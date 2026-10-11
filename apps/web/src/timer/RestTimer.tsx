import { useEffect, useRef, useState } from 'react';
import { mmss } from '../lib/format.js';
import { playCue, type CuePlayer } from './cues.js';

interface Props {
  seconds: number;
  /** Called once when the rest ends, whether it ran out or was skipped. */
  onDone: () => void;
  /** Start counting as soon as it is shown or reset. Defaults to true. */
  autoStart?: boolean;
  /** Change this value to restart the countdown, for example when the next set is logged. */
  resetKey?: string | number;
  cue?: CuePlayer;
}

const WARNING_AT_SEC = 10;

type Run = { status: 'idle' } | { status: 'running'; startedAt: number } | { status: 'done' };

/**
 * Compact rest countdown. Cues at 10 seconds left and at zero, tap to skip.
 * Time comes from the clock, not from counting ticks, so it stays right if the
 * page is backgrounded.
 */
export function RestTimer({ seconds, onDone, autoStart = true, resetKey, cue = playCue }: Props) {
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const [now, setNow] = useState(() => performance.now());
  const warned = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  // (Re)start whenever the parent resets it or the length changes.
  useEffect(() => {
    warned.current = false;
    const t = performance.now();
    setNow(t);
    setRun(autoStart ? { status: 'running', startedAt: t } : { status: 'idle' });
  }, [resetKey, seconds, autoStart]);

  const running = run.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, [running]);

  const remainingMs =
    run.status === 'running' ? Math.max(0, seconds * 1000 - (now - run.startedAt)) : seconds * 1000;
  const remaining = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!running) return;
    if (remainingMs <= 0) {
      setRun({ status: 'done' });
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
  }, [remainingMs, running, seconds, cue]);

  if (run.status === 'idle') {
    return (
      <button
        type="button"
        className="rest-timer"
        onClick={() => {
          const t = performance.now();
          setNow(t);
          setRun({ status: 'running', startedAt: t });
        }}
      >
        Start {mmss(seconds)} rest
      </button>
    );
  }
  if (run.status === 'done') {
    return (
      <p className="rest-timer rest-done" role="status">
        Rest over
      </p>
    );
  }
  return (
    <button
      type="button"
      className="rest-timer"
      aria-label={`Rest, ${remaining} seconds left. Tap to skip`}
      onClick={() => {
        setRun({ status: 'done' });
        done.current();
      }}
    >
      <span className="rest-digits" aria-hidden="true">
        {mmss(remaining)}
      </span>
      <span className="muted" aria-hidden="true">
        rest, tap to skip
      </span>
    </button>
  );
}
