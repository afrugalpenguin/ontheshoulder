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
  label: string;
  enabled: number;
  weekdays: string | null;
  answer_labels: string | null;
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

  it('0005 gives alcohol its days and answers and switches the prehab habit off, deleting nothing', async () => {
    const t = await makeApp();
    await t.call('POST', '/setup/apply-template/rebuild-100');
    await t.call('PUT', '/checkins/2031-01-07', {
      habits: { alcohol_free: true, prehab_done: true },
    });
    const sqlite = new Database(join(t.dataDir, DB_FILE));
    try {
      // As an install set up before this migration had it: plain ticks, every day, all on.
      sqlite
        .prepare(
          "update habit_definition set enabled = 1, weekdays = null, answer_labels = null, label = 'Alcohol free' where key = 'alcohol_free'",
        )
        .run();
      sqlite.prepare("update habit_definition set enabled = 1 where key = 'prehab_done'").run();
      const count = () =>
        (sqlite.prepare('select count(*) as n from habit_definition').get() as { n: number }).n;
      const before = count();

      // The two column statements have already run on this database; apply the data ones.
      const statements = sqlOf('0005_habit_days').split('--> statement-breakpoint');
      for (const statement of statements.filter((s) => s.trim().startsWith('update'))) {
        sqlite.exec(statement);
      }

      const rows = sqlite.prepare('select * from habit_definition').all() as HabitRow[];
      const byKey = Object.fromEntries(rows.map((h) => [h.key, h]));
      expect(count()).toBe(before);
      expect(byKey.alcohol_free).toMatchObject({
        label: 'Last night',
        enabled: 1,
        weekdays: '[2,3,4,5]',
        answer_labels: '["Alcohol-free","Had a drink"]',
      });
      expect(byKey.prehab_done).toMatchObject({ enabled: 0 });
      expect(byKey.protein_shake).toMatchObject({
        enabled: 1,
        weekdays: null,
        answer_labels: null,
      });
      // What was already ticked stays as it was saved.
      const saved = sqlite
        .prepare("select habits from daily_checkin where date = '2031-01-07'")
        .get() as { habits: string };
      expect(JSON.parse(saved.habits)).toEqual({ alcohol_free: true, prehab_done: true });
    } finally {
      sqlite.close();
      await t.close();
    }

    // Read back through the api, the stored text is the array the web app expects.
    const fresh = await makeApp();
    await fresh.call('POST', '/setup/apply-template/rebuild-100');
    const habits = (
      await fresh.call<{ key: string; weekdays: number[] | null }[]>('GET', '/habits')
    ).body;
    expect(habits.find((h) => h.key === 'alcohol_free')?.weekdays).toEqual([2, 3, 4, 5]);
    await fresh.close();
  });
});
