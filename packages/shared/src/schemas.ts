import { Type, type Static, type TObject, type TProperties, type TSchema } from 'typebox';

/**
 * TypeBox schemas for every entity in SPEC section 5. The api validates
 * requests with them and both sides take their TypeScript types from them.
 * Field names match the database columns.
 */

const Nullable = <T extends TSchema>(schema: T) => Type.Union([Type.Null(), schema]);
const Opt = <T extends TSchema>(schema: T) => Type.Optional(schema);
const OptNull = <T extends TSchema>(schema: T) => Type.Optional(Nullable(schema));

/** Stored row: the input fields, all present, plus the integer id. */
const row = <P extends TProperties>(input: TObject<P>) =>
  Type.Required(Type.Object({ id: Type.Integer(), ...input.properties }));

export const Id = Type.Integer({ minimum: 1 });
export const IsoDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
export const IsoWeek = Type.String({ pattern: '^\\d{4}-W\\d{2}$' });
export const TimeOfDay = Type.String({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' });
const Name = Type.String({ minLength: 1, maxLength: 200 });
const Text = Type.String({ maxLength: 4000 });
const Kg = Type.Number({ minimum: 0, maximum: 1000 });

// Value lists. The arrays are exported for selects in the UI.

export const SLOTS = ['am', 'pm'] as const;
export const PRIORITIES = ['A', 'B', 'C'] as const;
export const EVENT_STATUSES = ['planned', 'entered', 'done', 'skipped'] as const;
export const BLOCK_PURPOSES = ['rebuild', 'base', 'build', 'peak', 'taper', 'recovery'] as const;
export const SESSION_KINDS = [
  'run',
  'walk_vest',
  'walk',
  'ride',
  'swim',
  'strength',
  'prehab',
  'mobility',
  'rest',
] as const;
export const SESSION_STATUSES = ['planned', 'done', 'skipped', 'modified'] as const;
export const SKIP_REASONS = ['tired', 'sleep', 'family', 'injury', 'time', 'other'] as const;
export const ACTIVITY_SOURCES = ['manual', 'garmin'] as const;
export const EXERCISE_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'calf',
  'carry',
  'core',
  'hip',
  'mobility',
] as const;
export const EQUIPMENT_TYPES = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'bodyweight',
  'plate',
] as const;
export const LOAD_RULES = ['linear', 'double', 'bodyweight', 'fixed'] as const;

export const Slot = Type.Enum(SLOTS);
export const Priority = Type.Enum(PRIORITIES);
export const EventStatus = Type.Enum(EVENT_STATUSES);
export const BlockPurpose = Type.Enum(BLOCK_PURPOSES);
export const SessionKind = Type.Enum(SESSION_KINDS);
export const SessionStatus = Type.Enum(SESSION_STATUSES);
export const SkipReason = Type.Enum(SKIP_REASONS);
export const ActivitySource = Type.Enum(ACTIVITY_SOURCES);
export const ExercisePattern = Type.Enum(EXERCISE_PATTERNS);
export const EquipmentTypeSchema = Type.Enum(EQUIPMENT_TYPES);
export const LoadRule = Type.Enum(LOAD_RULES);

// 5.1 Setup and configuration

export const AthleteInput = Type.Object({
  display_name: Name,
  units: Opt(Type.Literal('metric')),
  week_start: Opt(Type.Literal('monday')),
  timezone: Opt(Type.String({ minLength: 1, maxLength: 100 })),
  /** When next week's plan is generated: ISO weekday and local time. */
  plan_weekday: Opt(Type.Integer({ minimum: 1, maximum: 7 })),
  plan_time: Opt(TimeOfDay),
});
export const Athlete = row(AthleteInput);

export const EventInput = Type.Object({
  name: Name,
  date: IsoDate,
  distance_km: OptNull(Type.Number({ exclusiveMinimum: 0 })),
  location: OptNull(Name),
  url: OptNull(Type.String({ maxLength: 500 })),
  time_limit_h: OptNull(Type.Number({ exclusiveMinimum: 0 })),
  priority: Priority,
  status: Opt(EventStatus),
  date_confirmed: Opt(Type.Boolean()),
  result_notes: OptNull(Text),
});
export const Event = row(EventInput);

export const Plate = Type.Object({
  kg: Type.Number({ exclusiveMinimum: 0, maximum: 100 }),
  count: Type.Integer({ minimum: 0, maximum: 20 }),
});
export const EquipmentSchema = Type.Object({
  bar_kg: Nullable(Kg),
  plates: Type.Array(Plate, { maxItems: 30 }),
  dumbbells: Type.Array(Kg, { maxItems: 60 }),
  kettlebells: Type.Array(Kg, { maxItems: 60 }),
  vest_kg: Nullable(Kg),
});

export const FixtureInput = Type.Object({
  weekday: Type.Integer({ minimum: 1, maximum: 7 }),
  slot: Slot,
  template_id: Id,
});
export const Fixture = row(FixtureInput);
export const FixturesInput = Type.Object({ fixtures: Type.Array(FixtureInput, { maxItems: 50 }) });

export const HabitInput = Type.Object({
  key: Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 50 }),
  label: Name,
  prompt_text: OptNull(Name),
  prompt_until: OptNull(TimeOfDay),
  enabled: Opt(Type.Boolean()),
});
export const Habit = row(HabitInput);

// 5.2 Plan

export const BlockInput = Type.Object({
  name: Name,
  start_date: IsoDate,
  end_date: IsoDate,
  purpose: BlockPurpose,
  progression_rules: Opt(Type.Unknown()),
  ends_at_event_id: OptNull(Id),
});
export const Block = row(BlockInput);

const Count = Type.Integer({ minimum: 0, maximum: 10_000 });

/** SPEC 5.5. Every key is optional; a template uses the ones that describe it. */
export const SessionStructure = Type.Object({
  warmup_min: Opt(Count),
  repeats: Opt(Count),
  run_sec: Opt(Count),
  walk_sec: Opt(Count),
  cooldown_min: Opt(Count),
  duration_min: Opt(Count),
  vest_kg: Opt(Kg),
});

export const SessionTemplateInput = Type.Object({
  key: OptNull(Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 50 })),
  kind: SessionKind,
  name: Name,
  default_duration_min: OptNull(Count),
  structure: OptNull(SessionStructure),
  programme_day_id: OptNull(Id),
  notes: OptNull(Text),
  tags: Opt(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })),
});
export const SessionTemplate = row(SessionTemplateInput);

export const Targets = Type.Object({
  duration_min: OptNull(Type.Number({ minimum: 0 })),
  run_block_sec: OptNull(Count),
  walk_block_sec: OptNull(Count),
  repeats: OptNull(Count),
  vest_kg: OptNull(Kg),
  distance_km: OptNull(Type.Number({ minimum: 0 })),
});

export const PlannedSessionInput = Type.Object({
  date: IsoDate,
  template_id: Id,
  slot: Slot,
  targets: Opt(Targets),
  status: Opt(SessionStatus),
  skip_reason: OptNull(SkipReason),
  edited_by_user: Opt(Type.Boolean()),
  linked_activity_id: OptNull(Id),
  optional: Opt(Type.Boolean()),
});
export const PlannedSession = Type.Required(
  Type.Object({
    id: Type.Integer(),
    week_plan_id: Type.Integer(),
    ...PlannedSessionInput.properties,
  }),
);

/** A planned session with the parts of its template the UI needs. */
export const WeekSession = Type.Object({
  ...PlannedSession.properties,
  template: Type.Object({
    key: Nullable(Type.String()),
    kind: SessionKind,
    name: Type.String(),
    structure: Nullable(SessionStructure),
    programme_day_id: Nullable(Type.Integer()),
  }),
});

export const Week = Type.Object({
  iso_week: IsoWeek,
  start_date: IsoDate,
  end_date: IsoDate,
  generated_at: Nullable(Type.String()),
  reasoning: Type.Array(Type.String()),
  sessions: Type.Array(WeekSession),
});

export const GeneratedWeek = Type.Object({
  /** False for a dry run: nothing was written. */
  persisted: Type.Boolean(),
  week: Week,
  changes: Type.Object({
    created: Type.Integer(),
    updated: Type.Integer(),
    kept: Type.Integer(),
    removed: Type.Integer(),
  }),
});

export const Compliance = Type.Object({
  iso_week: IsoWeek,
  complete: Type.Boolean(),
  required: Type.Array(
    Type.Object({
      template_key: Type.String(),
      planned: Type.Integer(),
      done: Type.Integer(),
      met: Type.Boolean(),
    }),
  ),
  treadmill: Type.Object({
    days_done: Type.Integer(),
    days_needed: Type.Integer(),
    met: Type.Boolean(),
  }),
  optional_planned: Type.Integer(),
  optional_done: Type.Integer(),
  sessions_planned: Type.Integer(),
  sessions_done: Type.Integer(),
});

// 5.3 Log

export const SetLogInput = Type.Object({
  slot_id: Id,
  /** Set when a substitute exercise was done in place of the slot's own. */
  exercise_id: OptNull(Id),
  set_no: Type.Integer({ minimum: 1, maximum: 50 }),
  reps: Type.Integer({ minimum: 0, maximum: 10_000 }),
  load_kg: OptNull(Kg),
  rpe: OptNull(Type.Number({ minimum: 1, maximum: 10 })),
  done_at: OptNull(Type.String({ maxLength: 40 })),
  notes: OptNull(Text),
});
export const SetLog = Type.Required(
  Type.Object({
    id: Type.Integer(),
    strength_session_id: Type.Integer(),
    ...SetLogInput.properties,
  }),
);

export const StrengthSessionInput = Type.Object({
  programme_day_id: Id,
  started_at: OptNull(Type.String({ maxLength: 40 })),
  finished_at: OptNull(Type.String({ maxLength: 40 })),
  partial: Opt(Type.Boolean()),
  sets: Type.Array(SetLogInput, { maxItems: 500 }),
});
export const StrengthSession = Type.Object({
  id: Type.Integer(),
  activity_id: Type.Integer(),
  programme_day_id: Type.Integer(),
  started_at: Nullable(Type.String()),
  finished_at: Nullable(Type.String()),
  partial: Type.Boolean(),
  sets: Type.Array(SetLog),
});

const Hr = Type.Integer({ minimum: 20, maximum: 260 });
const ActivityFields = {
  date: IsoDate,
  kind: SessionKind,
  start_time: OptNull(TimeOfDay),
  duration_min: OptNull(Type.Number({ minimum: 0, maximum: 6000 })),
  distance_km: OptNull(Type.Number({ minimum: 0, maximum: 1000 })),
  source: Opt(ActivitySource),
  garmin_activity_id: OptNull(Type.String({ minLength: 1, maxLength: 64 })),
  avg_hr: OptNull(Hr),
  max_hr: OptNull(Hr),
  elevation_m: OptNull(Type.Number({ minimum: 0, maximum: 30_000 })),
  rpe: OptNull(Type.Integer({ minimum: 1, maximum: 10 })),
  notes: OptNull(Text),
  detail: OptNull(Type.Record(Type.String(), Type.Unknown())),
};
export const ActivityInput = Type.Object({
  ...ActivityFields,
  /** Links the activity to a planned session and marks that session done. */
  planned_session_id: OptNull(Id),
  strength_session: Opt(StrengthSessionInput),
});
export const ActivityPatch = Type.Partial(Type.Object(ActivityFields));
export const Activity = Type.Object({
  ...Type.Required(Type.Object({ id: Type.Integer(), ...ActivityFields })).properties,
  strength_session: Nullable(StrengthSession),
});

const Score5 = Type.Integer({ minimum: 1, maximum: 5 });
export const CheckinInput = Type.Object({
  sleep_quality: OptNull(Score5),
  energy: OptNull(Score5),
  weight_kg: OptNull(Type.Number({ minimum: 20, maximum: 400 })),
  ankle_score: OptNull(Type.Integer({ minimum: 0, maximum: 5 })),
  sunday_got_up: OptNull(Type.Boolean()),
  habits: Opt(Type.Record(Type.String(), Type.Boolean())),
  dismissed_prompts: Opt(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 50 })),
  notes: OptNull(Text),
});
export const Checkin = Type.Object({
  id: Nullable(Type.Integer()),
  date: IsoDate,
  ...Type.Required(CheckinInput).properties,
});

export const MetricInput = Type.Object({
  date: IsoDate,
  metric: Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 50 }),
  value: Type.Number(),
  source: Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 30 }),
});
export const Metric = row(MetricInput);

// 5.4 Strength

export const ExerciseInput = Type.Object({
  name: Name,
  pattern: ExercisePattern,
  equipment: EquipmentTypeSchema,
  unilateral: Opt(Type.Boolean()),
  cues: OptNull(Text),
  video_url: OptNull(Type.String({ maxLength: 500 })),
});
export const Exercise = row(ExerciseInput);

export const ProgrammeSlotInput = Type.Object({
  /** Present when updating an existing slot, so its set history stays attached. */
  id: Opt(Id),
  exercise_id: Id,
  sets: Type.Integer({ minimum: 1, maximum: 20 }),
  reps: OptNull(Type.Integer({ minimum: 1, maximum: 1000 })),
  seconds: OptNull(Type.Integer({ minimum: 1, maximum: 3600 })),
  rest_sec: Type.Integer({ minimum: 0, maximum: 1800 }),
  load_rule: LoadRule,
  increment_kg: OptNull(Kg),
  start_load_kg: OptNull(Kg),
  notes: OptNull(Text),
});
export const ProgrammeSlot = Type.Required(
  Type.Object({
    ...ProgrammeSlotInput.properties,
    id: Type.Integer(),
    programme_day_id: Type.Integer(),
    position: Type.Integer(),
  }),
);
/** The fields of a slot that can be changed on their own, without resending the day. */
export const ProgrammeSlotPatch = Type.Object({
  exercise_id: Opt(Id),
  increment_kg: OptNull(Kg),
  start_load_kg: OptNull(Kg),
  notes: OptNull(Text),
});

/** One past session of a programme day, with its sets. Lists are most recent first. */
export const StrengthHistoryEntry = Type.Object({
  activity_id: Type.Integer(),
  date: IsoDate,
  partial: Type.Boolean(),
  sets: Type.Array(SetLog),
});

export const ProgrammeDayInput = Type.Object({
  name: Name,
  slots: Type.Array(ProgrammeSlotInput, { maxItems: 30 }),
});
export const ProgrammeDay = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
  slots: Type.Array(ProgrammeSlot),
});

// Trends (SPEC 8.6)

export const TrendWeek = Type.Object({
  iso_week: IsoWeek,
  start_date: IsoDate,
  run_minutes: Type.Number(),
  vest_walk_hours: Type.Number(),
  strength_sessions: Type.Integer(),
  complete: Type.Boolean(),
  optional_planned: Type.Integer(),
  optional_done: Type.Integer(),
  /** Mean of the ankle scores entered that week; null when none were. */
  ankle_mean: Nullable(Type.Number()),
  run_rpe_mean: Nullable(Type.Number()),
  /** Heaviest working weight that week for each main lift (slots on the linear rule), by exercise name. */
  lifts: Type.Record(Type.String(), Type.Number()),
});

export const TrendDay = Type.Object({
  date: IsoDate,
  sleep_quality: Nullable(Type.Integer()),
  energy: Nullable(Type.Integer()),
  weight_kg: Nullable(Type.Number()),
  ankle_score: Nullable(Type.Integer()),
  /** Mean RPE of the runs logged that day; null when there were none. */
  run_rpe: Nullable(Type.Number()),
  /** Metrics from other sources (Garmin, if set up), by metric name. */
  metrics: Type.Record(Type.String(), Type.Number()),
});

// Setup, health and misc

export const SetupStatus = Type.Object({
  complete: Type.Boolean(),
  missing: Type.Array(Type.Enum(['athlete', 'a_event', 'fixtures'] as const)),
  data_dir: Type.String(),
});

export const StarterTemplate = Type.Object({
  name: Type.String(),
  title: Type.String(),
  description: Type.String(),
  weeks: Type.Integer(),
  week: Type.Array(
    Type.Object({
      weekday: Type.Integer(),
      slot: Slot,
      template: Type.String(),
      kind: SessionKind,
    }),
  ),
});

export const ApplyTemplateResult = Type.Object({
  template: Type.String(),
  created: Type.Record(Type.String(), Type.Integer()),
  changes: Type.Integer(),
});

export const HealthSchema = Type.Object({
  ok: Type.Boolean(),
  version: Type.String(),
  uptime_s: Type.Integer(),
  db: Type.Object({ ok: Type.Boolean(), migration: Nullable(Type.String()) }),
  backup: Type.Object({ last: Nullable(Type.String()), count: Type.Integer() }),
  garmin: Type.Object({ last_sync: Nullable(Type.String()) }),
});

export const GarminStatus = Type.Object({
  ok: Nullable(Type.Boolean()),
  message: Nullable(Type.String({ maxLength: 500 })),
  at: Nullable(Type.String()),
});

export const ErrorBody = Type.Object({
  statusCode: Type.Integer(),
  error: Type.String(),
  message: Type.String(),
  field: Opt(Type.String()),
});

export type Athlete = Static<typeof Athlete>;
export type AthleteInput = Static<typeof AthleteInput>;
export type Event = Static<typeof Event>;
export type EventInput = Static<typeof EventInput>;
export type Plate = Static<typeof Plate>;
export type Equipment = Static<typeof EquipmentSchema>;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];
export type Fixture = Static<typeof Fixture>;
export type FixtureInput = Static<typeof FixtureInput>;
export type Habit = Static<typeof Habit>;
export type HabitInput = Static<typeof HabitInput>;
export type Block = Static<typeof Block>;
export type BlockInput = Static<typeof BlockInput>;
export type SessionStructure = Static<typeof SessionStructure>;
export type SessionTemplate = Static<typeof SessionTemplate>;
export type SessionTemplateInput = Static<typeof SessionTemplateInput>;
export type SessionKind = (typeof SESSION_KINDS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SkipReason = (typeof SKIP_REASONS)[number];
export type Slot = (typeof SLOTS)[number];
export type Targets = Static<typeof Targets>;
export type PlannedSession = Static<typeof PlannedSession>;
export type PlannedSessionInput = Static<typeof PlannedSessionInput>;
export type WeekSession = Static<typeof WeekSession>;
export type Week = Static<typeof Week>;
export type GeneratedWeek = Static<typeof GeneratedWeek>;
export type Compliance = Static<typeof Compliance>;
export type SetLog = Static<typeof SetLog>;
export type SetLogInput = Static<typeof SetLogInput>;
export type StrengthSession = Static<typeof StrengthSession>;
export type StrengthSessionInput = Static<typeof StrengthSessionInput>;
export type Activity = Static<typeof Activity>;
export type ActivityInput = Static<typeof ActivityInput>;
export type TrendWeek = Static<typeof TrendWeek>;
export type TrendDay = Static<typeof TrendDay>;
export type Checkin = Static<typeof Checkin>;
export type CheckinInput = Static<typeof CheckinInput>;
export type Metric = Static<typeof Metric>;
export type MetricInput = Static<typeof MetricInput>;
export type Exercise = Static<typeof Exercise>;
export type ExerciseInput = Static<typeof ExerciseInput>;
export type ExercisePattern = (typeof EXERCISE_PATTERNS)[number];
export type LoadRule = (typeof LOAD_RULES)[number];
export type ProgrammeSlot = Static<typeof ProgrammeSlot>;
export type ProgrammeSlotInput = Static<typeof ProgrammeSlotInput>;
export type ProgrammeDay = Static<typeof ProgrammeDay>;
export type ProgrammeSlotPatch = Static<typeof ProgrammeSlotPatch>;
export type StrengthHistoryEntry = Static<typeof StrengthHistoryEntry>;
export type ProgrammeDayInput = Static<typeof ProgrammeDayInput>;
export type SetupStatus = Static<typeof SetupStatus>;
export type StarterTemplate = Static<typeof StarterTemplate>;
export type ApplyTemplateResult = Static<typeof ApplyTemplateResult>;
export type Health = Static<typeof HealthSchema>;
export type GarminStatus = Static<typeof GarminStatus>;
export type ErrorBody = Static<typeof ErrorBody>;
