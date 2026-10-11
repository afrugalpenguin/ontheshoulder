import type { Equipment, Exercise, ProgrammeDay } from '@ots/shared';
import { Link } from 'react-router';
import { NO_EQUIPMENT } from '../components/EquipmentEditor.js';
import { longDate } from '../lib/format.js';
import { useDayHistory, useEquipment, useExercises, useProgrammeDays } from '../queries.js';
import { nextSummary } from './session.js';

function DayRow(props: { day: ProgrammeDay; exercises: Exercise[]; equipment: Equipment }) {
  const { day, exercises, equipment } = props;
  const history = useDayHistory(day.id);
  const last = history.data?.[0];
  return (
    <li>
      <Link
        className="card day-link"
        to={`/strength/day/${day.id}`}
        aria-label={`Start ${day.name}`}
      >
        <h2 className="day-name">{day.name}</h2>
        <p className="muted">{last ? `Last done ${longDate(last.date)}` : 'Not done yet'}</p>
        {history.data && (
          <p>
            <span className="muted">Next session: </span>
            {nextSummary(day, exercises, history.data, equipment)}
          </p>
        )}
      </Link>
    </li>
  );
}

/** The Strength tab: programme days with when each was last done and what comes next. */
export function StrengthHome() {
  const days = useProgrammeDays();
  const exercises = useExercises();
  const equipment = useEquipment();
  const ready = days.data && exercises.data && equipment.isSuccess;

  return (
    <main>
      <header className="page-head">
        <h1>Strength</h1>
      </header>
      {!ready && <p className="muted">Loading...</p>}
      {ready && days.data.length === 0 && <p className="muted">No programme days yet.</p>}
      {ready && (
        <ul className="plain stack">
          {days.data.map((day) => (
            <DayRow
              key={day.id}
              day={day}
              exercises={exercises.data}
              equipment={equipment.data ?? NO_EQUIPMENT}
            />
          ))}
        </ul>
      )}
      <div className="row wrap">
        <Link className="button" to="/strength/exercises">
          Exercise library
        </Link>
        <Link className="button" to="/settings">
          Kit settings
        </Link>
      </div>
    </main>
  );
}
