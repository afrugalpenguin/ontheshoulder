import type { Compliance, Event } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { session } from '../test/fixtures.js';
import {
  complianceText,
  countdown,
  longDate,
  mmss,
  nextUpText,
  pickEvents,
  shortDate,
  targetText,
  timeOfDay,
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

describe('complianceText', () => {
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

  it('lists what is done and to do, with Sunday apart', () => {
    expect(complianceText(base)).toEqual({
      main: 'Week so far: key sessions 1 of 2, treadmill mornings 2 of 4',
      bonus: 'Bonus: not this week',
    });
  });

  it('says complete and reports a done bonus', () => {
    const done = complianceText({ ...base, complete: true, optional_done: 1 });
    expect(done.main).toMatch(/^Week complete: /);
    expect(done.bonus).toBe('Bonus done');
  });

  it('falls back to a plain count when the block has no rule, and no bonus without optional sessions', () => {
    const plain = complianceText({
      ...base,
      required: [],
      treadmill: { days_done: 0, days_needed: 0, met: true },
      optional_planned: 0,
    });
    expect(plain).toEqual({ main: 'Week so far: 3 of 9 sessions done', bonus: null });
  });
});
