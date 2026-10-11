import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CLASS: Record<ButtonVariant, string> = {
  primary: 'primary',
  secondary: '',
  ghost: 'quiet',
  danger: 'danger',
};

const classes = (...names: (string | undefined)[]) => names.filter(Boolean).join(' ') || undefined;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and stops further taps while something is in flight. */
  loading?: boolean;
}

/** The one button. 48px tall; secondary unless told otherwise. */
export function Button({ variant = 'secondary', loading, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={classes(CLASS[variant], className)}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

interface LinkProps {
  to: string;
  state?: unknown;
  variant?: ButtonVariant;
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
  children: ReactNode;
}

/** A link that looks like a button, for actions that go to another screen. */
export function ButtonLink({ variant = 'secondary', className, ...rest }: LinkProps) {
  return <Link {...rest} className={classes('button', CLASS[variant], className)} />;
}
