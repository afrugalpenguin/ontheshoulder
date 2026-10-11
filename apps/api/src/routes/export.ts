import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Type } from 'typebox';
import * as schema from '../db/schema.js';
import { notFound } from '../errors.js';

/** The tables a user can take with them. The export routes accept these names only. */
const EXPORT_TABLES: Readonly<Record<string, SQLiteTable>> = {
  athlete: schema.athlete,
  event: schema.event,
  equipment: schema.equipment,
  fixture: schema.fixture,
  habit_definition: schema.habit_definition,
  block: schema.block,
  session_template: schema.session_template,
  week_plan: schema.week_plan,
  planned_session: schema.planned_session,
  activity: schema.activity,
  strength_session: schema.strength_session,
  set_log: schema.set_log,
  daily_checkin: schema.daily_checkin,
  body_metric: schema.body_metric,
  exercise: schema.exercise,
  programme_day: schema.programme_day,
  programme_slot: schema.programme_slot,
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const exportRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const db = app.db;
  const tags = ['export'];

  app.get('/export/json', { schema: { tags } }, (_req, reply) => {
    const tables = Object.fromEntries(
      Object.entries(EXPORT_TABLES).map(([name, table]) => [name, db.select().from(table).all()]),
    );
    void reply.header('content-disposition', 'attachment; filename="ontheshoulder-export.json"');
    return { exported_at: new Date().toISOString(), tables };
  });

  app.get(
    '/export/csv/:table',
    { schema: { tags, params: Type.Object({ table: Type.String({ maxLength: 50 }) }) } },
    (req, reply) => {
      const name = req.params.table;
      const table = Object.hasOwn(EXPORT_TABLES, name) ? EXPORT_TABLES[name] : undefined;
      if (!table) throw notFound(`export table "${name}"`);
      const rows = db.select().from(table).all() as Record<string, unknown>[];
      void reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${name}.csv"`);
      return toCsv(Object.keys(getTableColumns(table)), rows);
    },
  );
};
