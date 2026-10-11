/**
 * Interval timer state machine. Pure: every function takes the current time
 * (milliseconds from a monotonic clock such as performance.now) and returns a
 * new state. Position is always derived from elapsed time, never from counting
 * ticks, so a backgrounded tab or a locked phone cannot make it drift.
 */

export type PhaseKind = 'warmup' | 'work' | 'rest' | 'cooldown' | 'main';

export interface Phase {
  kind: PhaseKind;
  label: string;
  seconds: number;
  /** For work and rest phases: which repeat this is, and of how many. */
  repeat?: number;
  repeats?: number;
}

/** What a session asks for, in the terms the timer needs. */
export interface TimerPlan {
  warmup_min?: number | null;
  cooldown_min?: number | null;
  repeats?: number | null;
  work_sec?: number | null;
  rest_sec?: number | null;
  /** Used when there are no repeats: one phase of this length. */
  duration_min?: number | null;
  /** Cue at the half-way point of a single-duration session. */
  halfway?: boolean;
  workLabel?: string;
  restLabel?: string;
  mainLabel?: string;
}

export type CueKind =
  'countdown' | 'work' | 'rest' | 'warmup' | 'cooldown' | 'main' | 'halfway' | 'finish';

export interface Cue {
  kind: CueKind;
  /** Virtual elapsed time at which the cue was due, in ms. */
  at: number;
}

export interface TimerState {
  phases: Phase[];
  halfwayAt: number | null;
  status: 'idle' | 'running' | 'paused' | 'done';
  /** Clock reading when the timer was started. */
  startedAt: number;
  /** Clock reading when the current pause began. */
  pauseStartedAt: number | null;
  /** Total time spent paused so far, ms. */
  pausedMs: number;
  /** Planned time jumped over by skipping phases, ms. */
  skippedMs: number;
  /** Phases the user skipped out of, with the time actually spent in each. */
  skips: { index: number; doneMs: number }[];
  /** Virtual elapsed time the cues have been issued up to. */
  cuedTo: number;
  /** Virtual elapsed time at which the timer ended (naturally or early). */
  endedAt: number | null;
}

const COUNTDOWN_SECONDS = [3, 2, 1];
/** A tick that covers more than this is a resume from the background, not a normal tick. */
const GAP_MS = 1500;

export function buildPhases(plan: TimerPlan): Phase[] {
  const phases: Phase[] = [];
  const repeats = plan.repeats ?? 0;
  const work = plan.work_sec ?? 0;
  if (repeats > 0 && work > 0) {
    if (plan.warmup_min)
      phases.push({ kind: 'warmup', label: 'Warm-up', seconds: plan.warmup_min * 60 });
    const rest = plan.rest_sec ?? 0;
    for (let i = 1; i <= repeats; i++) {
      phases.push({
        kind: 'work',
        label: plan.workLabel ?? 'Work',
        seconds: work,
        repeat: i,
        repeats,
      });
      if (rest > 0) {
        phases.push({
          kind: 'rest',
          label: plan.restLabel ?? 'Rest',
          seconds: rest,
          repeat: i,
          repeats,
        });
      }
    }
    if (plan.cooldown_min) {
      phases.push({ kind: 'cooldown', label: 'Cool-down', seconds: plan.cooldown_min * 60 });
    }
    return phases;
  }
  if (plan.duration_min && plan.duration_min > 0) {
    phases.push({ kind: 'main', label: plan.mainLabel ?? 'Go', seconds: plan.duration_min * 60 });
  }
  return phases;
}

export function createTimer(plan: TimerPlan): TimerState {
  const phases = buildPhases(plan);
  const single = phases.length === 1 && phases[0]?.kind === 'main';
  return {
    phases,
    halfwayAt: plan.halfway && single ? ((phases[0] as Phase).seconds * 1000) / 2 : null,
    status: 'idle',
    startedAt: 0,
    pauseStartedAt: null,
    pausedMs: 0,
    skippedMs: 0,
    skips: [],
    cuedTo: 0,
    endedAt: null,
  };
}

export const totalMs = (state: TimerState): number =>
  state.phases.reduce((sum, p) => sum + p.seconds * 1000, 0);

/** Start time of each phase on the virtual timeline, ms. */
function starts(phases: Phase[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const p of phases) {
    out.push(at);
    at += p.seconds * 1000;
  }
  return out;
}

/**
 * Position on the planned timeline: active time plus whatever was skipped.
 * Stops advancing while paused and once the timer has ended.
 */
export function virtualElapsed(state: TimerState, now: number): number {
  if (state.status === 'idle') return 0;
  if (state.endedAt !== null) return state.endedAt;
  const clock = state.pauseStartedAt ?? now;
  const raw = clock - state.startedAt - state.pausedMs + state.skippedMs;
  return Math.max(0, Math.min(raw, totalMs(state)));
}

export interface TimerView {
  status: TimerState['status'];
  index: number;
  phase: Phase | null;
  phaseRemainingMs: number;
  phaseElapsedMs: number;
  /** Time actually spent, excluding pauses and skipped time. */
  activeMs: number;
  /** 0 to 1 through the current phase. */
  phaseProgress: number;
  /** 0 to 1 through the whole plan. */
  totalProgress: number;
}

export function view(state: TimerState, now: number): TimerView {
  const elapsed = virtualElapsed(state, now);
  const begin = starts(state.phases);
  let index = state.phases.length - 1;
  for (let i = 0; i < state.phases.length; i++) {
    if (elapsed < (begin[i] as number) + (state.phases[i] as Phase).seconds * 1000) {
      index = i;
      break;
    }
  }
  const phase = state.phases[index] ?? null;
  const phaseMs = (phase?.seconds ?? 0) * 1000;
  const phaseElapsedMs = phase ? Math.min(elapsed - (begin[index] as number), phaseMs) : 0;
  const total = totalMs(state);
  return {
    status: state.status,
    index: Math.max(index, 0),
    phase,
    phaseElapsedMs,
    phaseRemainingMs: phaseMs - phaseElapsedMs,
    activeMs: elapsed - state.skippedMs,
    phaseProgress: phaseMs === 0 ? 1 : phaseElapsedMs / phaseMs,
    totalProgress: total === 0 ? 1 : elapsed / total,
  };
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status !== 'idle' || state.phases.length === 0) return state;
  return { ...state, status: 'running', startedAt: now };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', pauseStartedAt: now };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused' || state.pauseStartedAt === null) return state;
  return {
    ...state,
    status: 'running',
    pausedMs: state.pausedMs + (now - state.pauseStartedAt),
    pauseStartedAt: null,
  };
}

/** Jumps to the start of the next phase. Skipping the last phase ends the timer. */
export function skipPhase(state: TimerState, now: number): TimerState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  const current = view(state, now);
  const jumped: TimerState = {
    ...state,
    skippedMs: state.skippedMs + current.phaseRemainingMs,
    skips: [...state.skips, { index: current.index, doneMs: current.phaseElapsedMs }],
    // Nothing in the skipped stretch should cue; the new phase's own cue still will.
    cuedTo: virtualElapsed(state, now) + current.phaseRemainingMs - 1,
  };
  if (current.index >= state.phases.length - 1) {
    return { ...jumped, status: 'done', endedAt: totalMs(state), pauseStartedAt: null };
  }
  return jumped;
}

export function endEarly(state: TimerState, now: number): TimerState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  return { ...state, status: 'done', endedAt: virtualElapsed(state, now), pauseStartedAt: null };
}

/** Every cue on the planned timeline, in order. */
function schedule(state: TimerState): Cue[] {
  const cues: Cue[] = [];
  const begin = starts(state.phases);
  state.phases.forEach((phase, i) => {
    const at = begin[i] as number;
    cues.push({ kind: phase.kind, at });
    const end = at + phase.seconds * 1000;
    for (const s of COUNTDOWN_SECONDS) {
      if (phase.seconds > s) cues.push({ kind: 'countdown', at: end - s * 1000 });
    }
  });
  if (state.halfwayAt !== null) cues.push({ kind: 'halfway', at: state.halfwayAt });
  cues.push({ kind: 'finish', at: totalMs(state) });
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * Advances the timer to `now` and returns the cues that became due. After a
 * gap (the phone was locked, the tab was in the background) the phases that
 * went by are fast-forwarded and only the most recent cue is issued, once.
 */
export function tick(state: TimerState, now: number): { state: TimerState; cues: Cue[] } {
  if (state.status !== 'running') return { state, cues: [] };
  const elapsed = virtualElapsed(state, now);
  const first = state.cuedTo === 0 && elapsed >= 0 && state.skips.length === 0;
  let due = schedule(state).filter(
    (c) => (first ? c.at >= 0 : c.at > state.cuedTo) && c.at <= elapsed,
  );
  if (elapsed - state.cuedTo > GAP_MS && due.length > 1) {
    const last = due.filter((c) => c.kind !== 'countdown').pop();
    due = last ? [last] : [];
  }
  const finished = elapsed >= totalMs(state);
  return {
    state: {
      ...state,
      // Keep cuedTo strictly positive once anything has been processed, so the
      // opening cue at 0 is issued exactly once.
      cuedTo: Math.max(elapsed, 1),
      ...(finished ? { status: 'done' as const, endedAt: totalMs(state) } : {}),
    },
    cues: due,
  };
}

export interface ExecutedPhase {
  kind: PhaseKind;
  label: string;
  planned_sec: number;
  actual_sec: number;
}

export interface TimerSummary {
  total_sec: number;
  completed: boolean;
  ended_early: boolean;
  phases: ExecutedPhase[];
}

/** What was actually done, for the activity log. */
export function summary(state: TimerState, now: number): TimerSummary {
  const elapsed = virtualElapsed(state, now);
  const begin = starts(state.phases);
  const phases = state.phases.map((phase, i) => {
    const skipped = state.skips.find((s) => s.index === i);
    const planned = phase.seconds * 1000;
    const done = skipped
      ? skipped.doneMs
      : Math.max(0, Math.min(elapsed - (begin[i] as number), planned));
    return {
      kind: phase.kind,
      label: phase.label,
      planned_sec: phase.seconds,
      actual_sec: Math.round(done / 1000),
    };
  });
  const full = elapsed >= totalMs(state);
  return {
    total_sec: Math.round((elapsed - state.skippedMs) / 1000),
    completed: full && state.skips.length === 0,
    ended_early: !full,
    phases,
  };
}
