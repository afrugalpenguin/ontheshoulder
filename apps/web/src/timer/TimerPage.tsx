import { isoWeekOf, type ActivityInput, type PlannedSession } from '@ots/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { api, errorText } from '../api.js';
import { plannedMinutes } from '../lib/activity.js';
import { mmss, targetText } from '../lib/format.js';
import { useRefreshWeek, useWeek } from '../queries.js';
import { Button, ButtonLink, Card, Segmented, scale, useToast } from '../ui/index.js';
import { IntervalTimer } from './IntervalTimer.js';
import type { TimerSummary } from './machine.js';
import { finishPayload, isShortFinish, timerPlanFor } from './plan.js';

const RPE = scale(1, 10);

/**
 * The interval timer for one planned session, then one tap to save what was
 * done. A timer finished after only a few minutes saves nothing until the user
 * has said whether to log the planned duration or the time on the clock.
 */
export function TimerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const autostart = (location.state as { autostart?: boolean } | null)?.autostart === true;
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
  // Which time to log after a short finish; null until chosen.
  const [logAs, setLogAs] = useState<'planned' | 'actual' | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: (activity: ActivityInput) => api('POST', '/activities', activity),
    onSuccess: async () => {
      toast(`${session?.template.name ?? 'Session'} logged`);
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
        <ButtonLink to="/">Back to Week</ButtonLink>
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
        autostart={autostart}
      />
    );
  }

  const plannedMin = plannedMinutes(session);
  if (isShortFinish(done, plannedMin) && logAs === null) {
    return (
      <main>
        <header className="page-head">
          <h1>{session.template.name}</h1>
          <p className="muted">The timer ran for {mmss(done.total_sec)}.</p>
        </header>
        <Card role="alertdialog" aria-label="Which time to log">
          <p>Log the planned {plannedMin} min instead?</p>
          <div className="row">
            <Button variant="primary" className="grow" onClick={() => setLogAs('planned')}>
              Log {plannedMin} min
            </Button>
            <Button className="grow" onClick={() => setLogAs('actual')}>
              Log {mmss(done.total_sec)}
            </Button>
          </div>
        </Card>
      </main>
    );
  }
  const minutes = logAs === 'planned' && plannedMin !== null ? plannedMin : undefined;

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
        aria-label="Log timed session"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(finishPayload(session, done, { rpe, notes }, minutes));
        }}
      >
        <Card>
          <dl className="pairs">
            <dt>Time</dt>
            <dd>{minutes === undefined ? mmss(done.total_sec) : `${minutes} min, as planned`}</dd>
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
          <Segmented
            label="RPE"
            options={RPE}
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
          <Button type="submit" variant="primary" loading={save.isPending}>
            Finish
          </Button>
        </Card>
      </form>
    </main>
  );
}
