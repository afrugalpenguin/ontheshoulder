import { isoWeekOf } from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { errorText } from '../api.js';
import { CheckinStrip } from '../components/CheckinStrip.js';
import { PromptsStrip } from '../components/PromptsStrip.js';
import { SessionCard } from '../components/SessionCard.js';
import { complianceText, countdown, longDate, nextUpText, pickEvents } from '../lib/format.js';
import { activePrompts } from '../lib/prompts.js';
import { useNow } from '../lib/useNow.js';
import {
  generateWeek,
  useCheckin,
  useCompliance,
  useEvents,
  useHabits,
  useLastWeight,
  useRefreshWeek,
  useSaveCheckin,
  useWeek,
} from '../queries.js';

export function Today() {
  const { today, time } = useNow();
  const isoWeek = isoWeekOf(today);
  const week = useWeek(isoWeek);
  const compliance = useCompliance(isoWeek);
  const events = useEvents();
  const habits = useHabits();
  const checkin = useCheckin(today);
  const lastWeight = useLastWeight(today);
  const saveCheckin = useSaveCheckin(today);
  const refreshWeek = useRefreshWeek();
  const [editingCheckin, setEditingCheckin] = useState(false);
  const generate = useMutation({
    mutationFn: () => generateWeek(isoWeek),
    onSuccess: () => refreshWeek(isoWeek),
  });

  const { goal, nextUp } = pickEvents(events.data ?? [], today);
  const sessions = (week.data?.sessions ?? []).filter((s) => s.date === today);
  const prompts = habits.data && checkin.data ? activePrompts(habits.data, checkin.data, time) : [];
  const checkedIn = checkin.data?.sleep_quality != null && checkin.data.energy != null;
  const summary = compliance.data ? complianceText(compliance.data) : null;

  return (
    <main>
      <header className="page-head">
        <h1>{longDate(today)}</h1>
        {goal && (
          <p className="countdown">
            {goal.name} {countdown(today, goal.date)}
          </p>
        )}
        {nextUp && <p className="muted">{nextUpText(nextUp, today)}</p>}
        {summary && (
          <p className="compliance" aria-label="Week compliance">
            {summary.main}
            {summary.bonus && <span className="tag">{summary.bonus}</span>}
          </p>
        )}
      </header>

      <PromptsStrip
        prompts={prompts}
        onDone={(key) => saveCheckin.mutate({ habits: { [key]: true } })}
        onDismiss={(key) =>
          saveCheckin.mutate({
            dismissed_prompts: [...(checkin.data?.dismissed_prompts ?? []), key],
          })
        }
      />

      {checkin.data && habits.data && !lastWeight.isLoading && (!checkedIn || editingCheckin) && (
        <CheckinStrip
          key={`${today}-${editingCheckin}`}
          checkin={checkin.data}
          habits={habits.data}
          lastWeight={lastWeight.data ?? null}
          onSave={(changes) => {
            saveCheckin.mutate(changes);
            setEditingCheckin(false);
          }}
          {...(editingCheckin ? { onCancel: () => setEditingCheckin(false) } : {})}
        />
      )}
      {checkedIn && !editingCheckin && checkin.data && (
        <section className="card row" aria-label="Check-in">
          <p className="grow">
            Checked in: sleep {checkin.data.sleep_quality}, energy {checkin.data.energy}
            {checkin.data.weight_kg != null ? `, ${checkin.data.weight_kg}kg` : ''}
          </p>
          <button type="button" className="quiet" onClick={() => setEditingCheckin(true)}>
            Edit
          </button>
        </section>
      )}
      {saveCheckin.isError && (
        <p role="alert" className="error">
          Check-in not saved: {errorText(saveCheckin.error)}
        </p>
      )}

      <section aria-label="Today's sessions" className="stack">
        <h2>Today</h2>
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
        {week.data && sessions.length === 0 && week.data.sessions.length > 0 && (
          <p className="muted">Nothing planned today.</p>
        )}
        {week.data && week.data.sessions.length === 0 && (
          <div className="card">
            <p>This week has no plan yet.</p>
            <button
              type="button"
              className="primary"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              Generate this week
            </button>
          </div>
        )}
        {week.isError && (
          <p role="alert" className="error">
            {errorText(week.error)}
          </p>
        )}
      </section>
    </main>
  );
}
