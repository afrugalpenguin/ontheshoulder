import type { ActivityInput, SessionKind, WeekSession } from '@ots/shared';

/** What the log sheet holds. */
export interface LogFormState {
  duration_min: number | null;
  rpe: number | null;
  notes: string;
}

/** What the primary button on a session card does. */
export type PrimaryAction = 'start' | 'log' | 'done';

/** Timed and set-by-set sessions start, watch-recorded ones are logged after, the rest are ticked. */
export function primaryAction(kind: SessionKind): PrimaryAction {
  switch (kind) {
    case 'walk_vest':
    case 'walk':
    case 'strength':
      return 'start';
    case 'run':
    case 'ride':
    case 'swim':
      return 'log';
    default:
      return 'done';
  }
}

/** Planned minutes for a session, when the plan gives any. */
export function plannedMinutes(session: Pick<WeekSession, 'targets' | 'template'>): number | null {
  return session.targets.duration_min ?? session.template.structure?.duration_min ?? null;
}

/** The sheet pre-filled from the plan, so logging is mostly a matter of confirming. */
export function logDefaults(session: Pick<WeekSession, 'targets' | 'template'>): LogFormState {
  return { duration_min: plannedMinutes(session), rpe: null, notes: '' };
}

/** The activity to send for a session logged through the sheet, or ticked done. */
export function buildActivity(
  session: Pick<WeekSession, 'id' | 'date' | 'template' | 'targets'>,
  form: LogFormState,
): ActivityInput {
  const kind = session.template.kind;
  const activity: ActivityInput = {
    date: session.date,
    kind,
    planned_session_id: session.id,
    duration_min: form.duration_min,
    rpe: form.rpe,
    notes: form.notes.trim() || null,
  };
  // The vest weight is the planned one; it is not asked for again.
  if (kind === 'walk_vest') activity.detail = { vest_kg: session.targets.vest_kg ?? 0 };
  return activity;
}
