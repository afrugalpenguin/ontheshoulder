import {
  isoWeekOf,
  type ActivityInput,
  type Equipment,
  type Exercise,
  type ProgrammeDay,
  type StrengthHistoryEntry,
} from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, errorText } from '../api.js';
import { NO_EQUIPMENT } from '../components/EquipmentEditor.js';
import { useNow } from '../lib/useNow.js';
import {
  keys,
  useDayHistory,
  useEquipment,
  useExercises,
  useProgrammeDays,
  useRefreshWeek,
  useWeek,
} from '../queries.js';
import { unlockAudio } from '../timer/cues.js';
import { SlotCard, type SetDraft } from './SlotCard.js';
import {
  asHistory,
  buildStrengthActivity,
  isComplete,
  suggestionFor,
  type SessionSet,
} from './session.js';

interface Props {
  day: ProgrammeDay;
  exercises: Exercise[];
  equipment: Equipment;
  history: StrengthHistoryEntry[];
  today: string;
  /** The planned session this will mark done, if the week has one. */
  plannedSessionId: number | null;
}

/** The session screen proper, once everything it needs has loaded. */
export function SessionScreen({
  day,
  exercises,
  equipment,
  history,
  today,
  plannedSessionId,
}: Props) {
  const client = useQueryClient();
  const refreshWeek = useRefreshWeek();
  const startedAt = useRef(new Date().toISOString());
  const [sets, setSets] = useState<SessionSet[]>([]);
  const [swaps, setSwaps] = useState<Record<number, number>>({});
  const [loads, setLoads] = useState<Record<number, number>>({});
  const [starts, setStarts] = useState<Record<number, number>>({});
  const [rest, setRest] = useState<{ slotId: number; key: number } | null>(null);
  const [highlight, setHighlight] = useState<{ slotId: number; setNo: number } | null>(null);
  const [saved, setSaved] = useState<SessionSet[] | null>(null);

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const exerciseFor = (slotId: number, own: number) => byId.get(swaps[slotId] ?? own);

  const refreshDays = () => client.invalidateQueries({ queryKey: keys.programmeDays });
  const patchSlot = useMutation({
    mutationFn: (input: { id: number; body: Record<string, unknown> }) =>
      api('PATCH', `/programme-slots/${input.id}`, input.body),
    onSuccess: refreshDays,
  });
  const finish = useMutation({
    mutationFn: (activity: ActivityInput) => api('POST', '/activities', activity),
    onSuccess: async () => {
      setSaved(sets);
      setRest(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.dayHistory(day.id) }),
        refreshWeek(isoWeekOf(today)),
      ]);
    },
  });

  if (saved) {
    const after = [asHistory(day, saved), ...history];
    return (
      <main>
        <header className="page-head">
          <h1>{day.name} saved</h1>
          <p className="muted">
            {isComplete(day, saved) ? 'All sets done.' : 'Saved as a partial session.'}
          </p>
        </header>
        <section className="card" aria-label="Next session">
          <h2>Next time</h2>
          <ul className="plain stack">
            {day.slots.map((slot) => {
              const exercise = byId.get(slot.exercise_id);
              if (!exercise) return null;
              const next = suggestionFor(slot, exercise, after, equipment);
              return (
                <li key={slot.id}>
                  <strong>{exercise.name}</strong>{' '}
                  {next.load_kg !== null ? `${next.load_kg}kg (${next.how})` : next.reason}
                </li>
              );
            })}
          </ul>
        </section>
        <Link className="button primary" to="/">
          Back to Today
        </Link>
      </main>
    );
  }

  const without = <T,>(record: Record<number, T>, key: number): Record<number, T> =>
    Object.fromEntries(Object.entries(record).filter(([k]) => Number(k) !== key));

  const logSet = (slotId: number, exerciseId: number, setNo: number, draft: SetDraft) => {
    unlockAudio();
    const entry: SessionSet = {
      slot_id: slotId,
      exercise_id: exerciseId,
      set_no: setNo,
      reps: draft.reps,
      load_kg: draft.load_kg,
      rpe: draft.rpe,
      notes: draft.notes,
      done_at: new Date().toISOString(),
    };
    setSets((all) => [...all.filter((s) => !(s.slot_id === slotId && s.set_no === setNo)), entry]);
    setHighlight(null);
    setRest((r) => ({ slotId, key: (r?.key ?? 0) + 1 }));
  };

  return (
    <main>
      <header className="page-head">
        <div className="row">
          <h1 className="grow">{day.name}</h1>
          <Link className="button quiet" to="/settings">
            Kit
          </Link>
        </div>
        <p className="muted">Tap a set to log it as shown. Hold, or use Adjust, to change it.</p>
      </header>

      {day.slots.map((slot) => {
        const original = byId.get(slot.exercise_id);
        const exercise = exerciseFor(slot.id, slot.exercise_id);
        if (!original || !exercise) return null;
        const swapped = exercise.id !== original.id;
        const suggestion = suggestionFor(
          slot,
          exercise,
          history,
          equipment,
          starts[slot.id] ?? null,
        );
        const load = loads[slot.id] ?? suggestion.load_kg;
        const mine = sets.filter((s) => s.slot_id === slot.id);
        return (
          <SlotCard
            key={`${slot.id}-${exercise.id}`}
            slot={slot}
            original={original}
            exercise={exercise}
            library={exercises}
            equipment={equipment}
            suggestion={suggestion}
            load={load}
            sets={mine}
            highlight={highlight?.slotId === slot.id ? highlight.setNo : null}
            restKey={rest?.slotId === slot.id ? rest.key : null}
            onLoad={(kg) => setLoads({ ...loads, [slot.id]: kg })}
            onLog={(setNo, draft) => logSet(slot.id, exercise.id, setNo, draft)}
            onUndo={(setNo) =>
              setSets((all) => all.filter((s) => !(s.slot_id === slot.id && s.set_no === setNo)))
            }
            onRestDone={() => {
              const logged = new Set(mine.map((s) => s.set_no));
              const next = Array.from({ length: slot.sets }, (_, i) => i + 1).find(
                (n) => !logged.has(n),
              );
              setHighlight(next === undefined ? null : { slotId: slot.id, setNo: next });
            }}
            onStartLoad={(kg) => {
              if (swapped) setStarts({ ...starts, [slot.id]: kg });
              else patchSlot.mutate({ id: slot.id, body: { start_load_kg: kg } });
            }}
            onSwap={(exerciseId) => {
              // A different exercise means a different load and a fresh set of rows.
              setLoads(without(loads, slot.id));
              setSets((all) => all.filter((s) => s.slot_id !== slot.id));
              setSwaps(
                exerciseId === null ? without(swaps, slot.id) : { ...swaps, [slot.id]: exerciseId },
              );
            }}
            onMakePermanent={() =>
              // Once the slot itself points at this exercise it is no longer a swap.
              patchSlot.mutate({
                id: slot.id,
                body: {
                  exercise_id: exercise.id,
                  increment_kg: exercise.equipment === 'barbell' ? slot.increment_kg : null,
                  start_load_kg: load,
                },
              })
            }
          />
        );
      })}

      {(patchSlot.isError || finish.isError) && (
        <p role="alert" className="error">
          {errorText(patchSlot.error ?? finish.error)}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={sets.length === 0 || finish.isPending}
        onClick={() =>
          finish.mutate(
            buildStrengthActivity({
              day,
              date: today,
              startedAt: startedAt.current,
              finishedAt: new Date().toISOString(),
              sets,
              plannedSessionId,
            }),
          )
        }
      >
        {isComplete(day, sets) ? 'Finish session' : 'Finish (save as partial)'}
      </button>
      {sets.length === 0 && <p className="muted">Log at least one set to finish.</p>}
    </main>
  );
}

/** Loads what the session screen needs, then shows it. */
export function StrengthSession() {
  const { dayId } = useParams();
  const id = Number(dayId);
  const { today } = useNow();
  const days = useProgrammeDays();
  const exercises = useExercises();
  const equipment = useEquipment();
  const history = useDayHistory(id);
  const week = useWeek(isoWeekOf(today));

  const day = days.data?.find((d) => d.id === id);
  if (days.isSuccess && !day) {
    return (
      <main>
        <p role="alert" className="error">
          No such programme day.
        </p>
        <Link className="button" to="/strength">
          Back to Strength
        </Link>
      </main>
    );
  }
  if (!day || !exercises.data || !equipment.isSuccess || !history.data || !week.data) {
    return (
      <main>
        <p className="muted">Loading...</p>
      </main>
    );
  }

  // Prefer today's planned session for this day, else the first open one this week.
  const open = week.data.sessions.filter(
    (s) => s.template.programme_day_id === day.id && s.status !== 'done' && s.status !== 'skipped',
  );
  const planned = open.find((s) => s.date === today) ?? open[0] ?? null;

  return (
    <SessionScreen
      key={day.id}
      day={day}
      exercises={exercises.data}
      equipment={equipment.data ?? NO_EQUIPMENT}
      history={history.data}
      today={today}
      plannedSessionId={planned?.id ?? null}
    />
  );
}
