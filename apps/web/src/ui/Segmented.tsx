export interface SegmentedOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Words for the two ends of a scale, shown under the row. */
  ends?: [string, string];
  /** Lets a second tap on the chosen option clear it. */
  clearable?: boolean;
  className?: string;
}

/** Options for a whole-number scale, for example 1 to 5. */
export const scale = (min: number, max: number): SegmentedOption<number>[] =>
  Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }));

/** A row of large choices where one is picked: scores, ranges, short lists. */
export function Segmented<T extends string | number>(props: Props<T>) {
  const { label, options, value, onChange, ends, clearable, className } = props;
  return (
    <div
      className={['score', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={label}
    >
      <span className="score-label">{label}</span>
      <div className="score-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={`${label} ${option.label}`}
            onClick={() => onChange(clearable && value === option.value ? null : option.value)}
          >
            {option.label}
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
