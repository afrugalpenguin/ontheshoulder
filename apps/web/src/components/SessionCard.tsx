import {
  SKIP_REASONS,
  isoWeekOf,
  type ActivityInput,
  type SkipReason,
  type WeekSession,
} from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorText } from '../api.js';
import { KIND_BADGE, KIND_LABEL, STATUS_LABEL, targetText } from '../lib/format.js';
import { useRefreshWeek } from '../queries.js';
import { LogForm } from './LogForm.js';

type Mode = 'idle' | 'log' | 'skip';

/** Where Start goes for a session, or why there is nowhere to go. */
function startTarget(session: WeekSession): { to: string } | { hint: string } | null {
  switch (session.template.kind) {
    case 'walk_vest':
    case 'walk':
      return { to: `/timer/${session.id}` };
    case 'strength':
      return { to: '/strength' };
    case 'run':
      return { hint: 'Recorded on your watch' };
    default:
      return null;
  }
}

/** A planned session with its actions: Log, Skip and Start. */
export function SessionCard({ session }: { session: WeekSession }) {
  const [mode, setMode] = useState<Mode>('idle');
  const refreshWeek = useRefreshWeek();
  const done = () => {
    setMode('idle');
    return refreshWeek(isoWeekOf(session.date));
  };

  const log = useMutation({
    mutationFn: (activity: ActivityInput) => api('POST', '/activities', activity),
    onSuccess: done,
  });
  const patch = useMutation({
    mutationFn: (changes: { status: 'skipped' | 'planned'; skip_reason: SkipReason | null }) =>
      api('PATCH', `/planned-sessions/${session.id}`, changes),
    onSuccess: done,
  });

  const { template, status } = session;
  const target = targetText(session);
  const start = startTarget(session);
  const open = status === 'planned' || status === 'modified';

  return (
    <article className={`card session status-${status}`} aria-label={template.name}>
      <header className="session-head">
        <span className="badge" title={KIND_LABEL[template.kind]} aria-hidden="true">
          {KIND_BADGE[template.kind]}
        </span>
        <div className="grow">
          <h3>{template.name}</h3>
          {target && <p className="target">{target}</p>}
        </div>
        <div className="tags">
          {session.optional && <span className="tag">optional</span>}
          <span className={`tag status-tag status-${status}`}>
            {STATUS_LABEL[status]}
            {status === 'skipped' && session.skip_reason ? `: ${session.skip_reason}` : ''}
          </span>
        </div>
      </header>

      {mode === 'idle' && open && (
        <div className="row actions">
          <button type="button" className="primary grow" onClick={() => setMode('log')}>
            Log
          </button>
          <button type="button" className="grow" onClick={() => setMode('skip')}>
            Skip
          </button>
          {start && 'to' in start && (
            <Link className="button grow" to={start.to}>
              Start
            </Link>
          )}
          {start && 'hint' in start && (
            <button type="button" className="grow" disabled aria-describedby={`hint-${session.id}`}>
              Start
            </button>
          )}
        </div>
      )}
      {mode === 'idle' && open && start && 'hint' in start && (
        <p className="muted hint" id={`hint-${session.id}`}>
          {start.hint}
        </p>
      )}

      {mode === 'idle' && status === 'skipped' && (
        <div className="row actions">
          <button
            type="button"
            className="quiet"
            onClick={() => patch.mutate({ status: 'planned', skip_reason: null })}
          >
            Undo skip
          </button>
        </div>
      )}

      {mode === 'log' && (
        <LogForm
          session={session}
          busy={log.isPending}
          error={log.isError ? errorText(log.error) : null}
          onSubmit={(activity) => log.mutate(activity)}
          onCancel={() => setMode('idle')}
        />
      )}

      {mode === 'skip' && (
        <div className="skip" role="group" aria-label="Why skip?">
          <p>Why skip?</p>
          <div className="chips">
            {SKIP_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className="chip"
                onClick={() => patch.mutate({ status: 'skipped', skip_reason: reason })}
              >
                {reason}
              </button>
            ))}
          </div>
          <button type="button" className="quiet" onClick={() => setMode('idle')}>
            Cancel
          </button>
        </div>
      )}
      {patch.isError && (
        <p role="alert" className="error">
          {errorText(patch.error)}
        </p>
      )}
    </article>
  );
}
