import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from '@ots/shared';
import Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { loadFileConfig, saveFileConfig } from '../config.js';
import { DB_FILE, type OpenDb } from '../db/client.js';
import { badRequest, conflict } from '../errors.js';
import { BACKUP_DIR, backupDir, listBackups } from './backup.js';

/**
 * Moving the data folder from Settings. The database is copied with SQLite's
 * online backup API, the copy is opened and its row counts compared with the
 * live database, the backups folder is copied, and only then is the config
 * file pointed at the new folder. Nothing in the old folder is deleted. If any
 * step fails the config file is left as it was.
 */

/** The repo this code is running from. Data must never be put inside it. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

const FIELD = 'path';

/** True when `child` is `parent` or somewhere under it. */
export function isInside(child: string, parent: string): boolean {
  const fold = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = relative(fold(resolve(parent)), fold(resolve(child)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** A path on another machine: \\server\share or //server/share, in any mix of slashes. */
export const isNetworkPath = (path: string): boolean => /^[\\/]{2}/.test(path.trim());

/**
 * Checks a folder the user typed and returns it resolved. Throws a 400 naming
 * the field for anything that is not a usable local folder: a network path, a
 * relative path, somewhere inside the repo, the folder already in use, a
 * folder that already holds a database, or one that cannot be written to.
 */
export function validateTarget(
  input: string,
  current: string,
  repoRoot: string = REPO_ROOT,
): string {
  const typed = input.trim();
  if (typed === '') throw badRequest(FIELD, 'is empty');
  if (isNetworkPath(typed)) {
    throw badRequest(
      FIELD,
      'is a network path. The data folder must be on this PC, for example C:\\Data\\ontheshoulder',
    );
  }
  if (!isAbsolute(typed)) {
    throw badRequest(FIELD, 'must be a full path, for example C:\\Data\\ontheshoulder');
  }
  const target = resolve(typed);
  if (isInside(target, repoRoot)) {
    throw badRequest(FIELD, 'is inside the app folder. Choose a folder outside the code');
  }
  if (isInside(target, current) || isInside(current, target)) {
    throw badRequest(FIELD, 'is the current data folder, or inside or around it');
  }
  if (existsSync(target) && !statSync(target).isDirectory()) {
    throw badRequest(FIELD, 'is a file, not a folder');
  }
  if (existsSync(join(target, DB_FILE))) {
    throw badRequest(FIELD, `already holds a database (${DB_FILE}). Choose an empty folder`);
  }
  // Writable means a file can actually be made there, so make one.
  const probe = join(target, `.ots-write-test-${process.pid}`);
  try {
    mkdirSync(target, { recursive: true });
    writeFileSync(probe, '');
    unlinkSync(probe);
  } catch (err) {
    throw badRequest(FIELD, `cannot be written to (${(err as NodeJS.ErrnoException).code})`);
  }
  return target;
}

/** Rows in every table of a database, by table name. */
export function rowCounts(sqlite: Database.Database): Record<string, number> {
  const tables = sqlite
    .prepare(
      `select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`,
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      (sqlite.prepare(`select count(*) as n from "${name}"`).get() as { n: number }).n,
    ]),
  );
}

export type MoveStep = 'validated' | 'database_copied' | 'verified' | 'backups_copied';

export interface MoveOptions {
  open: OpenDb;
  /** The folder as the user typed it. */
  target: string;
  /** The config file to update once the copy is known to be good. */
  configPath: string;
  log: FastifyBaseLogger;
  repoRoot?: string;
  now?: Date;
  /** Called after each step. For tests, to make a later step fail. */
  onStep?: (step: MoveStep, target: string) => void;
}

export interface MoveResult {
  from: string;
  to: string;
  tables: number;
  rows: number;
  backups: number;
  marker: string;
}

/**
 * Copies the database and backups to a new folder and points the config file
 * at it. The running api keeps using the old folder until it is restarted.
 */
export async function moveDataDir(options: MoveOptions): Promise<MoveResult> {
  const { open, configPath, log, onStep } = options;
  const from = open.dataDir;
  const target = validateTarget(options.target, from, options.repoRoot);
  const targetDb = join(target, DB_FILE);
  log.info({ from, to: target }, 'data folder move: started');
  onStep?.('validated', target);

  let wroteDb = false;
  try {
    // 1. The database, by the online backup API: safe while it is in use.
    await open.sqlite.backup(targetDb);
    wroteDb = true;
    log.info({ file: targetDb }, 'data folder move: database copied');
    onStep?.('database_copied', target);

    // 2. Open the copy and compare it with the live database, table by table.
    const expected = rowCounts(open.sqlite);
    const copy = new Database(targetDb, { readonly: true, fileMustExist: true });
    let actual: Record<string, number>;
    try {
      const check = copy.pragma('integrity_check', { simple: true });
      if (check !== 'ok') throw new Error(`the copy failed its integrity check: ${String(check)}`);
      actual = rowCounts(copy);
    } finally {
      copy.close();
    }
    const tables = Object.keys(expected);
    const differ = [...new Set([...tables, ...Object.keys(actual)])].filter(
      (t) => expected[t] !== actual[t],
    );
    if (differ.length > 0) {
      throw new Error(
        `row counts differ in ${differ.map((t) => `${t} (${expected[t] ?? 'none'} here, ${actual[t] ?? 'none'} in the copy)`).join(', ')}`,
      );
    }
    const rows = Object.values(actual).reduce((sum, n) => sum + n, 0);
    log.info({ tables: tables.length, rows }, 'data folder move: copy verified, row counts match');
    onStep?.('verified', target);

    // 3. The backups folder.
    let backups = 0;
    if (existsSync(backupDir(from))) {
      cpSync(backupDir(from), join(target, BACKUP_DIR), { recursive: true });
      backups = listBackups(target).length;
    }
    log.info({ backups }, 'data folder move: backups copied');
    onStep?.('backups_copied', target);

    // 4. Only now the config file. Everything before this left it alone.
    const { config } = loadFileConfig(configPath);
    saveFileConfig(configPath, { ...config, data_dir: target });
    log.info({ config: configPath, data_dir: target }, 'data folder move: config updated');

    // 5. A note in the old folder saying where the data went. Nothing there is deleted.
    const marker = join(from, `MOVED-${localDate(options.now ?? new Date())}.txt`);
    writeFileSync(
      marker,
      `The data in this folder was copied to:\n${target}\n\nThe app uses that folder from its next restart. Nothing here was deleted.\n`,
      'utf8',
    );
    log.info({ marker }, 'data folder move: finished, restart required');
    return { from, to: target, tables: tables.length, rows, backups, marker };
  } catch (err) {
    // Take back the half-made copy so the same folder can be tried again. The
    // old folder and the config file have not been touched.
    if (wroteDb) {
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        rmSync(`${targetDb}${suffix}`, { force: true });
      }
    }
    const reason = err instanceof Error ? err.message : String(err);
    log.error({ from, to: target, reason }, 'data folder move: failed, config unchanged');
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw conflict(`The data folder was not moved: ${reason}. Nothing was changed.`, FIELD);
  }
}
