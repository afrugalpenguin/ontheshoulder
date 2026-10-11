import { describe, expect, it } from 'vitest';
import { validateRules } from './rules.js';

const VALID = {
  midweek_run: {
    template_key: 'midweek_run',
    warmup_min: 5,
    cooldown_min: 5,
    repeats: 8,
    walk_sec: 60,
    start_run_sec: 120,
    run_sec_increment: 30,
    continuous_at_run_sec: 300,
    continuous_start_min: 25,
    continuous_increment_min: 5,
    continuous_cap_min: 45,
  },
  long_run: {
    template_key: 'long_run',
    warmup_min: 5,
    cooldown_min: 5,
    run_sec: 120,
    walk_sec: 60,
    start_repeats: 10,
    repeats_increment: 3,
    repeats_cap: 30,
  },
  vest: { default_kg: 20, unloaded_weekdays: [5] },
  compliance: {
    required_templates: ['midweek_run', 'strength_a', 'strength_b'],
    treadmill: { slot: 'am', weekdays: [1, 2, 3, 4, 5], min_days: 4 },
    optional_weekdays: [7],
  },
};

const clone = () => structuredClone(VALID) as Record<string, Record<string, unknown>>;

describe('validateRules', () => {
  it('accepts the full rule set and an empty one', () => {
    expect(validateRules(VALID)).toEqual({ ok: true, rules: VALID });
    expect(validateRules({})).toEqual({ ok: true, rules: {} });
  });

  it('names an unknown key inside a section', () => {
    const rules = clone();
    (rules.midweek_run as Record<string, unknown>).run_sec_incremnt = 30;
    expect(validateRules(rules)).toEqual({
      ok: false,
      key: 'midweek_run/run_sec_incremnt',
      message: 'is not a known rule key',
    });
  });

  it('names an unknown top-level section', () => {
    expect(validateRules({ ...VALID, hill_reps: {} })).toMatchObject({
      ok: false,
      key: 'hill_reps',
    });
  });

  it('names a missing key', () => {
    const rules = clone();
    delete (rules.long_run as Record<string, unknown>).repeats_cap;
    expect(validateRules(rules)).toEqual({
      ok: false,
      key: 'long_run/repeats_cap',
      message: 'is required',
    });
  });

  it('names a key with a value of the wrong type or range', () => {
    const wrongType = clone();
    (wrongType.vest as Record<string, unknown>).default_kg = 'twenty';
    expect(validateRules(wrongType)).toMatchObject({ ok: false, key: 'vest/default_kg' });

    const range = clone();
    (range.compliance as { treadmill: Record<string, unknown> }).treadmill.min_days = 9;
    expect(validateRules(range)).toMatchObject({ ok: false, key: 'compliance/treadmill/min_days' });
  });

  it('rejects values that are not an object', () => {
    expect(validateRules('fast')).toMatchObject({ ok: false, key: '(root)' });
    expect(validateRules(null)).toMatchObject({ ok: false });
  });
});

describe('run mode', () => {
  it.each(['timebox', 'runwalk'])('accepts %s', (mode) => {
    const rules = { ...VALID, runs: { mode } };
    expect(validateRules(rules)).toEqual({ ok: true, rules });
  });

  it('accepts the mode on its own, with no ladder to fall back on', () => {
    expect(validateRules({ runs: { mode: 'timebox' } }).ok).toBe(true);
  });

  it('rejects an unknown mode, naming the key', () => {
    const result = validateRules({ ...VALID, runs: { mode: 'fartlek' } });
    expect(result).toMatchObject({ ok: false, key: 'runs/mode' });
  });

  it('rejects a missing mode and an unknown key beside it', () => {
    expect(validateRules({ runs: {} })).toMatchObject({ ok: false, key: 'runs/mode' });
    expect(validateRules({ runs: { mode: 'timebox', pace: 'easy' } })).toMatchObject({
      ok: false,
      key: 'runs/pace',
      message: 'is not a known rule key',
    });
  });
});
