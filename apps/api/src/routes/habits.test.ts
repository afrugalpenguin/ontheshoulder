import type { Compliance, Habit, Week } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers.js';

let t: TestApp;

beforeAll(async () => {
  t = await makeApp();
  await t.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
  await t.call('POST', '/weeks/2031-W02/generate');
});

afterAll(() => t.close());

const habit = async (key: string): Promise<Habit> => {
  const all = (await t.call<Habit[]>('GET', '/habits')).body;
  return all.find((h) => h.key === key) as Habit;
};

describe('habit days and answers', () => {
  it('saves days and a pair of answer labels, and null puts a habit back to every day', async () => {
    const protein = await habit('protein_shake');
    const set = await t.call<Habit>('PATCH', `/habits/${protein.id}`, {
      weekdays: [1, 3, 5],
      answer_labels: ['Had it', 'Skipped it'],
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({
      weekdays: [1, 3, 5],
      answer_labels: ['Had it', 'Skipped it'],
    });

    const cleared = await t.call<Habit>('PATCH', `/habits/${protein.id}`, {
      weekdays: null,
      answer_labels: null,
    });
    expect(cleared.body).toMatchObject({ weekdays: null, answer_labels: null });
  });

  it.each([
    ['an empty list', []],
    ['a repeated day', [2, 2, 3]],
    ['a day below 1', [0, 1]],
    ['a day above 7', [7, 8]],
    ['a day that is not a whole number', [1.5]],
    ['something that is not a list', '2,3'],
  ])('refuses %s for the days', async (_name, weekdays) => {
    const protein = await habit('protein_shake');
    const res = await t.call('PATCH', `/habits/${protein.id}`, { weekdays });
    expect(res.status).toBe(400);
    expect((await habit('protein_shake')).weekdays).toBeNull();
  });

  it('refuses answer labels that are not exactly two names', async () => {
    const protein = await habit('protein_shake');
    for (const answer_labels of [['Only one'], ['One', 'Two', 'Three'], ['', 'Blank first']]) {
      const res = await t.call('PATCH', `/habits/${protein.id}`, { answer_labels });
      expect(res.status).toBe(400);
    }
  });
});

describe('prehab in the week', () => {
  it('is on Tuesday and Friday mornings, before the session it shares the slot with', async () => {
    const week = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    const morning = (date: string) =>
      week.sessions.filter((s) => s.date === date && s.slot === 'am').map((s) => s.template.name);
    expect(morning('2031-01-07')).toEqual(['Prehab', 'Midweek run']);
    expect(morning('2031-01-10')).toEqual(['Prehab', 'Treadmill walk']);
    expect(week.sessions.filter((s) => s.template.kind === 'prehab')).toHaveLength(2);

    const prehab = week.sessions.find((s) => s.template.kind === 'prehab');
    expect(prehab?.targets.duration_min).toBe(8);
    // The routine comes from the template, as data.
    expect(prehab?.template.structure?.exercises).toEqual([
      { name: 'Single-leg balance, eyes open then closed', dose: '30 s each, both legs' },
      { name: 'Slow calf raises off a step, two up one down', dose: '3 x 12 each leg' },
      { name: 'Edge walking, outside then inside edges', dose: '20 m each' },
      { name: 'Toe spreads and towel scrunches', dose: '2 min' },
      { name: 'Ankle circles and alphabet', dose: '1 min each' },
    ]);
  });

  it('done or not, it does not change compliance', async () => {
    const before = (await t.call<Compliance>('GET', '/weeks/2031-W02/compliance')).body;
    const week = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    const prehab = week.sessions.find((s) => s.template.kind === 'prehab');
    const logged = await t.call('POST', '/activities', {
      date: prehab?.date,
      kind: 'prehab',
      planned_session_id: prehab?.id,
      duration_min: 8,
    });
    expect(logged.status).toBe(201);
    const done = (await t.call<Week>('GET', '/weeks/2031-W02')).body.sessions.find(
      (s) => s.id === prehab?.id,
    );
    expect(done?.status).toBe('done');

    // A done prehab on a weekday morning is not a treadmill morning.
    const after = (await t.call<Compliance>('GET', '/weeks/2031-W02/compliance')).body;
    expect(after).toEqual(before);
    expect(after.treadmill.days_done).toBe(0);
    expect(after.required.map((r) => r.template_key)).not.toContain('prehab');
  });
});
