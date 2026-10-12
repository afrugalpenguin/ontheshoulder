import type {
  Block,
  Compliance,
  ErrorBody,
  GeneratedWeek,
  PlannedSession,
  Week,
  WeekSession,
} from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runScheduledGeneration } from '../plan/scheduler.js';
import { ATHLETE, makeApp, setRunMode, type TestApp } from '../test/helpers.js';

// Route-level tests for generation, compliance, rules validation and the scheduler.

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
  await t.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
  // These are the run-walk ladder's tests; the time box has its own below.
  await setRunMode(t, 'runwalk');
});
afterAll(() => t.close());

const find = (week: Week, key: string) =>
  week.sessions.find((s) => s.template.key === key) as WeekSession;

describe('POST /weeks/:isoWeek/generate', () => {
  it('generates the first week of the block from the starter template', async () => {
    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W02/generate');
    expect(res.status).toBe(200);
    expect(res.body.changes).toEqual({ created: 12, updated: 0, kept: 0, removed: 0 });
    expect(res.body.week.sessions).toHaveLength(12);
    expect(res.body.week.generated_at).toMatch(/^\d{4}-/);
    expect(res.body.week.reasoning).toEqual([
      'Midweek run: 8 x 120s run / 60s walk, the starting point.',
      'Long run: 10 x 120s run / 60s walk, the starting point.',
      'Vest walks: 20kg.',
    ]);
    expect(find(res.body.week, 'long_run')).toMatchObject({ optional: true, date: '2031-01-12' });
    expect(res.body.week.sessions.filter((s) => s.optional)).toHaveLength(1);
  });

  it('is idempotent while nothing has been touched', async () => {
    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W02/generate');
    expect(res.body.changes).toEqual({ created: 0, updated: 12, kept: 0, removed: 0 });
  });

  it('progresses the next week from this week, done or not', async () => {
    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W03/generate');
    expect(find(res.body.week, 'midweek_run').targets).toMatchObject({ run_block_sec: 150 });
    expect(find(res.body.week, 'long_run').targets).toMatchObject({ repeats: 13 });
  });

  it('uses the saved vest weight once kit exists', async () => {
    await t.call('PUT', '/equipment', {
      bar_kg: null,
      plates: [],
      dumbbells: [],
      kettlebells: [],
      vest_kg: 15,
    });
    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W03/generate');
    expect(find(res.body.week, 'vest_walk').targets.vest_kg).toBe(15);
  });

  it('keeps a PATCHed session through a forced regenerate, and says so', async () => {
    const before = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    const run = find(before, 'midweek_run');
    const patched = await t.call<PlannedSession>('PATCH', `/planned-sessions/${run.id}`, {
      targets: { repeats: 6, run_block_sec: 120, walk_block_sec: 60, duration_min: 28 },
    });
    expect(patched.body.edited_by_user).toBe(true);

    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W02/generate?force=true');
    expect(res.body.changes).toEqual({ created: 0, updated: 11, kept: 1, removed: 0 });
    expect(find(res.body.week, 'midweek_run').targets.repeats).toBe(6);
    expect(res.body.week.reasoning).toContain('Midweek run on 2031-01-07: kept your edit.');
  });

  it('refuses with 409 once a session is done or skipped, unless forced', async () => {
    const week = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    const walk = find(week, 'vest_walk');
    const activity = await t.call<{ id: number }>('POST', '/activities', {
      date: walk.date,
      kind: 'walk_vest',
      duration_min: 60,
      planned_session_id: walk.id,
    });

    const refused = await t.call<ErrorBody>('POST', '/weeks/2031-W02/generate');
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('force');

    const forced = await t.call<GeneratedWeek>('POST', '/weeks/2031-W02/generate?force=true');
    expect(forced.status).toBe(200);
    expect(forced.body.changes).toEqual({ created: 0, updated: 10, kept: 2, removed: 0 });
    const kept = find(forced.body.week, 'vest_walk');
    expect(kept).toMatchObject({ status: 'done', linked_activity_id: activity.body.id });
    expect(forced.body.week.reasoning).toContain(
      'Vest walk on 2031-01-06: kept, it has a logged activity.',
    );
  });

  it('generates fixtures without progression when no block covers the week', async () => {
    const res = await t.call<GeneratedWeek>('POST', '/weeks/2032-W20/generate');
    expect(res.body.week.reasoning[0]).toBe(
      'No block covers this week: fixtures only, no progression.',
    );
    expect(res.body.week.sessions).toHaveLength(12);
    expect(res.body.week.sessions.some((s) => s.optional)).toBe(false);
  });

  it('rejects a week that does not exist', async () => {
    const res = await t.call<ErrorBody>('POST', '/weeks/2031-W99/generate');
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('isoWeek');
  });
});

describe('GET /weeks/:isoWeek/compliance', () => {
  const log = async (week: Week, key: string, index = 0) => {
    const session = week.sessions.filter((s) => s.template.key === key)[index] as WeekSession;
    await t.call('POST', '/activities', {
      date: session.date,
      kind: session.template.kind,
      planned_session_id: session.id,
    });
  };

  it('counts up to complete, with the optional Sunday kept separate', async () => {
    const start = await t.call<Compliance>('GET', '/weeks/2031-W02/compliance');
    expect(start.body).toMatchObject({
      iso_week: '2031-W02',
      complete: false,
      treadmill: { days_done: 1, days_needed: 4, met: false },
      optional_planned: 1,
      optional_done: 0,
    });

    const week = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    await log(week, 'midweek_run');
    await log(week, 'vest_walk', 1);
    await log(week, 'vest_walk', 2);
    await log(week, 'strength_a');
    const almost = await t.call<Compliance>('GET', '/weeks/2031-W02/compliance');
    expect(almost.body).toMatchObject({ complete: false, treadmill: { days_done: 4, met: true } });

    await log(week, 'strength_b');
    const complete = await t.call<Compliance>('GET', '/weeks/2031-W02/compliance');
    expect(complete.body).toMatchObject({ complete: true, optional_done: 0 });

    // Skipping Sunday with a reason leaves the week complete.
    const sunday = find(week, 'long_run');
    await t.call('PATCH', `/planned-sessions/${sunday.id}`, {
      status: 'skipped',
      skip_reason: 'family',
    });
    const skipped = await t.call<Compliance>('GET', '/weeks/2031-W02/compliance');
    expect(skipped.body).toMatchObject({ complete: true, optional_planned: 1, optional_done: 0 });
  });

  it('reports an empty week as not complete', async () => {
    const res = await t.call<Compliance>('GET', '/weeks/2031-W08/compliance');
    expect(res.body).toMatchObject({ complete: false, sessions_planned: 0 });
    expect((await t.call('GET', '/weeks/2031-W99/compliance')).status).toBe(400);
  });
});

describe('block rules validation', () => {
  it('rejects malformed rules with 400 naming the bad key', async () => {
    const block = (await t.call<Block[]>('GET', '/blocks')).body[0] as Block;
    const rules = structuredClone(block.progression_rules) as {
      midweek_run: Record<string, unknown>;
    };
    rules.midweek_run.run_sec_incremnt = 30;
    delete rules.midweek_run.run_sec_increment;

    const res = await t.call<ErrorBody>('PATCH', `/blocks/${block.id}`, {
      progression_rules: rules,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('progression_rules/midweek_run/run_sec_incremnt');
    expect(res.body.message).toContain('is not a known rule key');

    const created = await t.call<ErrorBody>('POST', '/blocks', {
      name: 'Bad rules',
      start_date: '2031-06-02',
      end_date: '2031-06-29',
      purpose: 'base',
      progression_rules: { vest: { default_kg: 'heavy', unloaded_weekdays: [] } },
    });
    expect(created.status).toBe(400);
    expect(created.body.field).toBe('progression_rules/vest/default_kg');
  });

  it('accepts valid rules and applies them to the next generation', async () => {
    const block = (await t.call<Block[]>('GET', '/blocks')).body[0] as Block;
    const rules = structuredClone(block.progression_rules) as {
      long_run: { repeats_increment: number };
    };
    rules.long_run.repeats_increment = 2;
    const saved = await t.call<Block>('PATCH', `/blocks/${block.id}`, { progression_rules: rules });
    expect(saved.status).toBe(200);

    const res = await t.call<GeneratedWeek>('POST', '/weeks/2031-W04/generate');
    expect(find(res.body.week, 'long_run').targets.repeats).toBe(15);
  });
});

describe('scheduled generation', () => {
  it('does nothing before setup, then plans next week once and only once', async () => {
    const fresh = await makeApp();
    const { db, log } = fresh.app;
    // Sunday 2031-01-12 at 21:05 local: next week (2031-W03) is due.
    const sundayNight = new Date(2031, 0, 12, 21, 5);

    expect(runScheduledGeneration(db, log, sundayNight)).toBeNull();

    await fresh.call('PUT', '/athlete', ATHLETE);
    await fresh.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
    expect(runScheduledGeneration(db, log, new Date(2031, 0, 12, 20, 0))).toBeNull();
    expect(runScheduledGeneration(db, log, sundayNight)).toBe('2031-W03');
    expect((await fresh.call<Week>('GET', '/weeks/2031-W03')).body.sessions).toHaveLength(12);

    // A restart later the same evening finds the marker and does not run again.
    expect(runScheduledGeneration(db, log, new Date(2031, 0, 12, 22, 0))).toBeNull();
    await fresh.close();
  });

  it('follows the time in athlete settings', async () => {
    const fresh = await makeApp();
    const { db, log } = fresh.app;
    await fresh.call('PUT', '/athlete', { ...ATHLETE, plan_weekday: 5, plan_time: '18:30' });
    await fresh.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
    expect(runScheduledGeneration(db, log, new Date(2031, 0, 10, 18, 29))).toBeNull();
    expect(runScheduledGeneration(db, log, new Date(2031, 0, 10, 18, 30))).toBe('2031-W03');
    await fresh.close();
  });

  it('leaves a week that is already in use alone, and still marks it handled', async () => {
    const fresh = await makeApp();
    const { db, log } = fresh.app;
    await fresh.call('PUT', '/athlete', ATHLETE);
    await fresh.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
    const week = (await fresh.call<GeneratedWeek>('POST', '/weeks/2031-W03/generate')).body.week;
    const first = week.sessions[0] as WeekSession;
    await fresh.call('PATCH', `/planned-sessions/${first.id}`, { status: 'skipped' });

    const sundayNight = new Date(2031, 0, 12, 21, 5);
    expect(runScheduledGeneration(db, log, sundayNight)).toBe('2031-W03');
    const after = (await fresh.call<Week>('GET', '/weeks/2031-W03')).body;
    expect(after.sessions.find((s) => s.id === first.id)?.status).toBe('skipped');
    expect(runScheduledGeneration(db, log, sundayNight)).toBeNull();
    await fresh.close();
  });
});

describe('runs as a time box, the starter default', () => {
  let fresh: TestApp;
  beforeAll(async () => {
    fresh = await makeApp();
    await fresh.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
  });
  afterAll(() => fresh.close());

  const runTargets = (week: Week) =>
    ['midweek_run', 'long_run'].map((key) => find(week, key).targets);

  it('generates the same run targets two weeks running', async () => {
    const week1 = (await fresh.call<GeneratedWeek>('POST', '/weeks/2031-W02/generate')).body.week;
    const week2 = (await fresh.call<GeneratedWeek>('POST', '/weeks/2031-W03/generate')).body.week;
    expect(runTargets(week1)).toEqual([
      { min_min: 40, max_min: 50 },
      { min_min: 50, max_min: 60 },
    ]);
    expect(runTargets(week2)).toEqual(runTargets(week1));
    expect(week2.reasoning).toContain(
      'Midweek run: 40 to 50 min at your own pace, the same every week.',
    );
  });

  it('refuses an unknown run mode on a block, naming the key', async () => {
    const block = (await fresh.call<Block[]>('GET', '/blocks')).body[0] as Block;
    const res = await fresh.call<ErrorBody>('PATCH', `/blocks/${block.id}`, {
      progression_rules: { ...(block.progression_rules as object), runs: { mode: 'tempo' } },
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('progression_rules/runs/mode');
  });

  it('brings the ladder back when the block is switched to runwalk', async () => {
    await setRunMode(fresh, 'runwalk');
    const res = await fresh.call<GeneratedWeek>('POST', '/weeks/2031-W03/generate');
    expect(runTargets(res.body.week)).toEqual([
      { repeats: 8, run_block_sec: 120, walk_block_sec: 60, duration_min: 34 },
      { repeats: 10, run_block_sec: 120, walk_block_sec: 60, duration_min: 40 },
    ]);
    const next = await fresh.call<GeneratedWeek>('POST', '/weeks/2031-W04/generate');
    expect(find(next.body.week, 'midweek_run').targets).toMatchObject({ run_block_sec: 150 });
    expect(find(next.body.week, 'long_run').targets).toMatchObject({ repeats: 13 });
  });
});
