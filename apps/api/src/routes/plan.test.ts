import type { Block, ErrorBody, PlannedSession, SessionTemplate, Week } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers.js';

let t: TestApp;
let walk: SessionTemplate;
let run: SessionTemplate;

beforeAll(async () => {
  t = await makeApp();
  await t.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
  const templates = (await t.call<SessionTemplate[]>('GET', '/session-templates')).body;
  walk = templates.find((s) => s.key === 'vest_walk') as SessionTemplate;
  run = templates.find((s) => s.key === 'midweek_run') as SessionTemplate;
});
afterAll(() => t.close());

describe('blocks', () => {
  it('lists the seeded block with its rules', async () => {
    const res = await t.call<Block[]>('GET', '/blocks');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Block 1: rebuild', purpose: 'rebuild' });
    expect(res.body[0]?.progression_rules).toHaveProperty('midweek_run.start_run_sec', 120);
  });

  it('creates, reads, patches and deletes', async () => {
    const created = await t.call<Block>('POST', '/blocks', {
      name: 'Block 2: base',
      start_date: '2031-03-17',
      end_date: '2031-05-11',
      purpose: 'base',
    });
    expect(created.status).toBe(201);
    expect(created.body.ends_at_event_id).toBeNull();
    expect((await t.call<Block>('GET', `/blocks/${created.body.id}`)).body.name).toBe(
      'Block 2: base',
    );
    const patched = await t.call<Block>('PATCH', `/blocks/${created.body.id}`, {
      end_date: '2031-05-18',
    });
    expect(patched.body.end_date).toBe('2031-05-18');
    expect((await t.call('DELETE', `/blocks/${created.body.id}`)).status).toBe(204);
  });

  it('rejects an end before the start, a bad purpose and an impossible date', async () => {
    const base = { name: 'Bad', start_date: '2031-03-17', end_date: '2031-03-01', purpose: 'base' };
    const order = await t.call<ErrorBody>('POST', '/blocks', base);
    expect(order.status).toBe(400);
    expect(order.body.field).toBe('end_date');

    const purpose = await t.call<ErrorBody>('POST', '/blocks', { ...base, purpose: 'party' });
    expect(purpose.body.field).toBe('purpose');

    const date = await t.call<ErrorBody>('POST', '/blocks', { ...base, start_date: '2031-02-31' });
    expect(date.body.field).toBe('start_date');

    const end = await t.call<ErrorBody>('POST', '/blocks', { ...base, end_date: '2031-04-31' });
    expect(end.body.field).toBe('end_date');
  });

  it('refuses a duplicate name with 409 and an unknown event with 409', async () => {
    const dup = await t.call('POST', '/blocks', {
      name: 'Block 1: rebuild',
      start_date: '2031-06-01',
      end_date: '2031-06-30',
      purpose: 'build',
    });
    expect(dup.status).toBe(409);
    const orphan = await t.call('POST', '/blocks', {
      name: 'To nowhere',
      start_date: '2031-06-01',
      end_date: '2031-06-30',
      purpose: 'build',
      ends_at_event_id: 4242,
    });
    expect(orphan.status).toBe(409);
  });
});

describe('session templates', () => {
  it('creates a template and refuses a duplicate key', async () => {
    const body = {
      key: 'easy_spin',
      kind: 'ride',
      name: 'Easy spin',
      default_duration_min: 30,
      structure: { duration_min: 30 },
      tags: ['recovery'],
    };
    const created = await t.call<SessionTemplate>('POST', '/session-templates', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...body, notes: null, programme_day_id: null });
    expect((await t.call('POST', '/session-templates', body)).status).toBe(409);
  });

  it('rejects an unknown kind', async () => {
    const res = await t.call<ErrorBody>('POST', '/session-templates', {
      kind: 'juggling',
      name: 'Nope',
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('kind');
  });

  it('cannot delete a template that a fixture uses', async () => {
    expect((await t.call('DELETE', `/session-templates/${walk.id}`)).status).toBe(409);
  });
});

describe('weeks and planned sessions', () => {
  it('returns an empty week before anything is planned', async () => {
    const res = await t.call<Week>('GET', '/weeks/2031-W03');
    expect(res.body).toEqual({
      iso_week: '2031-W03',
      start_date: '2031-01-13',
      end_date: '2031-01-19',
      generated_at: null,
      reasoning: [],
      sessions: [],
    });
  });

  it('rejects a week that does not exist', async () => {
    const res = await t.call<ErrorBody>('GET', '/weeks/2031-W60');
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('isoWeek');
    expect((await t.call('GET', '/weeks/next')).status).toBe(400);
  });

  it('creates sessions into the right week and returns them with their template', async () => {
    const a = await t.call<PlannedSession>('POST', '/planned-sessions', {
      date: '2031-01-14',
      template_id: run.id,
      slot: 'am',
      targets: { repeats: 8, run_block_sec: 120, walk_block_sec: 60, duration_min: 34 },
    });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ status: 'planned', edited_by_user: false, optional: false });
    await t.call('POST', '/planned-sessions', {
      date: '2031-01-13',
      template_id: walk.id,
      slot: 'am',
      targets: { duration_min: 60, vest_kg: 20 },
    });

    const week = await t.call<Week>('GET', '/weeks/2031-W03');
    expect(week.body.sessions.map((s) => [s.date, s.template.key])).toEqual([
      ['2031-01-13', 'vest_walk'],
      ['2031-01-14', 'midweek_run'],
    ]);
    expect(week.body.sessions[1]?.template.structure).toMatchObject({ repeats: 8 });
  });

  it('refuses the same template in the same slot on the same day', async () => {
    const res = await t.call('POST', '/planned-sessions', {
      date: '2031-01-14',
      template_id: run.id,
      slot: 'am',
    });
    expect(res.status).toBe(409);
  });

  it('marks a session edited when the user changes its targets, not its status', async () => {
    const all = (await t.call<PlannedSession[]>('GET', '/planned-sessions')).body;
    const session = all.find((s) => s.template_id === run.id) as PlannedSession;

    const skipped = await t.call<PlannedSession>('PATCH', `/planned-sessions/${session.id}`, {
      status: 'skipped',
      skip_reason: 'family',
    });
    expect(skipped.body).toMatchObject({ status: 'skipped', edited_by_user: false });

    const edited = await t.call<PlannedSession>('PATCH', `/planned-sessions/${session.id}`, {
      targets: { repeats: 6, run_block_sec: 120, walk_block_sec: 60 },
    });
    expect(edited.body.edited_by_user).toBe(true);
    expect(edited.body.targets.repeats).toBe(6);
  });

  it('moves a session to another week when its date changes', async () => {
    const all = (await t.call<PlannedSession[]>('GET', '/planned-sessions')).body;
    const session = all.find((s) => s.template_id === walk.id) as PlannedSession;
    const moved = await t.call<PlannedSession>('PATCH', `/planned-sessions/${session.id}`, {
      date: '2031-01-20',
    });
    expect(moved.body.week_plan_id).not.toBe(session.week_plan_id);
    expect((await t.call<Week>('GET', '/weeks/2031-W04')).body.sessions).toHaveLength(1);
  });

  it('rejects a bad date, slot or skip reason, naming the field', async () => {
    const base = { date: '2031-01-15', template_id: walk.id, slot: 'am' };
    for (const [field, value] of [
      ['date', '2031-02-30'],
      ['slot', 'noon'],
      ['skip_reason', 'bored'],
    ] as const) {
      const res = await t.call<ErrorBody>('POST', '/planned-sessions', { ...base, [field]: value });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe(field);
    }
  });

  it('deletes a session', async () => {
    const all = (await t.call<PlannedSession[]>('GET', '/planned-sessions')).body;
    const id = (all[0] as PlannedSession).id;
    expect((await t.call('DELETE', `/planned-sessions/${id}`)).status).toBe(204);
    expect((await t.call('GET', `/planned-sessions/${id}`)).status).toBe(404);
  });
});
