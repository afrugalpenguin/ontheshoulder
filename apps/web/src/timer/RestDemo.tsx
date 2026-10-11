import { useState } from 'react';
import { playCue, unlockAudio, type CueName } from './cues.js';
import { RestTimer } from './RestTimer.js';
import { Button } from '../ui/index.js';

/** A page to try the rest timer on its own: 30 seconds, cues at 10 and 0. */
export function RestDemo() {
  const [round, setRound] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const cue = (name: CueName) => {
    playCue(name);
    setLog((lines) => [
      ...lines,
      name === 'rest_warning' ? 'Cue: 10 seconds left' : 'Cue: rest over',
    ]);
  };

  return (
    <main>
      <header className="page-head">
        <h1>Rest timer demo</h1>
        <p className="muted">30 seconds. A cue at 10 seconds left and another at zero.</p>
      </header>
      {round === 0 ? (
        <Button
          variant="primary"
          onClick={() => {
            unlockAudio();
            setRound(1);
          }}
        >
          Log a set
        </Button>
      ) : (
        <>
          <RestTimer
            seconds={30}
            resetKey={round}
            cue={cue}
            onDone={() => setLog((lines) => [...lines, 'onDone called'])}
          />
          <Button
            onClick={() => {
              setLog([]);
              setRound(round + 1);
            }}
          >
            Log the next set (resets the rest)
          </Button>
        </>
      )}
      <ul aria-label="Cue log" className="plain">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
