import {
  addDays,
  daysBetween,
  isoWeekOf,
  isoWeekStart,
  type SessionKind,
  type TrendDay,
  type TrendWeek,
} from '@ots/shared';

/**
 * Trend summaries, SPEC 8.6. Pure: rows in, summaries out. These describe what
 * was logged; there are no targets, scores, ratios or warnings here.
 */

export interface ActivityRow {
  date: string;
  kind: SessionKind;
  duration_min: number | null;
  rpe: number | null;
}

export interface CheckinRow {
  date: string;
  sleep_quality: number | null;
  energy: number | null;
  weight_kg: number | null;
  ankle_score: number | null;
}

/** One logged set of a main lift (a slot on the linear rule), with the day it was done. */
export interface LiftRow {
  date: string;
  exercise: string;
  load_kg: number | null;
}

export interface MetricRow {
  date: string;
  metric: string;
  value: number;
}

export interface WeekCompliance {
  complete: boolean;
  sessions_planned: number;
  optional_planned: number;
  optional_done: number;
}

const round = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const present = (value: number | null): value is number => value !== null;

/** Every ISO week that overlaps the date range, oldest first. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let monday = isoWeekStart(isoWeekOf(from)); monday <= to; monday = addDays(monday, 7)) {
    weeks.push(isoWeekOf(monday));
  }
  return weeks;
}

export function weeklyTrends(
  weeks: string[],
  input: {
    activities: ActivityRow[];
    checkins: CheckinRow[];
    lifts: LiftRow[];
    compliance: (isoWeek: string) => WeekCompliance;
  },
): TrendWeek[] {
  return weeks.map((iso_week) => {
    const inWeek = <T extends { date: string }>(rows: T[]) =>
      rows.filter((r) => isoWeekOf(r.date) === iso_week);
    const activities = inWeek(input.activities);
    const minutes = (kind: SessionKind) =>
      activities.filter((a) => a.kind === kind).reduce((sum, a) => sum + (a.duration_min ?? 0), 0);
    const runRpe = mean(
      activities
        .filter((a) => a.kind === 'run')
        .map((a) => a.rpe)
        .filter(present),
    );
    const ankle = mean(
      inWeek(input.checkins)
        .map((c) => c.ankle_score)
        .filter(present),
    );

    const lifts: Record<string, number> = {};
    for (const set of inWeek(input.lifts)) {
      if (set.load_kg === null) continue;
      lifts[set.exercise] = Math.max(lifts[set.exercise] ?? 0, set.load_kg);
    }

    return {
      iso_week,
      start_date: isoWeekStart(iso_week),
      run_minutes: round(minutes('run'), 1),
      vest_walk_hours: round(minutes('walk_vest') / 60, 2),
      strength_sessions: activities.filter((a) => a.kind === 'strength').length,
      ...input.compliance(iso_week),
      ankle_mean: ankle === null ? null : round(ankle, 2),
      run_rpe_mean: runRpe === null ? null : round(runRpe, 2),
      lifts,
    };
  });
}

export function dailyTrends(
  from: string,
  to: string,
  input: { activities: ActivityRow[]; checkins: CheckinRow[]; metrics: MetricRow[] },
): TrendDay[] {
  const checkins = new Map(input.checkins.map((c) => [c.date, c]));
  const days: TrendDay[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const date = addDays(from, i);
    const checkin = checkins.get(date);
    const rpe = mean(
      input.activities
        .filter((a) => a.date === date && a.kind === 'run')
        .map((a) => a.rpe)
        .filter(present),
    );
    days.push({
      date,
      sleep_quality: checkin?.sleep_quality ?? null,
      energy: checkin?.energy ?? null,
      weight_kg: checkin?.weight_kg ?? null,
      ankle_score: checkin?.ankle_score ?? null,
      run_rpe: rpe === null ? null : round(rpe, 2),
      metrics: Object.fromEntries(
        input.metrics.filter((m) => m.date === date).map((m) => [m.metric, m.value]),
      ),
    });
  }
  return days;
}
