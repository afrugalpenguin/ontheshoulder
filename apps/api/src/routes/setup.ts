import {
  ApplyTemplateResult,
  Athlete,
  AthleteInput,
  EquipmentSchema,
  Event,
  EventInput,
  Fixture,
  FixturesInput,
  Habit,
  HabitInput,
  IsoDate,
  SetupStatus,
  StarterTemplate,
  isIsoDate,
  localDate,
  mondayOf,
} from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { Type } from 'typebox';
import type { Db } from '../db/client.js';
import {
  athlete,
  equipment,
  event,
  fixture,
  habit_definition,
  session_template,
} from '../db/schema.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { STARTER_TEMPLATES, applyTemplate, describeStarter } from '../seed/apply.js';
import { crud } from './crud.js';

const EQUIPMENT_ROW_ID = 1;

function setupStatus(db: Db): Pick<SetupStatus, 'complete' | 'missing'> {
  const missing: SetupStatus['missing'] = [];
  if (!db.select().from(athlete).get()) missing.push('athlete');
  if (!db.select().from(event).where(eq(event.priority, 'A')).get()) missing.push('a_event');
  if (!db.select().from(fixture).get()) missing.push('fixtures');
  return { complete: missing.length === 0, missing };
}

export const setupRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;
  const tags = ['setup'];

  app.get('/setup/status', { schema: { tags, response: { 200: SetupStatus } } }, () => ({
    ...setupStatus(db),
    data_dir: app.dataDir,
  }));

  app.get('/athlete', { schema: { tags, response: { 200: Athlete } } }, () => {
    const row = db.select().from(athlete).get();
    if (!row) throw notFound('athlete');
    return row;
  });

  app.put(
    '/athlete',
    { schema: { tags, body: AthleteInput, response: { 200: Athlete } } },
    (req) => {
      const existing = db.select().from(athlete).get();
      if (!existing) return db.insert(athlete).values(req.body).returning().get();
      return db.update(athlete).set(req.body).where(eq(athlete.id, existing.id)).returning().get();
    },
  );

  await app.register(
    crud({
      path: '/events',
      name: 'event',
      table: event,
      input: EventInput,
      row: Event,
      orderBy: [event.date, event.id],
      prepare: (tx, body, existing) => {
        if (typeof body.date === 'string' && !isIsoDate(body.date)) {
          throw badRequest('date', 'is not a calendar date');
        }
        const priority = body.priority ?? existing?.priority;
        if (priority !== 'A') return;
        const other = tx
          .select()
          .from(event)
          .where(and(eq(event.priority, 'A'), ne(event.id, Number(existing?.id ?? 0))))
          .get();
        if (other) {
          throw conflict(
            `"${other.name}" is already the A event; there can be only one`,
            'priority',
          );
        }
      },
    }),
  );

  app.get(
    '/equipment',
    { schema: { tags, response: { 200: Type.Union([Type.Null(), EquipmentSchema]) } } },
    () => db.select().from(equipment).get() ?? null,
  );

  app.put(
    '/equipment',
    { schema: { tags, body: EquipmentSchema, response: { 200: EquipmentSchema } } },
    (req) =>
      db
        .insert(equipment)
        .values({ id: EQUIPMENT_ROW_ID, ...req.body })
        .onConflictDoUpdate({ target: equipment.id, set: req.body })
        .returning()
        .get(),
  );

  const listFixtures = () =>
    db
      .select()
      .from(fixture)
      .orderBy(asc(fixture.weekday), asc(fixture.slot), asc(fixture.id))
      .all();

  app.get('/fixtures', { schema: { tags, response: { 200: Type.Array(Fixture) } } }, listFixtures);

  app.put(
    '/fixtures',
    { schema: { tags, body: FixturesInput, response: { 200: Type.Array(Fixture) } } },
    (req) => {
      const wanted = req.body.fixtures;
      const ids = [...new Set(wanted.map((f) => f.template_id))];
      const known = ids.length
        ? db
            .select({ id: session_template.id })
            .from(session_template)
            .where(inArray(session_template.id, ids))
            .all()
        : [];
      const missing = ids.find((id) => !known.some((k) => k.id === id));
      if (missing !== undefined) {
        throw badRequest('fixtures/template_id', `${missing} is not a session template`);
      }
      const seen = new Set<string>();
      for (const f of wanted) {
        const key = `${f.weekday}-${f.slot}-${f.template_id}`;
        if (seen.has(key)) throw conflict(`duplicate fixture ${key}`, 'fixtures');
        seen.add(key);
      }
      db.transaction((tx) => {
        tx.delete(fixture).run();
        if (wanted.length) tx.insert(fixture).values(wanted).run();
      });
      return listFixtures();
    },
  );

  app.get(
    '/templates/starters',
    { schema: { tags, response: { 200: Type.Array(StarterTemplate) } } },
    () => [...STARTER_TEMPLATES.values()].map(describeStarter),
  );

  app.post(
    '/setup/apply-template/:name',
    {
      schema: {
        tags,
        params: Type.Object({ name: Type.String({ maxLength: 50 }) }),
        body: Type.Optional(
          Type.Union([Type.Null(), Type.Object({ start_date: Type.Optional(IsoDate) })]),
        ),
        response: { 200: ApplyTemplateResult },
      },
    },
    (req) => {
      // Only names on the built-in list are accepted; the parameter is never used as a path.
      const template = STARTER_TEMPLATES.get(req.params.name);
      if (!template) throw notFound(`starter template "${req.params.name}"`);
      const start = req.body?.start_date ?? mondayOf(localDate());
      if (!isIsoDate(start)) throw badRequest('start_date', 'is not a calendar date');
      const result = applyTemplate(db, template, mondayOf(start));
      req.log.info(
        { template: template.name, changes: result.changes },
        'starter template applied',
      );
      return result;
    },
  );

  await app.register(
    crud({
      path: '/habits',
      name: 'habit',
      table: habit_definition,
      input: HabitInput,
      row: Habit,
    }),
  );
};
