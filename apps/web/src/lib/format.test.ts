import type { Compliance, Event } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { session } from '../test/fixtures.js';
import {
  countdown,
  dateRange,
  longDate,
  mmss,
  nextUpText,
  pickEvents,
  shortDate,
  targetText,
  timeOfDay,
  weekLine,
} from './format.js';

const event = (over: Partial<Event>): Event => ({
  id: 1,
  name: 'Example 100',
  date: '2031-06-07',
  distance_km: 161,
  location: null,
  url: null,
  time_limit_h: 48,
  priority: 'A',
  status: 'planned',
  date_confirmed: true,
  result_notes: null,
  ...over,
});

describe('targetText', () => {
  it.each([
    [session('run', 'Midweek run', { min_min: 40, max_min: 50 }), '40 to 50 min, your pace'],
    [session('run', 'Long run', { min_min: 50, max_min: 60 }), '50 to 60 min, your pace'],
    [session('walk', 'Walk', { min_min: 30, max_min: 40 }), '30 to 40 min'],
    [
      session('run', 'Midweek run', { repeats: 8, run_block_sec: 120, walk_block_sec: 60 }),
      '8 x 2:00 / 1:00',
    ],
    [
      session('run', 'Midweek run', { repeats: 8, run_block_sec: 150, walk_block_sec: 60 }),
      '8 x 2:30 / 1:00',
    ],
    [
      session('run', 'Midweek run', { repeats: 1, run_block_sec: 1500, walk_block_sec: 0 }),
      '25 min continuous',
    ],
    [session('run', 'Easy run', { duration_min: 30 }), '30 min'],
    [session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 }), '60 min, 20kg'],
    [session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 0 }), '60 min, no vest'],
    [session('strength', 'Strength A', { duration_min: 40 }), '40 min'],
    [session('swim', 'Coached swim', {}), ''],
  ])('%#: %s', (s, expected) => {
    expect(targetText(s)).toBe(expected);
  });
});

describe('dates and times', () => {
  it('formats', () => {
    expect(mmss(90)).toBe('1:30');
    expect(longDate('2031-01-06')).toBe('Monday 6 January');
    expect(longDate('2031-01-12')).toBe('Sunday 12 January');
    expect(shortDate('2031-01-06')).toBe('6 Jan');
    expect(timeOfDay(new Date(2031, 0, 6, 7, 5))).toBe('07:05');
  });

  it.each([
    ['2031-06-07', 'is today'],
    ['2031-06-08', 'has passed'],
    ['2031-06-04', 'in 3 days'],
    ['2031-06-06', 'in 1 day'],
    ['2031-05-31', 'in 1 week'],
    ['2031-05-22', 'in 2 weeks, 2 days'],
    ['2031-01-06', 'in 21 weeks, 5 days'],
  ])('countdown from %s %s', (today, expected) => {
    expect(countdown(today, '2031-06-07')).toBe(expected);
  });
});

describe('events', () => {
  const events = [
    event({ id: 1 }),
    event({ id: 2, name: 'Example 50k', date: '2031-03-01', priority: 'B' }),
    event({ id: 3, name: 'Example 10k', date: '2031-02-01', priority: 'C' }),
    event({ id: 4, name: 'Skipped one', date: '2031-01-20', priority: 'C', status: 'skipped' }),
  ];

  it('picks the A event and the nearest B or C still to come', () => {
    const { goal, nextUp } = pickEvents(events, '2031-01-06');
    expect(goal?.name).toBe('Example 100');
    expect(nextUp?.name).toBe('Example 10k');
    expect(pickEvents(events, '2031-02-02').nextUp?.name).toBe('Example 50k');
    expect(pickEvents(events, '2031-03-02').nextUp).toBeNull();
    expect(pickEvents([], '2031-01-06')).toEqual({ goal: null, nextUp: null });
  });

  it('says how far off the next one is', () => {
    const tenK = events[2] as Event;
    expect(nextUpText(tenK, '2031-01-06')).toBe('Next up: Example 10k in 4 weeks');
    expect(nextUpText(tenK, '2031-01-25')).toBe('Next up: Example 10k in 1 week');
    expect(nextUpText(tenK, '2031-01-30')).toBe('Next up: Example 10k this week');
  });
});

describe('weekLine', () => {
  const base: Compliance = {
    iso_week: '2031-W02',
    complete: false,
    required: [
      { template_key: 'midweek_run', planned: 1, done: 0, met: false },
      { template_key: 'strength_a', planned: 1, done: 1, met: true },
    ],
    treadmill: { days_done: 2, days_needed: 4, met: false },
    optional_planned: 1,
    optional_done: 0,
    sessions_planned: 9,
    sessions_done: 3,
  };

  it('joins compliance, run minutes and streaks into one line', () => {
    expect(weekLine(base, { runMinutes: 45, weeks: 3, mornings: { days: 2, capped: false } })).toBe(
      'Key sessions 1 of 2 · mornings 2 of 4 · run 45 min · 3 weeks in a row · 2 mornings in a row',
    );
    expect(weekLine({ ...base, optional_done: 1 }, { weeks: 1 })).toBe(
      'Key sessions 1 of 2 · mornings 2 of 4 · bonus done · 1 week in a row',
    );
  });

  it('leaves out every part with nothing to say, and is null when nothing is left', () => {
    const fresh: Compliance = {
      ...base,
      required: base.required.map((r) => ({ ...r, done: 0, met: false })),
      treadmill: { days_done: 0, days_needed: 4, met: false },
      sessions_done: 0,
    };
    expect(weekLine(fresh, { runMinutes: 0, weeks: 0, mornings: { days: 0, capped: false } })).toBe(
      null,
    );
    // One thing done: only that part, and never a word about the optional session.
    const line = weekLine(
      { ...fresh, treadmill: { days_done: 1, days_needed: 4, met: false } },
      { runMinutes: 0, weeks: 0, mornings: { days: 1, capped: true } },
    );
    expect(line).toBe('Mornings 1 of 4 · 1+ morning in a row');
    expect(line).not.toMatch(/\b0\b|not this week/i);
  });

  it('falls back to a plain count when the block has no rule', () => {
    const plain = {
      ...base,
      required: [],
      treadmill: { days_done: 0, days_needed: 0, met: true },
      optional_planned: 0,
    };
    expect(weekLine(plain)).toBe('3 of 9 sessions');
    expect(weekLine({ ...plain, sessions_done: 0 })).toBe(null);
  });
});

describe('dateRange', () => {
  it('names the month once unless the week crosses into another', () => {
    expect(dateRange('2031-01-06', '2031-01-12')).toBe('6 to 12 Jan');
    expect(dateRange('2031-01-27', '2031-02-02')).toBe('27 Jan to 2 Feb');
  });
});
