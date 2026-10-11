import { createReadStream, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { About, DataStatus, MoveDataInput, MoveDataResult } from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import { loadFileConfig } from '../config.js';
import { conflict, notFound } from '../errors.js';
import { backupDir, backupStatus, runBackup } from '../ops/backup.js';
import { REPO_ROOT, moveDataDir } from '../ops/data-move.js';

const BackupResult = Type.Object({
  file: Type.String(),
  count: Type.Integer(),
  at: Type.String(),
});

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

/** What the Data card shows: where the data is, how big, and whether a restart is pending. */
function dataStatus(app: FastifyInstance): DataStatus {
  const { runtime } = app;
  const backup = backupStatus(app.dataDir);
  let configured: string | null = null;
  if (runtime.configPath) {
    try {
      configured = loadFileConfig(runtime.configPath).config.data_dir;
    } catch (err) {
      app.log.error(err, 'data status: the config file could not be read');
    }
  }
  // An environment override wins at the next start too, so the file is not what counts then.
  const fromEnv = runtime.overrides.includes('data_dir');
  return {
    data_dir: app.dataDir,
    db_bytes: sizeOf(app.openDb.path) + sizeOf(`${app.openDb.path}-wal`),
    backup: { last: backup.last, count: backup.count },
    config_path: runtime.configPath,
    configured_data_dir: configured,
    restart_required:
      !fromEnv && configured !== null && resolve(configured) !== resolve(app.dataDir),
    can_restart: runtime.restart !== null,
    env_overrides: runtime.overrides,
    port: runtime.port,
    lan_guard: runtime.lanGuard,
    log_level: runtime.logLevel,
  };
}

function readAbout(version: string): About {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      version?: string;
      license?: string;
      repository?: string | { url?: string };
    };
    const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    return {
      version: pkg.version ?? version,
      licence: pkg.license ?? 'unknown',
      repository: repository ?? null,
    };
  } catch {
    return { version, licence: 'unknown', repository: null };
  }
}

export const adminRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const tags = ['admin'];

  app.post('/admin/backup', { schema: { tags, response: { 200: BackupResult } } }, async (req) => {
    const { file, count } = await runBackup(app.openDb, req.log);
    return { file, count, at: new Date().toISOString() };
  });

  // Streams the newest backup so it can be saved off the PC.
  app.get('/admin/backup/latest', { schema: { tags } }, (_req, reply) => {
    const { latest } = backupStatus(app.dataDir);
    if (!latest) throw notFound('backup');
    void reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${latest}"`);
    return reply.send(createReadStream(join(backupDir(app.dataDir), latest)));
  });

  app.get('/admin/data', { schema: { tags, response: { 200: DataStatus } } }, () =>
    dataStatus(app),
  );

  // Copies the database and backups to a new folder on this PC and points the
  // config file at it. The path is checked before anything is written; see
  // validateTarget. The api keeps using the old folder until it is restarted.
  app.post(
    '/admin/data/move',
    { schema: { tags, body: MoveDataInput, response: { 200: MoveDataResult } } },
    async (req) => {
      const { runtime } = app;
      if (!runtime.configPath) {
        throw conflict(
          'This api was started without a config file, so the folder cannot be moved.',
        );
      }
      if (runtime.overrides.includes('data_dir')) {
        throw conflict(
          'OTS_DATA_DIR is set in the environment and overrides the config file. Remove it, restart, then move the folder.',
        );
      }
      const result = await moveDataDir({
        open: app.openDb,
        target: req.body.path,
        configPath: runtime.configPath,
        log: req.log,
      });
      return { ...result, restart_required: true };
    },
  );

  // Ends the process once the reply has gone, for the service manager to start
  // it again. Refused when nothing would bring it back.
  app.post(
    '/admin/restart',
    { schema: { tags, response: { 202: Type.Object({ restarting: Type.Boolean() }) } } },
    (_req, reply) => {
      const { restart } = app.runtime;
      if (!restart) {
        throw conflict(
          'This api is not running as an installed service. Stop it and start it again by hand.',
        );
      }
      void reply.status(202);
      setTimeout(restart, 250).unref();
      return { restarting: true };
    },
  );

  app.get('/admin/about', { schema: { tags, response: { 200: About } } }, () =>
    readAbout(app.appVersion),
  );
};
