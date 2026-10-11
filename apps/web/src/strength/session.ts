import {
  achievableLoads,
  snapLoad,
  suggestLoad,
  type ActivityInput,
  type Equipment,
  type Exercise,
  type LoadSuggestion,
  type LoggedSet,
  type ProgrammeDay,
  type ProgrammeSlot,
  type SetLogInput,
  type StrengthHistoryEntry,
} from '@ots/shared';

// Pure helpers behind the strength screens: no React, no fetching.

/** A set logged in the session being done now. `exercise_id` is always the exercise actually done. */
export type SessionSet = Required<
  Pick<
    SetLogInput,
    'slot_id' | 'set_no' | 'reps' | 'load_kg' | 'rpe' | 'notes' | 'done_at' | 'warmup'
  >
> & { exercise_id: number };

/**
 * What a tap on a set circle does to its reps. Empty fills with the target;
 * each further tap takes one off; a tap at zero empties it again.
 */
export function cycleReps(current: number | null, target: number): number | null {
  if (current === null) return target;
  return current > 0 ? current - 1 : null;
}

/** Reps a full set of this slot is worth. Timed and carried work counts as one. */
export const targetReps = (slot: Pick<ProgrammeSlot, 'reps'>): number => slot.reps ?? 1;

/** Warm-ups are offered for barbell lifts on the linear rule, unless switched off for the slot. */
export function hasWarmups(
  slot: Pick<ProgrammeSlot, 'load_rule' | 'warmups_enabled'>,
  exercise: Pick<Exercise, 'equipment'>,
): boolean {
  return slot.warmups_enabled && slot.load_rule === 'linear' && exercise.equipment === 'barbell';
}

export interface WarmupSet {
  reps: number;
  load_kg: number;
}

/**
 * The standard ramp to a working load: the empty bar twice for five, then 40
 * and 60 per cent of the working load for five, each snapped to a load the kit
 * can make. A step that snaps to the bar, or that does not climb, is dropped.
 */
export function warmupRamp(workingLoad: number, equipment: Equipment): WarmupSet[] {
  const bar = equipment.bar_kg;
  if (bar === null || workingLoad <= bar) return [];
  const loads = achievableLoads(equipment, 'barbell');
  const ramp: WarmupSet[] = [
    { reps: 5, load_kg: bar },
    { reps: 5, load_kg: bar },
  ];
  for (const share of [0.4, 0.6]) {
    const load = snapLoad(workingLoad * share, loads, 'nearest');
    const heaviest = (ramp[ramp.length - 1] as WarmupSet).load_kg;
    if (load !== null && load > heaviest && load < workingLoad) {
      ramp.push({ reps: 5, load_kg: load });
    }
  }
  return ramp;
}

/** The working sets of a session: everything that is not a warm-up. */
export const working = (sets: SessionSet[]): SessionSet[] => sets.filter((s) => !s.warmup);

/**
 * The next empty working set, looking first in the slot just worked on, then
 * in the slots after it, then from the top. `slots` are the ones that can be
 * logged right now, in screen order. Null when every set is done.
 */
export function nextSet(
  slots: Pick<ProgrammeSlot, 'id' | 'sets'>[],
  sets: SessionSet[],
  fromSlotId: number | null,
): { slotId: number; setNo: number } | null {
  const start = Math.max(
    0,
    slots.findIndex((s) => s.id === fromSlotId),
  );
  const order = [...slots.slice(start), ...slots.slice(0, start)];
  for (const slot of order) {
    const done = new Set(
      working(sets)
        .filter((s) => s.slot_id === slot.id)
        .map((s) => s.set_no),
    );
    for (let setNo = 1; setNo <= slot.sets; setNo++) {
      if (!done.has(setNo)) return { slotId: slot.id, setNo };
    }
  }
  return null;
}

/** Sets as the api stores them: the exercise is only recorded when it was a substitute. */
function stored(day: ProgrammeDay, sets: SessionSet[]) {
  const own = new Map(day.slots.map((slot) => [slot.id, slot.exercise_id]));
  return [...sets]
    .sort(
      (a, b) => a.slot_id - b.slot_id || Number(b.warmup) - Number(a.warmup) || a.set_no - b.set_no,
    )
    .map((s) => ({
      ...s,
      exercise_id: own.get(s.slot_id) === s.exercise_id ? null : s.exercise_id,
    }));
}

/**
 * Past sessions of one slot for one exercise, most recent first. A set logged
 * with a substitute only counts towards that substitute's history.
 */
export function slotHistory(
  history: Pick<StrengthHistoryEntry, 'sets'>[],
  slot: Pick<ProgrammeSlot, 'id' | 'exercise_id'>,
  exerciseId: number,
): LoggedSet[][] {
  return history
    .map((entry) =>
      entry.sets
        .filter(
          (s) =>
            // Warm-up sets never count towards progression.
            !s.warmup &&
            s.slot_id === slot.id &&
            (s.exercise_id ?? slot.exercise_id) === exerciseId,
        )
        .map((s) => ({ reps: s.reps, load_kg: s.load_kg })),
    )
    .filter((sets) => sets.length > 0);
}

/**
 * The load to show for a slot. `exercise` is what will actually be done, which
 * is the slot's own exercise or a substitute; a substitute steps through the
 * kit it uses and takes its starting load from `startLoad`.
 */
export function suggestionFor(
  slot: ProgrammeSlot,
  exercise: Exercise,
  history: Pick<StrengthHistoryEntry, 'sets'>[],
  equipment: Equipment,
  startLoad: number | null = null,
): LoadSuggestion {
  const substitute = exercise.id !== slot.exercise_id;
  return suggestLoad(
    {
      equipment: exercise.equipment,
      sets: slot.sets,
      reps: slot.reps,
      load_rule: slot.load_rule,
      increment_kg: substitute && exercise.equipment !== 'barbell' ? null : slot.increment_kg,
      start_load_kg: substitute ? startLoad : (slot.start_load_kg ?? startLoad),
    },
    slotHistory(history, slot, exercise.id),
    equipment,
  );
}

/** The next load up or down the list of loads the kit can make. Stays put at either end. */
export function stepLoad(load: number, achievable: number[], direction: 1 | -1): number {
  const sorted = [...achievable].sort((a, b) => a - b);
  if (direction === 1) return sorted.find((v) => v > load) ?? load;
  return sorted.filter((v) => v < load).pop() ?? load;
}

/** True when every slot has all its working sets logged. Warm-ups do not count. */
export function isComplete(day: ProgrammeDay, sets: SessionSet[]): boolean {
  return day.slots.every(
    (slot) => working(sets).filter((s) => s.slot_id === slot.id).length >= slot.sets,
  );
}

/** The lift a day is known by: its first slot on the linear rule, else its first slot. */
export function mainSlot(day: ProgrammeDay): ProgrammeSlot | undefined {
  return day.slots.find((s) => s.load_rule === 'linear') ?? day.slots[0];
}

export interface MainLift {
  exercise: Exercise;
  /** What the next session asks for. */
  next: LoadSuggestion;
  /** Working load of the last session, when there was one. */
  lastLoad: number | null;
  /** Whether the next load is above, below or the same as last time. */
  trend: 'up' | 'down' | 'same' | null;
}

/** The main lift of a day with its next load and whether the last session moved it. */
export function mainLift(
  day: ProgrammeDay,
  exercises: Exercise[],
  history: Pick<StrengthHistoryEntry, 'sets'>[],
  equipment: Equipment,
): MainLift | null {
  const slot = mainSlot(day);
  const exercise = slot && exercises.find((e) => e.id === slot.exercise_id);
  if (!slot || !exercise) return null;
  const next = suggestionFor(slot, exercise, history, equipment);
  const last = slotHistory(history, slot, exercise.id)[0];
  const loads = (last ?? []).map((s) => s.load_kg).filter((kg): kg is number => kg !== null);
  const lastLoad = loads.length ? Math.max(...loads) : null;
  const trend =
    next.load_kg === null || lastLoad === null
      ? null
      : next.load_kg > lastLoad
        ? 'up'
        : next.load_kg < lastLoad
          ? 'down'
          : 'same';
  return { exercise, next, lastLoad, trend };
}

export interface SessionRow {
  activity_id: number;
  date: string;
  day: string;
  lift: string;
  load_kg: number | null;
  /** Every working set of the main lift was done at the target reps. */
  success: boolean;
}

/** The most recent sessions across every day, newest first, for the history list. */
export function recentSessions(
  days: ProgrammeDay[],
  histories: StrengthHistoryEntry[][],
  exercises: Exercise[],
  limit = 10,
): SessionRow[] {
  const rows = days.flatMap((day, index) => {
    const slot = mainSlot(day);
    return (histories[index] ?? []).map((entry): SessionRow => {
      const sets = slot ? entry.sets.filter((s) => s.slot_id === slot.id && !s.warmup) : [];
      const done = sets[0]?.exercise_id ?? slot?.exercise_id;
      const loads = sets.map((s) => s.load_kg).filter((kg): kg is number => kg !== null);
      return {
        activity_id: entry.activity_id,
        date: entry.date,
        day: day.name,
        lift: exercises.find((e) => e.id === done)?.name ?? '',
        load_kg: loads.length ? Math.max(...loads) : null,
        success:
          slot !== undefined &&
          sets.length >= slot.sets &&
          sets.every((s) => s.reps >= targetReps(slot)),
      };
    });
  });
  return rows
    .sort((a, b) => b.date.localeCompare(a.date) || b.activity_id - a.activity_id)
    .slice(0, limit);
}

/** The activity to save for a finished (or part finished) strength session. */
export function buildStrengthActivity(input: {
  day: ProgrammeDay;
  date: string;
  startedAt: string;
  finishedAt: string;
  sets: SessionSet[];
  plannedSessionId: number | null;
}): ActivityInput {
  const { day, date, startedAt, finishedAt, sets, plannedSessionId } = input;
  const minutes = Math.max(
    1,
    Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60_000),
  );
  return {
    date,
    kind: 'strength',
    duration_min: minutes,
    planned_session_id: plannedSessionId,
    strength_session: {
      programme_day_id: day.id,
      started_at: startedAt,
      finished_at: finishedAt,
      partial: !isComplete(day, sets),
      sets: stored(day, sets),
    },
  };
}

/** This session as a history entry, so next session's loads can be shown straight away. */
export function asHistory(
  day: ProgrammeDay,
  sets: SessionSet[],
): Pick<StrengthHistoryEntry, 'sets'> {
  return {
    sets: stored(day, sets).map((s, index) => ({ ...s, id: -(index + 1), strength_session_id: 0 })),
  };
}
