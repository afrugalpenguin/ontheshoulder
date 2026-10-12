import { describe, expect, it } from 'vitest';
import {
  dailyTrends,
  weeklyTrends,
  weeksBetween,
  type ActivityRow,
  type CheckinRow,
  type LiftRow,
} from './compute.js';

// Two hand-checkable weeks. 2031-W02 is Monday 6 to Sunday 12 January.

const ACTIVITIES: ActivityRow[] = [
  { date: '2031-01-06', kind: 'walk_vest', duration_min: 60, rpe: 3 },
  { date: '2031-01-07', kind: 'run', duration_min: 34, rpe: 4 },
  { date: '2031-01-08', kind: 'walk_vest', duration_min: 55, rpe: null },
  { date: '2031-01-08', kind: 'strength', duration_min: 40, rpe: null },
  { date: '2031-01-10', kind: 'strength', duration_min: 35, rpe: null },
  { date: '2031-01-12', kind: 'run', duration_min: 20, rpe: 7 },
  { date: '2031-01-12', kind: 'ride', duration_min: 90, rpe: 5 },
  // Next week.
  { date: '2031-01-14', kind: 'run', duration_min: 38, rpe: null },
  { date: '2031-01-15', kind: 'walk_vest', duration_min: null, rpe: null },
];

const CHECKINS: CheckinRow[] = [
  { date: '2031-01-06', sleep_quality: 4, energy: 3, weight_kg: 72, ankle_score: 2 },
  { date: '2031-01-07', sleep_quality: 3, energy: 4, weight_kg: null, ankle_score: 1 },
  { date: '2031-01-09', sleep_quality: 5, energy: 5, weight_kg: 71.6, ankle_score: null },
  { date: '2031-01-13', sleep_quality: 2, energy: 2, weight_kg: 71.8, ankle_score: null },
];

const LIFTS: LiftRow[] = [
  { date: '2031-01-08', exercise: 'Back squat', load_kg: 60 },
  { date: '2031-01-08', exercise: 'Back squat', load_kg: 62.5 },
  { date: '2031-01-08', exercise: 'Back squat', load_kg: null },
  { date: '2031-01-10', exercise: 'Deadlift', load_kg: 80 },
  { date: '2031-01-15', exercise: 'Back squat', load_kg: 65 },
];

const compliance = (isoWeek: string) => ({
  complete: isoWeek === '2031-W02',
  sessions_planned: 10,
  optional_planned: 1,
  optional_done: isoWeek === '2031-W02' ? 1 : 0,
});

describe('weeksBetween', () => {
  it('lists every ISO week the range touches, including a midweek start', () => {
    expect(weeksBetween('2031-01-08', '2031-01-20')).toEqual(['2031-W02', '2031-W03', '2031-W04']);
    expect(weeksBetween('2031-01-06', '2031-01-12')).toEqual(['2031-W02']);
    expect(weeksBetween('2031-01-12', '2031-01-12')).toEqual(['2031-W02']);
  });
});

describe('weeklyTrends', () => {
  const [w2, w3, w4] = weeklyTrends(['2031-W02', '2031-W03', '2031-W04'], {
    activities: ACTIVITIES,
    checkins: CHECKINS,
    lifts: LIFTS,
    compliance,
  });

  it('worked example, 2031-W02', () => {
    expect(w2).toEqual({
      iso_week: '2031-W02',
      start_date: '2031-01-06',
      // Runs: 34 + 20. The ride is not a run.
      run_minutes: 54,
      // Vest walks: (60 + 55) / 60 = 1.9166..., to two places.
      vest_walk_hours: 1.92,
      strength_sessions: 2,
      complete: true,
      sessions_planned: 10,
      optional_planned: 1,
      optional_done: 1,
      // Ankle scores entered: 2 and 1. The day with none does not count as zero.
      ankle_mean: 1.5,
      // Run RPE: (4 + 7) / 2.
      run_rpe_mean: 5.5,
      // Heaviest set of each main lift that week.
      lifts: { 'Back squat': 62.5, Deadlift: 80 },
      habit_answers: {},
    });
  });

  it('a week with gaps: null means, not zeros', () => {
    expect(w3).toEqual({
      iso_week: '2031-W03',
      start_date: '2031-01-13',
      run_minutes: 38,
      vest_walk_hours: 0,
      strength_sessions: 0,
      complete: false,
      sessions_planned: 10,
      optional_planned: 1,
      optional_done: 0,
      ankle_mean: null,
      run_rpe_mean: null,
      lifts: { 'Back squat': 65 },
      habit_answers: {},
    });
  });

  it('an empty week is all zeros and nulls', () => {
    expect(w4).toMatchObject({
      iso_week: '2031-W04',
      run_minutes: 0,
      vest_walk_hours: 0,
      strength_sessions: 0,
      ankle_mean: null,
      run_rpe_mean: null,
      lifts: {},
    });
  });
});

describe('dailyTrends', () => {
  const days = dailyTrends('2031-01-06', '2031-01-12', {
    activities: ACTIVITIES,
    checkins: CHECKINS,
    metrics: [
      { date: '2031-01-07', metric: 'sleep_score', value: 81 },
      { date: '2031-01-07', metric: 'hrv', value: 55 },
    ],
  });

  it('has one row per day in the range, with nulls where nothing was entered', () => {
    expect(days.map((d) => d.date)).toEqual([
      '2031-01-06',
      '2031-01-07',
      '2031-01-08',
      '2031-01-09',
      '2031-01-10',
      '2031-01-11',
      '2031-01-12',
    ]);
    expect(days[2]).toEqual({
      date: '2031-01-08',
      sleep_quality: null,
      energy: null,
      weight_kg: null,
      ankle_score: null,
      run_rpe: null,
      metrics: {},
    });
  });

  it('carries the check-in, the run RPE and other metrics for the day', () => {
    expect(days[1]).toEqual({
      date: '2031-01-07',
      sleep_quality: 3,
      energy: 4,
      weight_kg: null,
      ankle_score: 1,
      run_rpe: 4,
      metrics: { sleep_score: 81, hrv: 55 },
    });
    expect(days[0]).toMatchObject({ weight_kg: 72, run_rpe: null });
    expect(days[6]).toMatchObject({ run_rpe: 7, sleep_quality: null });
  });
});

describe('weeklyTrends: two-answer habits', () => {
  const weeknights = { key: 'alcohol_free', weekdays: [2, 3, 4, 5] };
  const checkin = (date: string, habits: Record<string, boolean>): CheckinRow => ({
    date,
    sleep_quality: null,
    energy: null,
    weight_kg: null,
    ankle_score: null,
    habits,
  });
  const [week] = weeklyTrends(['2031-W02'], {
    activities: [],
    lifts: [],
    compliance,
    answerHabits: [weeknights, { key: 'every_day', weekdays: null }],
    checkins: [
      // Monday is not an asked day, so an answer saved on it is not counted.
      checkin('2031-01-06', { alcohol_free: false }),
      checkin('2031-01-07', { alcohol_free: true, every_day: true }),
      checkin('2031-01-08', { alcohol_free: false }),
      // Thursday has a check-in with no answer, Friday has no check-in at all.
      checkin('2031-01-09', { protein_shake: true }),
    ],
  });

  it('counts each answer on the asked days and leaves the rest unanswered', () => {
    expect(week?.habit_answers.alcohol_free).toEqual({
      dates: ['2031-01-07', '2031-01-08', '2031-01-09', '2031-01-10'],
      yes: 1,
      no: 1,
    });
  });

  it('a habit with no days is asked every day of the week', () => {
    expect(week?.habit_answers.every_day).toMatchObject({ yes: 1, no: 0 });
    expect(week?.habit_answers.every_day?.dates).toHaveLength(7);
  });
});
