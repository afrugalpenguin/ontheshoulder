import { isoWeekOf, type ActivityInput, type PlannedSession } from '@ots/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../api.js';
import { ScoreRow } from '../components/ScoreRow.js';
import { mmss, targetText } from '../lib/format.js';
import { useRefreshWeek, useWeek } from '../queries.js';
import { IntervalTimer } from './IntervalTimer.js';
import type { TimerSummary } from './machine.js';
import { finishPayload, timerPlanFor } from './plan.js';

/** The interval timer for one planned session, then the log form pre-filled from what was done. */
export function TimerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const refreshWeek = useRefreshWeek();
  const planned = useQuery({
    queryKey: ['planned-session', sessionId],
    queryFn: () => api<PlannedSession>('GET', `/planned-sessions/${sessionId}`),
  });
  const isoWeek = planned.data ? isoWeekOf(planned.data.date) : '';
  const week = useWeek(isoWeek || isoWeekOf('2000-01-03'));
  const session = planned.data
    ? week.data?.sessions.find((s) => s.id === planned.data.id)
    : undefined;

  const [done, setDone] = useState<TimerSummary | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: (activity: ActivityInput) => api('POST', '/activities', activity),
    onSuccess: async () => {
      await refreshWeek(isoWeek);
      await navigate('/');
    },
  });

  if (planned.isError) {
    return (
      <main>
        <p role="alert" className="error">
          {errorText(planned.error)}
        </p>
        <Link className="button" to="/">
          Back to Today
        </Link>
      </main>
    );
  }
  if (!session) {
    return (
      <main>
        <p className="muted">Loading...</p>
      </main>
    );
  }

  if (!done) {
    return (
      <IntervalTimer
        title={session.template.name}
        plan={timerPlanFor(session)}
        onFinish={setDone}
      />
    );
  }

  return (
    <main>
      <header className="page-head">
        <h1>{session.template.name}</h1>
        <p className="muted">
          {done.ended_early ? 'Ended early' : done.completed ? 'Completed' : 'Finished'}. Planned{' '}
          {targetText(session) || 'session'}.
        </p>
      </header>
      <form
        className="card stack"
        aria-label="Log timed session"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(finishPayload(session, done, { rpe, notes }));
        }}
      >
        <dl className="pairs">
          <dt>Time</dt>
          <dd>{mmss(done.total_sec)}</dd>
          {session.template.kind === 'walk_vest' && (
            <>
              <dt>Vest</dt>
              <dd>{session.targets.vest_kg ? `${session.targets.vest_kg}kg` : 'none'}</dd>
            </>
          )}
          {done.phases.length > 1 && (
            <>
              <dt>Phases</dt>
              <dd>
                {done.phases.filter((p) => p.actual_sec > 0).length} of {done.phases.length} done
              </dd>
            </>
          )}
        </dl>
        <ScoreRow
          label="RPE"
          min={1}
          max={10}
          value={rpe}
          onChange={setRpe}
          ends={['easy', 'all out']}
          clearable
        />
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {save.isError && (
          <p role="alert" className="error">
            {errorText(save.error)}
          </p>
        )}
        <button type="submit" className="primary" disabled={save.isPending}>
          Save and finish
        </button>
      </form>
    </main>
  );
}
