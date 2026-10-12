import { addDays, mondayOf, type TrendDay, type TrendWeek } from '@ots/shared';

// Pure shaping of trend data for the charts. No drawing here.

export const RANGES = [4, 8, 12] as const;
export type RangeWeeks = (typeof RANGES)[number];

/** The date range for the last `weeks` ISO weeks, ending with the week `today` is in. */
export function rangeFor(today: string, weeks: number): { from: string; to: string } {
  const monday = mondayOf(today);
  return { from: addDays(monday, -7 * (weeks - 1)), to: addDays(monday, 6) };
}

/**
 * Trailing mean over `window` entries, ignoring gaps. A day is null only when
 * its whole window has no values, so one missed check-in does not break the line.
 */
export function rolling(values: (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v !== null);
    if (slice.length === 0) return null;
    return Math.round((slice.reduce((sum, v) => sum + v, 0) / slice.length) * 100) / 100;
  });
}

/** Seconds since the epoch at UTC midnight of an ISO date, the x value uPlot wants. */
export const toX = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 1000;

export interface Series {
  label: string;
  values: (number | null)[];
}

export interface ChartData {
  x: number[];
  series: Series[];
  /** True when there is nothing to draw. */
  empty: boolean;
}

const hasValue = (values: (number | null)[]) => values.some((v) => v !== null && v !== 0);
const anyValue = (values: (number | null)[]) => values.some((v) => v !== null);

/** Weekly run minutes and vest-walk time, with the ankle mean only if any scores exist. */
export function volumeChart(weeks: TrendWeek[]): ChartData {
  const run = weeks.map((w) => w.run_minutes);
  const vest = weeks.map((w) => Math.round(w.vest_walk_hours * 60));
  const ankle = weeks.map((w) => w.ankle_mean);
  const series: Series[] = [
    { label: 'Run minutes', values: run },
    { label: 'Vest walk minutes', values: vest },
  ];
  if (anyValue(ankle)) series.push({ label: 'Ankle mean', values: ankle });
  return {
    x: weeks.map((w) => toX(w.start_date)),
    series,
    empty: !hasValue(run) && !hasValue(vest),
  };
}

/** A week with nothing planned and nothing complete: drawn as an empty cell in the grid. */
export const isUnplanned = (week: Pick<TrendWeek, 'sessions_planned' | 'complete'>): boolean =>
  week.sessions_planned === 0 && !week.complete;

/** Weight as entered, and its 7-day rolling mean. */
export function weightChart(days: TrendDay[]): ChartData {
  const weight = days.map((d) => d.weight_kg);
  return {
    x: days.map((d) => toX(d.date)),
    series: [
      { label: 'Weight', values: weight },
      { label: '7-day mean', values: rolling(weight) },
    ],
    empty: !anyValue(weight),
  };
}

/** Working weight per week for the two main lifts with the most history. */
export function liftsChart(weeks: TrendWeek[]): ChartData {
  const counts = new Map<string, number>();
  for (const w of weeks) {
    for (const name of Object.keys(w.lifts)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([name]) => name);
  return {
    x: weeks.map((w) => toX(w.start_date)),
    series: names.map((name) => ({ label: name, values: weeks.map((w) => w.lifts[name] ?? null) })),
    empty: names.length === 0,
  };
}

/** The most recent value of a series, for the text shown beside each chart. */
export function latest(series: Series): number | null {
  for (let i = series.values.length - 1; i >= 0; i--) {
    const v = series.values[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** The two-answer habit that records weeknights, and what its line is called. */
export const WEEKNIGHTS_HABIT = 'alcohol_free';
export const WEEKNIGHTS_LABEL = 'AF weeknights';

/**
 * One plain line per week for a two-answer habit, newest first, for example
 * "AF weeknights: 3 of 4" or "AF weeknights: 3 of 4, 1 not recorded". A morning
 * with no answer is not recorded, never a "no"; a morning still to come is not
 * mentioned. Weeks before the first answer are left out, and so is a week whose
 * first asked morning has not arrived.
 */
export function answerLines(
  weeks: TrendWeek[],
  key: string,
  label: string,
  today: string,
): { iso_week: string; start_date: string; text: string }[] {
  const first = weeks.findIndex((w) => {
    const a = w.habit_answers[key];
    return a !== undefined && a.yes + a.no > 0;
  });
  if (first === -1) return [];
  const lines = [];
  for (const week of weeks.slice(first)) {
    const answers = week.habit_answers[key];
    if (!answers) continue;
    const due = answers.dates.filter((d) => d <= today).length;
    if (due === 0) continue;
    const missing = Math.max(0, due - answers.yes - answers.no);
    lines.push({
      iso_week: week.iso_week,
      start_date: week.start_date,
      text:
        `${label}: ${answers.yes} of ${answers.dates.length}` +
        (missing > 0 ? `, ${missing} not recorded` : ''),
    });
  }
  return lines.reverse();
}
