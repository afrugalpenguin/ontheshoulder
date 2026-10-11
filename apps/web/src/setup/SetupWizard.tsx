import { SESSION_KINDS, type SessionKind, type Slot } from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorText } from '../api.js';
import { EquipmentEditor, NO_EQUIPMENT } from '../components/EquipmentEditor.js';
import { KIND_LABEL, WEEKDAYS } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';
import { useStarters } from '../queries.js';
import { finishSetup, type HandRow, type SetupState } from './finish.js';

const STEPS = ['You', 'Your event', 'Your kit', 'Your week', 'Your data'] as const;

const INITIAL: SetupState = {
  name: '',
  event: { name: '', date: '', distance_km: '', time_limit_h: '', url: '' },
  equipment: NO_EQUIPMENT,
  mode: 'starter',
  starter: '',
  rows: [],
};

const NEW_ROW: HandRow = { weekday: 1, slot: 'am', kind: 'run', name: '', minutes: '' };

/** First-run setup. Shown until an athlete, an A event and fixtures exist. */
export function SetupWizard({ dataDir }: { dataDir: string }) {
  const { today } = useNow();
  const client = useQueryClient();
  const starters = useStarters();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<SetupState>(INITIAL);
  const set = (patch: Partial<SetupState>) => setState((s) => ({ ...s, ...patch }));
  const setEvent = (patch: Partial<SetupState['event']>) =>
    setState((s) => ({ ...s, event: { ...s.event, ...patch } }));

  const starter = state.starter || starters.data?.[0]?.name || '';
  const chosen = starters.data?.find((s) => s.name === starter);
  const finish = useMutation({
    mutationFn: () => finishSetup({ ...state, starter }, today),
    onSuccess: () => client.invalidateQueries(),
  });

  const valid = [
    state.name.trim() !== '',
    state.event.name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(state.event.date),
    true,
    state.mode === 'starter'
      ? starter !== ''
      : state.rows.length > 0 && state.rows.every((r) => r.name.trim() !== ''),
    true,
  ][step];

  const setRow = (index: number, patch: Partial<HandRow>) =>
    set({ rows: state.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });

  return (
    <main className="setup">
      <header className="page-head">
        <h1>Set up</h1>
        <p className="muted" aria-live="polite">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </header>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          if (step < STEPS.length - 1) setStep(step + 1);
          else finish.mutate();
        }}
      >
        {step === 0 && (
          <label>
            Your name
            <input
              autoComplete="off"
              value={state.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
        )}

        {step === 1 && (
          <>
            <p className="muted">The event this build is for. You can add others in Settings.</p>
            <label>
              Event name
              <input
                value={state.event.name}
                onChange={(e) => setEvent({ name: e.target.value })}
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={state.event.date}
                onChange={(e) => setEvent({ date: e.target.value })}
              />
            </label>
            <label>
              Distance (km)
              <input
                inputMode="decimal"
                value={state.event.distance_km}
                onChange={(e) => setEvent({ distance_km: e.target.value })}
              />
            </label>
            <label>
              Time limit (hours)
              <input
                inputMode="decimal"
                value={state.event.time_limit_h}
                onChange={(e) => setEvent({ time_limit_h: e.target.value })}
              />
            </label>
            <label>
              Link
              <input
                type="url"
                inputMode="url"
                placeholder="optional"
                value={state.event.url}
                onChange={(e) => setEvent({ url: e.target.value })}
              />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <p className="muted">What you own. Leave a section at none if you have none of it.</p>
            <EquipmentEditor value={state.equipment} onChange={(equipment) => set({ equipment })} />
          </>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend>How do you want to shape the week?</legend>
              <label className="check">
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'starter'}
                  onChange={() => set({ mode: 'starter' })}
                />
                Start from a template
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="mode"
                  checked={state.mode === 'hand'}
                  onChange={() => set({ mode: 'hand' })}
                />
                Build it by hand
              </label>
            </fieldset>

            {state.mode === 'starter' && (
              <>
                <label>
                  Template
                  <select value={starter} onChange={(e) => set({ starter: e.target.value })}>
                    {(starters.data ?? []).map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                {chosen && (
                  <section aria-label="Week preview">
                    <p>{chosen.description}</p>
                    <ul className="plain preview">
                      {WEEKDAYS.map((day, index) => {
                        const items = chosen.week.filter((w) => w.weekday === index + 1);
                        return (
                          <li key={day}>
                            <strong>{day.slice(0, 3)}</strong>{' '}
                            {items.length === 0
                              ? 'nothing'
                              : items.map((w) => `${w.template} (${w.slot})`).join(', ')}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}

            {state.mode === 'hand' && (
              <section aria-label="Sessions in your week" className="stack">
                {state.rows.map((row, index) => (
                  <fieldset key={index} className="hand-row">
                    <legend>Session {index + 1}</legend>
                    <label>
                      Day
                      <select
                        value={row.weekday}
                        onChange={(e) => setRow(index, { weekday: Number(e.target.value) })}
                      >
                        {WEEKDAYS.map((day, i) => (
                          <option key={day} value={i + 1}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Slot
                      <select
                        value={row.slot}
                        onChange={(e) => setRow(index, { slot: e.target.value as Slot })}
                      >
                        <option value="am">Morning</option>
                        <option value="pm">Evening</option>
                      </select>
                    </label>
                    <label>
                      Kind
                      <select
                        value={row.kind}
                        onChange={(e) => setRow(index, { kind: e.target.value as SessionKind })}
                      >
                        {SESSION_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Name
                      <input
                        value={row.name}
                        onChange={(e) => setRow(index, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      Minutes
                      <input
                        inputMode="numeric"
                        placeholder="optional"
                        value={row.minutes}
                        onChange={(e) => setRow(index, { minutes: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => set({ rows: state.rows.filter((_, i) => i !== index) })}
                    >
                      Remove session {index + 1}
                    </button>
                  </fieldset>
                ))}
                <button type="button" onClick={() => set({ rows: [...state.rows, NEW_ROW] })}>
                  Add a session
                </button>
              </section>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <p>Your data stays on this computer, in this folder:</p>
            <p>
              <code aria-label="Data folder">{dataDir}</code>
            </p>
            <p className="muted">
              Backups go in the same place. Finishing sets up {state.name.trim() || 'you'} for{' '}
              {state.event.name.trim() || 'your event'} and plans this week.
            </p>
          </>
        )}

        {finish.isError && (
          <p role="alert" className="error">
            Setup did not finish: {errorText(finish.error)}. Nothing is lost; try again.
          </p>
        )}

        <div className="row">
          {step > 0 && (
            <button type="button" className="quiet" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="submit" className="primary grow" disabled={!valid || finish.isPending}>
            {step < STEPS.length - 1 ? 'Next' : finish.isPending ? 'Setting up...' : 'Finish'}
          </button>
        </div>
      </form>
    </main>
  );
}
