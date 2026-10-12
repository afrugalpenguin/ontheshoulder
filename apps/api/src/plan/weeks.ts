import { addDays, isoWeekStart, type Week } from '@ots/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { planned_session, session_template, week_plan } from '../db/schema.js';

/** Id of the week_plan row for an ISO week, creating an empty one if needed. */
export function ensureWeekPlan(db: Db, isoWeek: string): number {
  const found = db.select().from(week_plan).where(eq(week_plan.iso_week, isoWeek)).get();
  if (found) return found.id;
  return db.insert(week_plan).values({ iso_week: isoWeek }).returning().get().id;
}

type Row = { session: { date: string; slot: string }; template: { kind: string } };

/**
 * Within a day and slot, prehab comes first: it is done before the session it
 * shares the slot with. The sort is stable, so everything else keeps the order
 * it was read in.
 */
function byDayOrder(a: Row, b: Row): number {
  if (a.session.date !== b.session.date || a.session.slot !== b.session.slot) return 0;
  return Number(b.template.kind === 'prehab') - Number(a.template.kind === 'prehab');
}

/** The week as the api returns it. A week with no plan yet has no sessions. */
export function loadWeek(db: Db, isoWeek: string): Week {
  const start = isoWeekStart(isoWeek);
  const plan = db.select().from(week_plan).where(eq(week_plan.iso_week, isoWeek)).get();
  const rows = plan
    ? db
        .select({ session: planned_session, template: session_template })
        .from(planned_session)
        .innerJoin(session_template, eq(planned_session.template_id, session_template.id))
        .where(eq(planned_session.week_plan_id, plan.id))
        .orderBy(asc(planned_session.date), asc(planned_session.slot), asc(planned_session.id))
        .all()
    : [];
  return {
    iso_week: isoWeek,
    start_date: start,
    end_date: addDays(start, 6),
    generated_at: plan?.generated_at ?? null,
    reasoning: plan?.reasoning ?? [],
    sessions: [...rows].sort(byDayOrder).map(({ session, template }) => ({
      ...session,
      template: {
        key: template.key,
        kind: template.kind,
        name: template.name,
        structure: template.structure,
        programme_day_id: template.programme_day_id,
      },
    })),
  };
}
