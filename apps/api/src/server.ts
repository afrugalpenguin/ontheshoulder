import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { configPath, loadFileConfig, readConfig } from './config.js';
import { loggerOptions } from './ops/logging.js';

// The built web app, when there is one (after `pnpm build`). In dev the Vite
// server serves the web app and proxies /api here.
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

// Run from the built files this is the installed service, which the task or
// unit restarts when it exits. Run from source it is `pnpm dev` or a test, and
// nothing would bring it back.
const INSTALLED = !import.meta.url.endsWith('.ts');

try {
  const path = configPath();
  const file = loadFileConfig(path);
  const config = readConfig(process.env, file.config);
  const app = await buildApp({
    dataDir: config.dataDir,
    logger: loggerOptions(config.logLevel, config.logDir ?? join(config.dataDir, 'logs')),
    scheduler: true,
    backups: true,
    lanGuard: config.lanGuard,
    webDir: WEB_DIST,
    runtime: {
      configPath: path,
      overrides: config.overrides,
      port: config.port,
      lanGuard: config.lanGuard,
      logLevel: config.logLevel,
      restart: INSTALLED
        ? () => {
            app.log.info('restart requested from Settings: exiting so the service starts again');
            void app.close().finally(() => process.exit(0));
          }
        : null,
    },
  });
  app.log.info(
    { config: path, created: file.created, data_dir: config.dataDir, overrides: config.overrides },
    file.created ? 'config file written with defaults' : 'config file read',
  );
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  console.error('api failed to start:', err);
  process.exit(1);
}
