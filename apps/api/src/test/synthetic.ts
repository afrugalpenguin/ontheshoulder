import {
  addDays,
  isoWeekOf,
  weekdayOf,
  type ProgrammeDay,
  type Week,
  type WeekSession,
} from '@ots/shared';
import type { TestApp } from './helpers.js';

/**
 * Fills a fresh test database with a deterministic, obviously synthetic
 * training history from `start` (a Monday) for `days` days, through the api.
 *
 * Every week: vest walks Monday, Wednesday and Thursday (60 min), the midweek
 * run on Tuesday, the Friday walk, Strength A on Wednesday and Strength B on
 * Friday with the main lift 2.5kg heavier each week, and the long run on the
 * Sundays of even-numbered weeks. A check-in every day.
 */
export async function seedSynthetic(t: TestApp, start: string, days: number): Promise<void> {
  await t.call('PUT', '/athlete', { display_name: 'Test Runner' });
  await t.call('POST', '/events', { name: 'Example 100', date: '2032-06-05', priority: 'A' });
  await t.call('POST', '/setup/apply-template/rebuild-100', { start_date: start });
  const programme = (await t.call<ProgrammeDay[]>('GET', '/programme-days')).body;
  const dayNamed = (name: string) => programme.find((d) => d.name === name) as ProgrammeDay;

  const weeks = new Map<string, Week>();
  const weekFor = async (date: string) => {
    const iso = isoWeekOf(date);
    let week = weeks.get(iso);
    if (!week) {
      week = (await t.call<{ week: Week }>('POST', `/weeks/${iso}/generate`)).body.week;
      weeks.set(iso, week);
    }
    return week;
  };

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const weekIndex = Math.floor(i / 7);
    const weekday = weekdayOf(date);
    const week = await weekFor(date);
    const planned = (key: string) =>
      week.sessions.find((s) => s.date === date && s.template.key === key) as
        WeekSession | undefined;
    const log = async (key: string, body: Record<string, unknown>) => {
      const session = planned(key);
      if (!session) return;
      await t.call('POST', '/activities', {
        date,
        kind: session.template.kind,
        planned_session_id: session.id,
        ...body,
      });
    };

    await t.call('PUT', `/checkins/${date}`, {
      sleep_quality: 2 + (i % 3),
      energy: 3 + (i % 2),
      weight_kg: Math.round((72 - i * 0.02) * 10) / 10,
      ankle_score: i % 4,
    });

    if (weekday === 1 || weekday === 3 || weekday === 4) {
      await log('vest_walk', { duration_min: 60, detail: { vest_kg: 20 } });
    }
    if (weekday === 2)
      await log('midweek_run', { duration_min: 34 + weekIndex * 2, rpe: 4 + (weekIndex % 3) });
    if (weekday === 5) await log('treadmill_walk', { duration_min: 50 });
    if (weekday === 7 && weekIndex % 2 === 0) {
      await log('long_run', { duration_min: 40 + weekIndex * 5, rpe: 6 });
    }

    const strength = async (key: string, dayName: string, base: number) => {
      const day = dayNamed(dayName);
      const main = day.slots[0];
      if (!main) return;
      await log(key, {
        duration_min: 40,
        strength_session: {
          programme_day_id: day.id,
          sets: [1, 2, 3, 4, 5].map((set_no) => ({
            slot_id: main.id,
            set_no,
            reps: 5,
            load_kg: base + weekIndex * 2.5,
          })),
        },
      });
    };
    if (weekday === 3) await strength('strength_a', 'Strength A', 60);
    if (weekday === 5) await strength('strength_b', 'Strength B', 80);
  }
}
