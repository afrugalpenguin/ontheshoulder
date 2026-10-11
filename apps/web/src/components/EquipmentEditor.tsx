import { achievableLoads, describeLoad, type Equipment, type EquipmentType } from '@ots/shared';
import { useState } from 'react';
import { Chip } from '../ui/index.js';
import { NumberField } from './NumberField.js';

export const NO_EQUIPMENT: Equipment = {
  bar_kg: null,
  plates: [],
  dumbbells: [],
  kettlebells: [],
  vest_kg: null,
};

const STANDARD_PLATES = [20, 10, 5, 2.5, 1.25];
const PLATE_CHOICES = [25, 20, 15, 10, 5, 2.5, 1.25];
const DUMBBELL_CHOICES = [5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30];
const KETTLEBELL_CHOICES = [8, 12, 16, 20, 24, 28, 32];
/** Kit types with a full "preview achievable loads" list, to sanity-check a plate list. */
const PREVIEW_TYPES: [EquipmentType, string][] = [
  ['barbell', 'barbell'],
  ['dumbbell', 'dumbbell'],
  ['kettlebell', 'kettlebell'],
  ['plate', 'single plate'],
];

interface Props {
  value: Equipment;
  onChange: (next: Equipment) => void;
}

/** One line per kit type saying what loads it can make. */
export function loadSummary(equipment: Equipment, type: EquipmentType): string {
  const loads = achievableLoads(equipment, type);
  if (loads.length === 0) return 'none';
  if (loads.length === 1) return `${loads[0]}kg`;
  return `${loads.length} loads, ${loads[0]} to ${loads[loads.length - 1]}kg`;
}

function WeightChips(props: {
  label: string;
  noun: string;
  choices: number[];
  values: number[];
  onChange: (values: number[]) => void;
}) {
  const { label, noun, choices, values, onChange } = props;
  const [custom, setCustom] = useState('');
  const sorted = [...values].sort((a, b) => a - b);
  const toggle = (kg: number) =>
    onChange(values.includes(kg) ? values.filter((v) => v !== kg) : [...values, kg]);
  const addCustom = () => {
    const kg = Number(custom);
    if (custom.trim() !== '' && Number.isFinite(kg) && kg > 0 && !values.includes(kg)) {
      onChange([...values, kg]);
    }
    setCustom('');
  };
  const all = [...new Set([...choices, ...sorted])].sort((a, b) => a - b);

  return (
    <fieldset className="kit-section">
      <legend>{label}</legend>
      <p className="muted">
        {sorted.length === 0 ? `No ${noun}.` : `Owned: ${sorted.map((v) => `${v}kg`).join(', ')}`}
      </p>
      <div className="chips">
        {all.map((kg) => (
          <button
            key={kg}
            type="button"
            className="chip"
            aria-pressed={values.includes(kg)}
            aria-label={`${kg}kg ${noun}`}
            onClick={() => toggle(kg)}
          >
            {kg}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="grow">
          <span className="visually-hidden">Other {noun} weight in kg</span>
          <input
            inputMode="decimal"
            placeholder="Other kg"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </label>
        <button type="button" onClick={addCustom}>
          Add
        </button>
        <button type="button" className="quiet" onClick={() => onChange([])}>
          No {noun}
        </button>
      </div>
    </fieldset>
  );
}

/** The plates owned at a glance: one chip per size, saying how many pairs. */
export function PlatePairs({ equipment }: { equipment: Equipment }) {
  const plates = [...equipment.plates].sort((a, b) => b.kg - a.kg);
  if (plates.length === 0) return null;
  const loads = achievableLoads(equipment, 'barbell');
  return (
    <section className="kit-section stack" aria-label="Plate pairs">
      <h3>Plate pairs</h3>
      <div className="chips">
        {plates.map((p) => (
          <Chip
            key={p.kg}
            aria-label={`${p.kg} kg, ${p.count} ${p.count === 1 ? 'pair' : 'pairs'}`}
          >
            {p.kg} x {p.count}
          </Chip>
        ))}
      </div>
      {loads.length > 0 && (
        <p className="muted small">
          Heaviest bar: {loads[loads.length - 1]} kg, with every plate on.
        </p>
      )}
    </section>
  );
}

/** Editor for the kit a user owns. Every section can be set to none. */
export function EquipmentEditor({ value, onChange }: Props) {
  const set = (patch: Partial<Equipment>) => onChange({ ...value, ...patch });
  const plates = [...value.plates].sort((a, b) => b.kg - a.kg);

  const addPair = (kg: number) => {
    const found = value.plates.find((p) => p.kg === kg);
    set({
      plates: found
        ? value.plates.map((p) => (p.kg === kg ? { ...p, count: p.count + 1 } : p))
        : [...value.plates, { kg, count: 1 }],
    });
  };
  const removePair = (kg: number) =>
    set({
      plates: value.plates
        .map((p) => (p.kg === kg ? { ...p, count: p.count - 1 } : p))
        .filter((p) => p.count > 0),
    });
  const addStandardSet = () => {
    const have = new Set(value.plates.map((p) => p.kg));
    set({
      plates: [
        ...value.plates,
        ...STANDARD_PLATES.filter((kg) => !have.has(kg)).map((kg) => ({ kg, count: 1 })),
      ],
    });
  };

  return (
    <div className="kit">
      <PlatePairs equipment={value} />
      <fieldset className="kit-section">
        <legend>Barbell</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={value.bar_kg !== null}
            onChange={(e) => set({ bar_kg: e.target.checked ? 20 : null })}
          />
          I have a barbell
        </label>
        {value.bar_kg !== null && (
          <NumberField
            label="Bar weight (kg)"
            value={value.bar_kg}
            onChange={(kg) => set({ bar_kg: kg ?? 0 })}
          />
        )}
      </fieldset>

      <fieldset className="kit-section">
        <legend>Plates</legend>
        {plates.length === 0 ? (
          <p className="muted">No plates.</p>
        ) : (
          <ul className="plain">
            {plates.map((p) => (
              <li key={p.kg} className="row">
                <span className="grow">
                  {p.kg}kg x {p.count} {p.count === 1 ? 'pair' : 'pairs'}
                </span>
                <button
                  type="button"
                  aria-label={`One pair of ${p.kg}kg fewer`}
                  onClick={() => removePair(p.kg)}
                >
                  -
                </button>
                <button
                  type="button"
                  aria-label={`One more pair of ${p.kg}kg`}
                  onClick={() => addPair(p.kg)}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chips">
          {PLATE_CHOICES.map((kg) => (
            <button
              key={kg}
              type="button"
              className="chip"
              aria-label={`Add a pair of ${kg}kg plates`}
              onClick={() => addPair(kg)}
            >
              + {kg}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" onClick={addStandardSet}>
            Add standard set
          </button>
          <button type="button" className="quiet" onClick={() => set({ plates: [] })}>
            No plates
          </button>
        </div>
      </fieldset>

      <WeightChips
        label="Dumbbells (pairs)"
        noun="dumbbells"
        choices={DUMBBELL_CHOICES}
        values={value.dumbbells}
        onChange={(dumbbells) => set({ dumbbells })}
      />
      <WeightChips
        label="Kettlebells"
        noun="kettlebells"
        choices={KETTLEBELL_CHOICES}
        values={value.kettlebells}
        onChange={(kettlebells) => set({ kettlebells })}
      />

      <fieldset className="kit-section">
        <legend>Weight vest</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={value.vest_kg !== null}
            onChange={(e) => set({ vest_kg: e.target.checked ? 20 : null })}
          />
          I have a vest
        </label>
        {value.vest_kg !== null && (
          <NumberField
            label="Vest weight (kg)"
            value={value.vest_kg}
            onChange={(kg) => set({ vest_kg: kg ?? 0 })}
          />
        )}
      </fieldset>

      <section className="kit-section" aria-label="Loads you can make">
        <h3>Loads you can make</h3>
        <dl className="pairs">
          <dt>Barbell</dt>
          <dd>{loadSummary(value, 'barbell')}</dd>
          <dt>Dumbbells</dt>
          <dd>{loadSummary(value, 'dumbbell')}</dd>
          <dt>Kettlebells</dt>
          <dd>{loadSummary(value, 'kettlebell')}</dd>
        </dl>
        {PREVIEW_TYPES.map(([type, label]) => {
          const loads = achievableLoads(value, type);
          if (loads.length === 0) return null;
          return (
            <details key={type} className="load-preview">
              <summary>
                Every {label} load ({loads.length})
              </summary>
              <ul className="plain">
                {loads.map((kg) => (
                  <li key={kg}>
                    <strong>{kg}kg</strong>{' '}
                    <span className="muted">{describeLoad(kg, value, type)}</span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </section>
    </div>
  );
}
