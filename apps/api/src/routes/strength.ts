import {
  Exercise,
  ExerciseInput,
  Id,
  ProgrammeDay,
  ProgrammeDayInput,
  ProgrammeSlot,
  ProgrammeSlotPatch,
  StrengthHistoryEntry,
  type ProgrammeSlotInput,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { Type } from 'typebox';
import type { Db } from '../db/client.js';
import {
  activity,
  exercise,
  programme_day,
  programme_slot,
  set_log,
  strength_session,
} from '../db/schema.js';
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
    warmups_enabled: slot.warmups_enabled ?? true,
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

  // Past sessions of a day, most recent first, for load suggestions and "last done".
  app.get(
    '/programme-days/:id/history',
    {
      schema: {
        tags,
        params: IdParams,
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        }),
        response: { 200: Type.Array(StrengthHistoryEntry) },
      },
    },
    (req) => {
      if (!loadProgrammeDay(db, req.params.id)) throw notFound('programme day');
      const sessions = db
        .select({ session: strength_session, date: activity.date })
        .from(strength_session)
        .innerJoin(activity, eq(strength_session.activity_id, activity.id))
        .where(eq(strength_session.programme_day_id, req.params.id))
        .orderBy(desc(activity.date), desc(strength_session.id))
        .limit(req.query.limit ?? 10)
        .all();
      return sessions.map(({ session, date }) => ({
        activity_id: session.activity_id,
        date,
        partial: session.partial,
        sets: db
          .select()
          .from(set_log)
          .where(eq(set_log.strength_session_id, session.id))
          .orderBy(asc(set_log.slot_id), desc(set_log.warmup), asc(set_log.set_no))
          .all(),
      }));
    },
  );

  // Changes one slot in place: its starting load, or a permanent exercise swap.
  app.patch(
    '/programme-slots/:id',
    {
      schema: {
        tags,
        params: IdParams,
        body: ProgrammeSlotPatch,
        response: { 200: ProgrammeSlot },
      },
    },
    (req) => {
      const slot = db
        .select()
        .from(programme_slot)
        .where(eq(programme_slot.id, req.params.id))
        .get();
      if (!slot) throw notFound('programme slot');
      const changes = Object.fromEntries(
        Object.entries(req.body).filter(([, v]) => v !== undefined),
      );
      if (req.body.exercise_id !== undefined) {
        const found = db.select().from(exercise).where(eq(exercise.id, req.body.exercise_id)).get();
        if (!found) throw badRequest('exercise_id', 'is not an exercise');
      }
      if (Object.keys(changes).length === 0) return slot;
      return db.transaction((tx) => {
        if (req.body.exercise_id !== undefined && req.body.exercise_id !== slot.exercise_id) {
          // Past sets logged without an exercise were the old one. Say so before the
          // slot changes, or its history would be read as the new exercise's.
          tx.update(set_log)
            .set({ exercise_id: slot.exercise_id })
            .where(and(eq(set_log.slot_id, slot.id), isNull(set_log.exercise_id)))
            .run();
        }
        return tx
          .update(programme_slot)
          .set(changes)
          .where(eq(programme_slot.id, slot.id))
          .returning()
          .get();
      });
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
