import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  /** Where plus and minus start from when there is no value yet. */
  start?: number | undefined;
  unit?: string;
  /** Allows the value to be emptied by clearing the field. */
  clearable?: boolean;
}

const decimalsOf = (step: number): number => (String(step).split('.')[1] ?? '').length;

const parse = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Big minus and plus around a value. The value can also be typed; typing is
 * reported when the field is left or Enter is pressed, so a half-typed number
 * is never saved.
 */
export function Stepper(props: Props) {
  const { label, value, onChange, step, min, max, start, unit, clearable } = props;
  const decimals = decimalsOf(step);
  const shown = value === null ? '' : value.toFixed(decimals);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const clamp = (n: number) => {
    const rounded = Number(n.toFixed(decimals));
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
  };
  const nudge = (by: number) => onChange(clamp(value === null ? (start ?? min ?? 0) : value + by));
  const commit = () => {
    const typed = parse(text);
    if (typed === null) {
      if (clearable && text.trim() === '') {
        if (value !== null) onChange(null);
      } else {
        setText(shown);
      }
      return;
    }
    const next = clamp(typed);
    setText(next.toFixed(decimals));
    if (next !== value) onChange(next);
  };

  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="score-label">{label}</span>
      <div className="stepper-row">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => nudge(-step)}>
          <span aria-hidden="true">-</span>
        </button>
        <input
          aria-label={label}
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {unit && <span className="stepper-unit">{unit}</span>}
        <button type="button" aria-label={`Increase ${label}`} onClick={() => nudge(step)}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
