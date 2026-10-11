import {
  EVENT_STATUSES,
  PRIORITIES,
  type Athlete,
  type Equipment,
  type Event,
  type EventInput,
  type Fixture,
  type FixtureInput,
  type Habit,
  type ProgrammeDay,
  type SessionTemplate,
  type Slot,
} from '@ots/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, errorText } from '../api.js';
import { EquipmentEditor, NO_EQUIPMENT } from '../components/EquipmentEditor.js';
import { BlocksSection } from './BlocksSection.js';
import { WEEKDAYS, shortDate } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';
import {
  keys,
  useAthlete,
  useBlocks,
  useEquipment,
  useEvents,
  useFixtures,
  useHabits,
  useHealth,
  useProgrammeDays,
  useSetupStatus,
  useTemplates,
} from '../queries.js';

const EXPORT_TABLES = [
  'activity',
  'daily_checkin',
  'body_metric',
  'planned_session',
  'strength_session',
  'set_log',
  'event',
  'block',
  'session_template',
  'fixture',
  'exercise',
  'programme_day',
  'programme_slot',
  'habit_definition',
  'equipment',
  'athlete',
  'week_plan',
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="card settings-section">
      <summary>{title}</summary>
      <div className="stack">{children}</div>
    </details>
  );
}

/** Save button with its saved and failed states, shared by every section. */
function SaveRow(props: {
  mutation: { isPending: boolean; isSuccess: boolean; isError: boolean; error: unknown };
  label?: string;
}) {
  const { mutation, label = 'Save' } = props;
  return (
    <div className="row">
      <button type="submit" className="primary" disabled={mutation.isPending}>
        {label}
      </button>
      {mutation.isSuccess && (
        <span role="status" className="muted">
          Saved
        </span>
      )}
      {mutation.isError && (
        <span role="alert" className="error">
          {errorText(mutation.error)}
        </span>
      )}
    </div>
  );
}

function AthleteSection({ athlete }: { athlete: Athlete }) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    display_name: athlete.display_name,
    plan_weekday: athlete.plan_weekday,
    plan_time: athlete.plan_time,
  });
  const save = useMutation({
    mutationFn: () => api<Athlete>('PUT', '/athlete', { ...form, timezone: athlete.timezone }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.athlete }),
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Name
        <input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </label>
      <label>
        Plan next week on
        <select
          value={form.plan_weekday}
          onChange={(e) => setForm({ ...form, plan_weekday: Number(e.target.value) })}
        >
          {WEEKDAYS.map((day, i) => (
            <option key={day} value={i + 1}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label>
        at
        <input
          type="time"
          value={form.plan_time}
          onChange={(e) => setForm({ ...form, plan_time: e.target.value })}
        />
      </label>
      <SaveRow mutation={save} />
    </form>
  );
}

const text = (value: number | string | null) => (value === null ? '' : String(value));
const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

function EventForm(props: { event: Event | null; aTaken: boolean; onDone: () => void }) {
  const { event, aTaken, onDone } = props;
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: event?.name ?? '',
    date: event?.date ?? '',
    distance_km: text(event?.distance_km ?? null),
    time_limit_h: text(event?.time_limit_h ?? null),
    location: event?.location ?? '',
    url: event?.url ?? '',
    priority: event?.priority ?? (aTaken ? 'B' : 'A'),
    status: event?.status ?? 'planned',
    date_confirmed: event?.date_confirmed ?? false,
    result_notes: event?.result_notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const refresh = () => {
    onDone();
    return Promise.all([
      client.invalidateQueries({ queryKey: keys.events }),
      client.invalidateQueries({ queryKey: keys.setup }),
    ]);
  };
  const save = useMutation({
    mutationFn: () => {
      const body: EventInput = {
        name: form.name.trim(),
        date: form.date,
        distance_km: numberOrNull(form.distance_km),
        time_limit_h: numberOrNull(form.time_limit_h),
        location: form.location.trim() || null,
        url: form.url.trim() || null,
        priority: form.priority,
        status: form.status,
        date_confirmed: form.date_confirmed,
        result_notes: form.result_notes.trim() || null,
      };
      return event ? api('PATCH', `/events/${event.id}`, body) : api('POST', '/events', body);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api('DELETE', `/events/${event?.id}`),
    onSuccess: refresh,
  });
  // Exactly one A event: A is only on offer if nothing else holds it.
  const canBeA = !aTaken || event?.priority === 'A';

  return (
    <form
      className="stack event-form"
      aria-label={event ? `Edit ${event.name}` : 'Add event'}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Event name
        <input required value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        Date
        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={form.date_confirmed}
          onChange={(e) => set({ date_confirmed: e.target.checked })}
        />
        Date confirmed
      </label>
      <label>
        Priority
        <select
          value={form.priority}
          onChange={(e) => set({ priority: e.target.value as Event['priority'] })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} disabled={p === 'A' && !canBeA}>
              {p}
              {p === 'A' ? ' (the goal)' : ''}
            </option>
          ))}
        </select>
      </label>
      {!canBeA && <p className="muted">Another event is already the A event.</p>}
      <label>
        Status
        <select
          value={form.status}
          onChange={(e) => set({ status: e.target.value as Event['status'] })}
        >
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Distance (km)
        <input
          inputMode="decimal"
          value={form.distance_km}
          onChange={(e) => set({ distance_km: e.target.value })}
        />
      </label>
      <label>
        Time limit (hours)
        <input
          inputMode="decimal"
          value={form.time_limit_h}
          onChange={(e) => set({ time_limit_h: e.target.value })}
        />
      </label>
      <label>
        Location
        <input value={form.location} onChange={(e) => set({ location: e.target.value })} />
      </label>
      <label>
        Link
        <input type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} />
      </label>
      {form.status === 'done' && (
        <label>
          Result notes
          <textarea
            rows={3}
            value={form.result_notes}
            onChange={(e) => set({ result_notes: e.target.value })}
          />
        </label>
      )}
      <SaveRow mutation={save} label={event ? 'Save event' : 'Add event'} />
      <div className="row">
        <button type="button" className="quiet" onClick={onDone}>
          Cancel
        </button>
        {event && event.priority !== 'A' && (
          <button type="button" className="quiet danger" onClick={() => remove.mutate()}>
            Delete event
          </button>
        )}
      </div>
    </form>
  );
}

function EventsSection({ events }: { events: Event[] }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const aTaken = events.some((e) => e.priority === 'A');
  return (
    <>
      <ul className="plain stack">
        {events.map((e) =>
          editing === e.id ? (
            <li key={e.id}>
              <EventForm event={e} aTaken={aTaken} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={e.id} className="row">
              <span className="tag">{e.priority}</span>
              <span className="grow">
                {e.name}
                <span className="muted sub">
                  {shortDate(e.date)} {e.date.slice(0, 4)}, {e.status}
                  {e.date_confirmed ? '' : ', date not confirmed'}
                </span>
              </span>
              <button type="button" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e.id)}>
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <EventForm event={null} aTaken={aTaken} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')}>
          Add an event
        </button>
      )}
    </>
  );
}

function EquipmentSection({ saved }: { saved: Equipment | null }) {
  const client = useQueryClient();
  const [value, setValue] = useState<Equipment>(saved ?? NO_EQUIPMENT);
  const save = useMutation({
    mutationFn: () => api('PUT', '/equipment', value),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.equipment }),
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <EquipmentEditor value={value} onChange={setValue} />
      <SaveRow mutation={save} label="Save kit" />
    </form>
  );
}

function FixturesSection(props: { fixtures: Fixture[]; templates: SessionTemplate[] }) {
  const { templates } = props;
  const client = useQueryClient();
  const [rows, setRows] = useState<FixtureInput[]>(
    props.fixtures.map(({ weekday, slot, template_id }) => ({ weekday, slot, template_id })),
  );
  const setRow = (index: number, patch: Partial<FixtureInput>) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const save = useMutation({
    mutationFn: () => api('PUT', '/fixtures', { fixtures: rows }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.fixtures }),
        client.invalidateQueries({ queryKey: keys.setup }),
      ]),
  });
  const firstTemplate = templates[0]?.id;

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="muted">
        The repeating shape of the week. Changes apply from the next generated week.
      </p>
      {rows.map((row, index) => (
        <fieldset key={index} className="fixture-row">
          <legend className="visually-hidden">Fixture {index + 1}</legend>
          <label>
            <span className="visually-hidden">Day for fixture {index + 1}</span>
            <select
              value={row.weekday}
              onChange={(e) => setRow(index, { weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i + 1}>
                  {day.slice(0, 3)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Slot for fixture {index + 1}</span>
            <select
              value={row.slot}
              onChange={(e) => setRow(index, { slot: e.target.value as Slot })}
            >
              <option value="am">am</option>
              <option value="pm">pm</option>
            </select>
          </label>
          <label className="grow">
            <span className="visually-hidden">Session for fixture {index + 1}</span>
            <select
              value={row.template_id}
              onChange={(e) => setRow(index, { template_id: Number(e.target.value) })}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="quiet"
            aria-label={`Remove fixture ${index + 1}`}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            <span aria-hidden="true">x</span>
          </button>
        </fieldset>
      ))}
      {firstTemplate !== undefined && (
        <button
          type="button"
          onClick={() => setRows([...rows, { weekday: 1, slot: 'am', template_id: firstTemplate }])}
        >
          Add a fixture
        </button>
      )}
      <SaveRow mutation={save} label="Save week shape" />
    </form>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    label: habit.label,
    prompt_text: habit.prompt_text ?? '',
    prompt_until: habit.prompt_until ?? '',
    enabled: habit.enabled,
  });
  const save = useMutation({
    mutationFn: () =>
      api('PATCH', `/habits/${habit.id}`, {
        label: form.label.trim(),
        prompt_text: form.prompt_text.trim() || null,
        prompt_until: form.prompt_until || null,
        enabled: form.enabled,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.habits }),
  });
  return (
    <form
      className="stack habit-row"
      aria-label={`Habit ${habit.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Label
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </label>
      <label>
        Prompt text
        <input
          placeholder="no prompt"
          value={form.prompt_text}
          onChange={(e) => setForm({ ...form, prompt_text: e.target.value })}
        />
      </label>
      <label>
        Prompt until
        <input
          type="time"
          value={form.prompt_until}
          onChange={(e) => setForm({ ...form, prompt_until: e.target.value })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <SaveRow mutation={save} label={`Save ${habit.label}`} />
    </form>
  );
}

function ExportSection() {
  const [table, setTable] = useState(EXPORT_TABLES[0] as string);
  return (
    <>
      <a className="button" href="/api/export/json" download>
        Download everything (JSON)
      </a>
      <label>
        Table
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          {EXPORT_TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <a className="button" href={`/api/export/csv/${table}`} download>
        Download table (CSV)
      </a>
    </>
  );
}

function BackupSection() {
  const client = useQueryClient();
  const health = useHealth();
  const backup = useMutation({
    mutationFn: () => api<{ file: string; count: number }>('POST', '/admin/backup'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.health }),
  });
  const info = health.data?.backup;
  return (
    <>
      <p aria-label="Backup status">
        {info?.last
          ? `Last backup ${new Date(info.last).toLocaleString()}. ${info.count} kept.`
          : 'No backup yet.'}
      </p>
      <div className="row wrap">
        <button type="button" disabled={backup.isPending} onClick={() => backup.mutate()}>
          Back up now
        </button>
        {info?.last && (
          <a className="button" href="/api/admin/backup/latest" download>
            Download latest backup
          </a>
        )}
      </div>
      {backup.isSuccess && (
        <p role="status" className="muted">
          Saved {backup.data.file}
        </p>
      )}
      {backup.isError && (
        <p role="alert" className="error">
          {errorText(backup.error)}
        </p>
      )}
    </>
  );
}

/**
 * One switch for warm-up sets. It is stored on each barbell slot that
 * progresses linearly, so it reads as on only when every one of them has it on.
 */
export function WarmupsSetting({ days }: { days: ProgrammeDay[] }) {
  const client = useQueryClient();
  const slots = days.flatMap((d) => d.slots).filter((s) => s.load_rule === 'linear');
  const on = slots.length > 0 && slots.every((s) => s.warmups_enabled);
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      Promise.all(
        slots.map((s) => api('PATCH', `/programme-slots/${s.id}`, { warmups_enabled: enabled })),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: keys.programmeDays }),
  });
  if (slots.length === 0) return null;
  return (
    <div className="stack">
      <label className="check">
        <input
          type="checkbox"
          checked={save.isPending ? save.variables : on}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Warm-up sets before barbell lifts
      </label>
      <p className="muted small">
        The empty bar twice, then 40 and 60 per cent of the working load. Logged, but never counted
        for progression.
      </p>
      {save.isError && (
        <p role="alert" className="error">
          {errorText(save.error)}
        </p>
      )}
    </div>
  );
}

export function Settings() {
  const { today } = useNow();
  const status = useSetupStatus();
  const athlete = useAthlete();
  const events = useEvents();
  const equipment = useEquipment();
  const fixtures = useFixtures();
  const templates = useTemplates();
  const habits = useHabits();
  const blocks = useBlocks();
  const days = useProgrammeDays();

  return (
    <main>
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <Section title="You">{athlete.data && <AthleteSection athlete={athlete.data} />}</Section>
      <Section title="Events">{events.data && <EventsSection events={events.data} />}</Section>
      <Section title="Kit">
        {days.data && <WarmupsSetting days={days.data} />}
        {equipment.isSuccess && <EquipmentSection saved={equipment.data} />}
      </Section>
      <Section title="Week shape">
        {fixtures.data && templates.data && (
          <FixturesSection fixtures={fixtures.data} templates={templates.data} />
        )}
      </Section>
      <Section title="Habits and prompts">
        {(habits.data ?? []).map((h) => (
          <HabitRow key={h.id} habit={h} />
        ))}
      </Section>
      <Section title="Blocks and rules">
        {blocks.data && <BlocksSection blocks={blocks.data} today={today} />}
      </Section>
      <Section title="Export">
        <ExportSection />
      </Section>
      <Section title="Data folder and backups">
        <p>
          <code>{status.data?.data_dir}</code>
        </p>
        <BackupSection />
      </Section>
    </main>
  );
}
