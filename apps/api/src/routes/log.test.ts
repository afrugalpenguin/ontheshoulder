import type {
  Activity,
  Checkin,
  ErrorBody,
  Metric,
  PlannedSession,
  ProgrammeDay,
  SessionTemplate,
} from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers.js';

let t: TestApp;
let walk: SessionTemplate;
let dayA: ProgrammeDay;

beforeAll(async () => {
  t = await makeApp();
  await t.call('POST', '/setup/apply-template/rebuild-100');
  const templates = (await t.call<SessionTemplate[]>('GET', '/session-templates')).body;
  walk = templates.find((s) => s.key === 'vest_walk') as SessionTemplate;
  dayA = (await t.call<ProgrammeDay[]>('GET', '/programme-days')).body[0] as ProgrammeDay;
});
afterAll(() => t.close());

describe('activities', () => {
  it('logs a vest walk against a planned session and marks it done', async () => {
    const planned = await t.call<PlannedSession>('POST', '/planned-sessions', {
      date: '2031-01-13',
      template_id: walk.id,
      slot: 'am',
      targets: { duration_min: 60, vest_kg: 20 },
    });
    const created = await t.call<Activity>('POST', '/activities', {
      date: '2031-01-13',
      kind: 'walk_vest',
      duration_min: 58,
      rpe: 3,
      detail: { vest_kg: 20 },
      planned_session_id: planned.body.id,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      source: 'manual',
      duration_min: 58,
      detail: { vest_kg: 20 },
      strength_session: null,
    });

    const after = await t.call<PlannedSession>('GET', `/planned-sessions/${planned.body.id}`);
    expect(after.body).toMatchObject({ status: 'done', linked_activity_id: created.body.id });

    // Deleting the activity puts the session back to planned.
    expect((await t.call('DELETE', `/activities/${created.body.id}`)).status).toBe(204);
    const reverted = await t.call<PlannedSession>('GET', `/planned-sessions/${planned.body.id}`);
    expect(reverted.body).toMatchObject({ status: 'planned', linked_activity_id: null });
  });

  it('stores a strength session with its sets, nested in the activity', async () => {
    const [squat, rdl] = dayA.slots;
    if (!squat || !rdl) throw new Error('seed has no slots');
    const created = await t.call<Activity>('POST', '/activities', {
      date: '2031-01-15',
      kind: 'strength',
      duration_min: 40,
      strength_session: {
        programme_day_id: dayA.id,
        started_at: '2031-01-15T18:00:00.000Z',
        finished_at: '2031-01-15T18:40:00.000Z',
        sets: [
          { slot_id: squat.id, set_no: 1, reps: 5, load_kg: 60 },
          { slot_id: squat.id, set_no: 2, reps: 5, load_kg: 60, rpe: 7.5 },
          { slot_id: rdl.id, set_no: 1, reps: 8, load_kg: 50, notes: 'steady' },
        ],
      },
    });
    expect(created.status).toBe(201);
    const session = created.body.strength_session;
    expect(session).toMatchObject({ programme_day_id: dayA.id, partial: false });
    expect(session?.sets).toHaveLength(3);
    expect(session?.sets[1]).toMatchObject({ set_no: 2, reps: 5, load_kg: 60, rpe: 7.5 });
    expect(created.body.detail).toEqual({ strength_session_id: session?.id });

    const read = await t.call<Activity>('GET', `/activities/${created.body.id}`);
    expect(read.body).toEqual(created.body);
  });

  it('filters the list by date range and kind', async () => {
    await t.call('POST', '/activities', { date: '2031-01-20', kind: 'run', duration_min: 34 });
    await t.call('POST', '/activities', { date: '2031-01-22', kind: 'run', duration_min: 36 });
    const all = await t.call<Activity[]>('GET', '/activities');
    expect(all.body).toHaveLength(3);
    const runs = await t.call<Activity[]>('GET', '/activities?kind=run&from=2031-01-21');
    expect(runs.body.map((a) => a.date)).toEqual(['2031-01-22']);
    const early = await t.call<Activity[]>('GET', '/activities?to=2031-01-20');
    expect(early.body.map((a) => a.kind)).toEqual(['strength', 'run']);
  });

  it('patches an activity', async () => {
    const run = (await t.call<Activity[]>('GET', '/activities?kind=run')).body[0] as Activity;
    const patched = await t.call<Activity>('PATCH', `/activities/${run.id}`, {
      rpe: 6,
      notes: 'felt fine',
    });
    expect(patched.body).toMatchObject({ rpe: 6, notes: 'felt fine', duration_min: 34 });
    expect((await t.call<Activity>('PATCH', `/activities/${run.id}`, {})).body.rpe).toBe(6);
  });

  it('rejects bad input, naming the field', async () => {
    const base = { date: '2031-01-20', kind: 'run' };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, rpe: 11 }, 'rpe'],
      [{ ...base, date: '2031-02-30' }, 'date'],
      [{ ...base, kind: 'hop' }, 'kind'],
      [{ kind: 'run' }, 'date'],
      [{ ...base, planned_session_id: 9999 }, 'planned_session_id'],
      [
        { ...base, kind: 'strength', strength_session: { programme_day_id: 9999, sets: [] } },
        'strength_session/programme_day_id',
      ],
    ];
    for (const [body, field] of cases) {
      const res = await t.call<ErrorBody>('POST', '/activities', body);
      expect(res.status, field).toBe(400);
      expect(res.body.field).toBe(field);
    }
    const run = (await t.call<Activity[]>('GET', '/activities?kind=run')).body[0] as Activity;
    const patch = await t.call<ErrorBody>('PATCH', `/activities/${run.id}`, { date: '2031-02-30' });
    expect(patch.body.field).toBe('date');
  });

  it('refuses the same garmin activity id twice with 409', async () => {
    const body = { date: '2031-01-21', kind: 'run', source: 'garmin', garmin_activity_id: 'g-1' };
    expect((await t.call('POST', '/activities', body)).status).toBe(201);
    expect((await t.call('POST', '/activities', body)).status).toBe(409);
  });

  it('returns 404 for an unknown activity', async () => {
    expect((await t.call('GET', '/activities/9999')).status).toBe(404);
    expect((await t.call('PATCH', '/activities/9999', { rpe: 5 })).status).toBe(404);
    expect((await t.call('DELETE', '/activities/9999')).status).toBe(404);
  });
});

describe('daily check-in', () => {
  it('returns an empty check-in for a day with none', async () => {
    const res = await t.call<Checkin>('GET', '/checkins/2031-01-13');
    expect(res.body).toEqual({
      id: null,
      date: '2031-01-13',
      sleep_quality: null,
      energy: null,
      weight_kg: null,
      ankle_score: null,
      sunday_got_up: null,
      habits: {},
      dismissed_prompts: [],
      notes: null,
    });
  });

  it('merges separate saves and mirrors weight into body metrics', async () => {
    const tick = await t.call<Checkin>('PUT', '/checkins/2031-01-13', {
      habits: { protein_shake: true },
    });
    expect(tick.body).toMatchObject({ sleep_quality: null, habits: { protein_shake: true } });

    const full = await t.call<Checkin>('PUT', '/checkins/2031-01-13', {
      sleep_quality: 4,
      energy: 3,
      weight_kg: 80.5,
      ankle_score: 1,
      habits: { alcohol_free: true },
    });
    expect(full.body).toMatchObject({
      id: tick.body.id,
      sleep_quality: 4,
      energy: 3,
      weight_kg: 80.5,
      habits: { protein_shake: true, alcohol_free: true },
    });

    const metrics = await t.call<Metric[]>('GET', '/metrics?metric=weight_kg');
    expect(metrics.body).toMatchObject([
      { date: '2031-01-13', metric: 'weight_kg', value: 80.5, source: 'checkin' },
    ]);

    await t.call('PUT', '/checkins/2031-01-13', { weight_kg: 80.1 });
    expect((await t.call<Metric[]>('GET', '/metrics?metric=weight_kg')).body[0]?.value).toBe(80.1);

    await t.call('PUT', '/checkins/2031-01-13', { weight_kg: null });
    expect((await t.call<Metric[]>('GET', '/metrics?metric=weight_kg')).body).toEqual([]);
  });

  it('records dismissed prompts', async () => {
    const res = await t.call<Checkin>('PUT', '/checkins/2031-01-14', {
      dismissed_prompts: ['protein_shake'],
    });
    expect(res.body.dismissed_prompts).toEqual(['protein_shake']);
  });

  it('accepts the got-up toggle only on a Sunday', async () => {
    const sunday = await t.call<Checkin>('PUT', '/checkins/2031-01-19', { sunday_got_up: true });
    expect(sunday.body.sunday_got_up).toBe(true);
    const monday = await t.call<ErrorBody>('PUT', '/checkins/2031-01-20', { sunday_got_up: true });
    expect(monday.status).toBe(400);
    expect(monday.body.field).toBe('sunday_got_up');
  });

  it('rejects out-of-range scores and impossible dates', async () => {
    const sleep = await t.call<ErrorBody>('PUT', '/checkins/2031-01-13', { sleep_quality: 6 });
    expect(sleep.status).toBe(400);
    expect(sleep.body.field).toBe('sleep_quality');
    const ankle = await t.call<ErrorBody>('PUT', '/checkins/2031-01-13', { ankle_score: -1 });
    expect(ankle.body.field).toBe('ankle_score');
    expect((await t.call('PUT', '/checkins/2031-02-30', { energy: 3 })).status).toBe(400);
    expect((await t.call('GET', '/checkins/2031-02-30')).status).toBe(400);
    expect((await t.call('GET', '/checkins/yesterday')).status).toBe(400);
  });
});

describe('body metrics', () => {
  it('upserts on date, metric and source, and filters by range', async () => {
    const body = { date: '2031-01-10', metric: 'resting_hr', value: 52, source: 'manual' };
    expect((await t.call<Metric>('PUT', '/metrics', body)).status).toBe(200);
    const again = await t.call<Metric>('PUT', '/metrics', { ...body, value: 50 });
    expect(again.body.value).toBe(50);
    await t.call('PUT', '/metrics', { ...body, date: '2031-01-12', value: 51 });

    const all = await t.call<Metric[]>('GET', '/metrics?metric=resting_hr');
    expect(all.body.map((m) => [m.date, m.value])).toEqual([
      ['2031-01-10', 50],
      ['2031-01-12', 51],
    ]);
    const ranged = await t.call<Metric[]>('GET', '/metrics?from=2031-01-11&to=2031-01-12');
    expect(ranged.body).toHaveLength(1);
  });

  it('rejects a bad metric name or date', async () => {
    const name = await t.call<ErrorBody>('PUT', '/metrics', {
      date: '2031-01-10',
      metric: 'Resting HR',
      value: 1,
      source: 'manual',
    });
    expect(name.status).toBe(400);
    expect(name.body.field).toBe('metric');
    const date = await t.call<ErrorBody>('PUT', '/metrics', {
      date: '2031-02-30',
      metric: 'resting_hr',
      value: 1,
      source: 'manual',
    });
    expect(date.body.field).toBe('date');
  });
});
