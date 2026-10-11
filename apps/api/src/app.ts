import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Ajv } from 'ajv';
import type Database from 'better-sqlite3';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { migrateDb, openDb, type Db, type OpenDb } from './db/client.js';
import { errorHandler } from './errors.js';
import { startBackups } from './ops/backup.js';
import { lanGuard } from './ops/lan-guard.js';
import { startScheduler } from './plan/scheduler.js';
import { routes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sqlite: Database.Database;
    openDb: OpenDb;
    dataDir: string;
    appVersion: string;
    runtime: Runtime;
  }
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** How this api was started: what Settings needs to know to move the data folder or restart. */
export interface Runtime {
  /** The config file in use, or null when there is none (tests). */
  configPath: string | null;
  /** Settings an environment variable is overriding, by config file key. */
  overrides: string[];
  port: number;
  lanGuard: boolean;
  logLevel: string;
  /** Ends the process so the service manager starts it again. Null when nothing would. */
  restart: (() => void) | null;
}

/** Every api route lives under this prefix; everything else is the web app. */
export const API_PREFIX = '/api';

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
  /** Backs up on start and nightly. Off unless asked for. */
  backups?: boolean;
  /** Refuses requests from outside the LAN. On unless turned off. */
  lanGuard?: boolean;
  /** Folder with the built web app (index.html). Served from / when it exists. */
  webDir?: string | null;
  /** How the api was started. Left out in tests: no config file, no restart. */
  runtime?: Partial<Runtime>;
}

/** Opens and migrates the database in `dataDir`, then builds the api around it. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const {
    dataDir,
    scheduler = false,
    backups = false,
    lanGuard: guard = true,
    webDir = null,
    runtime = {},
    ...fastifyOptions
  } = options;
  const app = Fastify(fastifyOptions).withTypeProvider<TypeBoxTypeProvider>();

  const open = openDb(dataDir);
  const version = migrateDb(open);
  app.log.info({ path: open.path, migration: version }, 'database ready');

  app.decorate('db', open.db);
  app.decorate('sqlite', open.sqlite);
  app.decorate('openDb', open);
  app.decorate('dataDir', open.dataDir);
  app.decorate('appVersion', pkg.version);
  app.decorate('runtime', {
    configPath: null,
    overrides: [],
    port: 0,
    lanGuard: guard,
    logLevel: 'info',
    restart: null,
    ...runtime,
  });
  app.addHook('onClose', () => {
    open.sqlite.close();
  });
  app.setErrorHandler(errorHandler);
  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'body' ? bodyValidator : urlValidator).compile(schema),
  );
  if (guard) app.addHook('onRequest', lanGuard(app.log));
  else app.log.warn('lan guard is off: the api will answer any address that can reach it');

  await app.register(swagger, {
    openapi: {
      info: { title: 'On the Shoulder api', version: pkg.version },
    },
  });
  await app.register(routes, { prefix: API_PREFIX });

  // Production: one process serves the built web app as well. Unknown paths
  // fall back to index.html so a reload on /week or /settings still works.
  const hasWeb = webDir !== null && existsSync(join(webDir, 'index.html'));
  if (hasWeb) {
    // The web build leaves a .br and a .gz beside each file; send those when the browser takes them.
    await app.register(fastifyStatic, { root: webDir, wildcard: false, preCompressed: true });
    app.log.info({ webDir }, 'serving the web app');
  }
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const isApi = path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
    if (hasWeb && !isApi && (req.method === 'GET' || req.method === 'HEAD')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `${req.method} ${path} not found`,
    });
  });

  if (scheduler) {
    const stop = startScheduler(open.db, app.log);
    app.addHook('onClose', stop);
  }
  if (backups) {
    const stop = startBackups(open, app.log);
    app.addHook('onClose', stop);
  }

  return app as unknown as FastifyInstance;
}
