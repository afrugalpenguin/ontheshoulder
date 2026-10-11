import {
  addDays,
  isoWeekOf,
  isoWeekStart,
  validateRules,
  type GeneratedWeek,
  type ProgressionRules,
} from '@ots/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  block,
  equipment,
  fixture,
  planned_session,
  session_template,
  week_plan,
} from '../db/schema.js';
import { computeCompliance, type Compliance } from '../engine/compliance.js';
import { generateWeek } from '../engine/generate.js';
import { conflict } from '../errors.js';
import { ensureWeekPlan, loadWeek } from './weeks.js';

/** The rules of the block that covers a date, or none when no block does. */
export function rulesForDate(
  db: Db,
  date: string,
): { rules: ProgressionRules; block: string | null } {
  const covering = db
    .select()
    .from(block)
    .where(and(lte(block.start_date, date), gte(block.end_date, date)))
    .get();
  if (!covering) return { rules: {}, block: null };
  const checked = validateRules(covering.progression_rules ?? {});
  return { rules: checked.ok ? checked.rules : {}, block: covering.name };
}

function weekSessions(db: Db, isoWeek: string) {
  const plan = db.select().from(week_plan).where(eq(week_plan.iso_week, isoWeek)).get();
  if (!plan) return [];
  return db.select().from(planned_session).where(eq(planned_session.week_plan_id, plan.id)).all();
}

/**
 * Generates or regenerates a week from fixtures and the covering block's rules.
 * Refuses (409) when the week already has a session that is not `planned`,
 * unless `force` is set. Never removes or rewrites a session that is edited,
 * logged, done or skipped.
 */
export function generateWeekPlan(
  db: Db,
  isoWeek: string,
  options: { force?: boolean } = {},
): GeneratedWeek {
  const start = isoWeekStart(isoWeek);
  const existing = weekSessions(db, isoWeek);
  if (!options.force && existing.some((s) => s.status !== 'planned')) {
    throw conflict(
      `${isoWeek} already has sessions that are done, skipped or modified; regenerate with force to keep them and refresh the rest`,
    );
  }

  const covering = rulesForDate(db, start);
  const { rules } = covering;
  const fixtures = db
    .select({ fixture, template: session_template })
    .from(fixture)
    .innerJoin(session_template, eq(fixture.template_id, session_template.id))
    .all()
    .map((row) => ({
      weekday: row.fixture.weekday,
      slot: row.fixture.slot,
      template: row.template,
    }));
  const kit = db.select().from(equipment).get();

  const result = generateWeek({
    isoWeek,
    rules,
    fixtures,
    previous: weekSessions(db, isoWeekOf(addDays(start, -7))),
    existing,
    vestKg: kit ? kit.vest_kg : undefined,
  });
  const reasoning = covering.block
    ? result.reasoning
    : ['No block covers this week: fixtures only, no progression.', ...result.reasoning];
  const changes = {
    created: result.create.length,
    updated: result.update.length,
    kept: result.keep.length,
    removed: result.remove.length,
  };

  db.transaction((tx) => {
    const planId = ensureWeekPlan(tx as unknown as Db, isoWeek);
    if (result.remove.length) {
      tx.delete(planned_session).where(inArray(planned_session.id, result.remove)).run();
    }
    for (const session of result.update) {
      tx.update(planned_session)
        .set({ targets: session.targets, optional: session.optional })
        .where(eq(planned_session.id, session.id))
        .run();
    }
    if (result.create.length) {
      tx.insert(planned_session)
        .values(result.create.map((s) => ({ ...s, week_plan_id: planId })))
        .run();
    }
    tx.update(week_plan)
      .set({ generated_at: new Date().toISOString(), reasoning })
      .where(eq(week_plan.id, planId))
      .run();
  });

  return { week: loadWeek(db, isoWeek), changes };
}

export function weekCompliance(db: Db, isoWeek: string): Compliance {
  const { rules } = rulesForDate(db, isoWeekStart(isoWeek));
  const sessions = loadWeek(db, isoWeek).sessions.map((s) => ({
    date: s.date,
    slot: s.slot,
    status: s.status,
    optional: s.optional,
    template_key: s.template.key,
  }));
  return computeCompliance(rules.compliance, sessions);
}
