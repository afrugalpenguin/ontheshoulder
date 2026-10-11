import type { Habit, WeekSession } from '@ots/shared';
import { KIND_LABEL, targetText } from './format.js';

/** The habit ticked from the evening banner. It is recorded on the next day's check-in. */
export const KIT_READY = 'kit_ready';

/** Local time of day from which tomorrow's banner shows. */
export const KIT_PROMPT_FROM = '20:00';

/** Used when the habit has no text of its own. `{session}` is replaced by what is planned. */
export const KIT_PROMPT_DEFAULT = 'Tomorrow: {session}. Kit out?';

type Planned = Pick<WeekSession, 'targets' | 'template' | 'status'>;

/** "run, 50 to 60 min" for one session. */
function describe(session: Planned): string {
  const kind = KIND_LABEL[session.template.kind].toLowerCase();
  const target = targetText(session);
  return target ? `${kind}, ${target}` : kind;
}

/**
 * The evening banner for tomorrow, or null when there is nothing to say: before
 * the time, nothing planned, or the habit switched off. The wording comes from
 * the kit_ready habit so it can be edited in Settings.
 */
export function kitPrompt(habits: Habit[], tomorrow: Planned[], time: string): string | null {
  if (time < KIT_PROMPT_FROM) return null;
  const habit = habits.find((h) => h.key === KIT_READY);
  if (habit && !habit.enabled) return null;
  const sessions = tomorrow.filter((s) => s.template.kind !== 'rest' && s.status !== 'skipped');
  if (sessions.length === 0) return null;
  const template = habit?.prompt_text || KIT_PROMPT_DEFAULT;
  return template.replace('{session}', sessions.map(describe).join(' and '));
}
