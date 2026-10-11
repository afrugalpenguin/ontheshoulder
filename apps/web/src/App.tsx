import type { Health } from '@ots/shared';
import { useEffect, useState } from 'react';

type HealthState =
  { status: 'loading' } | { status: 'ok'; health: Health } | { status: 'error'; message: string };

export function App() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`api responded ${res.status}`);
        return (await res.json()) as Health;
      })
      .then((health) => {
        if (!cancelled) setState({ status: 'ok', health });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>On the Shoulder</h1>
      {state.status === 'loading' && <p>Checking the api...</p>}
      {state.status === 'ok' && (
        <dl>
          <dt>api</dt>
          <dd>ok</dd>
          <dt>version</dt>
          <dd>{state.health.version}</dd>
          <dt>uptime</dt>
          <dd>{state.health.uptime_s} s</dd>
        </dl>
      )}
      {state.status === 'error' && <p role="alert">api unreachable: {state.message}</p>}
    </main>
  );
}
