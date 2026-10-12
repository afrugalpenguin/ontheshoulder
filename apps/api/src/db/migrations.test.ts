import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { makeApp } from '../test/helpers.js';
import { DB_FILE } from './client.js';

const sqlOf = (tag: string): string =>
  readFileSync(fileURLToPath(new URL(`../../drizzle/${tag}.sql`, import.meta.url)), 'utf8');

interface HabitRow {
  key: string;
  enabled: number;
}

describe('data migrations', () => {
  it('0004 switches the treadmill habit off on an install that has it on, and deletes nothing', async () => {
    const t = await makeApp();
    await t.call('POST', '/setup/apply-template/rebuild-100');
    const sqlite = new Database(join(t.dataDir, DB_FILE));
    try {
      // As an install set up before this migration had it: every habit on.
      sqlite.prepare('update habit_definition set enabled = 1').run();
      const before = sqlite
        .prepare('select key, enabled from habit_definition')
        .all() as HabitRow[];

      sqlite.exec(sqlOf('0004_disable_treadmill_habit'));

      const after = sqlite.prepare('select key, enabled from habit_definition').all() as HabitRow[];
      expect(after.map((h) => h.key)).toEqual(before.map((h) => h.key));
      expect(after.filter((h) => h.enabled === 0).map((h) => h.key)).toEqual(['treadmill_done']);
    } finally {
      sqlite.close();
      await t.close();
    }
  });
});
