import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { localDate } from '@ots/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { OpenDb } from '../db/client.js';

/** Backups, SPEC 9.2: online copies of the database in <data dir>/backups, newest 30 kept. */

export const BACKUP_DIR = 'backups';
export const KEEP_BACKUPS = 30;
export const NIGHTLY_AT = '02:00';
const NAME = /^ots-\d{8}-\d{4}\.db$/;
const CHECK_EVERY_MS = 60_000;

const two = (n: number) => String(n).padStart(2, '0');
const timeOf = (now: Date) => `${two(now.getHours())}:${two(now.getMinutes())}`;

/** ots-YYYYMMDD-HHmm.db in local time. */
export function backupName(now: Date): string {
  return `ots-${localDate(now).replaceAll('-', '')}-${two(now.getHours())}${two(now.getMinutes())}.db`;
}

export const backupDir = (dataDir: string): string => join(dataDir, BACKUP_DIR);

/** Backup file names, newest first. Only files this module wrote are listed. */
export function listBackups(dataDir: string): string[] {
  try {
    return readdirSync(backupDir(dataDir))
      .filter((name) => NAME.test(name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export interface BackupStatus {
  /** When the newest backup was written, or null if there is none. */
  last: string | null;
  count: number;
  latest: string | null;
}

export function backupStatus(dataDir: string): BackupStatus {
  const files = listBackups(dataDir);
  const latest = files[0] ?? null;
  return {
    last: latest ? statSync(join(backupDir(dataDir), latest)).mtime.toISOString() : null,
    count: files.length,
    latest,
  };
}

/**
 * Takes a backup with SQLite's online backup API (safe while the database is
 * in use, unlike copying the file), then deletes all but the newest 30.
 */
export async function runBackup(
  open: OpenDb,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<{ file: string; count: number; removed: string[] }> {
  const dir = backupDir(open.dataDir);
  mkdirSync(dir, { recursive: true });
  const file = backupName(now);
  await open.sqlite.backup(join(dir, file));

  const removed = listBackups(open.dataDir).slice(KEEP_BACKUPS);
  for (const old of removed) unlinkSync(join(dir, old));
  const count = listBackups(open.dataDir).length;
  log.info({ file, count, removed: removed.length }, 'backup written');
  return { file, count, removed };
}

/**
 * True when the nightly backup should run now: it is past the nightly time and
 * no nightly has run today. `lastNightly` is the local date of the last one.
 */
export function nightlyDue(now: Date, lastNightly: string | null): boolean {
  return timeOf(now) >= NIGHTLY_AT && lastNightly !== localDate(now);
}

/** Backs up now, then once each night. Returns a function that stops the schedule. */
export function startBackups(open: OpenDb, log: FastifyBaseLogger): () => void {
  // A start after the nightly time counts as tonight's backup.
  let lastNightly: string | null = null;
  const run = (why: string) => {
    lastNightly = timeOf(new Date()) >= NIGHTLY_AT ? localDate() : lastNightly;
    runBackup(open, log).catch((err: unknown) => log.error(err, `backup failed (${why})`));
  };
  run('start');
  const timer = setInterval(() => {
    if (nightlyDue(new Date(), lastNightly)) run('nightly');
  }, CHECK_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
