import {
  Activity,
  ActivityInput,
  ActivityPatch,
  Checkin,
  CheckinInput,
  Id,
  IsoDate,
  Metric,
  MetricInput,
  SessionKind,
  isIsoDate,
  weekdayOf,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { Type } from 'typebox';
import type { Db } from '../db/client.js';
import {
  activity,
  body_metric,
  daily_checkin,
  planned_session,
  programme_day,
  set_log,
  strength_session,
} from '../db/schema.js';
import { badRequest, notFound } from '../errors.js';

const IdParams = Type.Object({ id: Id });
const DateParams = Type.Object({ date: IsoDate });
const WEIGHT_METRIC = 'weight_kg';
const CHECKIN_SOURCE = 'checkin';

export function loadActivity(db: Db, id: number): Activity | undefined {
  const row = db.select().from(activity).where(eq(activity.id, id)).get();
  if (!row) return undefined;
  const session = db
    .select()
    .from(strength_session)
    .where(eq(strength_session.activity_id, id))
    .get();
  if (!session) return { ...row, strength_session: null };
  const sets = db
    .select()
    .from(set_log)
    .where(eq(set_log.strength_session_id, session.id))
    .orderBy(asc(set_log.slot_id), desc(set_log.warmup), asc(set_log.set_no))
    .all();
  return { ...row, strength_session: { ...session, sets } };
}

function createActivity(db: Db, body: ActivityInput): number {
  const { planned_session_id, strength_session: strength, ...fields } = body;
  if (!isIsoDate(fields.date)) throw badRequest('date', 'is not a calendar date');

  return db.transaction((tx) => {
    if (planned_session_id != null) {
      const planned = tx
        .select()
        .from(planned_session)
        .where(eq(planned_session.id, planned_session_id))
        .get();
      if (!planned) throw badRequest('planned_session_id', 'is not a planned session');
    }
    if (strength) {
      const day = tx
        .select()
        .from(programme_day)
        .where(eq(programme_day.id, strength.programme_day_id))
        .get();
      if (!day) throw badRequest('strength_session/programme_day_id', 'is not a programme day');
    }

    const created = tx.insert(activity).values(fields).returning().get();

    if (strength) {
      const session = tx
        .insert(strength_session)
        .values({
          activity_id: created.id,
          programme_day_id: strength.programme_day_id,
          started_at: strength.started_at ?? null,
          finished_at: strength.finished_at ?? null,
          partial: strength.partial ?? false,
        })
        .returning()
        .get();
      if (strength.sets.length) {
        tx.insert(set_log)
          .values(strength.sets.map((s) => ({ ...s, strength_session_id: session.id })))
          .run();
      }
      tx.update(activity)
        .set({ detail: { ...(fields.detail ?? {}), strength_session_id: session.id } })
        .where(eq(activity.id, created.id))
        .run();
    }

    if (planned_session_id != null) {
      tx.update(planned_session)
        .set({ linked_activity_id: created.id, status: 'done', skip_reason: null })
        .where(eq(planned_session.id, planned_session_id))
        .run();
    }
    return created.id;
  });
}

function emptyCheckin(date: string): Checkin {
  return {
    id: null,
    date,
    sleep_quality: null,
    energy: null,
    weight_kg: null,
    ankle_score: null,
    sunday_got_up: null,
    habits: {},
    dismissed_prompts: [],
    notes: null,
  };
}

export const logRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;

  // Activities

  app.get(
    '/activities',
    {
      schema: {
        tags: ['activity'],
        querystring: Type.Object({
          from: Type.Optional(IsoDate),
          to: Type.Optional(IsoDate),
          kind: Type.Optional(SessionKind),
        }),
        response: { 200: Type.Array(Activity) },
      },
    },
    (req) => {
      const where: SQL[] = [];
      if (req.query.from) where.push(gte(activity.date, req.query.from));
      if (req.query.to) where.push(lte(activity.date, req.query.to));
      if (req.query.kind) where.push(eq(activity.kind, req.query.kind));
      return db
        .select({ id: activity.id })
        .from(activity)
        .where(and(...where))
        .orderBy(asc(activity.date), asc(activity.id))
        .all()
        .map((r) => loadActivity(db, r.id) as Activity);
    },
  );

  app.get(
    '/activities/:id',
    { schema: { tags: ['activity'], params: IdParams, response: { 200: Activity } } },
    (req) => {
      const found = loadActivity(db, req.params.id);
      if (!found) throw notFound('activity');
      return found;
    },
  );

  app.post(
    '/activities',
    { schema: { tags: ['activity'], body: ActivityInput, response: { 201: Activity } } },
    (req, reply) => {
      const id = createActivity(db, req.body);
      void reply.status(201);
      return loadActivity(db, id) as Activity;
    },
  );

  app.patch(
    '/activities/:id',
    {
      schema: {
        tags: ['activity'],
        params: IdParams,
        body: ActivityPatch,
        response: { 200: Activity },
      },
    },
    (req) => {
      if (!loadActivity(db, req.params.id)) throw notFound('activity');
      if (req.body.date !== undefined && !isIsoDate(req.body.date)) {
        throw badRequest('date', 'is not a calendar date');
      }
      const changes = Object.fromEntries(
        Object.entries(req.body).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(changes).length) {
        db.update(activity).set(changes).where(eq(activity.id, req.params.id)).run();
      }
      return loadActivity(db, req.params.id) as Activity;
    },
  );

  app.delete(
    '/activities/:id',
    { schema: { tags: ['activity'], params: IdParams, response: { 204: Type.Null() } } },
    (req, reply) => {
      if (!loadActivity(db, req.params.id)) throw notFound('activity');
      db.transaction((tx) => {
        // A planned session that was done by this activity goes back to planned.
        tx.update(planned_session)
          .set({ status: 'planned', linked_activity_id: null })
          .where(eq(planned_session.linked_activity_id, req.params.id))
          .run();
        tx.delete(activity).where(eq(activity.id, req.params.id)).run();
      });
      void reply.status(204);
      return null;
    },
  );

  // Daily check-in

  app.get(
    '/checkins/:date',
    { schema: { tags: ['checkin'], params: DateParams, response: { 200: Checkin } } },
    (req) => {
      const { date } = req.params;
      if (!isIsoDate(date)) throw badRequest('date', 'is not a calendar date');
      return (
        db.select().from(daily_checkin).where(eq(daily_checkin.date, date)).get() ??
        emptyCheckin(date)
      );
    },
  );

  // Merges into the day's check-in, so a habit tick before the morning check-in
  // and the check-in itself can arrive as separate calls.
  app.put(
    '/checkins/:date',
    {
      schema: {
        tags: ['checkin'],
        params: DateParams,
        body: CheckinInput,
        response: { 200: Checkin },
      },
    },
    (req) => {
      const { date } = req.params;
      if (!isIsoDate(date)) throw badRequest('date', 'is not a calendar date');
      if (req.body.sunday_got_up != null && weekdayOf(date) !== 7) {
        throw badRequest('sunday_got_up', 'can only be set on a Sunday');
      }
      return db.transaction((tx) => {
        const existing = tx.select().from(daily_checkin).where(eq(daily_checkin.date, date)).get();
        const changes = Object.fromEntries(
          Object.entries(req.body).filter(([, v]) => v !== undefined),
        );
        if (req.body.habits) changes.habits = { ...(existing?.habits ?? {}), ...req.body.habits };
        const saved = existing
          ? tx
              .update(daily_checkin)
              .set(changes)
              .where(eq(daily_checkin.id, existing.id))
              .returning()
              .get()
          : tx
              .insert(daily_checkin)
              .values({ date, ...changes })
              .returning()
              .get();

        // Weight is mirrored into body_metric so trends read one place.
        const mirror = and(
          eq(body_metric.date, date),
          eq(body_metric.metric, WEIGHT_METRIC),
          eq(body_metric.source, CHECKIN_SOURCE),
        );
        if (saved.weight_kg === null) {
          tx.delete(body_metric).where(mirror).run();
        } else {
          tx.insert(body_metric)
            .values({
              date,
              metric: WEIGHT_METRIC,
              value: saved.weight_kg,
              source: CHECKIN_SOURCE,
            })
            .onConflictDoUpdate({
              target: [body_metric.date, body_metric.metric, body_metric.source],
              set: { value: saved.weight_kg },
            })
            .run();
        }
        return saved;
      });
    },
  );

  // Body metrics

  app.get(
    '/metrics',
    {
      schema: {
        tags: ['metric'],
        querystring: Type.Object({
          from: Type.Optional(IsoDate),
          to: Type.Optional(IsoDate),
          metric: Type.Optional(Type.String({ maxLength: 50 })),
        }),
        response: { 200: Type.Array(Metric) },
      },
    },
    (req) => {
      const where: SQL[] = [];
      if (req.query.from) where.push(gte(body_metric.date, req.query.from));
      if (req.query.to) where.push(lte(body_metric.date, req.query.to));
      if (req.query.metric) where.push(eq(body_metric.metric, req.query.metric));
      return db
        .select()
        .from(body_metric)
        .where(and(...where))
        .orderBy(asc(body_metric.date), asc(body_metric.metric), asc(body_metric.source))
        .all();
    },
  );

  app.put(
    '/metrics',
    { schema: { tags: ['metric'], body: MetricInput, response: { 200: Metric } } },
    (req) => {
      if (!isIsoDate(req.body.date)) throw badRequest('date', 'is not a calendar date');
      return db
        .insert(body_metric)
        .values(req.body)
        .onConflictDoUpdate({
          target: [body_metric.date, body_metric.metric, body_metric.source],
          set: { value: req.body.value },
        })
        .returning()
        .get();
    },
  );
};
