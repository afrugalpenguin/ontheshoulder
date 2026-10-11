import { describe, expect, it } from 'vitest';
import type { Equipment } from './schemas.js';
import { suggestLoad, type LoggedSet, type SuggestSlot } from './strength.js';

const pairs = (...kgs: number[]) => kgs.map((kg) => ({ kg, count: 1 }));

const FULL: Equipment = {
  bar_kg: 20,
  plates: pairs(20, 10, 5, 2.5, 1.25),
  dumbbells: [10, 12.5, 15, 20],
  kettlebells: [12, 16, 20],
  vest_kg: 20,
};
/** No 1.25kg plates, so the bar moves in 5kg steps. */
const COARSE: Equipment = { ...FULL, plates: pairs(20, 10, 5, 2.5) };
const NO_KIT: Equipment = {
  bar_kg: null,
  plates: [],
  dumbbells: [],
  kettlebells: [],
  vest_kg: null,
};

const squat: SuggestSlot = {
  equipment: 'barbell',
  sets: 5,
  reps: 5,
  load_rule: 'linear',
  increment_kg: 2.5,
  start_load_kg: null,
};
const rdl: SuggestSlot = { ...squat, sets: 3, reps: 8, load_rule: 'double' };
const lunge: SuggestSlot = {
  equipment: 'dumbbell',
  sets: 3,
  reps: 8,
  load_rule: 'double',
  increment_kg: null,
  start_load_kg: null,
};

/** `n` sets at one load with the reps given (one number for all sets, or one per set). */
const sets = (load: number | null, reps: number | number[], n = 5): LoggedSet[] =>
  Array.from({ length: Array.isArray(reps) ? reps.length : n }, (_, i) => ({
    load_kg: load,
    reps: Array.isArray(reps) ? (reps[i] as number) : reps,
  }));

describe('suggestLoad: linear', () => {
  it('worked example: squat 60kg, 5x5 all hit, full plate set, gives 62.5', () => {
    expect(suggestLoad(squat, [sets(60, 5)], FULL)).toEqual({
      load_kg: 62.5,
      how: 'bar + 2 x 20 + 2 x 1.25',
      reason: 'completed last time, up 2.5kg',
    });
  });

  it('holds once after a failed session', () => {
    const result = suggestLoad(squat, [sets(62.5, [5, 5, 5, 4, 3]), sets(60, 5)], FULL);
    expect(result).toMatchObject({ load_kg: 62.5, reason: 'missed reps last time: hold once' });
  });

  it('counts a session with too few sets as failed', () => {
    expect(suggestLoad(squat, [sets(60, [5, 5, 5])], FULL).load_kg).toBe(60);
  });

  it('deloads 10 per cent, snapped down, after a second consecutive fail', () => {
    const fail = sets(62.5, [5, 5, 4, 4, 3]);
    expect(suggestLoad(squat, [fail, fail, sets(60, 5)], FULL)).toEqual({
      load_kg: 55,
      how: 'bar + 2 x 10 + 2 x 5 + 2 x 2.5',
      reason: 'second miss in a row: deload 10 per cent',
    });
  });

  it('holds, not deloads, when the earlier fail was at a different load', () => {
    const result = suggestLoad(
      squat,
      [sets(55, [5, 5, 5, 5, 4]), sets(62.5, [5, 4, 4, 3, 3])],
      FULL,
    );
    expect(result.load_kg).toBe(55);
  });

  it('resumes adding weight after a completed deload session', () => {
    const history = [sets(55, 5), sets(62.5, [5, 4, 4, 3, 3]), sets(62.5, [5, 5, 4, 4, 3])];
    expect(suggestLoad(squat, history, FULL).load_kg).toBe(57.5);
  });

  it('snaps down and holds when the increment lands on an unachievable load', () => {
    expect(suggestLoad(squat, [sets(60, 5)], COARSE)).toEqual({
      load_kg: 60,
      how: 'bar + 2 x 20',
      reason: 'completed last time, but 62.5kg cannot be made with your kit: hold',
    });
  });

  it('snaps a bigger increment down to the nearest load below it', () => {
    const slot = { ...squat, increment_kg: 7.5 };
    expect(suggestLoad(slot, [sets(60, 5)], COARSE).load_kg).toBe(65);
  });

  it('uses the starting load, snapped, when there is no history', () => {
    expect(suggestLoad({ ...squat, start_load_kg: 61 }, [], FULL)).toEqual({
      load_kg: 60,
      how: 'bar + 2 x 20',
      reason: 'starting load',
    });
    expect(suggestLoad(squat, [], FULL)).toEqual({
      load_kg: null,
      how: '',
      reason: 'no starting load yet',
    });
  });

  it('treats a session logged without loads as no history', () => {
    expect(suggestLoad({ ...squat, start_load_kg: 40 }, [sets(null, 5)], FULL).load_kg).toBe(40);
  });
});

describe('suggestLoad: double progression', () => {
  it('adds the increment when all sets hit the top of the range', () => {
    expect(suggestLoad(rdl, [sets(50, 8, 3)], FULL)).toMatchObject({
      load_kg: 52.5,
      reason: 'all sets hit the top, up 2.5kg',
    });
  });

  it('holds until every set is at the top, however many sessions that takes', () => {
    const short = sets(50, [8, 8, 7]);
    expect(suggestLoad(rdl, [short, short, short], FULL)).toMatchObject({
      load_kg: 50,
      reason: 'not all sets at the top yet: hold',
    });
  });

  it('steps a dumbbell slot to the next owned pair', () => {
    expect(suggestLoad(lunge, [sets(12.5, 8, 3)], FULL)).toEqual({
      load_kg: 15,
      how: '15kg dumbbells',
      reason: 'all sets hit the top, next load up',
    });
    expect(suggestLoad(lunge, [sets(15, 8, 3)], FULL).load_kg).toBe(20);
  });

  it('stays at the heaviest pair when there is nothing above it', () => {
    expect(suggestLoad(lunge, [sets(20, 8, 3)], FULL)).toMatchObject({
      load_kg: 20,
      reason: 'all sets hit the top, already at the heaviest you own',
    });
  });

  it('counts timed sets as done when the set count is met', () => {
    const plank: SuggestSlot = { ...lunge, equipment: 'kettlebell', reps: null };
    expect(suggestLoad(plank, [sets(12, 0, 3)], FULL).load_kg).toBe(16);
  });
});

describe('suggestLoad: fixed and bodyweight', () => {
  const carry: SuggestSlot = {
    equipment: 'kettlebell',
    sets: 3,
    reps: null,
    load_rule: 'fixed',
    increment_kg: null,
    start_load_kg: 18,
  };

  it('never changes a fixed load, only snaps it to the kit', () => {
    const result = suggestLoad(carry, [sets(16, 1, 3), sets(16, 1, 3)], FULL);
    expect(result).toEqual({ load_kg: 16, how: '16kg kettlebell', reason: 'fixed load' });
    expect(suggestLoad({ ...carry, start_load_kg: 20 }, [], FULL).load_kg).toBe(20);
  });

  it('falls back to the last load used, then to nothing', () => {
    const unset = { ...carry, start_load_kg: null };
    expect(suggestLoad(unset, [sets(12, 1, 3)], FULL).load_kg).toBe(12);
    expect(suggestLoad(unset, [], FULL)).toMatchObject({
      load_kg: null,
      reason: 'no starting load yet',
    });
  });

  it('has no load for bodyweight rules or bodyweight exercises', () => {
    const expected = { load_kg: null, how: 'bodyweight', reason: 'bodyweight' };
    expect(suggestLoad({ ...squat, load_rule: 'bodyweight' }, [], FULL)).toEqual(expected);
    expect(suggestLoad({ ...squat, equipment: 'bodyweight' }, [], NO_KIT)).toEqual(expected);
  });
});

describe('suggestLoad: no kit', () => {
  it.each([squat, rdl, lunge, { ...squat, equipment: 'plate' as const }])(
    'returns no kit for %o',
    (slot) => {
      expect(suggestLoad(slot, [sets(60, 5)], NO_KIT)).toEqual({
        load_kg: null,
        how: '',
        reason: 'no kit',
      });
    },
  );

  it('returns no kit for a barbell slot when only dumbbells are owned', () => {
    expect(suggestLoad(squat, [], { ...NO_KIT, dumbbells: [10] }).reason).toBe('no kit');
  });
});
