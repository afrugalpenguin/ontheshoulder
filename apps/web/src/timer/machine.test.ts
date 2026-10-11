import { describe, expect, it } from 'vitest';
import {
  buildPhases,
  createTimer,
  endEarly,
  pause,
  resume,
  skipPhase,
  start,
  summary,
  tick,
  view,
  type Cue,
  type TimerState,
} from './machine.js';

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = 5_000; // The clock does not start at zero.

/** Ticks every `stepMs` from `from` to `to`, collecting cues with the time they fired. */
function run(state: TimerState, from: number, to: number, stepMs = 200) {
  const cues: (Cue & { firedAt: number })[] = [];
  let s = state;
  for (let t = from; t <= to; t += stepMs) {
    const result = tick(s, t);
    s = result.state;
    for (const c of result.cues) cues.push({ ...c, firedAt: t - T0 });
  }
  return { state: s, cues };
}
const kinds = (cues: Cue[]) => cues.map((c) => c.kind);

describe('buildPhases', () => {
  it('builds warm-up, repeats of work and rest, and cool-down from a structure', () => {
    const phases = buildPhases({
      warmup_min: 5,
      repeats: 2,
      work_sec: 120,
      rest_sec: 60,
      cooldown_min: 5,
      workLabel: 'Run',
      restLabel: 'Walk',
    });
    expect(phases.map((p) => [p.kind, p.label, p.seconds, p.repeat])).toEqual([
      ['warmup', 'Warm-up', 300, undefined],
      ['work', 'Run', 120, 1],
      ['rest', 'Walk', 60, 1],
      ['work', 'Run', 120, 2],
      ['rest', 'Walk', 60, 2],
      ['cooldown', 'Cool-down', 300, undefined],
    ]);
  });

  it('builds one phase from a single duration, and nothing from an empty plan', () => {
    expect(buildPhases({ duration_min: 60, mainLabel: 'Vest walk' })).toEqual([
      { kind: 'main', label: 'Vest walk', seconds: 3600 },
    ]);
    expect(buildPhases({})).toEqual([]);
    expect(buildPhases({ repeats: 3, work_sec: 30 })).toHaveLength(3);
  });
});

describe('timer state machine', () => {
  const intervals = () =>
    start(
      createTimer({ warmup_min: 1, repeats: 2, work_sec: 30, rest_sec: 15, cooldown_min: 1 }),
      T0,
    );

  it('does nothing until started and cannot start an empty plan', () => {
    const idle = createTimer({ duration_min: 1 });
    expect(view(idle, T0 + 10 * SEC)).toMatchObject({ status: 'idle', activeMs: 0, index: 0 });
    expect(tick(idle, T0).cues).toEqual([]);
    expect(start(createTimer({}), T0).status).toBe('idle');
  });

  it('derives the phase and time left from elapsed time', () => {
    const s = intervals();
    expect(view(s, T0 + 20 * SEC)).toMatchObject({ index: 0, phaseRemainingMs: 40 * SEC });
    const inWork = view(s, T0 + 70 * SEC);
    expect(inWork).toMatchObject({
      index: 1,
      phaseElapsedMs: 10 * SEC,
      phaseRemainingMs: 20 * SEC,
    });
    expect(inWork.phase).toMatchObject({ kind: 'work', repeat: 1, repeats: 2 });
    expect(view(s, T0 + 95 * SEC).phase).toMatchObject({ kind: 'rest', repeat: 1 });
    expect(view(s, T0 + 70 * SEC).phaseProgress).toBeCloseTo(1 / 3);
  });

  it('cues each transition once, with 3-2-1 beeps before it, then finishes', () => {
    const { state, cues } = run(intervals(), T0, T0 + 4 * MIN);
    expect(state.status).toBe('done');
    const transitions = cues.filter((c) => c.kind !== 'countdown');
    expect(transitions.map((c) => [c.kind, c.at / SEC])).toEqual([
      ['warmup', 0],
      ['work', 60],
      ['rest', 90],
      ['work', 105],
      ['rest', 135],
      ['cooldown', 150],
      ['finish', 210],
    ]);
    // Three countdown beeps before each of the six phase ends.
    expect(cues.filter((c) => c.kind === 'countdown')).toHaveLength(18);
    expect(
      cues
        .filter((c) => c.kind === 'countdown')
        .slice(0, 3)
        .map((c) => c.at / SEC),
    ).toEqual([57, 58, 59]);
    // Each cue fires on the first tick at or after it is due.
    expect(cues.every((c) => c.firedAt - c.at >= 0 && c.firedAt - c.at < 200)).toBe(true);
  });

  it('stops the clock while paused', () => {
    let s = intervals();
    s = pause(s, T0 + 20 * SEC);
    expect(view(s, T0 + 50 * SEC)).toMatchObject({ status: 'paused', activeMs: 20 * SEC });
    expect(tick(s, T0 + 50 * SEC).cues).toEqual([]);
    s = resume(s, T0 + 80 * SEC);
    expect(view(s, T0 + 90 * SEC)).toMatchObject({
      status: 'running',
      activeMs: 30 * SEC,
      index: 0,
    });
    // Pausing twice or resuming when running changes nothing.
    expect(resume(s, T0 + 95 * SEC)).toBe(s);
    expect(pause(pause(s, T0 + 95 * SEC), T0 + 99 * SEC).pauseStartedAt).toBe(T0 + 95 * SEC);
  });

  it('skips to the next phase, cues it, and keeps the skipped time out of the total', () => {
    let s = intervals();
    s = run(s, T0, T0 + 20 * SEC).state;
    s = skipPhase(s, T0 + 20 * SEC);
    const after = tick(s, T0 + 20 * SEC + 200);
    expect(kinds(after.cues)).toEqual(['work']);
    expect(view(after.state, T0 + 25 * SEC)).toMatchObject({ index: 1, activeMs: 25 * SEC });
    const done = summary(after.state, T0 + 25 * SEC);
    expect(done.phases[0]).toMatchObject({ kind: 'warmup', planned_sec: 60, actual_sec: 20 });
    expect(done.phases[1]).toMatchObject({ kind: 'work', actual_sec: 5 });
  });

  it('skipping the last phase finishes the session', () => {
    let s = start(createTimer({ duration_min: 10 }), T0);
    s = skipPhase(s, T0 + 4 * MIN);
    expect(s.status).toBe('done');
    expect(summary(s, T0 + 9 * MIN)).toMatchObject({
      total_sec: 240,
      completed: false,
      ended_early: false,
    });
  });

  it('ends early with what was done so far', () => {
    let s = intervals();
    s = run(s, T0, T0 + 100 * SEC).state;
    s = endEarly(s, T0 + 100 * SEC);
    expect(s.status).toBe('done');
    const done = summary(s, T0 + 500 * SEC);
    expect(done).toMatchObject({ total_sec: 100, completed: false, ended_early: true });
    expect(done.phases.map((p) => p.actual_sec)).toEqual([60, 30, 10, 0, 0, 0]);
    expect(tick(s, T0 + 500 * SEC).cues).toEqual([]);
  });

  it('reports a full session as completed', () => {
    const { state } = run(intervals(), T0, T0 + 4 * MIN);
    expect(summary(state, T0 + 10 * MIN)).toMatchObject({
      total_sec: 210,
      completed: true,
      ended_early: false,
    });
  });
});

describe('background and resume', () => {
  const vestWalk = () => start(createTimer({ duration_min: 60, halfway: true }), T0);

  it('a 60 minute walk cues the start, half-way, the last three seconds and the finish', () => {
    const { state, cues } = run(vestWalk(), T0, T0 + 60 * MIN + SEC, 250);
    expect(cues.map((c) => [c.kind, c.at / SEC])).toEqual([
      ['main', 0],
      ['halfway', 1800],
      ['countdown', 3597],
      ['countdown', 3598],
      ['countdown', 3599],
      ['finish', 3600],
    ]);
    expect(summary(state, T0 + 61 * MIN).total_sec).toBe(3600);
  });

  it('a simulated 10 minute background gap does not drift and cues half-way once on resume', () => {
    // Runs normally to 25:00, then no ticks at all until 35:00 (screen locked).
    const before = run(vestWalk(), T0, T0 + 25 * MIN);
    expect(kinds(before.cues)).toEqual(['main']);

    const resumedAt = T0 + 35 * MIN;
    const resumed = tick(before.state, resumedAt);
    expect(kinds(resumed.cues)).toEqual(['halfway']);
    expect(view(resumed.state, resumedAt)).toMatchObject({
      activeMs: 35 * MIN,
      phaseRemainingMs: 25 * MIN,
    });

    // Carrying on, nothing is cued twice and the total is exact.
    const after = run(resumed.state, resumedAt + 200, T0 + 60 * MIN + SEC);
    expect(kinds(after.cues)).toEqual(['countdown', 'countdown', 'countdown', 'finish']);
    expect(summary(after.state, T0 + 61 * MIN)).toMatchObject({ total_sec: 3600, completed: true });
  });

  it('fast-forwards through several interval phases in the background and cues only the latest', () => {
    let s = start(
      createTimer({ warmup_min: 1, repeats: 8, work_sec: 120, rest_sec: 60, cooldown_min: 5 }),
      T0,
    );
    s = run(s, T0, T0 + 30 * SEC).state;
    // Ten minutes later: warm-up and three full repeats have gone by.
    const resumed = tick(s, T0 + 10 * MIN + 30 * SEC);
    expect(kinds(resumed.cues)).toEqual(['work']);
    expect(view(resumed.state, T0 + 10 * MIN + 30 * SEC)).toMatchObject({
      index: 7,
      phaseElapsedMs: 30 * SEC,
    });
    expect(view(resumed.state, T0 + 10 * MIN + 30 * SEC).phase).toMatchObject({ repeat: 4 });
  });

  it('a session that ends while in the background finishes on resume with one cue', () => {
    const s = run(vestWalk(), T0, T0 + 55 * MIN).state;
    const resumed = tick(s, T0 + 70 * MIN);
    expect(kinds(resumed.cues)).toEqual(['finish']);
    expect(resumed.state.status).toBe('done');
    expect(summary(resumed.state, T0 + 70 * MIN).total_sec).toBe(3600);
  });
});
