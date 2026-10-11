import { describe, expect, it } from 'vitest';
import {
  BUG_SLOT,
  DAY,
  DEAD_BUG,
  DUMBBELLS_ONLY,
  FULL_KIT,
  GOBLET,
  LIBRARY,
  LUNGE,
  LUNGE_SLOT,
  NO_KIT,
  SQUAT,
  SQUAT_SLOT,
  past,
} from './fixtures.js';
import {
  asHistory,
  buildStrengthActivity,
  cycleReps,
  hasWarmups,
  isComplete,
  mainLift,
  nextSet,
  recentSessions,
  slotHistory,
  stepLoad,
  suggestionFor,
  warmupRamp,
  type SessionSet,
} from './session.js';

const logged = (slotId: number, exerciseId: number, n: number, reps: number, load: number | null) =>
  Array.from({ length: n }, (_, i): SessionSet => ({
    slot_id: slotId,
    exercise_id: exerciseId,
    set_no: i + 1,
    reps,
    load_kg: load,
    rpe: null,
    notes: null,
    done_at: '2031-01-08T18:00:00.000Z',
    warmup: false,
  }));
const warmups = (slotId: number, exerciseId: number, loads: number[]) =>
  loads.map((load, i): SessionSet => ({
    ...(logged(slotId, exerciseId, 1, 5, load)[0] as SessionSet),
    set_no: i + 1,
    warmup: true,
  }));

describe('slotHistory', () => {
  const history = [
    past('2031-01-15', [[SQUAT_SLOT, [5, 5], 16, GOBLET.id]]),
    past('2031-01-08', [
      [SQUAT_SLOT, [5, 5, 5, 5, 5], 60],
      [LUNGE_SLOT, [8, 8, 8], 10],
    ]),
  ];

  it('keeps a substitute apart from the slot own exercise', () => {
    expect(slotHistory(history, SQUAT_SLOT, SQUAT.id)).toEqual([
      Array.from({ length: 5 }, () => ({ reps: 5, load_kg: 60 })),
    ]);
    expect(slotHistory(history, SQUAT_SLOT, GOBLET.id)).toEqual([
      [
        { reps: 5, load_kg: 16 },
        { reps: 5, load_kg: 16 },
      ],
    ]);
    expect(slotHistory(history, LUNGE_SLOT, LUNGE.id)).toHaveLength(1);
    expect(slotHistory(history, BUG_SLOT, DEAD_BUG.id)).toEqual([]);
  });
});

describe('suggestionFor', () => {
  it('progresses the main lift from its own history with the plate breakdown', () => {
    const history = [past('2031-01-08', [[SQUAT_SLOT, [5, 5, 5, 5, 5], 60]])];
    expect(suggestionFor(SQUAT_SLOT, SQUAT, history, FULL_KIT)).toMatchObject({
      load_kg: 62.5,
      how: 'bar + 2 x 20 + 2 x 1.25',
    });
  });

  it('asks for a starting load when there is no history, then uses the one given', () => {
    expect(suggestionFor(SQUAT_SLOT, SQUAT, [], FULL_KIT)).toMatchObject({
      load_kg: null,
      reason: 'no starting load yet',
    });
    expect(suggestionFor({ ...SQUAT_SLOT, start_load_kg: 60 }, SQUAT, [], FULL_KIT).load_kg).toBe(
      60,
    );
  });

  it('a substitute steps through its own kit and starts from the load given for it', () => {
    const slot = { ...SQUAT_SLOT, start_load_kg: 60 };
    expect(suggestionFor(slot, GOBLET, [], FULL_KIT).load_kg).toBeNull();
    expect(suggestionFor(slot, GOBLET, [], FULL_KIT, 16).load_kg).toBe(16);
    const history = [past('2031-01-15', [[SQUAT_SLOT, [5, 5, 5, 5, 5], 16, GOBLET.id]])];
    expect(suggestionFor(slot, GOBLET, history, FULL_KIT)).toMatchObject({
      load_kg: 20,
      how: '20kg kettlebell',
    });
  });

  it('says no kit when the exercise cannot be loaded, and bodyweight when it needs none', () => {
    expect(suggestionFor(SQUAT_SLOT, SQUAT, [], DUMBBELLS_ONLY).reason).toBe('no kit');
    expect(suggestionFor(BUG_SLOT, DEAD_BUG, [], NO_KIT).reason).toBe('bodyweight');
  });
});

describe('stepLoad', () => {
  it('moves through achievable loads only and stops at the ends', () => {
    const loads = [20, 22.5, 25, 30];
    expect(stepLoad(22.5, loads, 1)).toBe(25);
    expect(stepLoad(25, loads, 1)).toBe(30);
    expect(stepLoad(30, loads, 1)).toBe(30);
    expect(stepLoad(22.5, loads, -1)).toBe(20);
    expect(stepLoad(20, loads, -1)).toBe(20);
    expect(stepLoad(23, loads, 1)).toBe(25);
    expect(stepLoad(23, loads, -1)).toBe(22.5);
  });
});

describe('buildStrengthActivity', () => {
  const base = {
    day: DAY,
    date: '2031-01-08',
    startedAt: '2031-01-08T18:00:00.000Z',
    finishedAt: '2031-01-08T18:41:20.000Z',
    plannedSessionId: 5,
  };

  it('saves a full session with its sets in slot order, not partial', () => {
    const sets = [
      ...logged(BUG_SLOT.id, DEAD_BUG.id, 3, 1, null),
      ...logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60),
      ...logged(LUNGE_SLOT.id, LUNGE.id, 3, 8, 10),
    ];
    expect(isComplete(DAY, sets)).toBe(true);
    const activity = buildStrengthActivity({ ...base, sets });
    expect(activity).toMatchObject({
      date: '2031-01-08',
      kind: 'strength',
      duration_min: 41,
      planned_session_id: 5,
      strength_session: { programme_day_id: 1, partial: false },
    });
    const saved = activity.strength_session?.sets ?? [];
    expect(saved.map((s) => s.slot_id)).toEqual([11, 11, 11, 11, 11, 12, 12, 12, 13, 13, 13]);
    // The exercise is only recorded for a substitute.
    expect(saved.every((s) => s.exercise_id === null)).toBe(true);
  });

  it('marks a session with missing sets as partial and records a substitute', () => {
    const sets = logged(SQUAT_SLOT.id, GOBLET.id, 2, 5, 16);
    const activity = buildStrengthActivity({ ...base, sets, plannedSessionId: null });
    expect(activity.strength_session).toMatchObject({ partial: true });
    expect(activity.strength_session?.sets.map((s) => s.exercise_id)).toEqual([
      GOBLET.id,
      GOBLET.id,
    ]);
    expect(activity.planned_session_id).toBeNull();
  });

  it('turns the session into history so next loads can be shown at once', () => {
    const entry = asHistory(DAY, logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60));
    const slot = { ...SQUAT_SLOT, start_load_kg: 60 };
    expect(suggestionFor(slot, SQUAT, [entry], FULL_KIT).load_kg).toBe(62.5);
  });
});

describe('set circle: what a tap does', () => {
  it('fills an empty circle with the target reps', () => {
    expect(cycleReps(null, 5)).toBe(5);
    expect(cycleReps(null, 8)).toBe(8);
  });

  it('takes one rep off on each further tap, down to zero', () => {
    const seen: (number | null)[] = [];
    let reps: number | null = null;
    for (let i = 0; i < 6; i++) {
      reps = cycleReps(reps, 5);
      seen.push(reps);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('goes from zero back to empty, and round again', () => {
    expect(cycleReps(0, 5)).toBeNull();
    expect(cycleReps(cycleReps(0, 5), 5)).toBe(5);
  });

  it('a one-rep target (timed or carried work) is done, zero, then empty', () => {
    expect([cycleReps(null, 1), cycleReps(1, 1), cycleReps(0, 1)]).toEqual([1, 0, null]);
  });
});

describe('warm-up ramp', () => {
  const loads = (working: number, kit = FULL_KIT) =>
    warmupRamp(working, kit).map((s) => [s.reps, s.load_kg]);

  it('is the empty bar twice, then 40 and 60 per cent, each for five', () => {
    expect(
      loads(100, { ...FULL_KIT, plates: [{ kg: 20, count: 2 }, ...FULL_KIT.plates.slice(1)] }),
    ).toEqual([
      [5, 20],
      [5, 20],
      [5, 40],
      [5, 60],
    ]);
  });

  it('snaps each step to a load the kit can make', () => {
    // 40 per cent of 62.5 is 25; 60 per cent is 37.5: both makeable in 2.5 steps.
    expect(loads(62.5)).toEqual([
      [5, 20],
      [5, 20],
      [5, 25],
      [5, 37.5],
    ]);
    // With only 20s and 10s on the bar the steps land on 20, 40, 60, 80.
    const coarse = {
      ...FULL_KIT,
      plates: [
        { kg: 20, count: 1 },
        { kg: 10, count: 1 },
      ],
    };
    expect(loads(80, coarse)).toEqual([
      [5, 20],
      [5, 20],
      [5, 40],
    ]);
  });

  it('drops a step that snaps to the bar or does not climb', () => {
    // 40 per cent of 45 is 18, which is the bar; 60 per cent is 27, nearest 27.5.
    expect(loads(45)).toEqual([
      [5, 20],
      [5, 20],
      [5, 27.5],
    ]);
  });

  it('has nothing to ramp to at the bar itself, or without a bar', () => {
    expect(warmupRamp(20, FULL_KIT)).toEqual([]);
    expect(warmupRamp(60, DUMBBELLS_ONLY)).toEqual([]);
  });

  it('is offered for linear barbell slots only, and can be switched off per slot', () => {
    expect(hasWarmups(SQUAT_SLOT, SQUAT)).toBe(true);
    expect(hasWarmups({ ...SQUAT_SLOT, warmups_enabled: false }, SQUAT)).toBe(false);
    expect(hasWarmups(SQUAT_SLOT, GOBLET)).toBe(false);
    expect(hasWarmups(LUNGE_SLOT, LUNGE)).toBe(false);
  });

  it('warm-up sets are saved, flagged, and never count for progression or completion', () => {
    const sets = [
      ...warmups(SQUAT_SLOT.id, SQUAT.id, [20, 20, 25, 37.5]),
      ...logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60),
    ];
    const saved = buildStrengthActivity({
      day: DAY,
      date: '2031-01-08',
      startedAt: '2031-01-08T18:00:00.000Z',
      finishedAt: '2031-01-08T18:30:00.000Z',
      sets,
      plannedSessionId: null,
    }).strength_session?.sets;
    expect(saved?.map((s) => s.warmup)).toEqual([true, true, true, true, ...Array(5).fill(false)]);

    const entry = asHistory(DAY, sets);
    expect(slotHistory([entry], SQUAT_SLOT, SQUAT.id)).toEqual([
      Array(5).fill({ reps: 5, load_kg: 60 }),
    ]);
    // Warm-ups alone do not finish a slot.
    expect(isComplete({ ...DAY, slots: [SQUAT_SLOT] }, sets.slice(0, 4))).toBe(false);
    expect(isComplete({ ...DAY, slots: [SQUAT_SLOT] }, sets)).toBe(true);
  });
});

describe('nextSet: where the highlight goes after a rest', () => {
  const slots = [SQUAT_SLOT, LUNGE_SLOT, BUG_SLOT];

  it('is the next empty set of the slot just worked on', () => {
    const sets = logged(SQUAT_SLOT.id, SQUAT.id, 2, 5, 60);
    expect(nextSet(slots, sets, SQUAT_SLOT.id)).toEqual({ slotId: 11, setNo: 3 });
  });

  it('fills a gap before moving on', () => {
    const sets = logged(SQUAT_SLOT.id, SQUAT.id, 3, 5, 60).filter((s) => s.set_no !== 2);
    expect(nextSet(slots, sets, SQUAT_SLOT.id)).toEqual({ slotId: 11, setNo: 2 });
  });

  it('moves to the slot after when this one is done, and wraps to the top', () => {
    const squatDone = logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60);
    expect(nextSet(slots, squatDone, SQUAT_SLOT.id)).toEqual({ slotId: 12, setNo: 1 });
    const bugDone = logged(BUG_SLOT.id, DEAD_BUG.id, 3, 1, null);
    expect(nextSet(slots, bugDone, BUG_SLOT.id)).toEqual({ slotId: 11, setNo: 1 });
  });

  it('ignores warm-up sets and is null when everything is done', () => {
    const onlyWarmups = warmups(SQUAT_SLOT.id, SQUAT.id, [20, 20]);
    expect(nextSet(slots, onlyWarmups, SQUAT_SLOT.id)).toEqual({ slotId: 11, setNo: 1 });
    const all = [
      ...logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60),
      ...logged(LUNGE_SLOT.id, LUNGE.id, 3, 8, 10),
      ...logged(BUG_SLOT.id, DEAD_BUG.id, 3, 1, null),
    ];
    expect(nextSet(slots, all, SQUAT_SLOT.id)).toBeNull();
  });
});

describe('home list: next-up values', () => {
  const done = (date: string, reps: number[], load: number) =>
    past(date, [[SQUAT_SLOT, reps, load]]);
  const FIVES = [5, 5, 5, 5, 5];

  it('after a completed session the main lift is up by the increment', () => {
    const lift = mainLift(DAY, LIBRARY, [done('2031-01-08', FIVES, 60)], FULL_KIT);
    expect(lift).toMatchObject({ lastLoad: 60, trend: 'up' });
    expect(lift?.exercise.name).toBe('Back squat');
    expect(lift?.next.load_kg).toBe(62.5);
  });

  it('after one miss it holds, and after a second it comes down ten per cent', () => {
    const missed = done('2031-01-15', [5, 5, 5, 4, 3], 62.5);
    const held = mainLift(DAY, LIBRARY, [missed, done('2031-01-08', FIVES, 60)], FULL_KIT);
    expect(held).toMatchObject({ lastLoad: 62.5, trend: 'same' });
    expect(held?.next.load_kg).toBe(62.5);

    const again = done('2031-01-22', [5, 4, 4, 3, 3], 62.5);
    const down = mainLift(DAY, LIBRARY, [again, missed], FULL_KIT);
    // 56.25 is not a load this kit makes; it is snapped down to 55.
    expect(down?.next.load_kg).toBe(55);
    expect(down).toMatchObject({ lastLoad: 62.5, trend: 'down' });
  });

  it('with no history there is no trend, and the load waits for a starting load', () => {
    const lift = mainLift(DAY, LIBRARY, [], FULL_KIT);
    expect(lift).toMatchObject({ lastLoad: null, trend: null });
    expect(lift?.next).toMatchObject({ load_kg: null, reason: 'no starting load yet' });
  });

  it('lists the most recent sessions across days, newest first, with success per session', () => {
    const dayB = { ...DAY, id: 2, name: 'Strength B', slots: [{ ...SQUAT_SLOT, id: 21 }] };
    const histories = [
      [done('2031-01-15', [5, 5, 5, 4, 3], 62.5), done('2031-01-08', FIVES, 60)],
      [past('2031-01-10', [[{ ...SQUAT_SLOT, id: 21 }, FIVES, 70]])],
    ];
    const rows = recentSessions([DAY, dayB], histories, LIBRARY);
    expect(rows.map((r) => [r.date, r.day, r.lift, r.load_kg, r.success])).toEqual([
      ['2031-01-15', 'Strength A', 'Back squat', 62.5, false],
      ['2031-01-10', 'Strength B', 'Back squat', 70, true],
      ['2031-01-08', 'Strength A', 'Back squat', 60, true],
    ]);
    expect(recentSessions([DAY, dayB], histories, LIBRARY, 2)).toHaveLength(2);
  });

  it('a session with too few sets of the main lift is not a success', () => {
    const rows = recentSessions([DAY], [[done('2031-01-08', [5, 5, 5], 60)]], LIBRARY);
    expect(rows[0]?.success).toBe(false);
  });
});
