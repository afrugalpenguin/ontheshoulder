import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Whole numbers only. Sets the phone keyboard. */
  integer?: boolean;
  placeholder?: string;
}

const parse = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * A labelled number input that keeps what was typed (so "2." can become "2.5")
 * and reports the parsed number, or null when empty or not a number.
 */
export function NumberField({ label, value, onChange, integer, placeholder }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));

  // Follow changes made elsewhere (a reset, a prefill) without fighting the typist.
  useEffect(() => {
    setText((current) =>
      parse(current) === value ? current : value === null ? '' : String(value),
    );
  }, [value]);

  return (
    <label>
      {label}
      <input
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
      />
    </label>
  );
}
