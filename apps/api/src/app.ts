import { readFileSync } from 'node:fs';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Ajv } from 'ajv';
import type Database from 'better-sqlite3';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { migrateDb, openDb, type Db } from './db/client.js';
import { errorHandler } from './errors.js';
import { startScheduler } from './plan/scheduler.js';
import { routes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sqlite: Database.Database;
    dataDir: string;
    appVersion: string;
  }
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Query strings and path parameters arrive as text, so they are coerced to the
// schema's types. JSON bodies are not: coercion there turns a real 0 into null
// for any field that allows null, which would lose an ankle score of 0.
const urlValidator = new Ajv({ coerceTypes: 'array', useDefaults: true, removeAdditional: true });
const bodyValidator = new Ajv({ coerceTypes: false, useDefaults: true, removeAdditional: true });

export interface AppOptions extends FastifyServerOptions {
  /** Folder that holds the database. Always explicit so tests cannot touch real data. */
  dataDir: string;
  /** Runs the weekly plan scheduler. Off unless asked for, so tests stay deterministic. */
  scheduler?: boolean;
}

/** Opens and migrates the database in `dataDir`, then builds the api around it. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { dataDir, scheduler = false, ...fastifyOptions } = options;
  const app = Fastify(fastifyOptions).withTypeProvider<TypeBoxTypeProvider>();

  const open = openDb(dataDir);
  const version = migrateDb(open);
  app.log.info({ path: open.path, migration: version }, 'database ready');

  app.decorate('db', open.db);
  app.decorate('sqlite', open.sqlite);
  app.decorate('dataDir', open.dataDir);
  app.decorate('appVersion', pkg.version);
  app.addHook('onClose', () => {
    open.sqlite.close();
  });
  app.setErrorHandler(errorHandler);
  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'body' ? bodyValidator : urlValidator).compile(schema),
  );

  await app.register(swagger, {
    openapi: {
      info: { title: 'On the Shoulder api', version: pkg.version },
    },
  });
  await app.register(routes);

  if (scheduler) {
    const stop = startScheduler(open.db, app.log);
    app.addHook('onClose', stop);
  }

  return app as unknown as FastifyInstance;
}
