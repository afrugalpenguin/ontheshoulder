import type {
  ApplyTemplateResult,
  Equipment,
  ErrorBody,
  Event,
  Fixture,
  Habit,
  SessionTemplate,
  SetupStatus,
  StarterTemplate,
} from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ATHLETE, A_EVENT, KIT, makeApp, type TestApp } from '../test/helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(() => t.close());

describe('setup status transitions', () => {
  it('reports everything missing on a fresh database', async () => {
    const res = await t.call<SetupStatus>('GET', '/setup/status');
    expect(res.body).toEqual({
      complete: false,
      missing: ['athlete', 'a_event', 'fixtures'],
      data_dir: t.dataDir,
    });
  });

  it('has no athlete yet', async () => {
    expect((await t.call('GET', '/athlete')).status).toBe(404);
  });

  it('saves the athlete, then updates the same row', async () => {
    const created = await t.call<{ id: number; timezone: string }>('PUT', '/athlete', ATHLETE);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ display_name: 'Test Runner', units: 'metric' });
    const updated = await t.call<{ id: number; timezone: string }>('PUT', '/athlete', {
      ...ATHLETE,
      timezone: 'Etc/UTC',
    });
    expect(updated.body.id).toBe(created.body.id);
    expect((await t.call<{ timezone: string }>('GET', '/athlete')).body.timezone).toBe('Etc/UTC');
    const status = await t.call<SetupStatus>('GET', '/setup/status');
    expect(status.body.missing).toEqual(['a_event', 'fixtures']);
  });

  it('rejects an athlete without a name, naming the field', async () => {
    const res = await t.call<ErrorBody>('PUT', '/athlete', {});
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('display_name');
  });

  it('accepts one A event and refuses a second with 409', async () => {
    const first = await t.call<Event>('POST', '/events', A_EVENT);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ priority: 'A', status: 'planned', date_confirmed: false });

    const second = await t.call<ErrorBody>('POST', '/events', { ...A_EVENT, name: 'Example 50' });
    expect(second.status).toBe(409);
    expect(second.body.field).toBe('priority');

    const status = await t.call<SetupStatus>('GET', '/setup/status');
    expect(status.body.missing).toEqual(['fixtures']);
  });

  it('allows B events, and refuses promoting one to A while another A exists', async () => {
    const b = await t.call<Event>('POST', '/events', {
      name: 'Example 50k',
      date: '2031-03-01',
      priority: 'B',
    });
    expect(b.status).toBe(201);
    const promote = await t.call('PATCH', `/events/${b.body.id}`, { priority: 'A' });
    expect(promote.status).toBe(409);
    const edit = await t.call<Event>('PATCH', `/events/${b.body.id}`, { status: 'entered' });
    expect(edit.body.status).toBe('entered');
    const list = await t.call<Event[]>('GET', '/events');
    expect(list.body.map((e) => e.name)).toEqual(['Example 50k', 'Example 100']);
  });

  it('lets the A event itself be edited', async () => {
    const list = await t.call<Event[]>('GET', '/events');
    const a = list.body.find((e) => e.priority === 'A') as Event;
    const res = await t.call<Event>('PATCH', `/events/${a.id}`, { date_confirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.date_confirmed).toBe(true);
  });

  it('rejects an event with an impossible date or a bad priority', async () => {
    const date = await t.call<ErrorBody>('POST', '/events', { ...A_EVENT, date: '2031-02-30' });
    expect(date.status).toBe(400);
    expect(date.body.field).toBe('date');
    const priority = await t.call<ErrorBody>('POST', '/events', { ...A_EVENT, priority: 'Z' });
    expect(priority.status).toBe(400);
    expect(priority.body.field).toBe('priority');
  });

  it('completes once fixtures exist', async () => {
    const applied = await t.call<ApplyTemplateResult>('POST', '/setup/apply-template/rebuild-100');
    expect(applied.status).toBe(200);
    const status = await t.call<SetupStatus>('GET', '/setup/status');
    expect(status.body).toMatchObject({ complete: true, missing: [] });
  });
});

describe('starter template', () => {
  it('is listed with its week', async () => {
    const res = await t.call<StarterTemplate[]>('GET', '/templates/starters');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'rebuild-100', weeks: 10 });
    expect(res.body[0]?.week).toHaveLength(10);
    expect(res.body[0]?.week).toContainEqual({
      weekday: 7,
      slot: 'am',
      template: 'Long run',
      kind: 'run',
    });
  });

  it('is idempotent: a second apply reports zero changes', async () => {
    const fresh = await makeApp();
    const first = await fresh.call<ApplyTemplateResult>(
      'POST',
      '/setup/apply-template/rebuild-100',
      { start_date: '2031-01-08' },
    );
    expect(first.body.created).toEqual({
      habits: 4,
      exercises: 12,
      programme_days: 2,
      programme_slots: 12,
      session_templates: 8,
      fixtures: 10,
      blocks: 1,
    });
    expect(first.body.changes).toBe(49);

    const second = await fresh.call<ApplyTemplateResult>(
      'POST',
      '/setup/apply-template/rebuild-100',
    );
    expect(second.body.changes).toBe(0);

    // The block starts on the Monday of the week given and runs ten weeks.
    const blocks = await fresh.call<{ start_date: string; end_date: string }[]>('GET', '/blocks');
    expect(blocks.body[0]).toMatchObject({ start_date: '2031-01-06', end_date: '2031-03-16' });
    await fresh.close();
  });

  it('seeds the protein prompt and no athlete, events, kit or loads', async () => {
    const habits = await t.call<Habit[]>('GET', '/habits');
    expect(habits.body.map((h) => h.key)).toEqual([
      'treadmill_done',
      'alcohol_free',
      'prehab_done',
      'protein_shake',
    ]);
    expect(habits.body[3]).toMatchObject({ prompt_text: 'Oi. Protein.', prompt_until: '12:00' });

    const fresh = await makeApp();
    await fresh.call('POST', '/setup/apply-template/rebuild-100');
    expect((await fresh.call('GET', '/athlete')).status).toBe(404);
    expect((await fresh.call<unknown[]>('GET', '/events')).body).toEqual([]);
    expect((await fresh.call('GET', '/equipment')).body).toBeNull();
    const days = await fresh.call<{ slots: { start_load_kg: number | null }[] }[]>(
      'GET',
      '/programme-days',
    );
    expect(days.body.flatMap((d) => d.slots).every((s) => s.start_load_kg === null)).toBe(true);
    await fresh.close();
  });

  it('returns 404 for an unknown template and 400 for a bad start date', async () => {
    expect((await t.call('POST', '/setup/apply-template/nope')).status).toBe(404);
    const bad = await t.call<ErrorBody>('POST', '/setup/apply-template/rebuild-100', {
      start_date: '2031-13-01',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('start_date');
  });
});

describe('equipment', () => {
  it('is null until saved, then round-trips, and may be empty', async () => {
    const saved = await t.call<Equipment>('PUT', '/equipment', KIT);
    expect(saved.status).toBe(200);
    expect((await t.call<Equipment>('GET', '/equipment')).body).toEqual(KIT);

    const none = { bar_kg: null, plates: [], dumbbells: [], kettlebells: [], vest_kg: null };
    expect((await t.call<Equipment>('PUT', '/equipment', none)).body).toEqual(none);
  });

  it('rejects a bad plate, naming the path', async () => {
    const res = await t.call<ErrorBody>('PUT', '/equipment', {
      ...KIT,
      plates: [
        { kg: 20, count: 1 },
        { kg: -5, count: 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('plates/1/kg');
  });
});

describe('fixtures', () => {
  it('replaces the whole list', async () => {
    const templates = (await t.call<SessionTemplate[]>('GET', '/session-templates')).body;
    const walk = templates.find((s) => s.key === 'vest_walk') as SessionTemplate;
    const res = await t.call<Fixture[]>('PUT', '/fixtures', {
      fixtures: [
        { weekday: 1, slot: 'am', template_id: walk.id },
        { weekday: 3, slot: 'am', template_id: walk.id },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.map((f) => f.weekday)).toEqual([1, 3]);
    expect((await t.call<Fixture[]>('GET', '/fixtures')).body).toHaveLength(2);
  });

  it('rejects an unknown template with 400 and a duplicate with 409', async () => {
    const unknown = await t.call<ErrorBody>('PUT', '/fixtures', {
      fixtures: [{ weekday: 1, slot: 'am', template_id: 9999 }],
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.field).toBe('fixtures/template_id');

    const templates = (await t.call<SessionTemplate[]>('GET', '/session-templates')).body;
    const id = (templates[0] as SessionTemplate).id;
    const dup = await t.call('PUT', '/fixtures', {
      fixtures: [
        { weekday: 1, slot: 'am', template_id: id },
        { weekday: 1, slot: 'am', template_id: id },
      ],
    });
    expect(dup.status).toBe(409);
    // A rejected replace leaves the saved list alone.
    expect((await t.call<Fixture[]>('GET', '/fixtures')).body).toHaveLength(2);
  });

  it('accepts an empty list, which makes setup incomplete again', async () => {
    expect((await t.call<Fixture[]>('PUT', '/fixtures', { fixtures: [] })).body).toEqual([]);
    expect((await t.call<SetupStatus>('GET', '/setup/status')).body.missing).toEqual(['fixtures']);
  });
});

describe('habits', () => {
  it('creates, edits and deletes, and refuses a duplicate key with 409', async () => {
    const created = await t.call<Habit>('POST', '/habits', { key: 'stretch', label: 'Stretch' });
    expect(created.status).toBe(201);
    expect(created.body.enabled).toBe(true);

    const dup = await t.call('POST', '/habits', { key: 'stretch', label: 'Again' });
    expect(dup.status).toBe(409);

    const edited = await t.call<Habit>('PATCH', `/habits/${created.body.id}`, {
      prompt_text: 'Stretch.',
      prompt_until: '20:30',
    });
    expect(edited.body).toMatchObject({ prompt_text: 'Stretch.', prompt_until: '20:30' });

    const badTime = await t.call<ErrorBody>('PATCH', `/habits/${created.body.id}`, {
      prompt_until: '25:00',
    });
    expect(badTime.status).toBe(400);
    expect(badTime.body.field).toBe('prompt_until');

    expect((await t.call('DELETE', `/habits/${created.body.id}`)).status).toBe(204);
    expect((await t.call('GET', `/habits/${created.body.id}`)).status).toBe(404);
    expect((await t.call('DELETE', `/habits/${created.body.id}`)).status).toBe(404);
    expect((await t.call('PATCH', `/habits/${created.body.id}`, { label: 'x' })).status).toBe(404);
  });

  it('returns the row unchanged for an empty patch', async () => {
    const habits = (await t.call<Habit[]>('GET', '/habits')).body;
    const first = habits[0] as Habit;
    const res = await t.call<Habit>('PATCH', `/habits/${first.id}`, {});
    expect(res.body).toEqual(first);
    expect((await t.call<Habit>('GET', `/habits/${first.id}`)).body).toEqual(first);
  });
});
