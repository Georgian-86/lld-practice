import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import {
  designModelSchema,
  revealHintRequestSchema,
  saveDraftRequestSchema,
  startAttemptRequestSchema,
  type ApiErrorBody,
} from '@blueprint/shared';
import type { Container } from '../container';
import { DomainError, NotFoundError } from '../domain/errors';
import { toProblemDTO } from '../application/dto';

const LEARNER_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ANONYMOUS = 'anonymous-learner';

export interface AppOptions {
  logger?: FastifyBaseLogger;
  webDistDir?: string;
}

/** Thin HTTP adapter: parse → call a use case → map errors. No business logic here. */
export async function buildApp(container: Container, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    ...(options.logger ? { loggerInstance: options.logger } : { logger: false }),
    bodyLimit: 1024 * 1024,
  });

  app.setErrorHandler((error, request, reply) => {
    const send = (status: number, body: ApiErrorBody) => reply.status(status).send(body);
    if (error instanceof ZodError) {
      return send(400, {
        error: {
          code: 'invalid_request',
          message: 'The request body is not valid.',
          details: error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (error instanceof DomainError) {
      const status =
        error instanceof NotFoundError
          ? 404
          : error.code === 'validation_failed'
            ? 422
            : 409;
      return send(status, { error: { code: error.code, message: error.message, details: error.details } });
    }
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return send(fastifyError.statusCode, {
        error: { code: (fastifyError.code ?? 'bad_request').toLowerCase(), message: fastifyError.message ?? 'Bad request' },
      });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return send(500, { error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  const learner = (request: FastifyRequest): string => {
    const header = request.headers['x-learner-id'];
    const value = Array.isArray(header) ? header[0] : header;
    return value && LEARNER_ID.test(value) ? value : ANONYMOUS;
  };
  const params = <T extends z.ZodRawShape>(shape: T, request: FastifyRequest) => z.object(shape).parse(request.params);
  const id = z.string().min(1).max(80);

  const { practice, progress, problems } = container;

  app.get('/api/health', async () => ({
    status: 'ok',
    aiReviewer: container.aiReviewer?.name ?? 'disabled',
    pendingEvaluations: await container.queue.pendingCount(),
  }));

  app.get('/api/problems', async (request) => progress.listProblems(learner(request)));

  app.get('/api/problems/:problemId', async (request) => {
    const { problemId } = params({ problemId: id }, request);
    const problem = problems.get(problemId);
    if (!problem) throw new NotFoundError('Problem', problemId);
    return toProblemDTO(problem);
  });

  app.get('/api/progress', async (request) => progress.progress(learner(request)));

  app.get('/api/attempts', async (request) => {
    const { problemId } = z.object({ problemId: id.optional() }).parse(request.query);
    return practice.listAttempts(learner(request), problemId);
  });

  app.post('/api/attempts', async (request, reply) => {
    const body = startAttemptRequestSchema.parse(request.body);
    reply.status(201);
    return practice.startAttempt(learner(request), body.problemId);
  });

  app.get('/api/attempts/:attemptId', async (request) => {
    const { attemptId } = params({ attemptId: id }, request);
    return practice.getAttempt(learner(request), attemptId);
  });

  app.put('/api/attempts/:attemptId/draft', async (request) => {
    const { attemptId } = params({ attemptId: id }, request);
    const body = saveDraftRequestSchema.parse(request.body);
    return practice.saveDraft(learner(request), attemptId, body.draft);
  });

  app.post('/api/attempts/:attemptId/hints', async (request) => {
    const { attemptId } = params({ attemptId: id }, request);
    const body = revealHintRequestSchema.parse(request.body);
    return practice.revealHint(learner(request), attemptId, body.level);
  });

  app.post('/api/attempts/:attemptId/submissions', async (request, reply) => {
    const { attemptId } = params({ attemptId: id }, request);
    const body = saveDraftRequestSchema.parse(request.body);
    const submission = await practice.submit(learner(request), attemptId, body.draft);
    container.worker.notify();
    reply.status(202);
    return submission;
  });

  app.get('/api/submissions/:submissionId', async (request) => {
    const { submissionId } = params({ submissionId: id }, request);
    return practice.getSubmission(learner(request), submissionId);
  });

  app.post('/api/submissions/:submissionId/retry', async (request, reply) => {
    const { submissionId } = params({ submissionId: id }, request);
    const submission = await practice.retryEvaluation(learner(request), submissionId);
    container.worker.notify();
    reply.status(202);
    return submission;
  });

  // Live checks for the canvas: deterministic rules only, nothing stored.
  app.post('/api/lint', async (request) => {
    const body = z.object({ problemId: id, design: designModelSchema }).parse(request.body);
    return { findings: container.lint.lint(body.problemId, body.design) };
  });

  app.get('/api/compare', async (request) => {
    const { base, target } = z.object({ base: id, target: id }).parse(request.query);
    return practice.compare(learner(request), base, target);
  });

  app.all('/api/*', async (request, reply) => {
    reply.status(404);
    return { error: { code: 'not_found', message: `No API route for ${request.method} ${request.url}` } } satisfies ApiErrorBody;
  });

  // Serve the built web app (single deployable). Unknown non-API paths fall back to index.html for client routing.
  if (options.webDistDir && existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, { root: options.webDistDir, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET') return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }

  return app;
}
