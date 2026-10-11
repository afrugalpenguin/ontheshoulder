import { describeLoad, platesEachSide, type Equipment, type Exercise } from '@ots/shared';
import { useState } from 'react';
import { Segmented, Sheet } from '../ui/index.js';

interface Props {
  open: boolean;
  onClose: () => void;
  exercise: Exercise;
  load: number;
  equipment: Equipment;
}

type View = 'side' | 'total';
const VIEWS = [
  { value: 'side' as const, label: 'Each side' },
  { value: 'total' as const, label: 'Total kg' },
];
const VIEW_KEY = 'ots.plates.view';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'total' ? 'total' : 'side';
  } catch {
    return 'side';
  }
}

/** "20 + 2.5", or "2 x 20 + 5" when a plate goes on twice. */
export function sideText(plates: { kg: number; count: number }[]): string {
  return plates.map((p) => (p.count > 1 ? `${p.count} x ${p.kg}` : String(p.kg))).join(' + ');
}

/** What to load or pick up for a weight: plates per side for a bar, the pair or bell otherwise. */
export function PlatesSheet({ open, onClose, exercise, load, equipment }: Props) {
  const [view, setView] = useState<View>(savedView);
  const choose = (next: View | null) => {
    if (!next) return;
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private browsing: the choice lasts for this visit only.
    }
  };

  const side = exercise.equipment === 'barbell' ? platesEachSide(load, equipment) : null;
  let body;
  if (exercise.equipment === 'barbell' && side) {
    body = (
      <>
        {view === 'side' ? (
          <div>
            <p className="load">{side.length === 0 ? 'Bar only' : sideText(side)}</p>
            <p className="muted">
              {side.length === 0 ? 'no plates' : 'each side'}, bar {equipment.bar_kg}
            </p>
          </div>
        ) : (
          <div>
            <p className="load">{load} kg</p>
            <p className="muted">{describeLoad(load, equipment, 'barbell')}</p>
          </div>
        )}
        <Segmented label="Show" options={VIEWS} value={view} onChange={choose} />
      </>
    );
  } else if (exercise.equipment === 'dumbbell') {
    body = <p className="load">The {load} kg dumbbells</p>;
  } else if (exercise.equipment === 'kettlebell') {
    body = <p className="load">The {load} kg kettlebell</p>;
  } else {
    body = (
      <p className="load">{describeLoad(load, equipment, exercise.equipment) ?? `${load} kg`}</p>
    );
  }

  return (
    <Sheet open={open} title={`${exercise.name}: ${load} kg`} onClose={onClose}>
      {body}
    </Sheet>
  );
}
