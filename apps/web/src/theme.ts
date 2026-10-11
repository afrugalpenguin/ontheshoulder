export type Theme = 'dark' | 'light';

/**
 * Manual override for the colour scheme. Pass null to go back to the system
 * preference. Stub: nothing calls it until Settings exists.
 */
export function setThemeOverride(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme === null) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
