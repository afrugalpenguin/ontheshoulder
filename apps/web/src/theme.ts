export type Theme = 'dark' | 'light';

/**
 * Manual override for the colour scheme. Pass null to go back to the system
 * preference.
 */
export function setThemeOverride(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme === null) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

// The design tokens, by name. The values live in styles.css as custom
// properties; these are the references to use from code.

/** Spacing scale in CSS pixels: 4, 8, 12, 16, 24, 32. */
export const SPACE = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
} as const;

/** Three type sizes and one display size for timers and countdowns. */
export const TEXT = {
  sm: 'var(--text-sm)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  display: 'var(--text-display)',
} as const;

export const COLOUR = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  border: 'var(--border)',
  fg: 'var(--fg)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
} as const;
