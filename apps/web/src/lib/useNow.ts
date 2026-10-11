import { localDate } from '@ots/shared';
import { useEffect, useState } from 'react';
import { timeOfDay } from './format.js';

/** Today's date and the time of day, refreshed twice a minute so prompts expire on their own. */
export function useNow(): { today: string; time: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return { today: localDate(now), time: timeOfDay(now) };
}
