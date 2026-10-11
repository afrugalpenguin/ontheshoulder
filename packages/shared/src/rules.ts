import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { Slot } from './schemas.js';

/**
 * Progression rules stored as JSON on a block (SPEC 6.3). Every section is
 * optional so a later block can carry only what it uses. Unknown keys are
 * rejected so a typo cannot silently switch a rule off.
 */

const strict = { additionalProperties: false };
const Minutes = Type.Integer({ minimum: 0, maximum: 600 });
const Seconds = Type.Integer({ minimum: 0, maximum: 7200 });
const Repeats = Type.Integer({ minimum: 1, maximum: 200 });
const TemplateKey = Type.String({ pattern: '^[a-z][a-z0-9_]*$', maxLength: 50 });
const Weekdays = Type.Array(Type.Integer({ minimum: 1, maximum: 7 }), { maxItems: 7 });

export const MidweekRunRule = Type.Object(
  {
    template_key: TemplateKey,
    warmup_min: Minutes,
    cooldown_min: Minutes,
    repeats: Repeats,
    walk_sec: Seconds,
    start_run_sec: Type.Integer({ minimum: 1, maximum: 7200 }),
    run_sec_increment: Seconds,
    /** The week run_sec would reach this is the first continuous run instead. */
    continuous_at_run_sec: Type.Integer({ minimum: 1, maximum: 7200 }),
    continuous_start_min: Type.Integer({ minimum: 1, maximum: 600 }),
    continuous_increment_min: Minutes,
    continuous_cap_min: Type.Integer({ minimum: 1, maximum: 600 }),
  },
  strict,
);

export const LongRunRule = Type.Object(
  {
    template_key: TemplateKey,
    warmup_min: Minutes,
    cooldown_min: Minutes,
    run_sec: Type.Integer({ minimum: 1, maximum: 7200 }),
    walk_sec: Seconds,
    start_repeats: Repeats,
    repeats_increment: Type.Integer({ minimum: 0, maximum: 50 }),
    repeats_cap: Repeats,
  },
  strict,
);

/** The two ways a run can be planned. */
export const RUN_MODES = ['timebox', 'runwalk'] as const;

/**
 * How runs are planned. `timebox` passes each run template's time box through
 * unchanged, week after week. `runwalk` applies the run-walk ladder in
 * `midweek_run` and `long_run`. Without this section the ladder applies, as it
 * did before the mode existed.
 */
export const RunsRule = Type.Object({ mode: Type.Enum(RUN_MODES) }, strict);

export const VestRule = Type.Object(
  {
    /** Used when no kit has been saved. Saved kit always wins. */
    default_kg: Type.Number({ minimum: 0, maximum: 100 }),
    unloaded_weekdays: Weekdays,
  },
  strict,
);

export const ComplianceRule = Type.Object(
  {
    /** Template keys that must each have a done session for the week to be complete. */
    required_templates: Type.Array(TemplateKey, { maxItems: 20 }),
    treadmill: Type.Object(
      {
        slot: Slot,
        weekdays: Weekdays,
        min_days: Type.Integer({ minimum: 0, maximum: 7 }),
      },
      strict,
    ),
    /** Sessions on these weekdays are optional: reported, never required. */
    optional_weekdays: Weekdays,
  },
  strict,
);

export const ProgressionRules = Type.Object(
  {
    runs: Type.Optional(RunsRule),
    midweek_run: Type.Optional(MidweekRunRule),
    long_run: Type.Optional(LongRunRule),
    vest: Type.Optional(VestRule),
    compliance: Type.Optional(ComplianceRule),
  },
  strict,
);

export type RunsRule = Static<typeof RunsRule>;
export type MidweekRunRule = Static<typeof MidweekRunRule>;
export type LongRunRule = Static<typeof LongRunRule>;
export type VestRule = Static<typeof VestRule>;
export type ComplianceRule = Static<typeof ComplianceRule>;
export type ProgressionRules = Static<typeof ProgressionRules>;

export type RulesValidation =
  { ok: true; rules: ProgressionRules } | { ok: false; key: string; message: string };

interface ValueError {
  keyword: string;
  instancePath: string;
  message: string;
  params: { additionalProperties?: string[]; requiredProperties?: string[] };
}

/**
 * Checks rules JSON against the schema. On failure `key` is the path of the
 * first bad key, for example "midweek_run/run_sec_incremnt".
 */
export function validateRules(value: unknown): RulesValidation {
  if (Value.Check(ProgressionRules, value)) return { ok: true, rules: value };
  const errors = [...Value.Errors(ProgressionRules, value)] as ValueError[];
  // An unknown or missing key is the most useful thing to name; otherwise the first error.
  const error =
    errors.find((e) => e.keyword === 'additionalProperties') ??
    errors.find((e) => e.keyword === 'required') ??
    (errors[0] as ValueError);
  const base = error.instancePath.replace(/^\//, '');
  const extra = error.params.additionalProperties?.[0] ?? error.params.requiredProperties?.[0];
  const key = [base, extra].filter(Boolean).join('/');
  const message =
    error.keyword === 'additionalProperties'
      ? 'is not a known rule key'
      : error.keyword === 'required'
        ? 'is required'
        : error.message;
  return { ok: false, key: key || '(root)', message };
}
