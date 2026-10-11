import { buildApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const app = buildApp({ logger: { level: config.logLevel } });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.fatal(err, 'api failed to start');
  process.exit(1);
}
