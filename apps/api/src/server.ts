import { pino } from 'pino';
import { loadConfig } from './config';
import { createContainer } from './container';
import { buildApp } from './http/app';

const config = loadConfig();
const log = pino({ level: config.logLevel });
const container = createContainer(config, { logger: log });
const app = await buildApp(container, { logger: log, webDistDir: config.webDistDir });

await container.worker.start();
await app.listen({ port: config.port, host: config.host });
log.info(
  {
    aiReviewer: container.aiReviewer?.name ?? 'disabled',
    database: config.databasePath,
    web: config.webDistDir ?? 'not built (use the Vite dev server)',
  },
  'Blueprint API ready',
);

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'Shutting down');
    await app.close();
    await container.worker.stop();
    container.db.close();
    process.exit(0);
  });
}
