import {
  achievableLoads,
  describeLoad,
  hasKit,
  snapLoad,
  substitutesFor,
  type Equipment,
  type Exercise,
  type LoadSuggestion,
  type ProgrammeSlot,
} from '@ots/shared';
import { useRef, useState } from 'react';
import { NumberField } from '../components/NumberField.js';
import { ScoreRow } from '../components/ScoreRow.js';
import { RestTimer } from '../timer/RestTimer.js';
import { stepLoad, targetLabel, type SessionSet } from './session.js';

export interface SetDraft {
  reps: number;
  load_kg: number | null;
  rpe: number | null;
  notes: string | null;
}

interface Props {
  slot: ProgrammeSlot;
  /** The slot's own exercise. */
  original: Exercise;
  /** What is being done this session: the original or a substitute. */
  exercise: Exercise;
  library: Exercise[];
  equipment: Equipment;
  suggestion: LoadSuggestion;
  /** The load shown now: the suggestion unless the user stepped it. */
  load: number | null;
  sets: SessionSet[];
  /** Set number to highlight because the rest before it has ended. */
  highlight: number | null;
  /** Changes when a set is logged on this card; null when no rest is running here. */
  restKey: number | null;
  onLoad: (load: number) => void;
  onLog: (setNo: number, draft: SetDraft) => void;
  onUndo: (setNo: number) => void;
  onRestDone: () => void;
  onStartLoad: (load: number) => void;
  onSwap: (exerciseId: number | null) => void;
  onMakePermanent: () => void;
}

const LONG_PRESS_MS = 500;

/** One programme slot: what to lift, how to load it, and a row per set. */
export function SlotCard(props: Props) {
  const { slot, original, exercise, library, equipment, suggestion, load, sets, highlight } = props;
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<SetDraft>({ reps: 0, load_kg: null, rpe: null, notes: null });
  const [startLoad, setStartLoad] = useState<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const swapped = exercise.id !== original.id;
  const kit = hasKit(equipment, exercise.equipment);
  const loaded = exercise.equipment !== 'bodyweight' && slot.load_rule !== 'bodyweight';
  const achievable = achievableLoads(equipment, exercise.equipment);
  const how = load !== null ? describeLoad(load, equipment, exercise.equipment) : null;
  const needsStart = kit && loaded && load === null;
  const targetReps = slot.reps ?? 1;
  const substitutes = kit ? [] : substitutesFor(original, library, equipment);

  const openEditor = (setNo: number) => {
    const done = sets.find((s) => s.set_no === setNo);
    setDraft({
      reps: done?.reps ?? targetReps,
      load_kg: done?.load_kg ?? load,
      rpe: done?.rpe ?? null,
      notes: done?.notes ?? null,
    });
    setEditing(setNo);
  };
  const press = (setNo: number) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openEditor(setNo);
    }, LONG_PRESS_MS);
  };
  const release = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const tap = (setNo: number) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (sets.some((s) => s.set_no === setNo)) props.onUndo(setNo);
    else
      props.onLog(setNo, {
        reps: targetReps,
        load_kg: loaded ? load : null,
        rpe: null,
        notes: null,
      });
  };

  return (
    <article className="card slot" aria-label={exercise.name}>
      <header className="session-head">
        <div className="grow">
          <h3>{exercise.name}</h3>
          <p className="muted">
            {exercise.pattern}, {exercise.equipment}
            {exercise.unilateral ? ', each side' : ''}
          </p>
        </div>
        <p className="target">{targetLabel(slot)}</p>
      </header>
      {slot.notes && !swapped && <p className="muted">{slot.notes}</p>}

      {swapped && (
        <div className="stack">
          <p className="muted">In place of {original.name} today.</p>
          <div className="row">
            <button type="button" className="grow" onClick={props.onMakePermanent}>
              Make permanent
            </button>
            <button type="button" className="quiet" onClick={() => props.onSwap(null)}>
              Undo swap
            </button>
          </div>
        </div>
      )}

      {!kit && (
        <div className="stack" role="group" aria-label={`Substitutes for ${original.name}`}>
          <p>
            <strong>No kit for this.</strong>{' '}
            {substitutes.length > 0 ? 'Do one of these instead:' : 'No substitute available.'}
          </p>
          {substitutes.map((s) => (
            <button key={s.id} type="button" onClick={() => props.onSwap(s.id)}>
              {s.name} ({s.equipment})
            </button>
          ))}
        </div>
      )}

      {needsStart && (
        <form
          className="stack"
          aria-label={`Starting load for ${exercise.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (startLoad === null) return;
            props.onStartLoad(snapLoad(startLoad, achievable, 'nearest') as number);
          }}
        >
          <NumberField
            label={
              slot.reps != null
                ? `What did you last ${exercise.name.toLowerCase()} for ${slot.reps}? (kg)`
                : `What load for ${exercise.name.toLowerCase()}? (kg)`
            }
            value={startLoad}
            onChange={setStartLoad}
          />
          <p className="muted">
            It will be set to the nearest load you can make: {achievable[0]} to{' '}
            {achievable[achievable.length - 1]}kg.
          </p>
          <button type="submit" className="primary" disabled={startLoad === null}>
            Set starting load
          </button>
        </form>
      )}

      {kit && loaded && load !== null && (
        <div className="load-row">
          <button
            type="button"
            className="step"
            aria-label={`Lighter ${exercise.name}`}
            disabled={stepLoad(load, achievable, -1) === load}
            onClick={() => props.onLoad(stepLoad(load, achievable, -1))}
          >
            -
          </button>
          <div className="grow center">
            <p className="load" aria-label={`${exercise.name} load`}>
              {load}kg
            </p>
            <p className="how">{how}</p>
            <p className="muted reason">
              {load === suggestion.load_kg ? suggestion.reason : 'adjusted by you'}
            </p>
          </div>
          <button
            type="button"
            className="step"
            aria-label={`Heavier ${exercise.name}`}
            disabled={stepLoad(load, achievable, 1) === load}
            onClick={() => props.onLoad(stepLoad(load, achievable, 1))}
          >
            +
          </button>
        </div>
      )}

      {kit && !needsStart && (
        <ul className="plain sets">
          {Array.from({ length: slot.sets }, (_, i) => i + 1).map((setNo) => {
            const done = sets.find((s) => s.set_no === setNo);
            const what = done
              ? `${slot.reps != null ? `${done.reps} reps` : 'done'}${done.load_kg != null ? ` at ${done.load_kg}kg` : ''}${done.rpe != null ? `, RPE ${done.rpe}` : ''}`
              : `${slot.reps != null ? `${targetReps} reps` : slot.seconds != null ? `${slot.seconds}s` : 'go'}${loaded && load !== null ? ` at ${load}kg` : ''}`;
            return (
              <li key={setNo} className="row">
                <button
                  type="button"
                  className={`set grow${done ? ' is-done' : ''}${highlight === setNo ? ' is-next' : ''}`}
                  aria-label={`${exercise.name} set ${setNo}: ${done ? `logged, ${what}. Tap to undo` : `${what}. Tap to log`}`}
                  aria-pressed={!!done}
                  onPointerDown={() => press(setNo)}
                  onPointerUp={release}
                  onPointerLeave={release}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    release();
                    longPressed.current = true;
                    openEditor(setNo);
                  }}
                  onClick={() => tap(setNo)}
                >
                  <span>Set {setNo}</span>
                  <span>{what}</span>
                  <span className="set-state">
                    {done ? 'Done' : highlight === setNo ? 'Go' : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Adjust ${exercise.name} set ${setNo}`}
                  onClick={() => openEditor(setNo)}
                >
                  Adjust
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <form
          className="stack set-editor"
          aria-label={`Adjust ${exercise.name} set ${editing}`}
          onSubmit={(e) => {
            e.preventDefault();
            props.onLog(editing, draft);
            setEditing(null);
          }}
        >
          <NumberField
            label="Reps"
            integer
            value={draft.reps}
            onChange={(reps) => setDraft({ ...draft, reps: reps ?? 0 })}
          />
          <ScoreRow
            label="RPE"
            min={1}
            max={10}
            value={draft.rpe}
            onChange={(rpe) => setDraft({ ...draft, rpe })}
            clearable
          />
          <label>
            Note
            <input
              value={draft.notes ?? ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
            />
          </label>
          <div className="row">
            <button type="submit" className="primary grow">
              Log set {editing}
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {props.restKey !== null && slot.rest_sec > 0 && (
        <RestTimer seconds={slot.rest_sec} resetKey={props.restKey} onDone={props.onRestDone} />
      )}
    </article>
  );
}
