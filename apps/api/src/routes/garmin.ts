import { GarminStatus, IsoDate, isIsoDate } from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { eq, sql } from 'drizzle-orm';
import { Type } from 'typebox';
import { app_state, garmin_import } from '../db/schema.js';
import { badRequest } from '../errors.js';

const STATUS_KEY = 'garmin_status';
const Payload = Type.Record(Type.String(), Type.Unknown());
const Stored = Type.Object({ stored: Type.Integer() });
const StatusOut = Type.Object({
  ...GarminStatus.properties,
  pending: Type.Object({ daily: Type.Integer(), activity: Type.Integer() }),
});

/**
 * Inbox for the optional Garmin sidecar. Payloads are validated for shape,
 * stored as received and acknowledged with 202. Nothing here writes to the
 * log or metrics tables; matching happens in a later stage.
 */
export const garminRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;
  const tags = ['garmin import'];

  app.post(
    '/import/garmin/daily',
    {
      schema: {
        tags,
        body: Type.Object({ date: IsoDate, metrics: Payload }),
        response: { 202: Stored },
      },
    },
    (req, reply) => {
      if (!isIsoDate(req.body.date)) throw badRequest('date', 'is not a calendar date');
      const row = db
        .insert(garmin_import)
        .values({
          kind: 'daily',
          ref: req.body.date,
          payload: req.body.metrics,
          received_at: new Date().toISOString(),
        })
        .returning()
        .get();
      req.log.info({ id: row.id, date: row.ref }, 'garmin daily payload stored');
      void reply.status(202);
      return { stored: row.id };
    },
  );

  app.post(
    '/import/garmin/activity',
    {
      schema: {
        tags,
        body: Type.Object({
          garmin_activity_id: Type.String({ pattern: '^[0-9A-Za-z_-]{1,64}$' }),
          activity: Payload,
        }),
        response: { 202: Stored },
      },
    },
    (req, reply) => {
      const row = db
        .insert(garmin_import)
        .values({
          kind: 'activity',
          ref: req.body.garmin_activity_id,
          payload: req.body.activity,
          received_at: new Date().toISOString(),
        })
        .returning()
        .get();
      req.log.info({ id: row.id, ref: row.ref }, 'garmin activity payload stored');
      void reply.status(202);
      return { stored: row.id };
    },
  );

  app.get('/import/garmin/status', { schema: { tags, response: { 200: StatusOut } } }, () => {
    const saved = db.select().from(app_state).where(eq(app_state.key, STATUS_KEY)).get();
    const status = (saved?.value as GarminStatus | undefined) ?? {
      ok: null,
      message: null,
      at: null,
    };
    const counts = db
      .select({ kind: garmin_import.kind, n: sql<number>`count(*)` })
      .from(garmin_import)
      .groupBy(garmin_import.kind)
      .all();
    const count = (kind: string) => counts.find((c) => c.kind === kind)?.n ?? 0;
    return { ...status, pending: { daily: count('daily'), activity: count('activity') } };
  });

  app.post(
    '/import/garmin/status',
    {
      schema: {
        tags,
        body: Type.Object({
          ok: Type.Boolean(),
          message: Type.Optional(Type.Union([Type.Null(), Type.String({ maxLength: 500 })])),
        }),
        response: { 200: GarminStatus },
      },
    },
    (req) => {
      const value: GarminStatus = {
        ok: req.body.ok,
        message: req.body.message ?? null,
        at: new Date().toISOString(),
      };
      db.insert(app_state)
        .values({ key: STATUS_KEY, value })
        .onConflictDoUpdate({ target: app_state.key, set: { value } })
        .run();
      return value;
    },
  );
};
