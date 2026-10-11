import {
  hasKit,
  isoWeekOf,
  type Activity,
  type ActivityInput,
  type Equipment,
  type Exercise,
  type ProgrammeDay,
  type StrengthHistoryEntry,
} from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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
import { Button, ButtonLink } from '../ui/index.js';
import { RestBar } from './RestBar.js';
import { SlotBlock } from './SlotBlock.js';
import {
  asHistory,
  buildStrengthActivity,
  cycleReps,
  isComplete,
  nextSet,
  suggestionFor,
  working,
  type SessionSet,
} from './session.js';

/** What the Strength tab is told about a session that was just saved. */
export interface SavedSession {
  activityId: number;
  name: string;
  partial: boolean;
}

interface Props {
  day: ProgrammeDay;
  exercises: Exercise[];
  equipment: Equipment;
  history: StrengthHistoryEntry[];
  today: string;
  /** The planned session this will mark done, if the week has one. */
  plannedSessionId: number | null;
  /** Called with the saved session once Finish has gone through. */
  onSaved: (saved: SavedSession) => void;
}

const without = <T,>(record: Record<number, T>, key: number): Record<number, T> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => Number(k) !== key));

/**
 * The session screen: a block per exercise, a circle per set, the rest bar at
 * the bottom, and one Finish button once anything is logged.
 */
export function SessionScreen(props: Props) {
  const { day, exercises, equipment, history, today, plannedSessionId, onSaved } = props;
  const client = useQueryClient();
  const refreshWeek = useRefreshWeek();
  const startedAt = useRef(new Date().toISOString());
  const [sets, setSets] = useState<SessionSet[]>([]);
  const [swaps, setSwaps] = useState<Record<number, number>>({});
  const [loads, setLoads] = useState<Record<number, number>>({});
  const [starts, setStarts] = useState<Record<number, number>>({});
  const [rest, setRest] = useState<{ slotId: number; seconds: number; key: number } | null>(null);
  const [highlight, setHighlight] = useState<{ slotId: number; setNo: number } | null>(null);

  const byId = new Map(exercises.map((e) => [e.id, e]));
  // Each slot with what is being done in it today and at what load.
  const rows = day.slots.flatMap((slot) => {
    const original = byId.get(slot.exercise_id);
    const exercise = byId.get(swaps[slot.id] ?? slot.exercise_id);
    if (!original || !exercise) return [];
    const suggestion = suggestionFor(slot, exercise, history, equipment, starts[slot.id] ?? null);
    const load = loads[slot.id] ?? suggestion.load_kg;
    const loaded = exercise.equipment !== 'bodyweight' && slot.load_rule !== 'bodyweight';
    const ready = hasKit(equipment, exercise.equipment) && !(loaded && load === null);
    return [{ slot, original, exercise, load, ready }];
  });
  const loggable = rows.filter((r) => r.ready).map((r) => r.slot);
  const describe = (at: { slotId: number } | null) => {
    const row = rows.find((r) => r.slot.id === at?.slotId);
    if (!row) return null;
    return row.load !== null ? `${row.exercise.name}, ${row.load} kg` : row.exercise.name;
  };

  const refreshDays = () => client.invalidateQueries({ queryKey: keys.programmeDays });
  const patchSlot = useMutation({
    mutationFn: (input: { id: number; body: Record<string, unknown> }) =>
      api('PATCH', `/programme-slots/${input.id}`, input.body),
    onSuccess: refreshDays,
  });
  const finish = useMutation({
    mutationFn: (activity: ActivityInput) => api<Activity>('POST', '/activities', activity),
    onSuccess: async (activity) => {
      setRest(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.dayHistory(day.id) }),
        refreshWeek(isoWeekOf(today)),
      ]);
      onSaved({ activityId: activity.id, name: day.name, partial: !isComplete(day, sets) });
    },
  });

  const tap = (
    slotId: number,
    exerciseId: number,
    setNo: number,
    warmup: boolean,
    target: number,
    load: number | null,
  ) => {
    unlockAudio();
    const same = (s: SessionSet) =>
      s.slot_id === slotId && s.set_no === setNo && s.warmup === warmup;
    const before = sets.find(same);
    const reps = cycleReps(before?.reps ?? null, target);
    const others = sets.filter((s) => !same(s));
    const after: SessionSet[] =
      reps === null
        ? others
        : [
            ...others,
            {
              slot_id: slotId,
              exercise_id: exerciseId,
              set_no: setNo,
              reps,
              // A set keeps the load it was first logged at.
              load_kg: before ? before.load_kg : load,
              rpe: null,
              notes: null,
              done_at: before?.done_at ?? new Date().toISOString(),
              warmup,
            },
          ];
    setSets(after);
    // Only a newly logged working set starts a rest; taking reps off does not restart it.
    if (before || warmup) return;
    setHighlight(null);
    const seconds = day.slots.find((s) => s.id === slotId)?.rest_sec ?? 0;
    if (seconds > 0 && nextSet(loggable, after, slotId)) {
      setRest((r) => ({ slotId, seconds, key: (r?.key ?? 0) + 1 }));
    } else {
      setRest(null);
    }
  };

  const upcoming = rest ? nextSet(loggable, sets, rest.slotId) : null;
  const logged = sets.length > 0;
  const complete = isComplete(day, sets);

  return (
    <main className={rest ? 'has-rest-bar' : undefined}>
      <header className="page-head">
        <h1>{day.name}</h1>
      </header>

      {rows.map(({ slot, original, exercise, load }) => {
        const swapped = exercise.id !== original.id;
        const mine = sets.filter((s) => s.slot_id === slot.id);
        const done = working(mine).length >= slot.sets;
        return (
          <SlotBlock
            key={`${slot.id}-${exercise.id}`}
            slot={slot}
            original={original}
            exercise={exercise}
            library={exercises}
            equipment={equipment}
            load={load}
            sets={mine}
            highlight={highlight?.slotId === slot.id ? highlight.setNo : null}
            next={
              done && slot.load_rule === 'linear'
                ? suggestionFor(slot, exercise, [asHistory(day, sets), ...history], equipment)
                : null
            }
            onLoad={(kg) => setLoads({ ...loads, [slot.id]: kg })}
            onTap={(setNo, warmup, target, kg) =>
              tap(slot.id, exercise.id, setNo, warmup, target, kg)
            }
            onStartLoad={(kg) => {
              if (swapped) setStarts({ ...starts, [slot.id]: kg });
              else patchSlot.mutate({ id: slot.id, body: { start_load_kg: kg } });
            }}
            onSwap={(exerciseId) => {
              // A different exercise means a different load and a fresh row of circles.
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
      {logged && (
        <Button
          variant="primary"
          loading={finish.isPending}
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
          Finish
        </Button>
      )}
      {logged && !complete && <p className="muted small center">Saves as a partial session.</p>}

      {rest && (
        <RestBar
          seconds={rest.seconds}
          resetKey={rest.key}
          next={describe(upcoming)}
          onDone={() => {
            setHighlight(upcoming);
            setRest(null);
          }}
        />
      )}
    </main>
  );
}

/** Loads what the session screen needs, then shows it. */
export function StrengthSession() {
  const { dayId } = useParams();
  const id = Number(dayId);
  const navigate = useNavigate();
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
        <ButtonLink to="/strength">Back to Strength</ButtonLink>
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
      onSaved={(saved) => void navigate('/strength', { state: { saved } })}
    />
  );
}
