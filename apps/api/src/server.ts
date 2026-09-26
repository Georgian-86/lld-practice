import { pino } from 'pino';
import { loadConfig } from './config';
import { createContainer } from './container';
import { openPostgresStorage } from './infrastructure/postgres';
import { randomIds, systemClock } from './infrastructure/system';
import { buildApp } from './http/app';

const config = loadConfig();
const log = pino({ level: config.logLevel });
// Postgres (e.g. Supabase) when DATABASE_URL is set, for hosts without a persistent disk; otherwise a SQLite file.
const storage = config.databaseUrl ? await openPostgresStorage(config.databaseUrl, randomIds, systemClock) : undefined;
const container = createContainer(config, { logger: log, storage });
const app = await buildApp(container, { logger: log, webDistDir: config.webDistDir });

await container.worker.start();
await app.listen({ port: config.port, host: config.host });
log.info(
  {
    aiReviewer: container.aiReviewer?.name ?? 'disabled',
    database: container.storage.location,
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
    await container.storage.close();
    process.exit(0);
  });
}
