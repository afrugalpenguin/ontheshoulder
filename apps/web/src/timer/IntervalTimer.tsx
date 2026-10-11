import { useEffect, useRef, useState } from 'react';
import { mmss } from '../lib/format.js';
import { playCue, unlockAudio, type CuePlayer } from './cues.js';
import {
  createTimer,
  endEarly,
  pause,
  resume,
  skipPhase,
  start,
  summary,
  tick,
  view,
  type TimerPlan,
  type TimerState,
  type TimerSummary,
} from './machine.js';

interface Props {
  title: string;
  plan: TimerPlan;
  onFinish: (summary: TimerSummary) => void;
  cue?: CuePlayer;
  /** Start counting at once, for when the tap that opened the timer was the Start. */
  autostart?: boolean;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/**
 * Keeps the screen on while `active`. The Wake Lock API only exists in secure
 * contexts, so on plain LAN http this quietly does nothing.
 */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
          }
        ).wakeLock;
        if (!wakeLock || document.visibilityState !== 'visible') return;
        const acquired = await wakeLock.request('screen');
        if (cancelled) void acquired.release();
        else lock = acquired;
      } catch {
        // Not available or refused; the timer still runs.
      }
    };
    void request();
    // The lock is dropped when the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

/** Full-screen interval timer driven by the pure state machine. */
export function IntervalTimer({ title, plan, onFinish, cue = playCue, autostart }: Props) {
  const [state, setState] = useState<TimerState>(() =>
    autostart ? start(createTimer(plan), performance.now()) : createTimer(plan),
  );
  const [now, setNow] = useState(() => performance.now());
  const stateRef = useRef(state);
  stateRef.current = state;
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const reported = useRef(false);

  const apply = (next: TimerState) => {
    stateRef.current = next;
    setState(next);
  };

  const active = state.status === 'running' || state.status === 'paused';
  useWakeLock(active);

  // Advance from the clock: a few times a second, and at once when the page
  // comes back from the background so missed phases are fast-forwarded.
  useEffect(() => {
    if (state.status !== 'running') return;
    const step = () => {
      const t = performance.now();
      const result = tick(stateRef.current, t);
      for (const c of result.cues) cue(c.kind);
      apply(result.state);
      setNow(t);
    };
    step();
    const timer = setInterval(step, 200);
    document.addEventListener('visibilitychange', step);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', step);
    };
  }, [state.status, cue]);

  useEffect(() => {
    if (state.status === 'done' && !reported.current) {
      reported.current = true;
      finish.current(summary(state, performance.now()));
    }
  }, [state]);

  const v = view(state, now);
  const act = (fn: (s: TimerState, t: number) => TimerState) => {
    const t = performance.now();
    apply(fn(stateRef.current, t));
    setNow(t);
  };

  if (state.phases.length === 0) {
    return (
      <main className="timer">
        <h1>{title}</h1>
        <p className="muted">This session has no duration to time. Log it from Week instead.</p>
      </main>
    );
  }

  const phase = v.phase;
  const kind = state.status === 'idle' ? 'idle' : (phase?.kind ?? 'main');
  return (
    <main className={`timer phase-${kind}`}>
      <h1>{title}</h1>
      <p className="timer-phase" aria-live="polite">
        {state.status === 'idle' ? 'Ready' : state.status === 'paused' ? 'Paused' : phase?.label}
        {phase?.repeat !== undefined && state.status !== 'idle' && (
          <span className="muted">
            {' '}
            {phase.repeat} of {phase.repeats}
          </span>
        )}
      </p>

      <div className="timer-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r={RING_R} />
          <circle
            className="ring-fill"
            cx="60"
            cy="60"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - v.phaseProgress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div
          className="timer-digits"
          role="timer"
          aria-label={`${Math.ceil(v.phaseRemainingMs / 1000)} seconds left in this phase`}
        >
          {mmss(Math.ceil(v.phaseRemainingMs / 1000))}
        </div>
      </div>

      <p className="timer-total">
        Total <strong>{mmss(Math.floor(v.activeMs / 1000))}</strong>
      </p>

      {state.status === 'idle' && (
        <button
          type="button"
          className="primary timer-main"
          onClick={() => {
            unlockAudio();
            act(start);
          }}
        >
          Start
        </button>
      )}
      {state.status === 'running' && (
        <button type="button" className="primary timer-main" onClick={() => act(pause)}>
          Pause
        </button>
      )}
      {state.status === 'paused' && (
        <button type="button" className="primary timer-main" onClick={() => act(resume)}>
          Resume
        </button>
      )}
      {active && (
        <div className="row">
          <button type="button" className="grow" onClick={() => act(skipPhase)}>
            Skip phase
          </button>
          <button type="button" className="grow" onClick={() => act(endEarly)}>
            End early
          </button>
        </div>
      )}
    </main>
  );
}
