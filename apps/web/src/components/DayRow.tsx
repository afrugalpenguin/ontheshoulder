import type { Event, SessionStatus, WeekSession } from '@ots/shared';
import { forwardRef, type ReactNode } from 'react';
import { KIND_LABEL, STATUS_LABEL, shortDate } from '../lib/format.js';
import { Chip, type ChipTone } from '../ui/index.js';
import { SessionCard } from './SessionCard.js';

interface Props {
  date: string;
  weekday: string;
  sessions: WeekSession[];
  events: Event[];
  isToday: boolean;
  open: boolean;
  /** Absent on a desktop, where every day is open and there is nothing to toggle. */
  onToggle?: (() => void) | undefined;
  /** Shown above the sessions when the row is open: banner, prompts, check-in. */
  children?: ReactNode;
}

const TONE: Partial<Record<SessionStatus, ChipTone>> = { done: 'success', skipped: 'warning' };

/**
 * One day of the week. Closed, it is a single line: the day and a chip per
 * session, coloured by status. Open, it holds the day's cards.
 */
export const DayRow = forwardRef<HTMLElement, Props>(function DayRow(props, ref) {
  const { date, weekday, sessions, events, isToday, open, onToggle, children } = props;
  const label = `${weekday} ${shortDate(date)}`;
  const title = (
    <span className="day-title">
      {weekday.slice(0, 3)} <span className="muted">{shortDate(date)}</span>
    </span>
  );

  return (
    <section
      ref={ref}
      className={`day${isToday ? ' is-today' : ''}${open ? ' is-open' : ''}`}
      aria-label={label}
    >
      {onToggle ? (
        <button type="button" className="day-toggle" aria-expanded={open} onClick={onToggle}>
          {title}
          {!open && (
            <span className="chips">
              {events.map((e) => (
                <Chip key={`event-${e.id}`} tone="accent">
                  {e.name}
                </Chip>
              ))}
              {sessions.map((s) => (
                <Chip
                  key={s.id}
                  tone={TONE[s.status]}
                  aria-label={`${s.template.name}: ${STATUS_LABEL[s.status]}`}
                >
                  {KIND_LABEL[s.template.kind]}
                </Chip>
              ))}
              {sessions.length === 0 && events.length === 0 && (
                <span className="muted small">Nothing planned</span>
              )}
            </span>
          )}
        </button>
      ) : (
        <h2>{title}</h2>
      )}

      {open && (
        <div className="day-body">
          {events.map((e) => (
            <p key={e.id} className="tag event-marker">
              {e.priority} event: {e.name}
            </p>
          ))}
          {children}
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
          {sessions.length === 0 && <p className="muted">Nothing planned</p>}
        </div>
      )}
    </section>
  );
});
