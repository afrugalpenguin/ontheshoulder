import {
  hasKit,
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
  Pick<SetLogInput, 'slot_id' | 'set_no' | 'reps' | 'load_kg' | 'rpe' | 'notes' | 'done_at'>
> & { exercise_id: number };

/** Sets as the api stores them: the exercise is only recorded when it was a substitute. */
function stored(day: ProgrammeDay, sets: SessionSet[]) {
  const own = new Map(day.slots.map((slot) => [slot.id, slot.exercise_id]));
  return [...sets]
    .sort((a, b) => a.slot_id - b.slot_id || a.set_no - b.set_no)
    .map((s) => ({
      ...s,
      exercise_id: own.get(s.slot_id) === s.exercise_id ? null : s.exercise_id,
    }));
}

/** "5 x 5", "3 x 45s" or "3 sets" for work that is not counted in reps or seconds. */
export function targetLabel(slot: Pick<ProgrammeSlot, 'sets' | 'reps' | 'seconds'>): string {
  if (slot.reps != null) return `${slot.sets} x ${slot.reps}`;
  if (slot.seconds != null) return `${slot.sets} x ${slot.seconds}s`;
  return `${slot.sets} ${slot.sets === 1 ? 'set' : 'sets'}`;
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
        .filter((s) => s.slot_id === slot.id && (s.exercise_id ?? slot.exercise_id) === exerciseId)
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

/** One line for the day list, for example "Back squat 62.5kg, Romanian deadlift 50kg". */
export function nextSummary(
  day: ProgrammeDay,
  exercises: Exercise[],
  history: Pick<StrengthHistoryEntry, 'sets'>[],
  equipment: Equipment,
): string {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const parts: string[] = [];
  let needsStart = false;
  for (const slot of day.slots) {
    const exercise = byId.get(slot.exercise_id);
    if (!exercise || !hasKit(equipment, exercise.equipment)) continue;
    const { load_kg, reason } = suggestionFor(slot, exercise, history, equipment);
    if (load_kg !== null) parts.push(`${exercise.name} ${load_kg}kg`);
    else if (reason === 'no starting load yet') needsStart = true;
    if (parts.length === 2) break;
  }
  if (parts.length > 0) return parts.join(', ');
  return needsStart ? 'Starting loads to set' : 'No loaded lifts with your kit';
}

/** True when every slot has all its sets logged. */
export function isComplete(day: ProgrammeDay, sets: SessionSet[]): boolean {
  return day.slots.every((slot) => sets.filter((s) => s.slot_id === slot.id).length >= slot.sets);
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
