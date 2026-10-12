import {
  addDays,
  isoWeekOf,
  isoWeekStart,
  validateRules,
  type GeneratedWeek,
  type ProgressionRules,
  type WeekSession,
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
  options: { force?: boolean; persist?: boolean; rules?: ProgressionRules } = {},
): GeneratedWeek {
  const start = isoWeekStart(isoWeek);
  const existing = weekSessions(db, isoWeek);
  if (!options.force && existing.some((s) => s.status !== 'planned')) {
    throw conflict(
      `${isoWeek} already has sessions that are done, skipped or modified; regenerate with force to keep them and refresh the rest`,
    );
  }

  const covering = rulesForDate(db, start);
  const rules = options.rules ?? covering.rules;
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

  if (options.persist === false) {
    // Dry run: describe the week the engine would produce and write nothing.
    const templates = new Map(fixtures.map((f) => [f.template.id, f.template]));
    const current = loadWeek(db, isoWeek);
    const planned = [...result.create, ...result.update].map((s, index): WeekSession => {
      const template = templates.get(s.template_id);
      if (!template) throw new Error(`fixture template ${s.template_id} is missing`);
      return {
        id: 'id' in s ? (s.id as number) : -(index + 1),
        week_plan_id: 0,
        date: s.date,
        template_id: s.template_id,
        slot: s.slot,
        targets: s.targets,
        optional: s.optional,
        status: 'planned' as const,
        skip_reason: null,
        edited_by_user: false,
        linked_activity_id: null,
        template: {
          key: template.key,
          kind: template.kind,
          name: template.name,
          structure: template.structure,
          programme_day_id: template.programme_day_id,
        },
      };
    });
    const kept = current.sessions.filter((s) => result.keep.includes(s.id));
    const sessions = [...planned, ...kept].sort(
      (a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot),
    );
    return { persisted: false, week: { ...current, reasoning, sessions }, changes };
  }

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

  return { persisted: true, week: loadWeek(db, isoWeek), changes };
}

export function weekCompliance(db: Db, isoWeek: string): Compliance {
  const { rules } = rulesForDate(db, isoWeekStart(isoWeek));
  // Prehab is not a session the week is judged on: it never counts as a
  // treadmill morning or towards the session totals.
  const counted = loadWeek(db, isoWeek).sessions.filter((s) => s.template.kind !== 'prehab');
  const sessions = counted.map((s) => ({
    date: s.date,
    slot: s.slot,
    status: s.status,
    optional: s.optional,
    template_key: s.template.key,
  }));
  return computeCompliance(rules.compliance, sessions);
}
