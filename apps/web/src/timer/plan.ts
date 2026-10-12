import type { ActivityInput, WeekSession } from '@ots/shared';
import { isContinuous } from '../lib/format.js';
import type { TimerPlan, TimerSummary } from './machine.js';

type Timed = Pick<WeekSession, 'targets' | 'template'>;

/**
 * Turns a planned session into a timer plan. Sessions with run and walk blocks
 * get warm-up, repeats and cool-down; everything else is a single stretch with
 * a cue at half-way.
 */
export function timerPlanFor(session: Timed): TimerPlan {
  const t = session.targets;
  const structure = session.template.structure ?? {};
  if (t.repeats != null && t.run_block_sec != null && !isContinuous(t)) {
    return {
      warmup_min: structure.warmup_min ?? 0,
      cooldown_min: structure.cooldown_min ?? 0,
      repeats: t.repeats,
      work_sec: t.run_block_sec,
      rest_sec: t.walk_block_sec ?? 0,
      workLabel: 'Run',
      restLabel: 'Walk',
    };
  }
  return {
    duration_min: t.duration_min ?? structure.duration_min ?? null,
    halfway: true,
    mainLabel: session.template.name,
  };
}

/**
 * A timer finished with less than this on the clock was most likely started or
 * stopped by mistake, so its time is not saved without asking.
 */
export const SHORT_FINISH_SEC = 5 * 60;

/** Whether to ask which time to log: the timer ran short and the plan has a duration to offer. */
export const isShortFinish = (summary: TimerSummary, plannedMin: number | null): boolean =>
  plannedMin !== null && summary.total_sec < SHORT_FINISH_SEC;

export interface FinishForm {
  rpe: number | null;
  notes: string;
}

/**
 * The activity to save when a timed session is finished. `minutes` replaces the
 * timed duration when the planned one was chosen instead; what the timer
 * recorded is kept in the detail either way.
 */
export function finishPayload(
  session: Pick<WeekSession, 'id' | 'date' | 'targets' | 'template'>,
  summary: TimerSummary,
  form: FinishForm,
  minutes?: number,
): ActivityInput {
  const detail: Record<string, unknown> = {
    timer: {
      total_sec: summary.total_sec,
      completed: summary.completed,
      ended_early: summary.ended_early,
      phases: summary.phases,
    },
  };
  if (session.template.kind === 'walk_vest') detail.vest_kg = session.targets.vest_kg ?? 0;
  return {
    date: session.date,
    kind: session.template.kind,
    planned_session_id: session.id,
    // Minutes to one decimal place, from what was actually timed.
    duration_min: minutes ?? Math.round(summary.total_sec / 6) / 10,
    rpe: form.rpe,
    notes: form.notes.trim() || null,
    detail,
  };
}
