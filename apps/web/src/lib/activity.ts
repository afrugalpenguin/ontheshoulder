import type { ActivityInput, SessionKind, WeekSession } from '@ots/shared';
import { isContinuous } from './format.js';

/** What the log form holds. Numbers are kept as text while the user types. */
export interface LogFormState {
  duration_min: string;
  distance_km: string;
  vest_kg: string;
  repeats: string;
  run_block_sec: string;
  walk_block_sec: string;
  continuous: boolean;
  surface: string;
  rpe: number | null;
  notes: string;
}

export const SURFACES = ['treadmill', 'road', 'trail', 'track'] as const;

const text = (n: number | null | undefined): string => (n == null ? '' : String(n));

/** Which fields the form shows for a kind of session. */
export function fieldsFor(kind: SessionKind): (keyof LogFormState)[] {
  switch (kind) {
    case 'run':
      return [
        'continuous',
        'repeats',
        'run_block_sec',
        'walk_block_sec',
        'duration_min',
        'distance_km',
        'surface',
      ];
    case 'walk_vest':
      return ['duration_min', 'vest_kg'];
    case 'ride':
    case 'swim':
      return ['duration_min', 'distance_km'];
    default:
      return ['duration_min'];
  }
}

/** The form pre-filled from the plan, so logging is mostly a matter of confirming. */
export function logDefaults(session: Pick<WeekSession, 'targets' | 'template'>): LogFormState {
  const t = session.targets;
  return {
    duration_min: text(t.duration_min ?? session.template.structure?.duration_min),
    distance_km: text(t.distance_km),
    vest_kg: text(t.vest_kg),
    repeats: text(t.repeats),
    run_block_sec: text(t.run_block_sec),
    walk_block_sec: text(t.walk_block_sec),
    continuous: isContinuous(t),
    surface: session.template.kind === 'run' ? 'treadmill' : '',
    rpe: null,
    notes: '',
  };
}

const num = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The activity to send for a session logged through the form. */
export function buildActivity(
  session: Pick<WeekSession, 'id' | 'date' | 'template'>,
  form: LogFormState,
): ActivityInput {
  const kind = session.template.kind;
  const shown = new Set(fieldsFor(kind));
  const activity: ActivityInput = {
    date: session.date,
    kind,
    planned_session_id: session.id,
    duration_min: num(form.duration_min),
    rpe: form.rpe,
    notes: form.notes.trim() || null,
  };
  if (shown.has('distance_km')) activity.distance_km = num(form.distance_km);

  if (kind === 'walk_vest') {
    activity.detail = { vest_kg: num(form.vest_kg) ?? 0 };
  } else if (kind === 'run') {
    activity.detail = form.continuous
      ? { continuous: true, surface: form.surface || null }
      : {
          continuous: false,
          repeats: num(form.repeats),
          run_block_sec: num(form.run_block_sec),
          walk_block_sec: num(form.walk_block_sec),
          surface: form.surface || null,
        };
  }
  return activity;
}
