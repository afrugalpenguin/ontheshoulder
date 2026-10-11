/** Calendar helpers on plain ISO strings (YYYY-MM-DD). All arithmetic is in UTC so DST cannot shift a date. */

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export function weekdayOf(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

/** ISO 8601 week label, for example 2031-W07. */
export function isoWeekOf(date: string): string {
  // The ISO year is the year of the Thursday in the same week.
  const thursday = addDays(mondayOf(date), 3);
  const year = Number(thursday.slice(0, 4));
  const firstThursday = addDays(mondayOf(`${year}-01-04`), 3);
  const week = daysBetween(firstThursday, thursday) / 7 + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isIsoWeek(value: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(value)) return false;
  return isoWeekOf(isoWeekStart(value)) === value;
}

/** Monday of an ISO week label. */
export function isoWeekStart(isoWeek: string): string {
  const year = Number(isoWeek.slice(0, 4));
  const week = Number(isoWeek.slice(6));
  return addDays(mondayOf(`${year}-01-04`), (week - 1) * 7);
}

/** The seven dates of an ISO week, Monday first. */
export function isoWeekDates(isoWeek: string): string[] {
  const start = isoWeekStart(isoWeek);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Local calendar date of a Date as YYYY-MM-DD. */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
