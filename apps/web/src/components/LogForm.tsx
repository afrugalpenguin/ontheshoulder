import type { ActivityInput, WeekSession } from '@ots/shared';
import { useState } from 'react';
import {
  SURFACES,
  buildActivity,
  fieldsFor,
  logDefaults,
  type LogFormState,
} from '../lib/activity.js';
import { ScoreRow } from './ScoreRow.js';

interface Props {
  session: WeekSession;
  onSubmit: (activity: ActivityInput) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}

const LABELS: Partial<Record<keyof LogFormState, string>> = {
  duration_min: 'Minutes',
  distance_km: 'Distance (km)',
  vest_kg: 'Vest (kg)',
  repeats: 'Repeats',
  run_block_sec: 'Run block (seconds)',
  walk_block_sec: 'Walk block (seconds)',
};

/** Quick log form, pre-filled from the plan. Shows only the fields the session kind uses. */
export function LogForm({ session, onSubmit, onCancel, busy, error }: Props) {
  const [form, setForm] = useState<LogFormState>(() => logDefaults(session));
  const set = <K extends keyof LogFormState>(key: K, value: LogFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const fields = fieldsFor(session.template.kind);
  const hidden = new Set<keyof LogFormState>(
    form.continuous ? ['repeats', 'run_block_sec', 'walk_block_sec'] : [],
  );

  return (
    <form
      className="log-form"
      aria-label={`Log ${session.template.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(buildActivity(session, form));
      }}
    >
      {fields.map((field) => {
        if (hidden.has(field)) return null;
        if (field === 'continuous') {
          return (
            <label key={field} className="check">
              <input
                type="checkbox"
                checked={form.continuous}
                onChange={(e) => set('continuous', e.target.checked)}
              />
              Continuous (no walk breaks)
            </label>
          );
        }
        if (field === 'surface') {
          return (
            <label key={field}>
              Surface
              <select value={form.surface} onChange={(e) => set('surface', e.target.value)}>
                {SURFACES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={field}>
            {LABELS[field]}
            <input
              inputMode="decimal"
              value={form[field] as string}
              onChange={(e) => set(field, e.target.value as never)}
            />
          </label>
        );
      })}
      <ScoreRow
        label="RPE"
        min={1}
        max={10}
        value={form.rpe}
        onChange={(rpe) => set('rpe', rpe)}
        ends={['easy', 'all out']}
        clearable
      />
      <label>
        Notes
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary grow" disabled={busy}>
          Save
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
