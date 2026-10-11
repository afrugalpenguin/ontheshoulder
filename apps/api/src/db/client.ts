import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface OpenDb {
  db: Db;
  sqlite: Database.Database;
  path: string;
  dataDir: string;
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));
export const DB_FILE = 'ots.db';

/**
 * Where the database lives: OTS_DATA_DIR, else the per-user data folder from
 * SPEC 4. Never inside the repo by default.
 */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OTS_DATA_DIR) return resolve(env.OTS_DATA_DIR);
  if (process.platform === 'win32') {
    const base = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'ontheshoulder');
  }
  return join(homedir(), '.local', 'share', 'ontheshoulder');
}

/** Opens (creating if needed) the database in `dataDir` with WAL and foreign keys on. */
export function openDb(dataDir: string): OpenDb {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, DB_FILE);
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = wal');
  sqlite.pragma('foreign_keys = on');
  return { db: drizzle(sqlite, { schema }), sqlite, path, dataDir };
}

/** Applies any pending migrations and returns the version now in place. */
export function migrateDb(open: OpenDb): string | null {
  migrate(open.db, { migrationsFolder: MIGRATIONS_DIR });
  return migrationVersion(open.sqlite);
}

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** Tag of the newest applied migration, or null if none has run. */
export function migrationVersion(sqlite: Database.Database): string | null {
  const table = sqlite
    .prepare(
      `select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'`,
    )
    .get();
  if (!table) return null;
  const { n } = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as {
    n: number;
  };
  if (n === 0) return null;
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  return journal.entries[n - 1]?.tag ?? `unknown-${n}`;
}
