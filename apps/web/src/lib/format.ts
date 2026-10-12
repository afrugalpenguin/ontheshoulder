import {
  daysBetween,
  type Compliance,
  type Event,
  type SessionKind,
  type SessionStatus,
  type Targets,
  type WeekSession,
} from '@ots/shared';

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const KIND_LABEL: Record<SessionKind, string> = {
  run: 'Run',
  walk_vest: 'Vest walk',
  walk: 'Walk',
  ride: 'Ride',
  swim: 'Swim',
  strength: 'Strength',
  prehab: 'Prehab',
  mobility: 'Mobility',
  rest: 'Rest',
};

/** Short badge text standing in for an icon; always paired with the session name. */
export const KIND_BADGE: Record<SessionKind, string> = {
  run: 'RUN',
  walk_vest: 'VEST',
  walk: 'WALK',
  ride: 'RIDE',
  swim: 'SWIM',
  strength: 'LIFT',
  prehab: 'PRE',
  mobility: 'MOB',
  rest: 'REST',
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Planned',
  done: 'Done',
  skipped: 'Skipped',
  modified: 'Changed',
};

/** 150 becomes "2:30". */
export function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export const isContinuous = (t: Targets): boolean =>
  t.repeats === 1 && (t.walk_block_sec ?? 0) === 0 && t.run_block_sec != null;

/** "50 to 60 min" for a time box, or null when the session is not one. */
export function timeboxText(t: Targets): string | null {
  return t.min_min != null && t.max_min != null ? `${t.min_min} to ${t.max_min} min` : null;
}

/** One line saying what the session asks for, for example "8 x 2:00 / 1:00" or "60 min, 20kg". */
export function targetText(session: Pick<WeekSession, 'targets' | 'template'>): string {
  const t = session.targets;
  const minutes = t.duration_min != null ? `${t.duration_min} min` : '';
  const box = timeboxText(t);
  switch (session.template.kind) {
    case 'run':
      if (box) return `${box}, your pace`;
      if (isContinuous(t)) return `${Math.round((t.run_block_sec as number) / 60)} min continuous`;
      if (t.repeats != null && t.run_block_sec != null) {
        return `${t.repeats} x ${mmss(t.run_block_sec)} / ${mmss(t.walk_block_sec ?? 0)}`;
      }
      return minutes;
    case 'walk_vest': {
      const vest = t.vest_kg ? `${t.vest_kg}kg` : 'no vest';
      return minutes ? `${minutes}, ${vest}` : vest;
    }
    default:
      return box ?? minutes;
  }
}

/** "Monday 6 January" from an ISO date. */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** "6 Jan" from an ISO date. */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${(MONTHS[m - 1] as string).slice(0, 3)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Time from today to a date in weeks and days, for the A event countdown. */
export function countdown(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days < 0) return 'has passed';
  if (days === 0) return 'is today';
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  if (weeks === 0) return `in ${plural(rest, 'day')}`;
  if (rest === 0) return `in ${plural(weeks, 'week')}`;
  return `in ${plural(weeks, 'week')}, ${plural(rest, 'day')}`;
}

/** The A event, and the nearest B or C event still to come. */
export function pickEvents(events: Event[], today: string) {
  const goal = events.find((e) => e.priority === 'A') ?? null;
  const nextUp =
    events
      .filter((e) => e.priority !== 'A' && e.date >= today && e.status !== 'skipped')
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { goal, nextUp };
}

export function nextUpText(event: Event, today: string): string {
  const weeks = Math.round(daysBetween(today, event.date) / 7);
  const when = weeks <= 0 ? 'this week' : `in ${plural(weeks, 'week')}`;
  return `Next up: ${event.name} ${when}`;
}

/** "6 to 12 Jan", or "27 Jan to 2 Feb" when the week crosses a month. */
export function dateRange(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${sameMonth ? Number(from.slice(8)) : shortDate(from)} to ${shortDate(to)}`;
}

export interface WeekLineExtras {
  /** Minutes run so far this week. */
  runMinutes?: number | undefined;
  /** Complete weeks in a row. */
  weeks?: number | null;
  /** Weekday mornings in a row; `capped` when the run may be longer than what was loaded. */
  mornings?: { days: number; capped: boolean } | null;
}

/**
 * The week in one line: compliance, run minutes and streaks, for example
 * "Key sessions 1 of 3 · mornings 2 of 4 · run 45 min · 3 weeks in a row".
 * A part with nothing to say yet is left out: no count of zero, no streak of
 * zero, and nothing about an optional session that has not been done. Null
 * when no part is left.
 */
export function weekLine(c: Compliance, extras: WeekLineExtras = {}): string | null {
  const parts: string[] = [];
  const met = c.required.filter((r) => r.met).length;
  if (met > 0) parts.push(`key sessions ${met} of ${c.required.length}`);
  if (c.treadmill.days_needed > 0 && c.treadmill.days_done > 0) {
    parts.push(`mornings ${c.treadmill.days_done} of ${c.treadmill.days_needed}`);
  }
  // A block with no compliance rule gets a plain count.
  if (c.required.length === 0 && c.treadmill.days_needed === 0 && c.sessions_done > 0) {
    parts.push(`${c.sessions_done} of ${c.sessions_planned} sessions`);
  }
  const run = Math.round(extras.runMinutes ?? 0);
  if (run > 0) parts.push(`run ${run} min`);
  if (c.optional_done > 0) parts.push('bonus done');
  if (extras.weeks) parts.push(`${plural(extras.weeks, 'week')} in a row`);
  if (extras.mornings && extras.mornings.days > 0) {
    const { days, capped } = extras.mornings;
    parts.push(`${days}${capped ? '+' : ''} ${days === 1 ? 'morning' : 'mornings'} in a row`);
  }
  if (parts.length === 0) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Local time of day as HH:MM. */
export function timeOfDay(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
