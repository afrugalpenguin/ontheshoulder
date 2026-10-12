import { addDays, type ApplyTemplateResult, type StarterTemplate } from '@ots/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  block,
  exercise,
  fixture,
  habit_definition,
  programme_day,
  programme_slot,
  session_template,
} from '../db/schema.js';
import { rebuild100 } from './templates/rebuild-100.js';
import type { StarterTemplateData } from './templates/types.js';

export const STARTER_TEMPLATES: ReadonlyMap<string, StarterTemplateData> = new Map([
  [rebuild100.name, rebuild100],
]);

export function describeStarter(template: StarterTemplateData): StarterTemplate {
  const byKey = new Map(template.session_templates.map((t) => [t.key, t]));
  return {
    name: template.name,
    title: template.title,
    description: template.description,
    weeks: template.block.weeks,
    week: template.fixtures.map((f) => {
      const t = byKey.get(f.template);
      if (!t) throw new Error(`template ${template.name}: unknown fixture template ${f.template}`);
      return { weekday: f.weekday, slot: f.slot, template: t.name, kind: t.kind };
    }),
  };
}

/**
 * Loads a starter template. Every row is looked up by its natural key first and
 * only inserted when missing, so a second apply reports zero changes and never
 * overwrites what the user has edited since.
 *
 * On an install that already has a week (any fixture), only session templates
 * created by this apply are put on their days. So a newer version of a template
 * adds what is new, and a week the user has rearranged is left as it is.
 */
export function applyTemplate(
  db: Db,
  template: StarterTemplateData,
  blockStart: string,
): ApplyTemplateResult {
  const created = {
    habits: 0,
    exercises: 0,
    programme_days: 0,
    programme_slots: 0,
    session_templates: 0,
    fixtures: 0,
    blocks: 0,
  };

  db.transaction((tx) => {
    for (const h of template.habits) {
      const found = tx.select().from(habit_definition).where(eq(habit_definition.key, h.key)).get();
      if (found) continue;
      tx.insert(habit_definition)
        .values({
          key: h.key,
          label: h.label,
          prompt_text: h.prompt_text ?? null,
          prompt_until: h.prompt_until ?? null,
          enabled: h.enabled ?? true,
          weekdays: h.weekdays ?? null,
          answer_labels: h.answer_labels ?? null,
        })
        .run();
      created.habits++;
    }

    const exerciseIds = new Map<string, number>();
    for (const e of template.exercises) {
      let row = tx.select().from(exercise).where(eq(exercise.name, e.name)).get();
      if (!row) {
        row = tx
          .insert(exercise)
          .values({
            name: e.name,
            pattern: e.pattern,
            equipment: e.equipment,
            unilateral: e.unilateral ?? false,
            cues: e.cues ?? null,
          })
          .returning()
          .get();
        created.exercises++;
      }
      exerciseIds.set(e.name, row.id);
    }

    const dayIds = new Map<string, number>();
    for (const d of template.programme_days) {
      let day = tx.select().from(programme_day).where(eq(programme_day.name, d.name)).get();
      if (!day) {
        day = tx.insert(programme_day).values({ name: d.name }).returning().get();
        created.programme_days++;
        d.slots.forEach((s, index) => {
          const exerciseId = exerciseIds.get(s.exercise);
          if (exerciseId === undefined) {
            throw new Error(`template ${template.name}: unknown exercise ${s.exercise}`);
          }
          tx.insert(programme_slot)
            .values({
              programme_day_id: (day as { id: number }).id,
              position: index + 1,
              exercise_id: exerciseId,
              sets: s.sets,
              reps: s.reps ?? null,
              seconds: s.seconds ?? null,
              rest_sec: s.rest_sec,
              load_rule: s.load_rule,
              increment_kg: s.increment_kg ?? null,
              notes: s.notes ?? null,
            })
            .run();
          created.programme_slots++;
        });
      }
      dayIds.set(d.name, day.id);
    }

    const hadWeek = tx.select().from(fixture).get() !== undefined;
    const newTemplates = new Set<string>();
    const templateIds = new Map<string, number>();
    for (const t of template.session_templates) {
      let row = tx.select().from(session_template).where(eq(session_template.key, t.key)).get();
      if (!row) {
        row = tx
          .insert(session_template)
          .values({
            key: t.key,
            kind: t.kind,
            name: t.name,
            default_duration_min: t.default_duration_min ?? null,
            structure: t.structure ?? null,
            programme_day_id: t.programme_day ? (dayIds.get(t.programme_day) ?? null) : null,
            notes: t.notes ?? null,
            tags: t.tags ?? [],
          })
          .returning()
          .get();
        created.session_templates++;
        newTemplates.add(t.key);
      }
      templateIds.set(t.key, row.id);
    }

    for (const f of template.fixtures) {
      const templateId = templateIds.get(f.template);
      if (templateId === undefined) {
        throw new Error(`template ${template.name}: unknown fixture template ${f.template}`);
      }
      if (hadWeek && !newTemplates.has(f.template)) continue;
      const found = tx
        .select()
        .from(fixture)
        .where(
          and(
            eq(fixture.weekday, f.weekday),
            eq(fixture.slot, f.slot),
            eq(fixture.template_id, templateId),
          ),
        )
        .get();
      if (found) continue;
      tx.insert(fixture)
        .values({ weekday: f.weekday, slot: f.slot, template_id: templateId })
        .run();
      created.fixtures++;
    }

    const b = template.block;
    if (!tx.select().from(block).where(eq(block.name, b.name)).get()) {
      tx.insert(block)
        .values({
          name: b.name,
          purpose: b.purpose,
          start_date: blockStart,
          end_date: addDays(blockStart, b.weeks * 7 - 1),
          progression_rules: b.progression_rules,
        })
        .run();
      created.blocks++;
    }
  });

  const changes = Object.values(created).reduce((sum, n) => sum + n, 0);
  return { template: template.name, created, changes };
}
