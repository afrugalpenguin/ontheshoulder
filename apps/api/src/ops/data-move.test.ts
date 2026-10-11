import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DataStatus, ErrorBody, MoveDataResult } from '@ots/shared';
import Database from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX, buildApp, type Runtime } from '../app.js';
import { saveFileConfig, type FileConfig } from '../config.js';
import { ATHLETE } from '../test/helpers.js';
import { runBackup } from './backup.js';
import {
  REPO_ROOT,
  isInside,
  isNetworkPath,
  moveDataDir,
  rowCounts,
  validateTarget,
  type MoveStep,
} from './data-move.js';

let root: string;
let dataDir: string;
let configFile: string;
let app: FastifyInstance;
const lines: string[] = [];
const log = {
  info: (obj: object, msg: string) => lines.push(`${msg} ${JSON.stringify(obj)}`),
  error: (obj: object, msg: string) => lines.push(`ERROR ${msg} ${JSON.stringify(obj)}`),
} as unknown as FastifyBaseLogger;

const CONFIG = (data_dir: string): FileConfig => ({
  data_dir,
  port: 3001,
  lan_guard: true,
  log_level: 'info',
});
const savedConfig = () => JSON.parse(readFileSync(configFile, 'utf8')) as FileConfig;

async function start(runtime: Partial<Runtime> = {}) {
  app = await buildApp({ dataDir, runtime: { configPath: configFile, ...runtime } });
  const call = async <T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
    const res = await app.inject({
      method,
      url: `${API_PREFIX}${url}`,
      ...(payload ? { payload } : {}),
    });
    return { status: res.statusCode, body: res.json() as T };
  };
  await call('PUT', '/athlete', ATHLETE);
  await call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
  return call;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ots-move-'));
  dataDir = join(root, 'old');
  configFile = join(root, 'config', 'config.json');
  saveFileConfig(configFile, CONFIG(dataDir));
  lines.length = 0;
});
afterEach(async () => {
  await app?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('path checks', () => {
  it.each([
    ['\\\\nas\\share\\ots', true],
    ['//nas/share/ots', true],
    ['\\\\?\\C:\\data', true],
    ['  \\\\nas\\share', true],
    ['C:\\Data\\ots', false],
    ['/var/lib/ots', false],
    ['relative\\path', false],
  ])('isNetworkPath(%j) is %s', (path, expected) => {
    expect(isNetworkPath(path)).toBe(expected);
  });

  it('isInside is true for the folder itself and anything under it, and not for a sibling', () => {
    const base = join(root, 'a');
    expect(isInside(base, base)).toBe(true);
    expect(isInside(join(base, 'b', 'c'), base)).toBe(true);
    expect(isInside(join(root, 'ab'), base)).toBe(false);
    expect(isInside(root, base)).toBe(false);
  });

  const reject = (path: string, current = join(root, 'old')) => {
    try {
      validateTarget(path, current);
    } catch (err) {
      return (err as Error).message;
    }
    return 'accepted';
  };

  it('rejects a network path with a clear message, before touching the disk', () => {
    expect(reject('\\\\nas\\share\\ots')).toMatch(
      /^path is a network path\. The data folder must be on this PC/,
    );
    expect(reject('//nas/share/ots')).toMatch(/network path/);
  });

  it('rejects an empty or relative path', () => {
    expect(reject('   ')).toBe('path is empty');
    expect(reject('data/ots')).toMatch(/must be a full path/);
  });

  it('rejects anywhere in the repo tree', () => {
    expect(reject(REPO_ROOT)).toMatch(/inside the app folder/);
    expect(reject(join(REPO_ROOT, 'apps', 'api', 'data'))).toMatch(/inside the app folder/);
    expect(reject(join(REPO_ROOT, 'never', 'made', 'here'))).toMatch(/inside the app folder/);
    // Nothing was created by asking.
    expect(existsSync(join(REPO_ROOT, 'never'))).toBe(false);
  });

  it('rejects the current folder, a folder inside it, and a folder around it', () => {
    const current = join(root, 'old');
    expect(reject(current)).toMatch(/current data folder/);
    expect(reject(join(current, 'sub'))).toMatch(/current data folder/);
    expect(reject(root)).toMatch(/current data folder/);
  });

  it('rejects a path that is a file, and a folder that already holds a database', () => {
    const file = join(root, 'a-file');
    writeFileSync(file, 'x');
    expect(reject(file)).toMatch(/is a file, not a folder/);

    const taken = join(root, 'taken');
    mkdirSync(taken);
    writeFileSync(join(taken, 'ots.db'), 'x');
    expect(reject(taken)).toMatch(/already holds a database/);
  });

  it('rejects a folder that cannot be written to', () => {
    // A path under a file can never be created, on any platform.
    const file = join(root, 'blocker');
    writeFileSync(file, 'x');
    expect(reject(join(file, 'sub'))).toMatch(/^path cannot be written to \(E/);
  });

  it('accepts a new folder outside the repo, creates it, and leaves no test file in it', () => {
    const target = join(root, 'new', 'deeper');
    expect(validateTarget(`  ${target}  `, join(root, 'old'))).toBe(resolve(target));
    expect(readdirSync(target)).toEqual([]);
  });
});

describe('moving the data folder', () => {
  it('copies the database and backups, verifies the copy, updates the config and leaves a marker', async () => {
    await start();
    await runBackup(app.openDb, log, new Date(2031, 0, 6, 2, 0));
    lines.length = 0;
    const target = join(root, 'new');
    const before = rowCounts(app.sqlite);

    const result = await moveDataDir({
      open: app.openDb,
      target,
      configPath: configFile,
      log,
      now: new Date(2031, 0, 7, 9, 0),
    });

    expect(result).toMatchObject({
      from: dataDir,
      to: target,
      backups: 1,
      marker: join(dataDir, 'MOVED-2031-01-07.txt'),
    });
    expect(result.tables).toBe(Object.keys(before).length);
    expect(result.rows).toBe(Object.values(before).reduce((a, b) => a + b, 0));

    // The copy opens and holds the same rows.
    const copy = new Database(join(target, 'ots.db'), { readonly: true });
    expect(rowCounts(copy)).toEqual(before);
    expect(copy.prepare('select display_name from athlete').get()).toEqual(ATHLETE);
    copy.close();
    expect(readdirSync(join(target, 'backups'))).toEqual(['ots-20310106-0200.db']);

    // Config points at the new folder; the other settings are untouched.
    expect(savedConfig()).toEqual({ ...CONFIG(dataDir), data_dir: target });

    // Nothing in the old folder was deleted, and it has the marker.
    expect(existsSync(join(dataDir, 'ots.db'))).toBe(true);
    expect(readdirSync(join(dataDir, 'backups'))).toEqual(['ots-20310106-0200.db']);
    expect(readFileSync(result.marker, 'utf8')).toContain(target);

    expect(lines.map((l) => l.split(' {')[0])).toEqual([
      'data folder move: started',
      'data folder move: database copied',
      'data folder move: copy verified, row counts match',
      'data folder move: backups copied',
      'data folder move: config updated',
      'data folder move: finished, restart required',
    ]);
  });

  it('works when there are no backups yet', async () => {
    await start();
    const result = await moveDataDir({
      open: app.openDb,
      target: join(root, 'new'),
      configPath: configFile,
      log,
    });
    expect(result.backups).toBe(0);
    expect(existsSync(join(root, 'new', 'backups'))).toBe(false);
  });

  /** Runs a move that is sabotaged at one step and returns what was thrown. */
  async function failAt(step: MoveStep, sabotage: (target: string) => void) {
    const target = join(root, 'new');
    const attempt = moveDataDir({
      open: app.openDb,
      target,
      configPath: configFile,
      log,
      onStep: (reached, where) => {
        if (reached === step) sabotage(where);
      },
    });
    await expect(attempt).rejects.toMatchObject({ statusCode: 409, field: 'path' });
    return { target, message: await attempt.catch((err: Error) => err.message) };
  }
  const unchanged = () => {
    expect(savedConfig()).toEqual(CONFIG(dataDir));
    expect(readdirSync(dataDir).some((f) => f.startsWith('MOVED-'))).toBe(false);
    expect(existsSync(join(dataDir, 'ots.db'))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(/^ERROR data folder move: failed, config unchanged/);
  };

  it('a target that stops being writable after validation fails the copy and leaves config unchanged', async () => {
    await start();
    // After validation the folder is swapped for a file: nothing can be written into it.
    const { target, message } = await failAt('validated', (where) => {
      rmSync(where, { recursive: true });
      writeFileSync(where, 'not a folder any more');
    });
    expect(message).toMatch(/^The data folder was not moved: .+\. Nothing was changed\.$/);
    unchanged();
    expect(existsSync(join(target, 'ots.db'))).toBe(false);
    console.log(`failure after validation: ${message}`);
    console.log(`  config data_dir still: ${savedConfig().data_dir}`);
  });

  it('a copy whose row counts do not match is refused and removed', async () => {
    await start();
    // A row written between the copy and the check makes the two differ.
    const { target, message } = await failAt('database_copied', () => {
      app.sqlite
        .prepare(`insert into habit_definition (key, label) values ('late_row', 'Late row')`)
        .run();
    });
    expect(message).toMatch(/row counts differ in habit_definition \(6 here, 5 in the copy\)/);
    unchanged();
    // The half-made copy is taken back so the same folder can be tried again.
    expect(existsSync(join(target, 'ots.db'))).toBe(false);
  });

  it('a failure while copying backups leaves config unchanged and the target reusable', async () => {
    await start();
    await runBackup(app.openDb, log, new Date(2031, 0, 6, 2, 0));
    const { target } = await failAt('verified', (where) => {
      // A file where the backups folder has to go.
      writeFileSync(join(where, 'backups'), 'in the way');
    });
    unchanged();
    expect(existsSync(join(target, 'ots.db'))).toBe(false);

    // Clear the obstacle and the same folder works.
    rmSync(join(target, 'backups'));
    lines.length = 0;
    const result = await moveDataDir({
      open: app.openDb,
      target,
      configPath: configFile,
      log,
    });
    expect(result.to).toBe(target);
    expect(savedConfig().data_dir).toBe(target);
  });

  it('a config file that cannot be read stops the move at the last step, with the copy removed', async () => {
    await start();
    const { target, message } = await failAt('backups_copied', () => {
      writeFileSync(configFile, '{ broken');
    });
    expect(message).toMatch(/is not valid JSON/);
    expect(readFileSync(configFile, 'utf8')).toBe('{ broken');
    expect(existsSync(join(target, 'ots.db'))).toBe(false);
    expect(readdirSync(dataDir).some((f) => f.startsWith('MOVED-'))).toBe(false);
  });
});

describe('routes', () => {
  it('GET /admin/data reports the folder, size, backups and that nothing is pending', async () => {
    const call = await start({ port: 3001, logLevel: 'info' });
    await runBackup(app.openDb, log);
    const res = await call<DataStatus>('GET', '/admin/data');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data_dir: dataDir,
      config_path: configFile,
      configured_data_dir: dataDir,
      restart_required: false,
      can_restart: false,
      env_overrides: [],
      port: 3001,
      lan_guard: true,
      log_level: 'info',
    });
    expect(res.body.db_bytes).toBeGreaterThan(4096);
    expect(res.body.backup.count).toBe(1);
    expect(res.body.backup.last).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('POST /admin/data/move moves the folder and then reports a restart is required', async () => {
    const call = await start();
    const target = join(root, 'new');
    const res = await call<MoveDataResult>('POST', '/admin/data/move', { path: target });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: dataDir, to: target, restart_required: true });

    const after = await call<DataStatus>('GET', '/admin/data');
    expect(after.body).toMatchObject({
      data_dir: dataDir,
      configured_data_dir: target,
      restart_required: true,
    });
    // The running api is still on the old folder and still works.
    expect((await call('GET', '/athlete')).status).toBe(200);
  });

  it('rejects bad input at the route, naming the field, and changes nothing', async () => {
    const call = await start();
    const cases: [object, number, RegExp][] = [
      [{}, 400, /path/],
      [{ path: '' }, 400, /path/],
      [{ path: 42 }, 400, /path/],
      [{ path: 'x'.repeat(501) }, 400, /path/],
      [{ path: '\\\\nas\\share\\ots' }, 400, /network path/],
      [{ path: 'relative/folder' }, 400, /full path/],
      [{ path: REPO_ROOT }, 400, /inside the app folder/],
      [{ path: dataDir }, 400, /current data folder/],
    ];
    for (const [body, status, message] of cases) {
      const res = await call<ErrorBody>('POST', '/admin/data/move', body);
      expect(res.status, JSON.stringify(body)).toBe(status);
      expect(res.body.field).toBe('path');
      expect(res.body.message).toMatch(message);
    }
    expect(savedConfig()).toEqual(CONFIG(dataDir));
  });

  it('refuses to move when OTS_DATA_DIR overrides the config file', async () => {
    const call = await start({ overrides: ['data_dir'] });
    const res = await call<ErrorBody>('POST', '/admin/data/move', { path: join(root, 'new') });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/OTS_DATA_DIR is set/);
    expect(existsSync(join(root, 'new'))).toBe(false);
    expect((await call<DataStatus>('GET', '/admin/data')).body.env_overrides).toEqual(['data_dir']);
  });

  it('refuses to move when the api has no config file', async () => {
    const call = await start({ configPath: null });
    const res = await call<ErrorBody>('POST', '/admin/data/move', { path: join(root, 'new') });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/without a config file/);
  });

  it('POST /admin/restart is refused when nothing would bring the api back', async () => {
    const call = await start();
    const res = await call<ErrorBody>('POST', '/admin/restart');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/restart|start it again by hand/);
  });

  it('POST /admin/restart answers first, then asks the service to restart', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const restart = vi.fn();
    const call = await start({ restart });
    const res = await call<{ restarting: boolean }>('POST', '/admin/restart');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ restarting: true });
    expect(restart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(restart).toHaveBeenCalledTimes(1);
    expect((await call<DataStatus>('GET', '/admin/data')).body.can_restart).toBe(true);
    vi.useRealTimers();
  });

  it('GET /admin/about gives the version and licence from package.json', async () => {
    const call = await start();
    const res = await call<{ version: string; licence: string }>('GET', '/admin/about');
    expect(res.status).toBe(200);
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.body.licence).toBe('MIT');
  });
});
