import {
  SKIP_REASONS,
  isoWeekOf,
  type ActivityInput,
  type SkipReason,
  type WeekSession,
} from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../api.js';
import { buildActivity, logDefaults, primaryAction } from '../lib/activity.js';
import { KIND_BADGE, KIND_LABEL, STATUS_LABEL, targetText } from '../lib/format.js';
import { useRefreshWeek } from '../queries.js';
import { unlockAudio } from '../timer/cues.js';
import { Button, ButtonLink, Chip, Sheet, useToast } from '../ui/index.js';
import { LogForm } from './LogForm.js';

type Open = 'none' | 'more' | 'log' | 'skip';

/** Where Start goes: the timer for a walk, the session screen for strength. */
function startTarget(session: WeekSession): string {
  if (session.template.kind !== 'strength') return `/timer/${session.id}`;
  return session.template.programme_day_id
    ? `/strength/day/${session.template.programme_day_id}`
    : '/strength';
}

/**
 * A planned session. One primary button, whose label depends on the kind of
 * session (Start, Log or Done), and a small overflow for Skip and Edit.
 */
export function SessionCard({ session }: { session: WeekSession }) {
  const [open, setOpen] = useState<Open>('none');
  const refreshWeek = useRefreshWeek();
  const toast = useToast();
  const { template, status } = session;
  const refresh = () => {
    setOpen('none');
    return refreshWeek(isoWeekOf(session.date));
  };

  const log = useMutation({
    mutationFn: (activity: ActivityInput) => api('POST', '/activities', activity),
    onSuccess: () => {
      toast(`${template.name} logged`);
      return refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (changes: { status: 'skipped' | 'planned'; skip_reason: SkipReason | null }) =>
      api('PATCH', `/planned-sessions/${session.id}`, changes),
    onSuccess: refresh,
  });
  const undo = useMutation({
    mutationFn: () => api('DELETE', `/activities/${session.linked_activity_id}`),
    onSuccess: refresh,
  });

  const target = targetText(session);
  const action = primaryAction(template.kind);
  const pending = status === 'planned' || status === 'modified';
  const failure = [patch, undo].find((m) => m.isError);

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

      {pending && (
        <div className="row actions">
          {action === 'start' && (
            <ButtonLink
              variant="primary"
              className="grow"
              to={startTarget(session)}
              state={{ autostart: true }}
              // The tap that starts the timer is the one that lets it play its cues.
              onClick={unlockAudio}
            >
              Start
            </ButtonLink>
          )}
          {action === 'log' && (
            <Button variant="primary" className="grow" onClick={() => setOpen('log')}>
              Log
            </Button>
          )}
          {action === 'done' && (
            <Button
              variant="primary"
              className="grow"
              loading={log.isPending}
              onClick={() => log.mutate(buildActivity(session, logDefaults(session)))}
            >
              Done
            </Button>
          )}
          <Button
            variant="ghost"
            className="more"
            aria-label={`More for ${template.name}`}
            aria-expanded={open === 'more'}
            onClick={() => setOpen(open === 'more' ? 'none' : 'more')}
          >
            <span aria-hidden="true">...</span>
          </Button>
        </div>
      )}
      {pending && open === 'more' && (
        <div className="row">
          <Button className="grow" onClick={() => setOpen('skip')}>
            Skip
          </Button>
          <Button className="grow" onClick={() => setOpen('log')}>
            Edit
          </Button>
        </div>
      )}

      {status === 'skipped' && (
        <Button
          variant="ghost"
          loading={patch.isPending}
          onClick={() => patch.mutate({ status: 'planned', skip_reason: null })}
        >
          Undo skip
        </Button>
      )}
      {status === 'done' && session.linked_activity_id != null && (
        <Button variant="ghost" loading={undo.isPending} onClick={() => undo.mutate()}>
          Undo
        </Button>
      )}

      <Sheet open={open === 'log'} title={`Log ${template.name}`} onClose={() => setOpen('none')}>
        <LogForm
          session={session}
          busy={log.isPending}
          error={log.isError ? errorText(log.error) : null}
          onSubmit={(activity) => log.mutate(activity)}
        />
      </Sheet>

      <Sheet open={open === 'skip'} title="Why skip?" onClose={() => setOpen('none')}>
        <div className="chips">
          {SKIP_REASONS.map((reason) => (
            <Chip
              key={reason}
              disabled={patch.isPending}
              onClick={() => patch.mutate({ status: 'skipped', skip_reason: reason })}
            >
              {reason}
            </Chip>
          ))}
        </div>
      </Sheet>

      {failure && (
        <p role="alert" className="error">
          {errorText(failure.error)}
        </p>
      )}
    </article>
  );
}
