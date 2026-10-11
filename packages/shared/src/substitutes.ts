import { achievableLoads } from './equipment.js';
import type { Equipment, EquipmentType, Exercise } from './schemas.js';

/** True when the user can do an exercise of this equipment type: bodyweight always, else kit owned. */
export function hasKit(equipment: Equipment, type: EquipmentType): boolean {
  return type === 'bodyweight' || achievableLoads(equipment, type).length > 0;
}

/**
 * Exercises that can stand in for one the user has no kit for: the same
 * movement pattern, done with kit they do own. Loaded options come first,
 * bodyweight last, each group by name.
 */
export function substitutesFor(
  exercise: Pick<Exercise, 'id' | 'pattern'>,
  library: Exercise[],
  equipment: Equipment,
): Exercise[] {
  return library
    .filter(
      (e) =>
        e.id !== exercise.id && e.pattern === exercise.pattern && hasKit(equipment, e.equipment),
    )
    .sort(
      (a, b) =>
        Number(a.equipment === 'bodyweight') - Number(b.equipment === 'bodyweight') ||
        a.name.localeCompare(b.name),
    );
}
