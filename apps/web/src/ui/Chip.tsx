import type { ReactNode } from 'react';

export type ChipTone = 'success' | 'warning' | 'accent';

interface Props {
  children: ReactNode;
  /** Colour for a status. Never the only signal: the text says the same thing. */
  tone?: ChipTone | undefined;
  /** For a chip that toggles. Leave undefined for a chip that is a one-off action. */
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** A pill. With onClick it is a button (a choice or a toggle); without, a small label. */
export function Chip({ children, tone, selected, onClick, disabled, ...rest }: Props) {
  const className = ['chip', tone ? `tone-${tone}` : ''].filter(Boolean).join(' ');
  if (!onClick) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
