import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/db.ts';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = await buildApp({ db, logger: { level: config.LOG_LEVEL } });

// Stop taking requests, let in-flight ones finish, then close the database pool.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app
      .close()
      .then(() => db.destroy())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
