import { describe, expect, it } from 'vitest';
import { session } from '../test/fixtures.js';
import { createTimer, endEarly, start, summary, tick } from './machine.js';
import { finishPayload, timerPlanFor } from './plan.js';

const MIN = 60_000;

describe('timerPlanFor', () => {
  it('times a vest walk as one stretch with a half-way cue', () => {
    const walk = session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 });
    expect(timerPlanFor(walk)).toEqual({ duration_min: 60, halfway: true, mainLabel: 'Vest walk' });
  });

  it('times a run-walk session as warm-up, repeats and cool-down', () => {
    const run = session(
      'run',
      'Midweek run',
      { repeats: 8, run_block_sec: 120, walk_block_sec: 60, duration_min: 34 },
      {
        template: {
          key: 'midweek_run',
          kind: 'run',
          name: 'Midweek run',
          structure: { warmup_min: 5, repeats: 8, run_sec: 120, walk_sec: 60, cooldown_min: 5 },
          programme_day_id: null,
        },
      },
    );
    expect(timerPlanFor(run)).toEqual({
      warmup_min: 5,
      cooldown_min: 5,
      repeats: 8,
      work_sec: 120,
      rest_sec: 60,
      workLabel: 'Run',
      restLabel: 'Walk',
    });
  });

  it('falls back to the template duration, and to nothing when there is none', () => {
    const walk = session(
      'walk',
      'Treadmill walk',
      {},
      {
        template: {
          key: null,
          kind: 'walk',
          name: 'Treadmill walk',
          structure: { duration_min: 50 },
          programme_day_id: null,
        },
      },
    );
    expect(timerPlanFor(walk).duration_min).toBe(50);
    expect(timerPlanFor(session('swim', 'Coached swim', {})).duration_min).toBeNull();
  });
});

describe('finish form payload', () => {
  const walk = session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 });

  it('logs a completed 60 minute vest walk with the vest from the plan', () => {
    let s = start(createTimer(timerPlanFor(walk)), 0);
    s = tick(s, 60 * MIN).state;
    const payload = finishPayload(walk, summary(s, 60 * MIN), { rpe: 3, notes: '  steady  ' });
    expect(payload).toEqual({
      date: '2031-01-06',
      kind: 'walk_vest',
      planned_session_id: 7,
      duration_min: 60,
      rpe: 3,
      notes: 'steady',
      detail: {
        vest_kg: 20,
        timer: {
          total_sec: 3600,
          completed: true,
          ended_early: false,
          phases: [{ kind: 'main', label: 'Vest walk', planned_sec: 3600, actual_sec: 3600 }],
        },
      },
    });
  });

  it('logs what was actually done when ended early', () => {
    let s = start(createTimer(timerPlanFor(walk)), 0);
    s = endEarly(tick(s, 41 * MIN + 30_000).state, 41 * MIN + 30_000);
    const payload = finishPayload(walk, summary(s, 50 * MIN), { rpe: null, notes: '' });
    expect(payload).toMatchObject({ duration_min: 41.5, rpe: null, notes: null });
    expect(payload.detail).toMatchObject({
      vest_kg: 20,
      timer: { total_sec: 2490, completed: false, ended_early: true },
    });
  });

  it('leaves vest out for sessions that are not vest walks', () => {
    const plain = session('walk', 'Treadmill walk', { duration_min: 50 });
    let s = start(createTimer(timerPlanFor(plain)), 0);
    s = tick(s, 50 * MIN).state;
    const payload = finishPayload(plain, summary(s, 50 * MIN), { rpe: 2, notes: '' });
    expect(payload.kind).toBe('walk');
    expect(payload.detail).not.toHaveProperty('vest_kg');
  });
});
