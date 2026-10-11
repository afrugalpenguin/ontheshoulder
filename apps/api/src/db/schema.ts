import type {
  Plate,
  SessionStructure,
  Targets,
  EquipmentType,
  ExercisePattern,
  LoadRule,
  SessionKind,
  SessionStatus,
  SkipReason,
  Slot,
} from '@ots/shared';
import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Property names are the column names, so a selected row is already the api shape.
// Dates are ISO strings (YYYY-MM-DD), timestamps are ISO 8601 strings.

const id = () => integer('id').primaryKey({ autoIncrement: true });
const bool = (name: string) => integer(name, { mode: 'boolean' });
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

// 5.1 Setup and configuration

export const athlete = sqliteTable('athlete', {
  id: id(),
  display_name: text('display_name').notNull(),
  units: text('units').$type<'metric'>().notNull().default('metric'),
  week_start: text('week_start').$type<'monday'>().notNull().default('monday'),
  timezone: text('timezone').notNull().default('UTC'),
  plan_weekday: integer('plan_weekday').notNull().default(7),
  plan_time: text('plan_time').notNull().default('21:00'),
});

export const event = sqliteTable('event', {
  id: id(),
  name: text('name').notNull(),
  date: text('date').notNull(),
  distance_km: real('distance_km'),
  location: text('location'),
  url: text('url'),
  time_limit_h: real('time_limit_h'),
  priority: text('priority').$type<'A' | 'B' | 'C'>().notNull(),
  status: text('status')
    .$type<'planned' | 'entered' | 'done' | 'skipped'>()
    .notNull()
    .default('planned'),
  date_confirmed: bool('date_confirmed').notNull().default(false),
  result_notes: text('result_notes'),
});

/** Single row, id 1. Absent until the user has saved their kit. */
export const equipment = sqliteTable('equipment', {
  id: integer('id').primaryKey(),
  bar_kg: real('bar_kg'),
  plates: json<Plate[]>('plates').notNull(),
  dumbbells: json<number[]>('dumbbells').notNull(),
  kettlebells: json<number[]>('kettlebells').notNull(),
  vest_kg: real('vest_kg'),
});

export const habit_definition = sqliteTable('habit_definition', {
  id: id(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  prompt_text: text('prompt_text'),
  prompt_until: text('prompt_until'),
  enabled: bool('enabled').notNull().default(true),
});

// 5.4 Strength (declared before the plan tables that reference it)

export const exercise = sqliteTable('exercise', {
  id: id(),
  name: text('name').notNull().unique(),
  pattern: text('pattern').$type<ExercisePattern>().notNull(),
  equipment: text('equipment').$type<EquipmentType>().notNull(),
  unilateral: bool('unilateral').notNull().default(false),
  cues: text('cues'),
  video_url: text('video_url'),
});

export const programme_day = sqliteTable('programme_day', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const programme_slot = sqliteTable('programme_slot', {
  id: id(),
  programme_day_id: integer('programme_day_id')
    .notNull()
    .references(() => programme_day.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  exercise_id: integer('exercise_id')
    .notNull()
    .references(() => exercise.id),
  sets: integer('sets').notNull(),
  reps: integer('reps'),
  seconds: integer('seconds'),
  rest_sec: integer('rest_sec').notNull(),
  load_rule: text('load_rule').$type<LoadRule>().notNull(),
  increment_kg: real('increment_kg'),
  start_load_kg: real('start_load_kg'),
  notes: text('notes'),
});

// 5.2 Plan

export const block = sqliteTable('block', {
  id: id(),
  name: text('name').notNull().unique(),
  start_date: text('start_date').notNull(),
  end_date: text('end_date').notNull(),
  purpose: text('purpose')
    .$type<'rebuild' | 'base' | 'build' | 'peak' | 'taper' | 'recovery'>()
    .notNull(),
  progression_rules: json<unknown>('progression_rules'),
  ends_at_event_id: integer('ends_at_event_id').references(() => event.id, {
    onDelete: 'set null',
  }),
});

export const session_template = sqliteTable('session_template', {
  id: id(),
  key: text('key').unique(),
  kind: text('kind').$type<SessionKind>().notNull(),
  name: text('name').notNull(),
  default_duration_min: integer('default_duration_min'),
  structure: json<SessionStructure>('structure'),
  programme_day_id: integer('programme_day_id').references(() => programme_day.id),
  notes: text('notes'),
  tags: json<string[]>('tags')
    .notNull()
    .default(sql`'[]'`),
});

export const fixture = sqliteTable(
  'fixture',
  {
    id: id(),
    weekday: integer('weekday').notNull(),
    slot: text('slot').$type<Slot>().notNull(),
    template_id: integer('template_id')
      .notNull()
      .references(() => session_template.id),
  },
  (t) => [unique('fixture_weekday_slot_template').on(t.weekday, t.slot, t.template_id)],
);

export const week_plan = sqliteTable('week_plan', {
  id: id(),
  iso_week: text('iso_week').notNull().unique(),
  generated_at: text('generated_at'),
  reasoning: json<string[]>('reasoning')
    .notNull()
    .default(sql`'[]'`),
});

// 5.3 Log (activity is declared before planned_session, which links to it)

export const activity = sqliteTable(
  'activity',
  {
    id: id(),
    date: text('date').notNull(),
    kind: text('kind').$type<SessionKind>().notNull(),
    start_time: text('start_time'),
    duration_min: real('duration_min'),
    distance_km: real('distance_km'),
    source: text('source').$type<'manual' | 'garmin'>().notNull().default('manual'),
    garmin_activity_id: text('garmin_activity_id'),
    avg_hr: integer('avg_hr'),
    max_hr: integer('max_hr'),
    elevation_m: real('elevation_m'),
    rpe: integer('rpe'),
    notes: text('notes'),
    detail: json<Record<string, unknown>>('detail'),
  },
  (t) => [
    uniqueIndex('activity_garmin_activity_id')
      .on(t.garmin_activity_id)
      .where(sql`${t.garmin_activity_id} is not null`),
  ],
);

export const planned_session = sqliteTable(
  'planned_session',
  {
    id: id(),
    week_plan_id: integer('week_plan_id')
      .notNull()
      .references(() => week_plan.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    template_id: integer('template_id')
      .notNull()
      .references(() => session_template.id),
    slot: text('slot').$type<Slot>().notNull(),
    targets: json<Targets>('targets')
      .notNull()
      .default(sql`'{}'`),
    status: text('status').$type<SessionStatus>().notNull().default('planned'),
    skip_reason: text('skip_reason').$type<SkipReason>(),
    edited_by_user: bool('edited_by_user').notNull().default(false),
    linked_activity_id: integer('linked_activity_id').references(() => activity.id, {
      onDelete: 'set null',
    }),
    optional: bool('optional').notNull().default(false),
  },
  (t) => [unique('planned_session_date_template_slot').on(t.date, t.template_id, t.slot)],
);

export const strength_session = sqliteTable('strength_session', {
  id: id(),
  activity_id: integer('activity_id')
    .notNull()
    .unique()
    .references(() => activity.id, { onDelete: 'cascade' }),
  programme_day_id: integer('programme_day_id')
    .notNull()
    .references(() => programme_day.id),
  started_at: text('started_at'),
  finished_at: text('finished_at'),
  partial: bool('partial').notNull().default(false),
});

export const set_log = sqliteTable('set_log', {
  id: id(),
  strength_session_id: integer('strength_session_id')
    .notNull()
    .references(() => strength_session.id, { onDelete: 'cascade' }),
  slot_id: integer('slot_id')
    .notNull()
    .references(() => programme_slot.id),
  set_no: integer('set_no').notNull(),
  reps: integer('reps').notNull(),
  load_kg: real('load_kg'),
  rpe: real('rpe'),
  done_at: text('done_at'),
  notes: text('notes'),
});

export const daily_checkin = sqliteTable('daily_checkin', {
  id: id(),
  date: text('date').notNull().unique(),
  sleep_quality: integer('sleep_quality'),
  energy: integer('energy'),
  weight_kg: real('weight_kg'),
  ankle_score: integer('ankle_score'),
  sunday_got_up: bool('sunday_got_up'),
  habits: json<Record<string, boolean>>('habits')
    .notNull()
    .default(sql`'{}'`),
  dismissed_prompts: json<string[]>('dismissed_prompts')
    .notNull()
    .default(sql`'[]'`),
  notes: text('notes'),
});

export const body_metric = sqliteTable(
  'body_metric',
  {
    id: id(),
    date: text('date').notNull(),
    metric: text('metric').notNull(),
    value: real('value').notNull(),
    source: text('source').notNull(),
  },
  (t) => [unique('body_metric_date_metric_source').on(t.date, t.metric, t.source)],
);

// Garmin import inbox. Rows are stored as received; matching is a later stage.

export const garmin_import = sqliteTable('garmin_import', {
  id: id(),
  kind: text('kind').$type<'daily' | 'activity'>().notNull(),
  ref: text('ref').notNull(),
  payload: json<Record<string, unknown>>('payload').notNull(),
  received_at: text('received_at').notNull(),
});

/** Small key to JSON value store for app state that is not domain data. */
export const app_state = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: json<unknown>('value'),
});
