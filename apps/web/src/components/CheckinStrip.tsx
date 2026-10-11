import { weekdayOf, type Checkin, type CheckinInput, type Habit } from '@ots/shared';
import { useState } from 'react';
import { NumberField } from './NumberField.js';
import { ScoreRow } from './ScoreRow.js';

interface Props {
  checkin: Checkin;
  habits: Habit[];
  /** Most recent weight, used to prefill the field. */
  lastWeight: number | null;
  onSave: (changes: CheckinInput) => void;
  onCancel?: () => void;
}

/** The morning check-in: sleep, energy, weight, habits and the optional ankle row. One Save. */
export function CheckinStrip({ checkin, habits, lastWeight, onSave, onCancel }: Props) {
  const isSunday = weekdayOf(checkin.date) === 7;
  const [sleep, setSleep] = useState(checkin.sleep_quality);
  const [energy, setEnergy] = useState(checkin.energy);
  const [weight, setWeight] = useState(checkin.weight_kg ?? lastWeight);
  const [ankle, setAnkle] = useState(checkin.ankle_score);
  const [gotUp, setGotUp] = useState(checkin.sunday_got_up ?? false);
  const [ticks, setTicks] = useState<Record<string, boolean>>(checkin.habits);

  const ready = sleep !== null && energy !== null;
  const save = () => {
    if (!ready) return;
    onSave({
      sleep_quality: sleep,
      energy,
      weight_kg: weight,
      ankle_score: ankle,
      habits: Object.fromEntries(habits.map((h) => [h.key, ticks[h.key] === true])),
      ...(isSunday ? { sunday_got_up: gotUp } : {}),
    });
  };

  return (
    <section className="card" aria-label="Check-in">
      <h2>Check-in</h2>
      <ScoreRow
        label="Sleep"
        min={1}
        max={5}
        value={sleep}
        onChange={setSleep}
        ends={['poor', 'great']}
      />
      <ScoreRow
        label="Energy"
        min={1}
        max={5}
        value={energy}
        onChange={setEnergy}
        ends={['flat', 'full']}
      />
      <NumberField label="Weight (kg)" value={weight} onChange={setWeight} placeholder="optional" />
      <fieldset className="habits">
        <legend>Habits</legend>
        {habits
          .filter((h) => h.enabled)
          .map((h) => (
            <label key={h.key} className="check">
              <input
                type="checkbox"
                checked={ticks[h.key] === true}
                onChange={(e) => setTicks({ ...ticks, [h.key]: e.target.checked })}
              />
              {h.label}
            </label>
          ))}
      </fieldset>
      <ScoreRow
        label="Ankle"
        min={0}
        max={5}
        value={ankle}
        onChange={setAnkle}
        ends={['fine', 'sore']}
        clearable
      />
      {isSunday && (
        <label className="check">
          <input type="checkbox" checked={gotUp} onChange={(e) => setGotUp(e.target.checked)} />
          Got up for it
        </label>
      )}
      <div className="row">
        <button type="button" className="primary grow" disabled={!ready} onClick={save}>
          Save check-in
        </button>
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {!ready && <p className="muted">Pick sleep and energy to save.</p>}
    </section>
  );
}
