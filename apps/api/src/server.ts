import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { resolveDataDir } from './db/client.js';

const config = readConfig();

try {
  const app = await buildApp({
    dataDir: resolveDataDir(),
    logger: { level: config.logLevel },
    scheduler: true,
  });
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  console.error('api failed to start:', err);
  process.exit(1);
}
