import {
  Block,
  BlockInput,
  Compliance,
  GeneratedWeek,
  IsoWeek,
  PlannedSession,
  PlannedSessionInput,
  SessionTemplate,
  SessionTemplateInput,
  Week,
  addDays,
  daysBetween,
  isIsoDate,
  isIsoWeek,
  isoWeekOf,
  validateRules,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { asc, eq } from 'drizzle-orm';
import { block, planned_session, session_template } from '../db/schema.js';
import { badRequest, conflict } from '../errors.js';
import { generateWeekPlan, weekCompliance } from '../plan/generate.js';
import { ensureWeekPlan, loadWeek } from '../plan/weeks.js';
import { crud } from './crud.js';

/** Fields whose change through the api counts as the user editing the plan. */
const EDIT_FIELDS = ['date', 'template_id', 'slot', 'targets', 'optional'];

export const planRoutes: FastifyPluginAsyncTypebox = async (app) => {
  await app.register(
    crud({
      path: '/blocks',
      name: 'block',
      table: block,
      input: BlockInput,
      row: Block,
      orderBy: [block.start_date, block.id],
      prepare: (db, body, existing) => {
        const start = String(body.start_date ?? existing?.start_date);
        const end = String(body.end_date ?? existing?.end_date);
        if (!isIsoDate(start)) throw badRequest('start_date', 'is not a calendar date');
        if (!isIsoDate(end)) throw badRequest('end_date', 'is not a calendar date');
        if (end < start) throw badRequest('end_date', 'is before start_date');
        // Blocks tile the calendar: no two may cover the same day.
        const clash = db
          .select()
          .from(block)
          .all()
          .find((b) => b.id !== existing?.id && b.start_date <= end && b.end_date >= start);
        if (clash) {
          throw conflict(
            `overlaps "${clash.name}" (${clash.start_date} to ${clash.end_date})`,
            'start_date',
          );
        }
        if (body.progression_rules != null) {
          const checked = validateRules(body.progression_rules);
          if (!checked.ok) {
            throw badRequest(`progression_rules/${checked.key}`, checked.message);
          }
        }
      },
    }),
  );

  // Puts the blocks in a new order, back to back from the earliest start, each
  // keeping its own length. Done in one transaction so no step overlaps.
  app.post(
    '/blocks/reorder',
    {
      schema: {
        tags: ['block'],
        body: Type.Object({ ids: Type.Array(Type.Integer({ minimum: 1 }), { maxItems: 100 }) }),
        response: { 200: Type.Array(Block) },
      },
    },
    (req) => {
      const all = app.db.select().from(block).orderBy(asc(block.start_date)).all();
      const { ids } = req.body;
      const known = new Set(all.map((b) => b.id));
      const complete =
        ids.length === all.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => known.has(id));
      if (!complete) throw badRequest('ids', 'must list every block exactly once');
      const first = all[0];
      if (!first) return [];
      app.db.transaction((tx) => {
        let start = first.start_date;
        for (const id of ids) {
          const b = all.find((x) => x.id === id) as (typeof all)[number];
          const end = addDays(start, daysBetween(b.start_date, b.end_date));
          tx.update(block).set({ start_date: start, end_date: end }).where(eq(block.id, id)).run();
          start = addDays(end, 1);
        }
      });
      return app.db.select().from(block).orderBy(asc(block.start_date), asc(block.id)).all();
    },
  );

  await app.register(
    crud({
      path: '/session-templates',
      name: 'session template',
      table: session_template,
      input: SessionTemplateInput,
      row: SessionTemplate,
    }),
  );

  app.get(
    '/weeks/:isoWeek',
    {
      schema: {
        tags: ['week'],
        params: Type.Object({ isoWeek: IsoWeek }),
        response: { 200: Week },
      },
    },
    (req) => {
      if (!isIsoWeek(req.params.isoWeek)) throw badRequest('isoWeek', 'is not an ISO week');
      return loadWeek(app.db, req.params.isoWeek);
    },
  );

  const WeekParams = Type.Object({ isoWeek: IsoWeek });
  const checkWeek = (isoWeek: string) => {
    if (!isIsoWeek(isoWeek)) throw badRequest('isoWeek', 'is not an ISO week');
    return isoWeek;
  };

  app.post(
    '/weeks/:isoWeek/generate',
    {
      schema: {
        tags: ['week'],
        params: WeekParams,
        querystring: Type.Object({ force: Type.Optional(Type.Boolean()) }),
        response: { 200: GeneratedWeek },
      },
    },
    (req) => {
      const isoWeek = checkWeek(req.params.isoWeek);
      const result = generateWeekPlan(app.db, isoWeek, { force: req.query.force === true });
      req.log.info({ week: isoWeek, ...result.changes }, 'week generated');
      return result;
    },
  );

  // What generating this week would produce, with nothing written. Rules sent in
  // the body are tried in place of the saved ones, for the rules editor.
  app.post(
    '/weeks/:isoWeek/dry-run',
    {
      schema: {
        tags: ['week'],
        params: WeekParams,
        body: Type.Optional(
          Type.Union([Type.Null(), Type.Object({ rules: Type.Optional(Type.Unknown()) })]),
        ),
        response: { 200: GeneratedWeek },
      },
    },
    (req) => {
      const isoWeek = checkWeek(req.params.isoWeek);
      let rules;
      if (req.body?.rules != null) {
        const checked = validateRules(req.body.rules);
        if (!checked.ok) throw badRequest(`rules/${checked.key}`, checked.message);
        rules = checked.rules;
      }
      return generateWeekPlan(app.db, isoWeek, {
        force: true,
        persist: false,
        ...(rules ? { rules } : {}),
      });
    },
  );

  app.get(
    '/weeks/:isoWeek/compliance',
    { schema: { tags: ['week'], params: WeekParams, response: { 200: Compliance } } },
    (req) => {
      const isoWeek = checkWeek(req.params.isoWeek);
      return { iso_week: isoWeek, ...weekCompliance(app.db, isoWeek) };
    },
  );

  await app.register(
    crud({
      path: '/planned-sessions',
      name: 'planned session',
      table: planned_session,
      input: PlannedSessionInput,
      row: PlannedSession,
      orderBy: [planned_session.date, planned_session.slot, planned_session.id],
      prepare: (db, body, existing) => {
        const extra: Record<string, unknown> = {};
        if (typeof body.date === 'string') {
          if (!isIsoDate(body.date)) throw badRequest('date', 'is not a calendar date');
          extra.week_plan_id = ensureWeekPlan(db, isoWeekOf(body.date));
        }
        const edited = EDIT_FIELDS.some((f) => f in body);
        if (existing && edited && body.edited_by_user === undefined) extra.edited_by_user = true;
        return extra;
      },
    }),
  );
};
