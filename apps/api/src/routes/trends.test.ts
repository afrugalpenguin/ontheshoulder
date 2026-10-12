import type { ErrorBody, TrendDay, TrendWeek } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers.js';
import { seedSynthetic } from '../test/synthetic.js';

// Trend queries against a seeded fixture database with known answers.
// The seed is described in src/test/synthetic.ts; 2031-01-06 is a Monday.

const START = '2031-01-06';
let t: TestApp;

beforeAll(async () => {
  t = await makeApp();
  await seedSynthetic(t, START, 90);
}, 60_000);
afterAll(() => t.close());

describe('GET /trends/weekly', () => {
  it('returns the seeded weeks with hand-checked values', async () => {
    const res = await t.call<TrendWeek[]>('GET', '/trends/weekly?from=2031-01-06&to=2031-01-26');
    expect(res.status).toBe(200);
    expect(res.body.map((w) => w.iso_week)).toEqual(['2031-W02', '2031-W03', '2031-W04']);

    // Week 0 of the seed: run 34 min Tuesday plus the 40 min long run on Sunday,
    // three 60 min vest walks, both strength sessions, ankle scores 0,1,2,3,0,1,2.
    expect(res.body[0]).toEqual({
      iso_week: '2031-W02',
      start_date: '2031-01-06',
      run_minutes: 74,
      vest_walk_hours: 3,
      strength_sessions: 2,
      complete: true,
      sessions_planned: 9,
      optional_planned: 1,
      optional_done: 1,
      ankle_mean: 1.29,
      run_rpe_mean: 5,
      lifts: { 'Back squat': 60, Deadlift: 80 },
      // The seed answers nothing, so the four asked mornings are all unanswered.
      habit_answers: {
        alcohol_free: {
          dates: ['2031-01-07', '2031-01-08', '2031-01-09', '2031-01-10'],
          yes: 0,
          no: 0,
        },
      },
    });

    // Week 1: no long run (odd week), run 36 min at RPE 5, lifts 2.5kg heavier.
    expect(res.body[1]).toMatchObject({
      run_minutes: 36,
      vest_walk_hours: 3,
      strength_sessions: 2,
      complete: true,
      optional_planned: 1,
      optional_done: 0,
      run_rpe_mean: 5,
      lifts: { 'Back squat': 62.5, Deadlift: 82.5 },
    });
    expect(res.body[2]).toMatchObject({ run_minutes: 38 + 50, optional_done: 1 });
  });

  it('counts the answers to a two-answer habit on the mornings it is asked', async () => {
    await t.call('PUT', '/checkins/2031-01-21', { habits: { alcohol_free: true } });
    await t.call('PUT', '/checkins/2031-01-22', { habits: { alcohol_free: false } });
    const res = await t.call<TrendWeek[]>('GET', '/trends/weekly?from=2031-01-20&to=2031-01-26');
    expect(res.body[0]?.habit_answers.alcohol_free).toEqual({
      dates: ['2031-01-21', '2031-01-22', '2031-01-23', '2031-01-24'],
      yes: 1,
      no: 1,
    });
  });

  it('covers whole weeks when the range starts midweek', async () => {
    const res = await t.call<TrendWeek[]>('GET', '/trends/weekly?from=2031-01-09&to=2031-01-09');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ iso_week: '2031-W02', run_minutes: 74 });
  });

  it('rejects a bad range, naming the field', async () => {
    const cases: [string, string][] = [
      ['from=2031-02-30&to=2031-03-01', 'from'],
      ['from=2031-01-01&to=2031-13-01', 'to'],
      ['from=2031-02-01&to=2031-01-01', 'to'],
      ['from=2031-01-01&to=2034-01-01', 'to'],
      ['from=2031-01-01', 'to'],
    ];
    for (const [query, field] of cases) {
      const res = await t.call<ErrorBody>('GET', `/trends/weekly?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.field).toBe(field);
    }
  });
});

describe('GET /trends/daily', () => {
  it('returns one row per day with the seeded check-ins and run RPE', async () => {
    const res = await t.call<TrendDay[]>('GET', '/trends/daily?from=2031-01-06&to=2031-01-12');
    expect(res.body).toHaveLength(7);
    // Day 0: sleep 2, energy 3, weight 72.0, ankle 0. Day 1 is the Tuesday run at RPE 4.
    expect(res.body[0]).toEqual({
      date: '2031-01-06',
      sleep_quality: 2,
      energy: 3,
      weight_kg: 72,
      ankle_score: 0,
      run_rpe: null,
      metrics: {},
    });
    expect(res.body[1]).toMatchObject({ sleep_quality: 3, energy: 4, ankle_score: 1, run_rpe: 4 });
    expect(res.body[6]).toMatchObject({ run_rpe: 6, weight_kg: 71.9 });
  });

  it('adds metrics from other sources, and leaves the mirrored check-in weight out of them', async () => {
    await t.call('PUT', '/metrics', {
      date: '2031-01-07',
      metric: 'sleep_score',
      value: 81,
      source: 'garmin',
    });
    await t.call('PUT', '/metrics', {
      date: '2031-01-07',
      metric: 'hrv',
      value: 55,
      source: 'garmin',
    });
    const res = await t.call<TrendDay[]>('GET', '/trends/daily?from=2031-01-07&to=2031-01-07');
    expect(res.body[0]?.metrics).toEqual({ sleep_score: 81, hrv: 55 });
    expect(res.body[0]?.weight_kg).toBe(72);
  });

  it('rejects a bad range', async () => {
    const res = await t.call<ErrorBody>('GET', '/trends/daily?from=2031-01-10&to=2031-01-01');
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('to');
  });
});

describe('with 90 days of data', () => {
  it('answers both trend queries for the full range in well under a second', async () => {
    const range = 'from=2031-01-06&to=2031-04-05';
    const started = performance.now();
    const weekly = await t.call<TrendWeek[]>('GET', `/trends/weekly?${range}`);
    const daily = await t.call<TrendDay[]>('GET', `/trends/daily?${range}`);
    const ms = performance.now() - started;

    expect(weekly.body).toHaveLength(13);
    expect(daily.body).toHaveLength(90);
    expect(weekly.body.every((w) => w.strength_sessions === 2)).toBe(true);
    // Main lifts climb 2.5kg a week across the range.
    expect(weekly.body[12]?.lifts).toEqual({ 'Back squat': 90, Deadlift: 110 });
    console.log(`trends for 90 days: weekly + daily in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});
