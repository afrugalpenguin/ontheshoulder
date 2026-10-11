import type {
  Equipment,
  Exercise,
  ProgrammeDay,
  ProgrammeSlot,
  SetLog,
  StrengthHistoryEntry,
} from '@ots/shared';

// Synthetic strength data for tests.

const ex = (
  id: number,
  name: string,
  pattern: Exercise['pattern'],
  equipment: Exercise['equipment'],
): Exercise => ({ id, name, pattern, equipment, unilateral: false, cues: null, video_url: null });

export const SQUAT = ex(1, 'Back squat', 'squat', 'barbell');
export const LUNGE = ex(2, 'Reverse lunge', 'lunge', 'dumbbell');
export const DEAD_BUG = ex(3, 'Dead bug', 'core', 'bodyweight');
export const GOBLET = ex(4, 'Goblet squat', 'squat', 'kettlebell');
export const DB_SQUAT = ex(5, 'Dumbbell goblet squat', 'squat', 'dumbbell');
export const BW_SQUAT = ex(6, 'Bodyweight squat', 'squat', 'bodyweight');
export const BW_LUNGE = ex(7, 'Bodyweight reverse lunge', 'lunge', 'bodyweight');
export const CARRY = ex(8, 'Suitcase carry', 'carry', 'kettlebell');
export const LIBRARY = [SQUAT, LUNGE, DEAD_BUG, GOBLET, DB_SQUAT, BW_SQUAT, BW_LUNGE, CARRY];

const slot = (id: number, position: number, over: Partial<ProgrammeSlot>): ProgrammeSlot => ({
  id,
  programme_day_id: 1,
  position,
  exercise_id: SQUAT.id,
  sets: 5,
  reps: 5,
  seconds: null,
  rest_sec: 150,
  load_rule: 'linear',
  increment_kg: 2.5,
  start_load_kg: null,
  notes: null,
  ...over,
});

export const SQUAT_SLOT = slot(11, 1, {});
export const LUNGE_SLOT = slot(12, 2, {
  exercise_id: LUNGE.id,
  sets: 3,
  reps: 8,
  rest_sec: 75,
  load_rule: 'double',
  increment_kg: null,
});
export const BUG_SLOT = slot(13, 3, {
  exercise_id: DEAD_BUG.id,
  sets: 3,
  reps: null,
  seconds: 45,
  rest_sec: 45,
  load_rule: 'bodyweight',
  increment_kg: null,
});

export const DAY: ProgrammeDay = {
  id: 1,
  name: 'Strength A',
  slots: [SQUAT_SLOT, LUNGE_SLOT, BUG_SLOT],
};

const pairs = (...kgs: number[]) => kgs.map((kg) => ({ kg, count: 1 }));
export const FULL_KIT: Equipment = {
  bar_kg: 20,
  plates: pairs(20, 10, 5, 2.5, 1.25),
  dumbbells: [10, 12.5, 15],
  kettlebells: [12, 16, 20],
  vest_kg: 20,
};
export const DUMBBELLS_ONLY: Equipment = {
  bar_kg: null,
  plates: [],
  dumbbells: [10, 12.5, 15],
  kettlebells: [],
  vest_kg: null,
};
export const NO_KIT: Equipment = {
  bar_kg: null,
  plates: [],
  dumbbells: [],
  kettlebells: [],
  vest_kg: null,
};

let nextId = 1;
/** A past session: `sets` rows of [slot, reps per set, load, substitute exercise id]. */
export function past(
  date: string,
  rows: [slot: ProgrammeSlot, reps: number[], load: number | null, exerciseId?: number][],
): StrengthHistoryEntry {
  const sets: SetLog[] = rows.flatMap(([s, reps, load, exerciseId]) =>
    reps.map((r, i) => ({
      id: nextId++,
      strength_session_id: 1,
      slot_id: s.id,
      exercise_id: exerciseId ?? null,
      set_no: i + 1,
      reps: r,
      load_kg: load,
      rpe: null,
      done_at: null,
      notes: null,
    })),
  );
  return { activity_id: nextId++, date, partial: false, sets };
}
