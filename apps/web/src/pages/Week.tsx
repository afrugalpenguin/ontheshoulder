import { addDays, isIsoWeek, isoWeekDates, isoWeekOf, isoWeekStart } from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, errorText } from '../api.js';
import { CheckinCard } from '../components/CheckinCard.js';
import { DayRow } from '../components/DayRow.js';
import { KitBanner } from '../components/KitBanner.js';
import { PromptsStrip } from '../components/PromptsStrip.js';
import { WEEKDAYS, complianceText, countdown, pickEvents, shortDate } from '../lib/format.js';
import { KIT_READY, kitPrompt } from '../lib/kit.js';
import { activePrompts } from '../lib/prompts.js';
import { completeWeekStreak, morningStreak } from '../lib/streaks.js';
import { DESKTOP, useMediaQuery } from '../lib/useMediaQuery.js';
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
  useWeeklyTrends,
  useWeeks,
} from '../queries.js';
import { Button, Card } from '../ui/index.js';

/** How many weeks back the streaks look. */
const STREAK_WEEKS = 26;
const MORNING_WEEKS = 4;
/** A sideways drag at least this long, and flatter than it is long, changes week. */
const SWIPE_PX = 60;

/** The two small numbers in the header: complete weeks in a row, weekday mornings in a row. */
function Streaks({ today }: { today: string }) {
  const thisWeek = isoWeekOf(today);
  const monday = isoWeekStart(thisWeek);
  const trends = useWeeklyTrends(addDays(monday, -7 * STREAK_WEEKS), today);
  const earliest = addDays(monday, -7 * MORNING_WEEKS);
  const recent = useWeeks(
    Array.from({ length: MORNING_WEEKS + 1 }, (_, i) => isoWeekOf(addDays(earliest, 7 * i))),
  );
  // Drawn with dashes until the numbers arrive, so the header does not jump.
  const weeks = trends.data ? completeWeekStreak(trends.data, thisWeek) : null;
  const mornings = recent
    ? morningStreak(
        recent.flatMap((w) => w.sessions),
        today,
        earliest,
      )
    : null;
  return (
    <dl className="streaks" aria-label="Streaks">
      <div>
        <dt>Weeks in a row</dt>
        <dd>{weeks ?? '-'}</dd>
      </div>
      <div>
        <dt>Mornings in a row</dt>
        <dd>
          {mornings ? mornings.days : '-'}
          {mornings?.capped && mornings.days > 0 ? '+' : ''}
        </dd>
      </div>
    </dl>
  );
}

/** Home. The week as seven day rows, today open with its check-in, prompts and sessions. */
export function Week() {
  const { today, time } = useNow();
  const params = useParams();
  const navigate = useNavigate();
  const desktop = useMediaQuery(DESKTOP);
  const thisWeek = isoWeekOf(today);
  const isoWeek = params.isoWeek && isIsoWeek(params.isoWeek) ? params.isoWeek : thisWeek;
  const dates = isoWeekDates(isoWeek);
  const monday = dates[0] as string;
  const previousWeek = isoWeekOf(addDays(monday, -7));
  const nextWeek = isoWeekOf(addDays(monday, 7));
  const tomorrow = addDays(today, 1);

  const week = useWeek(isoWeek);
  const tomorrowWeek = useWeek(isoWeekOf(tomorrow));
  const compliance = useCompliance(isoWeek);
  const events = useEvents();
  const habits = useHabits();
  const checkin = useCheckin(today);
  const tomorrowCheckin = useCheckin(tomorrow);
  const lastWeight = useLastWeight(today);
  const saveCheckin = useSaveCheckin(today);
  const saveTomorrow = useSaveCheckin(tomorrow);
  const refreshWeek = useRefreshWeek();
  const [confirmForce, setConfirmForce] = useState(false);
  // Days the user has opened or closed by hand; everything else follows the default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

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

  const kitText =
    habits.data && tomorrowWeek.data
      ? kitPrompt(
          habits.data,
          tomorrowWeek.data.sessions.filter((s) => s.date === tomorrow),
          time,
        )
      : null;
  const kitBanner = kitText && tomorrowCheckin.data && (
    <KitBanner
      text={kitText}
      ready={tomorrowCheckin.data.habits[KIT_READY] === true}
      onChange={(ready) => saveTomorrow.mutate({ habits: { [KIT_READY]: ready } })}
    />
  );

  const isOpen = (date: string) =>
    desktop || (toggled[date] ?? (date === today || (date === tomorrow && kitText !== null)));

  // Everything the first screen shows arrives before anything is drawn, so the
  // page appears once instead of growing a piece at a time.
  const ready = Boolean(
    week.data &&
    tomorrowWeek.data &&
    compliance.data &&
    events.data &&
    habits.data &&
    checkin.data &&
    tomorrowCheckin.data &&
    !lastWeight.isLoading,
  );
  const loadError = [week, tomorrowWeek, compliance, events, habits, checkin, tomorrowCheckin].find(
    (q) => q.isError,
  );

  // Bring today to the top of the screen once the week has been drawn.
  const todayRow = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ready && !desktop) todayRow.current?.scrollIntoView?.({ block: 'start' });
  }, [ready, desktop, isoWeek]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const from = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!from || !t) return;
    const dx = t.clientX - from.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(t.clientY - from.y) > Math.abs(dx) / 2) return;
    void navigate(`/week/${dx < 0 ? nextWeek : previousWeek}`);
  };

  const { goal } = pickEvents(events.data ?? [], today);
  const summary = compliance.data ? complianceText(compliance.data) : null;
  const sessions = week.data?.sessions ?? [];
  const prompts = habits.data && checkin.data ? activePrompts(habits.data, checkin.data, time) : [];
  const failure = [regenerate, generateNext, saveCheckin, saveTomorrow].find(
    (m) => m.isError && !(m.error instanceof ApiError && m.error.status === 409 && confirmForce),
  );

  if (!ready) {
    return (
      <main className="wide">
        {loadError ? (
          <p role="alert" className="error">
            {errorText(loadError.error)}
          </p>
        ) : (
          <p className="muted">Loading...</p>
        )}
      </main>
    );
  }

  return (
    <main className="wide">
      <header className="page-head">
        <div className="week-head">
          <Button aria-label="Previous week" onClick={() => navigate(`/week/${previousWeek}`)}>
            <span aria-hidden="true">&lt;</span>
          </Button>
          <h1 className="grow center">
            {isoWeek}
            <span className="muted sub">
              {shortDate(monday)} to {shortDate(dates[6] as string)}
            </span>
          </h1>
          <Button aria-label="Next week" onClick={() => navigate(`/week/${nextWeek}`)}>
            <span aria-hidden="true">&gt;</span>
          </Button>
        </div>
        {goal && (
          <p className="countdown">
            {goal.name} {countdown(today, goal.date)}
          </p>
        )}
        {summary && (
          <p className="compliance" aria-label="Week compliance">
            {summary.main}
            {summary.bonus && <span className="tag">{summary.bonus}</span>}
          </p>
        )}
        <Streaks today={today} />
      </header>

      <div className="week-days" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {dates.map((date, index) => (
          <DayRow
            key={date}
            ref={date === today ? todayRow : undefined}
            date={date}
            weekday={WEEKDAYS[index] as string}
            sessions={sessions.filter((s) => s.date === date)}
            events={(events.data ?? []).filter((e) => e.date === date)}
            isToday={date === today}
            open={isOpen(date)}
            onToggle={
              desktop ? undefined : () => setToggled((t) => ({ ...t, [date]: !isOpen(date) }))
            }
          >
            {date === tomorrow && kitBanner}
            {date === today && (
              <>
                <PromptsStrip
                  prompts={prompts}
                  onDone={(key) => saveCheckin.mutate({ habits: { [key]: true } })}
                  onDismiss={(key) =>
                    saveCheckin.mutate({
                      dismissed_prompts: [...(checkin.data?.dismissed_prompts ?? []), key],
                    })
                  }
                />
                {checkin.data && habits.data && !lastWeight.isLoading && (
                  <CheckinCard
                    checkin={checkin.data}
                    habits={habits.data}
                    lastWeight={lastWeight.data ?? null}
                    onSave={(changes) => saveCheckin.mutate(changes)}
                  />
                )}
              </>
            )}
          </DayRow>
        ))}
      </div>
      {/* On a Sunday tomorrow belongs to next week, so its banner sits under the list. */}
      {!dates.includes(tomorrow) && isoWeek === thisWeek && kitBanner}

      {week.data && sessions.length === 0 && (
        <Card>
          <p>This week has no plan yet.</p>
          <Button
            variant="primary"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate(false)}
          >
            Generate this week
          </Button>
        </Card>
      )}

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

      <details>
        <summary className="muted">Plan</summary>
        <div className="row wrap">
          {sessions.length > 0 && (
            <Button loading={regenerate.isPending} onClick={() => regenerate.mutate(false)}>
              Regenerate this week
            </Button>
          )}
          <Button loading={generateNext.isPending} onClick={() => generateNext.mutate()}>
            Generate next week
          </Button>
        </div>
      </details>

      {confirmForce && (
        <Card role="alertdialog" aria-label="Confirm regenerate">
          <p>
            This week already has sessions that are done, skipped or edited. Regenerating keeps
            those and refreshes the rest.
          </p>
          <div className="row">
            <Button variant="primary" className="grow" onClick={() => regenerate.mutate(true)}>
              Keep them and regenerate
            </Button>
            <Button variant="ghost" onClick={() => setConfirmForce(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {failure && (
        <p role="alert" className="error">
          {errorText(failure.error)}
        </p>
      )}
    </main>
  );
}
