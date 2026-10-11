import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { resolveDataDir } from './db/client.js';
import { loggerOptions } from './ops/logging.js';

// The built web app, when there is one (after `pnpm build`). In dev the Vite
// server serves the web app and proxies /api here.
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

try {
  const config = readConfig();
  const dataDir = resolveDataDir();
  const app = await buildApp({
    dataDir,
    logger: loggerOptions(config.logLevel, config.logDir ?? join(dataDir, 'logs')),
    scheduler: true,
    backups: true,
    lanGuard: config.lanGuard,
    webDir: WEB_DIST,
  });
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  console.error('api failed to start:', err);
  process.exit(1);
}
