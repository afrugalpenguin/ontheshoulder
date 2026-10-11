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

/** One line saying what the session asks for, for example "8 x 2:00 / 1:00" or "60 min, 20kg". */
export function targetText(session: Pick<WeekSession, 'targets' | 'template'>): string {
  const t = session.targets;
  const minutes = t.duration_min != null ? `${t.duration_min} min` : '';
  switch (session.template.kind) {
    case 'run':
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
      return minutes;
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

/** The week so far in one line. Sunday is reported apart and never as a failure. */
export function complianceText(c: Compliance): { main: string; bonus: string | null } {
  const parts: string[] = [];
  if (c.required.length > 0) {
    const met = c.required.filter((r) => r.met).length;
    parts.push(`key sessions ${met} of ${c.required.length}`);
  }
  if (c.treadmill.days_needed > 0) {
    parts.push(`treadmill mornings ${c.treadmill.days_done} of ${c.treadmill.days_needed}`);
  }
  if (parts.length === 0) parts.push(`${c.sessions_done} of ${c.sessions_planned} sessions done`);
  const main = `${c.complete ? 'Week complete' : 'Week so far'}: ${parts.join(', ')}`;
  const bonus =
    c.optional_planned === 0 ? null : c.optional_done > 0 ? 'Bonus done' : 'Bonus: not this week';
  return { main, bonus };
}

/** Local time of day as HH:MM. */
export function timeOfDay(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
