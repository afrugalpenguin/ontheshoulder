import type { Equipment, Exercise, ProgrammeDay, StrengthHistoryEntry } from '@ots/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api, errorText } from '../api.js';
import { NO_EQUIPMENT } from '../components/EquipmentEditor.js';
import { longDate, shortDate } from '../lib/format.js';
import { useDayHistories, useEquipment, useExercises, useProgrammeDays } from '../queries.js';
import { ButtonLink, Card, Segmented, Sheet, scale, useToast } from '../ui/index.js';
import { CrossIcon, DownIcon, TickIcon, UpIcon } from '../ui/icons.js';
import type { SavedSession } from './StrengthSession.js';
import { mainLift, recentSessions } from './session.js';

const RPE = scale(1, 10);

/** One programme day: when it was last done, the main lift's next load, and Start. */
function DayCard(props: {
  day: ProgrammeDay;
  exercises: Exercise[];
  equipment: Equipment;
  history: StrengthHistoryEntry[];
}) {
  const { day, exercises, equipment, history } = props;
  const last = history[0];
  const lift = mainLift(day, exercises, history, equipment);
  return (
    <Card aria-label={day.name}>
      <h2 className="day-name">{day.name}</h2>
      <p className="muted">{last ? `Last done ${longDate(last.date)}` : 'Not done yet'}</p>
      {lift && (
        <p className="next-up">
          <span className="muted">Next up: </span>
          {lift.exercise.name}{' '}
          {lift.next.load_kg !== null ? (
            <strong>{lift.next.load_kg} kg</strong>
          ) : (
            <span className="muted">
              {lift.next.reason === 'no starting load yet'
                ? 'starting load to set'
                : lift.next.reason}
            </span>
          )}
          {lift.trend === 'up' && (
            <span className="trend trend-up">
              <UpIcon label={`up from ${lift.lastLoad} kg last time`} />
            </span>
          )}
          {lift.trend === 'down' && (
            <span className="trend trend-down">
              <DownIcon label={`down from ${lift.lastLoad} kg last time`} />
            </span>
          )}
        </p>
      )}
      <ButtonLink variant="primary" to={`/strength/day/${day.id}`} aria-label={`Start ${day.name}`}>
        Start
      </ButtonLink>
    </Card>
  );
}

/** The Strength tab: a card per programme day, then the last ten sessions. */
export function StrengthHome() {
  const days = useProgrammeDays();
  const exercises = useExercises();
  const equipment = useEquipment();
  const histories = useDayHistories((days.data ?? []).map((d) => d.id));
  const toast = useToast();
  const location = useLocation();
  const saved = (location.state as { saved?: SavedSession } | null)?.saved;
  const [rpeFor, setRpeFor] = useState<SavedSession | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const saveRpe = useMutation({
    mutationFn: (value: number) =>
      api('PATCH', `/activities/${rpeFor?.activityId}`, { rpe: value }),
    onSuccess: () => setRpeFor(null),
  });

  // Coming back from Finish: a quiet toast, with effort as an optional extra.
  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (!saved || announced.current === saved.activityId) return;
    announced.current = saved.activityId;
    toast(saved.partial ? `${saved.name} saved as a partial session` : `${saved.name} saved`, {
      label: 'Add RPE',
      onClick: () => {
        setRpe(null);
        setRpeFor(saved);
      },
    });
  }, [saved, toast]);

  const ready = days.data && exercises.data && equipment.isSuccess && histories;
  const kit = equipment.data ?? NO_EQUIPMENT;
  const recent = ready ? recentSessions(days.data, histories, exercises.data) : [];

  return (
    <main>
      <header className="page-head">
        <h1>Strength</h1>
      </header>
      {!ready && <p className="muted">Loading...</p>}
      {ready && days.data.length === 0 && <p className="muted">No programme days yet.</p>}
      {ready &&
        days.data.map((day, index) => (
          <DayCard
            key={day.id}
            day={day}
            exercises={exercises.data}
            equipment={kit}
            history={histories[index] ?? []}
          />
        ))}

      {ready && recent.length > 0 && (
        <section aria-label="Recent sessions" className="stack">
          <h2>History</h2>
          <ul className="plain history">
            {recent.map((row) => (
              <li key={row.activity_id} className="history-row">
                <span className="muted">{shortDate(row.date)}</span>
                <span>{row.day}</span>
                <span className="grow muted">
                  {row.lift}
                  {row.load_kg !== null ? ` ${row.load_kg} kg` : ''}
                </span>
                <span className={row.success ? 'trend-up' : 'trend-down'}>
                  {row.success ? (
                    <TickIcon label="every set done" />
                  ) : (
                    <CrossIcon label="reps missed" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="row wrap">
        <ButtonLink to="/strength/exercises">Exercise library</ButtonLink>
        <ButtonLink to="/settings">Kit settings</ButtonLink>
      </div>

      <Sheet
        open={rpeFor !== null}
        title={`How hard was ${rpeFor?.name ?? 'it'}?`}
        onClose={() => setRpeFor(null)}
      >
        <Segmented
          label="RPE"
          options={RPE}
          value={rpe}
          onChange={(value) => {
            setRpe(value);
            if (value !== null) saveRpe.mutate(value);
          }}
          ends={['easy', 'all out']}
        />
        {saveRpe.isError && (
          <p role="alert" className="error">
            {errorText(saveRpe.error)}
          </p>
        )}
      </Sheet>
    </main>
  );
}
