import type { TrendDay, TrendWeek } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import {
  latest,
  liftsChart,
  rangeFor,
  rolling,
  toX,
  volumeChart,
  weightChart,
  wellbeingChart,
} from './data.js';
import { reviewSentences } from './review.js';

const week = (over: Partial<TrendWeek>): TrendWeek => ({
  iso_week: '2031-W03',
  start_date: '2031-01-13',
  run_minutes: 54,
  vest_walk_hours: 3,
  strength_sessions: 2,
  complete: true,
  optional_planned: 1,
  optional_done: 0,
  ankle_mean: 1.5,
  run_rpe_mean: 5,
  lifts: { 'Back squat': 62.5, Deadlift: 82.5 },
  ...over,
});

const day = (date: string, over: Partial<TrendDay> = {}): TrendDay => ({
  date,
  sleep_quality: null,
  energy: null,
  weight_kg: null,
  ankle_score: null,
  run_rpe: null,
  metrics: {},
  ...over,
});

describe('review sentences', () => {
  it('compares this week with last, one fixed sentence per metric', () => {
    const last = week({
      iso_week: '2031-W02',
      run_minutes: 48,
      vest_walk_hours: 3,
      strength_sessions: 1,
      ankle_mean: 2,
      run_rpe_mean: 4,
      lifts: { 'Back squat': 60, Deadlift: 85 },
    });
    expect(reviewSentences(week({}), last)).toMatchInlineSnapshot(`
      [
        "Run minutes 54, up from 48.",
        "Vest walk hours 3, same as last week.",
        "Strength sessions 2, up from 1.",
        "Back squat 62.5kg, up from 60kg.",
        "Deadlift 82.5kg, down from 85kg.",
        "Run RPE mean 5, up from 4.",
        "Ankle mean 1.5, down from 2.",
        "Week complete.",
        "Bonus: not this week.",
      ]
    `);
  });

  it('with no last week, states this week only', () => {
    expect(reviewSentences(week({ complete: false, optional_done: 1 }), null))
      .toMatchInlineSnapshot(`
      [
        "Run minutes 54.",
        "Vest walk hours 3.",
        "Strength sessions 2.",
        "Back squat 62.5kg.",
        "Deadlift 82.5kg.",
        "Run RPE mean 5.",
        "Ankle mean 1.5.",
        "Week not complete yet.",
        "Bonus done.",
      ]
    `);
  });

  it('leaves out what was not recorded, and a lift that is new this week has no comparison', () => {
    const quiet = week({
      run_minutes: 0,
      vest_walk_hours: 1.92,
      strength_sessions: 0,
      ankle_mean: null,
      run_rpe_mean: null,
      lifts: { 'Goblet squat': 16 },
      complete: false,
      optional_planned: 0,
    });
    expect(reviewSentences(quiet, week({ run_minutes: 54 }))).toMatchInlineSnapshot(`
      [
        "Run minutes 0, down from 54.",
        "Vest walk hours 1.92, down from 3.",
        "Strength sessions 0, down from 2.",
        "Goblet squat 16kg.",
        "Week not complete yet.",
      ]
    `);
  });
});

describe('rangeFor', () => {
  it('ends with the current week and goes back whole weeks', () => {
    expect(rangeFor('2031-03-05', 4)).toEqual({ from: '2031-02-10', to: '2031-03-09' });
    expect(rangeFor('2031-03-09', 1)).toEqual({ from: '2031-03-03', to: '2031-03-09' });
    expect(rangeFor('2031-03-03', 12).from).toBe('2030-12-16');
  });
});

describe('rolling', () => {
  it('is a trailing mean that ignores gaps', () => {
    expect(rolling([2, 4, null, 6], 3)).toEqual([2, 3, 3, 5]);
    expect(rolling([null, null, 4], 2)).toEqual([null, null, 4]);
    expect(rolling([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 5]);
  });
});

describe('chart data', () => {
  const weeks = [
    week({
      start_date: '2031-01-06',
      run_minutes: 48,
      vest_walk_hours: 2,
      ankle_mean: null,
      lifts: { 'Back squat': 60 },
    }),
    week({}),
  ];

  it('volume: run and vest minutes, with the ankle line only when scores exist', () => {
    const chart = volumeChart(weeks);
    expect(chart.x).toEqual([toX('2031-01-06'), toX('2031-01-13')]);
    expect(chart.series).toEqual([
      { label: 'Run minutes', values: [48, 54] },
      { label: 'Vest walk minutes', values: [120, 180] },
      { label: 'Ankle mean', values: [null, 1.5] },
    ]);
    expect(chart.empty).toBe(false);

    const noAnkle = volumeChart(weeks.map((w) => ({ ...w, ankle_mean: null })));
    expect(noAnkle.series.map((s) => s.label)).toEqual(['Run minutes', 'Vest walk minutes']);
    expect(volumeChart([week({ run_minutes: 0, vest_walk_hours: 0 })]).empty).toBe(true);
  });

  it('wellbeing: rolling sleep and energy, RPE as points, Garmin only when present', () => {
    const days = [
      day('2031-01-06', { sleep_quality: 4, energy: 2 }),
      day('2031-01-07', { sleep_quality: 2, energy: 4, run_rpe: 5 }),
      day('2031-01-08'),
    ];
    const chart = wellbeingChart(days);
    expect(chart.series).toEqual([
      { label: 'Sleep (7-day)', values: [4, 3, 3] },
      { label: 'Energy (7-day)', values: [2, 3, 3] },
      { label: 'Run RPE', values: [null, 5, null] },
    ]);

    const withGarmin = wellbeingChart([
      day('2031-01-06', { sleep_quality: 4, energy: 2, metrics: { sleep_score: 80, hrv: 55 } }),
    ]);
    expect(withGarmin.series.map((s) => s.label)).toEqual([
      'Sleep (7-day)',
      'Energy (7-day)',
      'Run RPE',
      'Garmin sleep score',
      'HRV',
    ]);
    expect(wellbeingChart([day('2031-01-06')]).empty).toBe(true);
  });

  it('weight: the entries and their rolling mean', () => {
    const chart = weightChart([
      day('2031-01-06', { weight_kg: 72 }),
      day('2031-01-07'),
      day('2031-01-08', { weight_kg: 71 }),
    ]);
    expect(chart.series).toEqual([
      { label: 'Weight', values: [72, null, 71] },
      { label: '7-day mean', values: [72, 72, 71.5] },
    ]);
    expect(weightChart([day('2031-01-06')]).empty).toBe(true);
  });

  it('lifts: the two main lifts with the most history, gaps left as gaps', () => {
    const chart = liftsChart(weeks);
    expect(chart.series).toEqual([
      { label: 'Back squat', values: [60, 62.5] },
      { label: 'Deadlift', values: [null, 82.5] },
    ]);
    expect(liftsChart([week({ lifts: {} })]).empty).toBe(true);
    expect(latest(chart.series[1] as { label: string; values: (number | null)[] })).toBe(82.5);
    expect(latest({ label: 'x', values: [null, null] })).toBeNull();
  });
});
