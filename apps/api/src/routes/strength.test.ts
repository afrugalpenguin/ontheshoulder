import type { ErrorBody, Exercise, ProgrammeDay, StrengthHistoryEntry } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestApp } from '../test/helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
  await t.call('POST', '/setup/apply-template/rebuild-100');
});
afterAll(() => t.close());

const slot = (exercise_id: number, extra: Record<string, unknown> = {}) => ({
  exercise_id,
  sets: 3,
  reps: 10,
  rest_sec: 60,
  load_rule: 'double',
  ...extra,
});

describe('exercises', () => {
  it('lists the seeded library by name', async () => {
    const res = await t.call<Exercise[]>('GET', '/exercises');
    expect(res.body).toHaveLength(24);
    expect(res.body[0]?.name).toBe('Back squat');
    expect(res.body.find((e) => e.name === 'Reverse lunge')).toMatchObject({
      pattern: 'lunge',
      equipment: 'dumbbell',
      unilateral: true,
    });
  });

  it('creates an exercise, requires pattern and equipment, refuses a duplicate name', async () => {
    const body = { name: 'Zercher squat', pattern: 'squat', equipment: 'barbell' };
    const created = await t.call<Exercise>('POST', '/exercises', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ unilateral: false, cues: null, video_url: null });

    const noPattern = await t.call<ErrorBody>('POST', '/exercises', {
      name: 'Mystery',
      equipment: 'barbell',
    });
    expect(noPattern.status).toBe(400);
    expect(noPattern.body.field).toBe('pattern');

    expect((await t.call('POST', '/exercises', body)).status).toBe(409);
  });

  it('cannot delete an exercise that a programme slot uses', async () => {
    const squat = (await t.call<Exercise[]>('GET', '/exercises')).body.find(
      (e) => e.name === 'Back squat',
    ) as Exercise;
    expect((await t.call('DELETE', `/exercises/${squat.id}`)).status).toBe(409);
  });
});

describe('programme days', () => {
  it('lists the seeded days with slots in order', async () => {
    const res = await t.call<ProgrammeDay[]>('GET', '/programme-days');
    expect(res.body.map((d) => d.name)).toEqual(['Strength A', 'Strength B']);
    const a = res.body[0] as ProgrammeDay;
    expect(a.slots.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a.slots[0]).toMatchObject({
      sets: 5,
      reps: 5,
      rest_sec: 150,
      load_rule: 'linear',
      increment_kg: 2.5,
      start_load_kg: null,
    });
    expect(a.slots[5]).toMatchObject({ seconds: 45, reps: null, load_rule: 'bodyweight' });
  });

  it('creates a day, then replaces it keeping slot ids that are sent back', async () => {
    const exercises = (await t.call<Exercise[]>('GET', '/exercises')).body;
    const [e1, e2, e3] = exercises.map((e) => e.id) as [number, number, number];

    const created = await t.call<ProgrammeDay>('POST', '/programme-days', {
      name: 'Strength C',
      slots: [slot(e1), slot(e2)],
    });
    expect(created.status).toBe(201);
    const [first, second] = created.body.slots;
    if (!first || !second) throw new Error('slots were not created');

    const replaced = await t.call<ProgrammeDay>('PUT', `/programme-days/${created.body.id}`, {
      name: 'Strength C2',
      slots: [slot(e3), slot(e2, { id: second.id, sets: 4 })],
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.name).toBe('Strength C2');
    expect(replaced.body.slots.map((s) => [s.position, s.exercise_id, s.sets])).toEqual([
      [1, e3, 3],
      [2, e2, 4],
    ]);
    expect(replaced.body.slots[1]?.id).toBe(second.id);
    expect(replaced.body.slots.some((s) => s.id === first.id)).toBe(false);

    const read = await t.call<ProgrammeDay>('GET', `/programme-days/${created.body.id}`);
    expect(read.body).toEqual(replaced.body);

    expect((await t.call('DELETE', `/programme-days/${created.body.id}`)).status).toBe(204);
    expect((await t.call('GET', `/programme-days/${created.body.id}`)).status).toBe(404);
  });

  it('rejects an unknown exercise, a foreign slot id and an unknown day', async () => {
    const days = (await t.call<ProgrammeDay[]>('GET', '/programme-days')).body;
    const [a, b] = days as [ProgrammeDay, ProgrammeDay];
    const exerciseId = (a.slots[0] as { exercise_id: number }).exercise_id;

    const unknown = await t.call<ErrorBody>('POST', '/programme-days', {
      name: 'Bad',
      slots: [slot(9999)],
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.field).toBe('slots/exercise_id');

    const foreign = await t.call<ErrorBody>('PUT', `/programme-days/${a.id}`, {
      name: a.name,
      slots: [slot(exerciseId, { id: (b.slots[0] as { id: number }).id })],
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.field).toBe('slots/id');

    const empty = { name: 'x', slots: [] };
    expect((await t.call('PUT', '/programme-days/9999', empty)).status).toBe(404);
    expect((await t.call('DELETE', '/programme-days/9999')).status).toBe(404);
    expect(
      (await t.call('POST', '/programme-days', { name: 'Strength A', slots: [] })).status,
    ).toBe(409);
  });

  it('accepts a day with no slots', async () => {
    const res = await t.call<ProgrammeDay>('POST', '/programme-days', { name: 'Empty', slots: [] });
    expect(res.status).toBe(201);
    expect(res.body.slots).toEqual([]);
  });
});

describe('strength history and slot changes', () => {
  const dayNamed = async (name: string) => {
    const days = (await t.call<ProgrammeDay[]>('GET', '/programme-days')).body;
    const day = days.find((d) => d.name === name);
    if (!day) throw new Error(`no programme day ${name}`);
    return day;
  };

  const logSession = async (day: ProgrammeDay, date: string, load: number, exerciseId?: number) => {
    const slot = day.slots[0];
    if (!slot) throw new Error('seed has no slots');
    const res = await t.call<{ id: number }>('POST', '/activities', {
      date,
      kind: 'strength',
      strength_session: {
        programme_day_id: day.id,
        partial: true,
        sets: [1, 2].map((set_no) => ({
          slot_id: slot.id,
          set_no,
          reps: 5,
          load_kg: load,
          ...(exerciseId === undefined ? {} : { exercise_id: exerciseId }),
        })),
      },
    });
    expect(res.status).toBe(201);
  };

  it('returns past sessions of a day, most recent first, with their sets', async () => {
    const a = await dayNamed('Strength A');
    const b = await dayNamed('Strength B');
    expect((await t.call<unknown[]>('GET', `/programme-days/${a.id}/history`)).body).toEqual([]);

    await logSession(a, '2031-01-08', 60);
    await logSession(a, '2031-01-15', 62.5);
    await logSession(b, '2031-01-10', 80);

    const history = await t.call<StrengthHistoryEntry[]>('GET', `/programme-days/${a.id}/history`);
    expect(history.body.map((h) => [h.date, h.partial, h.sets.length])).toEqual([
      ['2031-01-15', true, 2],
      ['2031-01-08', true, 2],
    ]);
    expect(history.body[0]?.sets[0]).toMatchObject({ load_kg: 62.5, reps: 5, exercise_id: null });

    const limited = await t.call<StrengthHistoryEntry[]>(
      'GET',
      `/programme-days/${a.id}/history?limit=1`,
    );
    expect(limited.body).toHaveLength(1);
    expect((await t.call('GET', '/programme-days/9999/history')).status).toBe(404);
  });

  it('records the substitute exercise on a set', async () => {
    const a = await dayNamed('Strength A');
    const goblet = (await t.call<Exercise[]>('GET', '/exercises')).body.find(
      (e) => e.name === 'Goblet squat',
    ) as Exercise;
    await logSession(a, '2031-01-22', 16, goblet.id);
    const history = await t.call<StrengthHistoryEntry[]>('GET', `/programme-days/${a.id}/history`);
    expect(history.body[0]?.sets[0]).toMatchObject({ exercise_id: goblet.id, load_kg: 16 });
  });

  it('patches a slot: starting load, then a permanent exercise swap', async () => {
    const a = await dayNamed('Strength A');
    const slot = a.slots[0] as { id: number; exercise_id: number };
    const goblet = (await t.call<Exercise[]>('GET', '/exercises')).body.find(
      (e) => e.name === 'Goblet squat',
    ) as Exercise;

    const started = await t.call<{ start_load_kg: number }>(
      'PATCH',
      `/programme-slots/${slot.id}`,
      {
        start_load_kg: 60,
      },
    );
    expect(started.status).toBe(200);
    expect(started.body.start_load_kg).toBe(60);

    const swapped = await t.call<{ exercise_id: number; increment_kg: number | null }>(
      'PATCH',
      `/programme-slots/${slot.id}`,
      { exercise_id: goblet.id, increment_kg: null, start_load_kg: null },
    );
    expect(swapped.body).toMatchObject({
      exercise_id: goblet.id,
      increment_kg: null,
      start_load_kg: null,
    });
    const day = await t.call<ProgrammeDay>('GET', `/programme-days/${a.id}`);
    expect(day.body.slots[0]?.exercise_id).toBe(goblet.id);

    // Earlier sets logged for the old exercise are now labelled as such, so they
    // are not mistaken for the new exercise's history.
    const history = await t.call<StrengthHistoryEntry[]>('GET', `/programme-days/${a.id}/history`);
    const exerciseIds = history.body.flatMap((h) => h.sets.map((s) => s.exercise_id));
    expect(exerciseIds).toEqual([
      goblet.id,
      goblet.id,
      slot.exercise_id,
      slot.exercise_id,
      slot.exercise_id,
      slot.exercise_id,
    ]);

    const same = await t.call<{ exercise_id: number }>('PATCH', `/programme-slots/${slot.id}`, {});
    expect(same.body.exercise_id).toBe(goblet.id);
  });

  it('rejects an unknown slot or exercise', async () => {
    expect((await t.call('PATCH', '/programme-slots/9999', { start_load_kg: 1 })).status).toBe(404);
    const a = await dayNamed('Strength A');
    const slot = a.slots[0] as { id: number };
    const res = await t.call<ErrorBody>('PATCH', `/programme-slots/${slot.id}`, {
      exercise_id: 9999,
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('exercise_id');
  });
});
