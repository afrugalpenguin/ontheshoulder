interface Props {
  /** The line to show, from kitPrompt. */
  text: string;
  ready: boolean;
  onChange: (ready: boolean) => void;
}

/** The quiet evening line about tomorrow, with a tick for "kit is out". */
export function KitBanner({ text, ready, onChange }: Props) {
  return (
    <div className="kit-banner">
      <label className="check">
        <input
          type="checkbox"
          aria-label="Kit out for tomorrow"
          checked={ready}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{text}</span>
      </label>
    </div>
  );
}
