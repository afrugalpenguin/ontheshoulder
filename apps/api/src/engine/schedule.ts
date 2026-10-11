import { addDays, isoWeekOf, localDate, mondayOf } from '@ots/shared';

/** When the weekly plan is generated: ISO weekday (1 Monday to 7 Sunday) and local HH:MM. */
export interface PlanSchedule {
  weekday: number;
  time: string;
}

export const DEFAULT_PLAN_SCHEDULE: PlanSchedule = { weekday: 7, time: '21:00' };

/**
 * The ISO week that should be generated now, or null if nothing is due. Pure.
 *
 * Once this week's scheduled moment has passed, next week is due until it has
 * been generated; `lastGenerated` is the persisted marker of the last week the
 * scheduler handled, so a restart neither repeats nor skips a run.
 */
export function dueWeek(
  now: Date,
  schedule: PlanSchedule,
  lastGenerated: string | null,
): string | null {
  const today = localDate(now);
  const scheduledDay = addDays(mondayOf(today), schedule.weekday - 1);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const passed = today > scheduledDay || (today === scheduledDay && time >= schedule.time);
  if (!passed) return null;
  const target = isoWeekOf(addDays(mondayOf(today), 7));
  return target === lastGenerated ? null : target;
}
