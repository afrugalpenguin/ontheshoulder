import type { Checkin, Habit } from '@ots/shared';
import { KIT_READY } from './kit.js';

/**
 * Habits whose prompt should show right now: enabled, with prompt text, not yet
 * past the cut-off time, not ticked today and not dismissed today.
 * `time` is local HH:MM. A habit with no cut-off prompts all day. The kit
 * habit is about tomorrow and has its own banner, so it never shows here.
 */
export function activePrompts(
  habits: Habit[],
  checkin: Pick<Checkin, 'habits' | 'dismissed_prompts'>,
  time: string,
): Habit[] {
  return habits.filter(
    (h) =>
      h.enabled &&
      h.key !== KIT_READY &&
      !!h.prompt_text &&
      (h.prompt_until === null || time < h.prompt_until) &&
      checkin.habits[h.key] !== true &&
      !checkin.dismissed_prompts.includes(h.key),
  );
}
