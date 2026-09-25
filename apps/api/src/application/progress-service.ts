import type { EvaluationReport, ProblemSummaryDTO, ProgressDTO } from '@blueprint/shared';
import { CRITERIA, CRITERION_IDS } from '@blueprint/shared';
import type { AttemptRepository, EvaluationRepository, ProblemCatalog, SampleDesigns, SubmissionRepository } from '../domain/ports';
import { computeAchievements } from './achievements';
import { toSubmissionSummary } from './dto';

/** Read-side queries for the catalogue and the learner's progress dashboard. */
export class ProgressService {
  constructor(
    private readonly deps: {
      problems: ProblemCatalog;
      attempts: AttemptRepository;
      submissions: SubmissionRepository;
      evaluations: EvaluationRepository;
      samples?: SampleDesigns;
    },
  ) {}

  async listProblems(learnerId: string): Promise<ProblemSummaryDTO[]> {
    const [attempts, submissions] = await Promise.all([
      this.deps.attempts.listByLearner(learnerId),
      this.deps.submissions.listByLearner(learnerId),
    ]);
    const reports = await this.deps.evaluations.findBySubmissions(submissions.map((s) => s.id));

    return this.deps.problems.list().map((problem) => {
      const problemAttempts = attempts.filter((a) => a.problemId === problem.id);
      // listByLearner returns newest first.
      const problemSubmissions = submissions.filter((s) => s.problemId === problem.id);
      const scores = problemSubmissions
        .map((s) => reports.get(s.id)?.overallScore)
        .filter((n): n is number => typeof n === 'number');
      return {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        estimatedMinutes: problem.estimatedMinutes,
        summary: problem.summary,
        tags: problem.tags,
        requirementCount: problem.functionalRequirements.length + problem.nonFunctionalRequirements.length,
        rubric: problem.rubric,
        hasSample: Boolean(this.deps.samples?.get(problem.id)),
        progress: {
          attempts: problemAttempts.length,
          submissions: problemSubmissions.length,
          bestScore: scores.length ? Math.max(...scores) : null,
          lastScore: scores[0] ?? null,
          latestAttemptId: problemAttempts[0]?.id ?? null,
        },
      };
    });
  }

  async progress(learnerId: string): Promise<ProgressDTO> {
    const [attempts, submissions] = await Promise.all([
      this.deps.attempts.listByLearner(learnerId),
      this.deps.submissions.listByLearner(learnerId),
    ]);
    const reports = await this.deps.evaluations.findBySubmissions(submissions.map((s) => s.id));
    const evaluated: EvaluationReport[] = submissions.map((s) => reports.get(s.id)).filter((r): r is EvaluationReport => !!r);
    const scores = evaluated.map((r) => r.overallScore);
    const titles = new Map(this.deps.problems.list().map((p) => [p.id, p.title]));

    return {
      totals: {
        attempts: attempts.length,
        submissions: submissions.length,
        problemsPracticed: new Set(attempts.map((a) => a.problemId)).size,
        averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        bestScore: scores.length ? Math.max(...scores) : null,
      },
      recent: submissions
        .filter((s) => titles.has(s.problemId))
        .slice(0, 20)
        .map((s) => ({ ...toSubmissionSummary(s, reports.get(s.id)), problemTitle: titles.get(s.problemId)! })),
      criterionAverages: CRITERION_IDS.map((criterionId) => {
        const values = evaluated
          .map((r) => r.criterionScores.find((c) => c.criterionId === criterionId)?.score)
          .filter((n): n is number => typeof n === 'number');
        return {
          criterionId,
          name: CRITERIA[criterionId].name,
          average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        };
      }),
      achievements: computeAchievements({
        submissions: submissions.map((s) => s.toSnapshot()),
        reports,
        problems: this.deps.problems.list(),
      }),
    };
  }
}
