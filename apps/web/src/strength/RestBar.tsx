import { useEffect, useRef, useState } from 'react';
import { mmss } from '../lib/format.js';
import { playCue, type CuePlayer } from '../timer/cues.js';
import { Button } from '../ui/index.js';

interface Props {
  seconds: number;
  /** Changes when a set is logged, which restarts the countdown. */
  resetKey: number;
  /** What comes after the rest, for example "Back squat, 60 kg". */
  next: string | null;
  /** Called once when the rest ends, whether it ran out or was skipped. */
  onDone: () => void;
  cue?: CuePlayer;
}

const WARNING_AT_SEC = 10;

/**
 * The rest countdown, fixed to the bottom of the screen while a rest runs.
 * Cues at 10 seconds left and at zero. Time comes from the clock, not from
 * counting ticks, so it stays right if the page is backgrounded.
 */
export function RestBar({ seconds, resetKey, next, onDone, cue = playCue }: Props) {
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [now, setNow] = useState(startedAt);
  const warned = useRef(false);
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const t = performance.now();
    warned.current = false;
    finished.current = false;
    setStartedAt(t);
    setNow(t);
  }, [resetKey, seconds]);

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = Math.max(0, seconds * 1000 - (now - startedAt));
  const remaining = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (finished.current) return;
    if (remainingMs <= 0) {
      finished.current = true;
      cue('finish');
      done.current();
    } else if (
      !warned.current &&
      seconds > WARNING_AT_SEC &&
      remainingMs <= WARNING_AT_SEC * 1000
    ) {
      warned.current = true;
      cue('rest_warning');
    }
  }, [remainingMs, seconds, cue]);

  return (
    <aside className="rest-bar" aria-label="Rest">
      <div className="rest-bar-row">
        <p className="rest-bar-digits" role="timer" aria-label={`Rest, ${remaining} seconds left`}>
          {mmss(remaining)}
        </p>
        <p className="grow muted small">{next ? `Next: ${next}` : 'Last set done'}</p>
        <Button
          onClick={() => {
            if (finished.current) return;
            finished.current = true;
            done.current();
          }}
        >
          Skip
        </Button>
      </div>
      <progress
        className="rest-bar-progress"
        aria-hidden="true"
        max={seconds * 1000}
        value={seconds * 1000 - remainingMs}
      />
    </aside>
  );
}
