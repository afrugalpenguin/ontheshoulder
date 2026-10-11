import { achievableLoads, describeLoad, snapLoad } from './equipment.js';
import type { Equipment, EquipmentType, LoadRule } from './schemas.js';

/** The parts of a programme slot, plus its exercise's equipment type, that decide the load. */
export interface SuggestSlot {
  equipment: EquipmentType;
  sets: number;
  /** Target reps per set. Null for timed or carried work, where only the set count matters. */
  reps: number | null;
  load_rule: LoadRule;
  /** Null means "step to the next load the kit can make" (the next dumbbell pair, say). */
  increment_kg: number | null;
  start_load_kg: number | null;
}

export interface LoggedSet {
  reps: number;
  load_kg: number | null;
}

export interface LoadSuggestion {
  load_kg: number | null;
  /** How to make the load, for example "bar + 2 x 20 + 2 x 1.25". Empty when there is none. */
  how: string;
  /** One short phrase saying why this load. */
  reason: string;
}

const none = (reason: string): LoadSuggestion => ({ load_kg: null, how: '', reason });

/** The working load of a logged session: the heaviest set. */
function sessionLoad(sets: LoggedSet[]): number | null {
  const loads = sets.map((s) => s.load_kg).filter((kg): kg is number => kg !== null);
  return loads.length ? Math.max(...loads) : null;
}

/** A session is completed when every planned set was done at the target reps or more. */
function completed(slot: SuggestSlot, sets: LoggedSet[]): boolean {
  if (sets.length < slot.sets) return false;
  return slot.reps === null || sets.every((s) => s.reps >= (slot.reps as number));
}

/**
 * The load for the next session of a slot, per the four load rules in SPEC 5.4.
 * `history` is the slot's past sessions, most recent first. The result is
 * always a load the kit can make, or null with a reason.
 */
export function suggestLoad(
  slot: SuggestSlot,
  history: LoggedSet[][],
  equipment: Equipment,
): LoadSuggestion {
  if (slot.load_rule === 'bodyweight' || slot.equipment === 'bodyweight') {
    return { load_kg: null, how: 'bodyweight', reason: 'bodyweight' };
  }
  const achievable = achievableLoads(equipment, slot.equipment);
  if (achievable.length === 0) return none('no kit');

  const at = (load: number, reason: string): LoadSuggestion => ({
    load_kg: load,
    how: describeLoad(load, equipment, slot.equipment) as string,
    reason,
  });
  const snap = (load: number, direction: 'down' | 'nearest') =>
    snapLoad(load, achievable, direction) as number;

  const [last, previous] = history;
  const lastLoad = last ? sessionLoad(last) : null;

  if (slot.load_rule === 'fixed') {
    const fixed = slot.start_load_kg ?? lastLoad;
    return fixed === null ? none('no starting load yet') : at(snap(fixed, 'nearest'), 'fixed load');
  }

  if (!last || lastLoad === null) {
    return slot.start_load_kg === null
      ? none('no starting load yet')
      : at(snap(slot.start_load_kg, 'nearest'), 'starting load');
  }

  const current = snap(lastLoad, 'nearest');
  const progress = (why: string): LoadSuggestion => {
    if (slot.increment_kg === null || slot.increment_kg === 0) {
      const next = achievable.find((v) => v > current);
      return next === undefined
        ? at(current, `${why}, already at the heaviest you own`)
        : at(next, `${why}, next load up`);
    }
    const target = current + slot.increment_kg;
    const next = snap(target, 'down');
    return next > current
      ? at(next, `${why}, up ${next - current}kg`)
      : at(current, `${why}, but ${target}kg cannot be made with your kit: hold`);
  };

  if (completed(slot, last)) {
    return progress(slot.load_rule === 'linear' ? 'completed last time' : 'all sets hit the top');
  }
  if (slot.load_rule === 'double') return at(current, 'not all sets at the top yet: hold');

  // linear: one miss holds, a second miss in a row at the same load deloads 10 per cent.
  const missedTwice =
    previous !== undefined && !completed(slot, previous) && sessionLoad(previous) === lastLoad;
  if (!missedTwice) return at(current, 'missed reps last time: hold once');
  return at(snap(current * 0.9, 'down'), 'second miss in a row: deload 10 per cent');
}
