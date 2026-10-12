import { addDays, weekdayOf, type TrendWeek, type WeekSession } from '@ots/shared';

/**
 * Consecutive complete weeks, newest last in `weeks`. The week in progress
 * counts once it is complete and never breaks the run before then.
 */
export function completeWeekStreak(
  weeks: Pick<TrendWeek, 'iso_week' | 'complete'>[],
  currentWeek: string,
): number {
  let streak = 0;
  for (const week of [...weeks].reverse()) {
    if (week.iso_week > currentWeek) continue;
    if (week.complete) streak++;
    else if (week.iso_week !== currentWeek) break;
  }
  return streak;
}

type Done = Pick<WeekSession, 'date' | 'slot' | 'status'> & {
  template?: Pick<WeekSession['template'], 'kind'>;
};

/**
 * Consecutive weekdays, counting back from today, with a morning session done.
 * Prehab does not make a morning: it is the eight minutes before the session.
 * Weekends are stepped over, and today does not break the run while it is still
 * open. Stops at `earliest`, the first date the sessions cover; `capped` says
 * the run reached that far and may be longer.
 */
export function morningStreak(
  sessions: Done[],
  today: string,
  earliest: string,
): { days: number; capped: boolean } {
  const done = new Set(
    sessions
      .filter((s) => s.slot === 'am' && s.status === 'done' && s.template?.kind !== 'prehab')
      .map((s) => s.date),
  );
  let days = 0;
  for (let date = today; date >= earliest; date = addDays(date, -1)) {
    if (weekdayOf(date) > 5) continue;
    if (done.has(date)) days++;
    else if (date !== today) return { days, capped: false };
  }
  return { days, capped: true };
}
