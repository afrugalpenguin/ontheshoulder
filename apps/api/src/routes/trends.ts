import {
  IsoDate,
  TrendDay,
  TrendWeek,
  addDays,
  daysBetween,
  isIsoDate,
  isoWeekStart,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { Type } from 'typebox';
import {
  activity,
  body_metric,
  daily_checkin,
  exercise,
  programme_slot,
  set_log,
  strength_session,
} from '../db/schema.js';
import { badRequest } from '../errors.js';
import { weekCompliance } from '../plan/generate.js';
import { dailyTrends, weeklyTrends, weeksBetween } from '../trends/compute.js';

const Range = Type.Object({ from: IsoDate, to: IsoDate });
const MAX_DAYS = 800;

function checkRange(from: string, to: string): void {
  if (!isIsoDate(from)) throw badRequest('from', 'is not a calendar date');
  if (!isIsoDate(to)) throw badRequest('to', 'is not a calendar date');
  if (to < from) throw badRequest('to', 'is before from');
  if (daysBetween(from, to) > MAX_DAYS)
    throw badRequest('to', `is more than ${MAX_DAYS} days after from`);
}

export const trendRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;
  const tags = ['trends'];

  const activitiesBetween = (from: string, to: string) =>
    db
      .select({
        date: activity.date,
        kind: activity.kind,
        duration_min: activity.duration_min,
        rpe: activity.rpe,
      })
      .from(activity)
      .where(and(gte(activity.date, from), lte(activity.date, to)))
      .all();

  const checkinsBetween = (from: string, to: string) =>
    db
      .select({
        date: daily_checkin.date,
        sleep_quality: daily_checkin.sleep_quality,
        energy: daily_checkin.energy,
        weight_kg: daily_checkin.weight_kg,
        ankle_score: daily_checkin.ankle_score,
      })
      .from(daily_checkin)
      .where(and(gte(daily_checkin.date, from), lte(daily_checkin.date, to)))
      .all();

  app.get(
    '/trends/weekly',
    { schema: { tags, querystring: Range, response: { 200: Type.Array(TrendWeek) } } },
    (req) => {
      checkRange(req.query.from, req.query.to);
      const weeks = weeksBetween(req.query.from, req.query.to);
      // Whole weeks, so a range that starts midweek still counts the full week.
      const from = isoWeekStart(weeks[0] as string);
      const to = addDays(isoWeekStart(weeks[weeks.length - 1] as string), 6);

      // Sets of the main lifts: slots on the linear rule. A substitute set is
      // named for the exercise actually done.
      const lifts = db
        .select({ date: activity.date, exercise: exercise.name, load_kg: set_log.load_kg })
        .from(set_log)
        .innerJoin(strength_session, eq(set_log.strength_session_id, strength_session.id))
        .innerJoin(activity, eq(strength_session.activity_id, activity.id))
        .innerJoin(programme_slot, eq(set_log.slot_id, programme_slot.id))
        .innerJoin(
          exercise,
          eq(exercise.id, sql`coalesce(${set_log.exercise_id}, ${programme_slot.exercise_id})`),
        )
        .where(
          and(
            eq(programme_slot.load_rule, 'linear'),
            gte(activity.date, from),
            lte(activity.date, to),
          ),
        )
        .all();

      return weeklyTrends(weeks, {
        activities: activitiesBetween(from, to),
        checkins: checkinsBetween(from, to),
        lifts,
        compliance: (isoWeek) => {
          const c = weekCompliance(db, isoWeek);
          return {
            complete: c.complete,
            optional_planned: c.optional_planned,
            optional_done: c.optional_done,
          };
        },
      });
    },
  );

  app.get(
    '/trends/daily',
    { schema: { tags, querystring: Range, response: { 200: Type.Array(TrendDay) } } },
    (req) => {
      const { from, to } = req.query;
      checkRange(from, to);
      const metrics = db
        .select({ date: body_metric.date, metric: body_metric.metric, value: body_metric.value })
        .from(body_metric)
        .where(
          and(
            gte(body_metric.date, from),
            lte(body_metric.date, to),
            // Weight from the check-in is already on the day; this is everything else.
            ne(body_metric.source, 'checkin'),
          ),
        )
        .orderBy(asc(body_metric.date))
        .all();
      return dailyTrends(from, to, {
        activities: activitiesBetween(from, to),
        checkins: checkinsBetween(from, to),
        metrics,
      });
    },
  );
};
