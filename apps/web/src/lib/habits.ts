import { weekdayOf, type Checkin, type Habit } from '@ots/shared';
import { KIT_READY } from './kit.js';

/** Whether a habit is asked on a date: every day, unless it has its own weekdays. */
export function isAskedOn(habit: Pick<Habit, 'weekdays'>, date: string): boolean {
  return habit.weekdays == null || habit.weekdays.includes(weekdayOf(date));
}

/**
 * The habits the check-in shows on a date: switched on and asked that day. The
 * kit habit is about tomorrow and has its own banner, so it is never one.
 */
export function habitsFor(habits: Habit[], date: string): Habit[] {
  return habits.filter((h) => h.enabled && h.key !== KIT_READY && isAskedOn(h, date));
}

/** A habit answered with one of two labels instead of ticked. */
export const isTwoAnswer = <T extends Pick<Habit, 'answer_labels'>>(
  habit: T,
): habit is T & { answer_labels: [string, string] } => habit.answer_labels != null;

/** The label of the answer saved for a two-answer habit, or null when it has none yet. */
export function answerLabel(
  habit: Pick<Habit, 'key' | 'answer_labels'>,
  checkin: Pick<Checkin, 'habits'>,
): string | null {
  const answer = checkin.habits[habit.key];
  if (!isTwoAnswer(habit) || answer === undefined) return null;
  return answer ? habit.answer_labels[0] : habit.answer_labels[1];
}
