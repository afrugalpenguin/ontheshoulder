interface Props {
  label: string;
  /** Lowest and highest score, inclusive. */
  min: number;
  max: number;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Words for the ends of the scale, shown under the row. */
  ends?: [string, string];
  /** Lets a second tap on the chosen score clear it. */
  clearable?: boolean;
}

/** A row of large score buttons, for example sleep 1 to 5. */
export function ScoreRow({ label, min, max, value, onChange, ends, clearable }: Props) {
  const scores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="score" role="radiogroup" aria-label={label}>
      <span className="score-label">{label}</span>
      <div className="score-buttons">
        {scores.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label} ${n}`}
            onClick={() => onChange(clearable && value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {ends && (
        <div className="score-ends muted" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}
