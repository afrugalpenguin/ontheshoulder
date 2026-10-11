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

export interface FinishForm {
  rpe: number | null;
  notes: string;
}

/** The activity to save when a timed session is finished. */
export function finishPayload(
  session: Pick<WeekSession, 'id' | 'date' | 'targets' | 'template'>,
  summary: TimerSummary,
  form: FinishForm,
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
    duration_min: Math.round(summary.total_sec / 6) / 10,
    rpe: form.rpe,
    notes: form.notes.trim() || null,
    detail,
  };
}
