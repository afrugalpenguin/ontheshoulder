import type { ActivityInput, WeekSession } from '@ots/shared';
import { useState } from 'react';
import { buildActivity, logDefaults, type LogFormState } from '../lib/activity.js';
import { Button, Stepper } from '../ui/index.js';

interface Props {
  session: WeekSession;
  onSubmit: (activity: ActivityInput) => void;
  busy?: boolean;
  error?: string | null;
}

/** The log sheet's form, pre-filled from the plan: minutes, effort, a note. Saving is one tap. */
export function LogForm({ session, onSubmit, busy, error }: Props) {
  const [form, setForm] = useState<LogFormState>(() => logDefaults(session));
  const set = <K extends keyof LogFormState>(key: K, value: LogFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="log-form"
      aria-label={`Log ${session.template.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(buildActivity(session, form));
      }}
    >
      <Stepper
        label="Minutes"
        value={form.duration_min}
        onChange={(v) => set('duration_min', v)}
        step={5}
        min={0}
        max={1440}
        start={30}
        clearable
      />
      <Stepper
        label="RPE"
        value={form.rpe}
        onChange={(v) => set('rpe', v)}
        step={1}
        min={1}
        max={10}
        start={5}
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
      <Button type="submit" variant="primary" loading={busy ?? false}>
        Save
      </Button>
    </form>
  );
}
