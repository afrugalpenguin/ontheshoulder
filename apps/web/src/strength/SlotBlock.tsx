import {
  achievableLoads,
  hasKit,
  snapLoad,
  substitutesFor,
  type Equipment,
  type Exercise,
  type LoadSuggestion,
  type ProgrammeSlot,
} from '@ots/shared';
import { useState } from 'react';
import { Button, Sheet, Stepper } from '../ui/index.js';
import { PencilIcon } from '../ui/icons.js';
import { PlatesSheet } from './PlatesSheet.js';
import {
  hasWarmups,
  stepLoad,
  targetReps,
  warmupRamp,
  working,
  type SessionSet,
} from './session.js';

interface Props {
  slot: ProgrammeSlot;
  /** The slot's own exercise. */
  original: Exercise;
  /** What is being done this session: the original or a substitute. */
  exercise: Exercise;
  library: Exercise[];
  equipment: Equipment;
  /** The working load now: the suggestion unless the user changed it. */
  load: number | null;
  /** This slot's sets so far, warm-ups included. */
  sets: SessionSet[];
  /** Working set to highlight because the rest before it has ended. */
  highlight: number | null;
  /** The load for next session, shown once every working set is in. Linear slots only. */
  next: LoadSuggestion | null;
  onLoad: (load: number) => void;
  /** A tap on a set circle. `load` is what that set is done at. */
  onTap: (setNo: number, warmup: boolean, target: number, load: number | null) => void;
  onStartLoad: (load: number) => void;
  onSwap: (exerciseId: number | null) => void;
  onMakePermanent: () => void;
}

interface CircleProps {
  name: string;
  /** Reps logged, or null while the set is still to do. */
  reps: number | null;
  target: number;
  /** For timed work, the seconds to show in place of a rep count. */
  seconds: number | null;
  isNext: boolean;
  onTap: () => void;
}

/** One set. Tap to fill with the target reps; tap again to take one off; past zero it empties. */
function SetCircle({ name, reps, target, seconds, isNext, onTap }: CircleProps) {
  const shown = reps ?? target;
  const text = seconds !== null && shown > 0 ? `${seconds}s` : String(shown);
  const state =
    reps === null ? `not done, target ${text}` : reps >= target ? `done, ${text}` : `${reps} only`;
  return (
    <button
      type="button"
      className={`circle${reps === null ? '' : reps >= target ? ' is-done' : ' is-short'}${isNext ? ' is-next' : ''}`}
      aria-label={`${name}: ${state}`}
      aria-pressed={reps !== null}
      onClick={onTap}
    >
      {text}
    </button>
  );
}

/** One exercise of the session: its name, the working load, and a circle per set. */
export function SlotBlock(props: Props) {
  const { slot, original, exercise, library, equipment, load, sets, highlight, next } = props;
  const [startLoad, setStartLoad] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'none' | 'plates' | 'load'>('none');

  const swapped = exercise.id !== original.id;
  const kit = hasKit(equipment, exercise.equipment);
  const loaded = exercise.equipment !== 'bodyweight' && slot.load_rule !== 'bodyweight';
  const achievable = achievableLoads(equipment, exercise.equipment);
  const needsStart = kit && loaded && load === null;
  const target = targetReps(slot);
  const substitutes = kit ? [] : substitutesFor(original, library, equipment);
  const ramp = load !== null && hasWarmups(slot, exercise) ? warmupRamp(load, equipment) : [];
  const mine = working(sets);
  const warmups = sets.filter((s) => s.warmup);
  const repsOf = (list: SessionSet[], setNo: number) =>
    list.find((s) => s.set_no === setNo)?.reps ?? null;

  return (
    <article className="card slot" aria-label={exercise.name}>
      <header className="slot-head">
        <h3 className="grow">{exercise.name}</h3>
        {kit && loaded && load !== null && (
          <>
            <button
              type="button"
              className="load quiet"
              aria-label={`${exercise.name} load: ${load} kg. Show how to load it`}
              onClick={() => setSheet('plates')}
            >
              {load}
              <span className="unit"> kg</span>
            </button>
            <button
              type="button"
              className="quiet pencil"
              aria-label={`Change ${exercise.name} load`}
              onClick={() => setSheet('load')}
            >
              <PencilIcon />
            </button>
          </>
        )}
        {kit && !loaded && <span className="muted">bodyweight</span>}
      </header>

      {swapped && (
        <div className="stack">
          <p className="muted">In place of {original.name} today.</p>
          <div className="row">
            <Button className="grow" onClick={props.onMakePermanent}>
              Make permanent
            </Button>
            <Button variant="ghost" onClick={() => props.onSwap(null)}>
              Undo swap
            </Button>
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
            <Button key={s.id} onClick={() => props.onSwap(s.id)}>
              {s.name} ({s.equipment})
            </Button>
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
          <Stepper
            label={
              slot.reps != null
                ? `What did you last ${exercise.name.toLowerCase()} for ${slot.reps}?`
                : `What load for ${exercise.name.toLowerCase()}?`
            }
            unit="kg"
            value={startLoad}
            onChange={setStartLoad}
            step={2.5}
            min={0}
            start={achievable[0]}
            clearable
          />
          <p className="muted small">
            It will be set to the nearest load you can make: {achievable[0]} to{' '}
            {achievable[achievable.length - 1]} kg.
          </p>
          <Button type="submit" variant="primary" disabled={startLoad === null}>
            Set starting load
          </Button>
        </form>
      )}

      {kit && !needsStart && ramp.length > 0 && (
        <details className="warmups">
          <summary className="muted small">Warm-up</summary>
          <div className="circles" role="group" aria-label={`${exercise.name} warm-up sets`}>
            {ramp.map((step, index) => (
              <div key={index} className="warmup">
                <SetCircle
                  name={`${exercise.name} warm-up ${index + 1} at ${step.load_kg} kg`}
                  reps={repsOf(warmups, index + 1)}
                  target={step.reps}
                  seconds={null}
                  isNext={false}
                  onTap={() => props.onTap(index + 1, true, step.reps, step.load_kg)}
                />
                <span className="muted small">{step.load_kg}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {kit && !needsStart && (
        <div className="circles" role="group" aria-label={`${exercise.name} sets`}>
          {Array.from({ length: slot.sets }, (_, i) => i + 1).map((setNo) => (
            <SetCircle
              key={setNo}
              name={`${exercise.name} set ${setNo}`}
              reps={repsOf(mine, setNo)}
              target={target}
              seconds={slot.reps === null ? slot.seconds : null}
              isNext={highlight === setNo}
              onTap={() => props.onTap(setNo, false, target, loaded ? load : null)}
            />
          ))}
        </div>
      )}

      {next && next.load_kg !== null && (
        <p className="next-line" aria-label={`${exercise.name} next session`}>
          Next session: <strong>{next.load_kg} kg</strong>{' '}
          <span className="muted small">{next.reason}</span>
        </p>
      )}

      {load !== null && (
        <>
          <PlatesSheet
            open={sheet === 'plates'}
            onClose={() => setSheet('none')}
            exercise={exercise}
            load={load}
            equipment={equipment}
          />
          <Sheet
            open={sheet === 'load'}
            title={`${exercise.name} load`}
            onClose={() => setSheet('none')}
          >
            <div className="stepper" role="group" aria-label={`${exercise.name} load`}>
              <div className="stepper-row">
                <button
                  type="button"
                  aria-label={`Lighter ${exercise.name}`}
                  disabled={stepLoad(load, achievable, -1) === load}
                  onClick={() => props.onLoad(stepLoad(load, achievable, -1))}
                >
                  <span aria-hidden="true">-</span>
                </button>
                <p className="load grow center">{load} kg</p>
                <button
                  type="button"
                  aria-label={`Heavier ${exercise.name}`}
                  disabled={stepLoad(load, achievable, 1) === load}
                  onClick={() => props.onLoad(stepLoad(load, achievable, 1))}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </div>
            <p className="muted small">
              For this session only. Sets already logged keep the load they were done at.
            </p>
          </Sheet>
        </>
      )}
    </article>
  );
}
