import type { Equipment, EquipmentType } from './schemas.js';

export type SnapDirection = 'down' | 'up' | 'nearest';

// Loads are compared in grams so 1.25kg plates never hit float rounding.
const toG = (kg: number): number => Math.round(kg * 1000);
const toKg = (g: number): number => g / 1000;

function sortedUnique(values: number[]): number[] {
  return [...new Set(values.map(toG))].sort((a, b) => a - b).map(toKg);
}

/** Every per-side plate weight (grams) that can be built from the pairs owned. */
function perSideSums(equipment: Equipment): Set<number> {
  let sums = new Set<number>([0]);
  for (const plate of equipment.plates) {
    const next = new Set<number>();
    for (const sum of sums) {
      for (let n = 0; n <= plate.count; n++) next.add(sum + n * toG(plate.kg));
    }
    sums = next;
  }
  return sums;
}

/**
 * Sorted loads in kg that this kit can actually make for one equipment type.
 * Barbell: bar plus every symmetric plate combination. Dumbbell, kettlebell and
 * plate: the values owned. Bodyweight, or no kit of the type: empty.
 */
export function achievableLoads(equipment: Equipment, type: EquipmentType): number[] {
  switch (type) {
    case 'barbell': {
      if (equipment.bar_kg === null) return [];
      const bar = toG(equipment.bar_kg);
      return [...perSideSums(equipment)].map((sum) => toKg(bar + 2 * sum)).sort((a, b) => a - b);
    }
    case 'dumbbell':
      return sortedUnique(equipment.dumbbells);
    case 'kettlebell':
      return sortedUnique(equipment.kettlebells);
    case 'plate':
      return sortedUnique(equipment.plates.filter((p) => p.count > 0).map((p) => p.kg));
    case 'bodyweight':
      return [];
  }
}

/**
 * Moves a load onto the achievable list. `down` never goes above the load unless
 * nothing lighter exists; `up` never goes below unless nothing heavier exists.
 * Returns null when there is nothing to snap to.
 */
export function snapLoad(
  load: number,
  achievable: number[],
  direction: SnapDirection = 'nearest',
): number | null {
  if (achievable.length === 0) return null;
  const sorted = [...achievable].sort((a, b) => a - b);
  const lowest = sorted[0] as number;
  const highest = sorted[sorted.length - 1] as number;
  const below = sorted.filter((v) => toG(v) <= toG(load)).pop();
  const above = sorted.find((v) => toG(v) >= toG(load));
  if (direction === 'down') return below ?? lowest;
  if (direction === 'up') return above ?? highest;
  if (below === undefined) return lowest;
  if (above === undefined) return highest;
  return toG(load) - toG(below) <= toG(above) - toG(load) ? below : above;
}

/**
 * Fewest plates per side that add up to `target` grams, largest plates first.
 * The caller has already checked that the target can be made.
 */
function platesPerSide(equipment: Equipment, target: number): Map<number, number> {
  const plates = [...equipment.plates].sort((a, b) => b.kg - a.kg);
  let best: number[] = [];
  let bestCount = Infinity;

  const search = (index: number, remaining: number, used: number[], count: number): void => {
    if (remaining === 0) {
      if (count < bestCount) {
        best = [...used];
        bestCount = count;
      }
      return;
    }
    const plate = plates[index];
    if (plate === undefined || count >= bestCount) return;
    const max = Math.min(plate.count, Math.floor(remaining / toG(plate.kg)));
    for (let n = max; n >= 0; n--) {
      used[index] = n;
      search(index + 1, remaining - n * toG(plate.kg), used, count + n);
    }
    used[index] = 0;
  };
  search(0, target, [], 0);

  const result = new Map<number, number>();
  best.forEach((n, i) => {
    if (n > 0) result.set((plates[i] as { kg: number }).kg, n);
  });
  return result;
}

/**
 * The plates to put on each end of the bar for a load, heaviest first, for
 * example 20 and 2.5 for 65kg on a 20kg bar. Empty for the bar alone. Returns
 * null when there is no bar or the load cannot be made.
 */
export function platesEachSide(
  load: number,
  equipment: Equipment,
): { kg: number; count: number }[] | null {
  if (equipment.bar_kg === null) return null;
  if (!achievableLoads(equipment, 'barbell').some((v) => toG(v) === toG(load))) return null;
  const perSide = (toG(load) - toG(equipment.bar_kg)) / 2;
  return [...platesPerSide(equipment, perSide)].map(([kg, count]) => ({ kg, count }));
}

/**
 * How to make a load from the kit, for example "bar + 2 x 20 + 2 x 1.25".
 * Returns null when the load cannot be made.
 */
export function describeLoad(
  load: number,
  equipment: Equipment,
  type: EquipmentType = 'barbell',
): string | null {
  if (type === 'bodyweight') return 'bodyweight';
  if (!achievableLoads(equipment, type).some((v) => toG(v) === toG(load))) return null;
  switch (type) {
    case 'dumbbell':
      return `${load}kg dumbbells`;
    case 'kettlebell':
      return `${load}kg kettlebell`;
    case 'plate':
      return `${load}kg plate`;
    case 'barbell': {
      const perSide = (toG(load) - toG(equipment.bar_kg as number)) / 2;
      const plates = platesPerSide(equipment, perSide);
      const parts = [...plates].map(([kg, n]) => `${n * 2} x ${kg}`);
      return parts.length === 0 ? 'bar only' : ['bar', ...parts].join(' + ');
    }
  }
}
