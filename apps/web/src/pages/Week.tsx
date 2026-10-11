import { addDays, isIsoWeek, isoWeekDates, isoWeekOf } from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, errorText } from '../api.js';
import { SessionCard } from '../components/SessionCard.js';
import { WEEKDAYS, complianceText, shortDate } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';
import { generateWeek, useCompliance, useEvents, useRefreshWeek, useWeek } from '../queries.js';

export function Week() {
  const { today } = useNow();
  const params = useParams();
  const navigate = useNavigate();
  const isoWeek = params.isoWeek && isIsoWeek(params.isoWeek) ? params.isoWeek : isoWeekOf(today);
  const dates = isoWeekDates(isoWeek);
  const monday = dates[0] as string;
  const previousWeek = isoWeekOf(addDays(monday, -7));
  const nextWeek = isoWeekOf(addDays(monday, 7));

  const week = useWeek(isoWeek);
  const compliance = useCompliance(isoWeek);
  const events = useEvents();
  const refreshWeek = useRefreshWeek();
  const [confirmForce, setConfirmForce] = useState(false);

  const regenerate = useMutation({
    mutationFn: (force: boolean) => generateWeek(isoWeek, force),
    onSuccess: () => {
      setConfirmForce(false);
      return refreshWeek(isoWeek);
    },
    onError: (err) => {
      // 409 means the week has logged or skipped sessions; ask before forcing.
      if (err instanceof ApiError && err.status === 409) setConfirmForce(true);
    },
  });
  const generateNext = useMutation({
    mutationFn: () => generateWeek(nextWeek),
    onSuccess: async () => {
      await refreshWeek(nextWeek);
      await navigate(`/week/${nextWeek}`);
    },
  });

  const summary = compliance.data ? complianceText(compliance.data) : null;
  const sessions = week.data?.sessions ?? [];
  const failure = [regenerate, generateNext].find(
    (m) => m.isError && !(m.error instanceof ApiError && m.error.status === 409 && confirmForce),
  );

  return (
    <main className="wide">
      <header className="page-head">
        <div className="row">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => navigate(`/week/${previousWeek}`)}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
          <h1 className="grow center">
            {isoWeek}
            <span className="muted sub">
              {shortDate(monday)} to {shortDate(dates[6] as string)}
            </span>
          </h1>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => navigate(`/week/${nextWeek}`)}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
        {summary && (
          <p className="compliance" aria-label="Week compliance">
            {summary.main}
            {summary.bonus && <span className="tag">{summary.bonus}</span>}
          </p>
        )}
      </header>

      <div className="week-grid">
        {dates.map((date, index) => {
          const daySessions = sessions.filter((s) => s.date === date);
          const dayEvents = (events.data ?? []).filter((e) => e.date === date);
          return (
            <section
              key={date}
              className={`day${date === today ? ' is-today' : ''}`}
              aria-label={`${WEEKDAYS[index]} ${shortDate(date)}`}
            >
              <h2>
                {WEEKDAYS[index]} <span className="muted">{shortDate(date)}</span>
              </h2>
              {dayEvents.map((e) => (
                <p key={e.id} className="tag event-marker">
                  {e.priority} event: {e.name}
                </p>
              ))}
              {daySessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
              {daySessions.length === 0 && <p className="muted">Nothing planned</p>}
            </section>
          );
        })}
      </div>

      {week.data && week.data.reasoning.length > 0 && (
        <details className="card">
          <summary>Why these targets</summary>
          <ul>
            {week.data.reasoning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="row wrap">
        <button
          type="button"
          disabled={regenerate.isPending}
          onClick={() => regenerate.mutate(false)}
        >
          {sessions.length === 0 ? 'Generate this week' : 'Regenerate this week'}
        </button>
        <button
          type="button"
          disabled={generateNext.isPending}
          onClick={() => generateNext.mutate()}
        >
          Generate next week
        </button>
      </div>

      {confirmForce && (
        <div className="card" role="alertdialog" aria-label="Confirm regenerate">
          <p>
            This week already has sessions that are done, skipped or edited. Regenerating keeps
            those and refreshes the rest.
          </p>
          <div className="row">
            <button type="button" className="primary grow" onClick={() => regenerate.mutate(true)}>
              Keep them and regenerate
            </button>
            <button type="button" className="quiet" onClick={() => setConfirmForce(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {failure && (
        <p role="alert" className="error">
          {errorText(failure.error)}
        </p>
      )}
    </main>
  );
}
