import { useEffect, useState } from 'react';

/** Whether a media query matches, kept up to date. False where matchMedia does not exist. */
export function useMediaQuery(query: string): boolean {
  const read = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** The width from which Week shows seven columns. Matches the breakpoint in styles.css. */
export const DESKTOP = '(min-width: 900px)';
