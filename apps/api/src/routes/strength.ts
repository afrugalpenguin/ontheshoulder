import {
  Exercise,
  ExerciseInput,
  Id,
  ProgrammeDay,
  ProgrammeDayInput,
  type ProgrammeSlotInput,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { asc, eq, inArray } from 'drizzle-orm';
import { Type } from 'typebox';
import type { Db } from '../db/client.js';
import { exercise, programme_day, programme_slot } from '../db/schema.js';
import { badRequest, notFound } from '../errors.js';
import { crud } from './crud.js';

const IdParams = Type.Object({ id: Id });

export function loadProgrammeDay(db: Db, id: number): ProgrammeDay | undefined {
  const day = db.select().from(programme_day).where(eq(programme_day.id, id)).get();
  if (!day) return undefined;
  const slots = db
    .select()
    .from(programme_slot)
    .where(eq(programme_slot.programme_day_id, id))
    .orderBy(asc(programme_slot.position))
    .all();
  return { ...day, slots };
}

function slotValues(slot: ProgrammeSlotInput, dayId: number, position: number) {
  return {
    programme_day_id: dayId,
    position,
    exercise_id: slot.exercise_id,
    sets: slot.sets,
    reps: slot.reps ?? null,
    seconds: slot.seconds ?? null,
    rest_sec: slot.rest_sec,
    load_rule: slot.load_rule,
    increment_kg: slot.increment_kg ?? null,
    start_load_kg: slot.start_load_kg ?? null,
    notes: slot.notes ?? null,
  };
}

function checkExercises(db: Db, slots: ProgrammeSlotInput[]): void {
  const ids = [...new Set(slots.map((s) => s.exercise_id))];
  if (ids.length === 0) return;
  const known = db
    .select({ id: exercise.id })
    .from(exercise)
    .where(inArray(exercise.id, ids))
    .all();
  const missing = ids.find((id) => !known.some((k) => k.id === id));
  if (missing !== undefined) throw badRequest('slots/exercise_id', `${missing} is not an exercise`);
}

export const strengthRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;
  const tags = ['programme day'];

  await app.register(
    crud({
      path: '/exercises',
      name: 'exercise',
      table: exercise,
      input: ExerciseInput,
      row: Exercise,
      orderBy: [exercise.name],
    }),
  );

  app.get(
    '/programme-days',
    { schema: { tags, response: { 200: Type.Array(ProgrammeDay) } } },
    () =>
      db
        .select({ id: programme_day.id })
        .from(programme_day)
        .orderBy(asc(programme_day.name))
        .all()
        .map((d) => loadProgrammeDay(db, d.id) as ProgrammeDay),
  );

  app.get(
    '/programme-days/:id',
    { schema: { tags, params: IdParams, response: { 200: ProgrammeDay } } },
    (req) => {
      const day = loadProgrammeDay(db, req.params.id);
      if (!day) throw notFound('programme day');
      return day;
    },
  );

  app.post(
    '/programme-days',
    { schema: { tags, body: ProgrammeDayInput, response: { 201: ProgrammeDay } } },
    (req, reply) => {
      checkExercises(db, req.body.slots);
      const id = db.transaction((tx) => {
        const day = tx.insert(programme_day).values({ name: req.body.name }).returning().get();
        req.body.slots.forEach((slot, index) => {
          tx.insert(programme_slot)
            .values(slotValues(slot, day.id, index + 1))
            .run();
        });
        return day.id;
      });
      void reply.status(201);
      return loadProgrammeDay(db, id) as ProgrammeDay;
    },
  );

  // Replaces the day. Slots sent with an id are updated in place so their set
  // history stays attached; slots without one are new; the rest are removed.
  app.put(
    '/programme-days/:id',
    {
      schema: { tags, params: IdParams, body: ProgrammeDayInput, response: { 200: ProgrammeDay } },
    },
    (req) => {
      const dayId = req.params.id;
      const current = loadProgrammeDay(db, dayId);
      if (!current) throw notFound('programme day');
      checkExercises(db, req.body.slots);
      const currentIds = new Set(current.slots.map((s) => s.id));
      const stray = req.body.slots.find((s) => s.id !== undefined && !currentIds.has(s.id));
      if (stray) throw badRequest('slots/id', `${stray.id} is not a slot of this programme day`);

      db.transaction((tx) => {
        tx.update(programme_day)
          .set({ name: req.body.name })
          .where(eq(programme_day.id, dayId))
          .run();
        const keep = new Set(req.body.slots.map((s) => s.id).filter((id) => id !== undefined));
        for (const old of current.slots) {
          if (!keep.has(old.id))
            tx.delete(programme_slot).where(eq(programme_slot.id, old.id)).run();
        }
        req.body.slots.forEach((slot, index) => {
          const values = slotValues(slot, dayId, index + 1);
          if (slot.id === undefined) tx.insert(programme_slot).values(values).run();
          else tx.update(programme_slot).set(values).where(eq(programme_slot.id, slot.id)).run();
        });
      });
      return loadProgrammeDay(db, dayId) as ProgrammeDay;
    },
  );

  app.delete(
    '/programme-days/:id',
    { schema: { tags, params: IdParams, response: { 204: Type.Null() } } },
    (req, reply) => {
      if (!loadProgrammeDay(db, req.params.id)) throw notFound('programme day');
      db.delete(programme_day).where(eq(programme_day.id, req.params.id)).run();
      void reply.status(204);
      return null;
    },
  );
};
