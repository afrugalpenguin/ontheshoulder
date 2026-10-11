import { readFileSync } from 'node:fs';
import type { Health } from '@ots/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export function buildApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);

  app.get('/health', (): Health => {
    return { ok: true, version: pkg.version, uptime_s: Math.round(process.uptime()) };
  });

  return app;
}
