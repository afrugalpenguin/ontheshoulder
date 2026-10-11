import { describe, expect, it } from 'vitest';
import type { Equipment, Exercise } from './schemas.js';
import { hasKit, substitutesFor } from './substitutes.js';

const NONE: Equipment = { bar_kg: null, plates: [], dumbbells: [], kettlebells: [], vest_kg: null };

const ex = (
  id: number,
  name: string,
  pattern: Exercise['pattern'],
  equipment: Exercise['equipment'],
) =>
  ({
    id,
    name,
    pattern,
    equipment,
    unilateral: false,
    cues: null,
    video_url: null,
  }) satisfies Exercise;

const LIBRARY: Exercise[] = [
  ex(1, 'Back squat', 'squat', 'barbell'),
  ex(2, 'Goblet squat', 'squat', 'kettlebell'),
  ex(3, 'Dumbbell squat', 'squat', 'dumbbell'),
  ex(4, 'Bodyweight squat', 'squat', 'bodyweight'),
  ex(5, 'Deadlift', 'hinge', 'barbell'),
  ex(6, 'Suitcase carry', 'carry', 'kettlebell'),
  ex(7, 'Farmer carry', 'carry', 'dumbbell'),
];
const names = (list: Exercise[]) => list.map((e) => e.name);

describe('hasKit', () => {
  it('is always true for bodyweight and follows the kit otherwise', () => {
    expect(hasKit(NONE, 'bodyweight')).toBe(true);
    expect(hasKit(NONE, 'barbell')).toBe(false);
    expect(hasKit({ ...NONE, bar_kg: 20 }, 'barbell')).toBe(true);
    expect(hasKit({ ...NONE, dumbbells: [10] }, 'dumbbell')).toBe(true);
    expect(hasKit({ ...NONE, dumbbells: [10] }, 'kettlebell')).toBe(false);
  });
});

describe('substitutesFor', () => {
  const squat = LIBRARY[0] as Exercise;

  it('with dumbbells only, offers the dumbbell option then bodyweight', () => {
    expect(names(substitutesFor(squat, LIBRARY, { ...NONE, dumbbells: [10, 15] }))).toEqual([
      'Dumbbell squat',
      'Bodyweight squat',
    ]);
  });

  it('with no kit at all, offers only bodyweight', () => {
    expect(names(substitutesFor(squat, LIBRARY, NONE))).toEqual(['Bodyweight squat']);
  });

  it('lists loaded options by name before bodyweight', () => {
    const kit = { ...NONE, dumbbells: [10], kettlebells: [16] };
    expect(names(substitutesFor(squat, LIBRARY, kit))).toEqual([
      'Dumbbell squat',
      'Goblet squat',
      'Bodyweight squat',
    ]);
  });

  it('never offers the exercise itself or another pattern', () => {
    const all = { bar_kg: 20, plates: [], dumbbells: [10], kettlebells: [16], vest_kg: null };
    const result = substitutesFor(squat, LIBRARY, all);
    expect(result.some((e) => e.id === squat.id)).toBe(false);
    expect(result.every((e) => e.pattern === 'squat')).toBe(true);
  });

  it('returns nothing when the pattern has no usable alternative', () => {
    const carry = LIBRARY[5] as Exercise;
    expect(substitutesFor(carry, LIBRARY, NONE)).toEqual([]);
  });
});
