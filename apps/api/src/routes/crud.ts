import { Id } from '@ots/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { asc, eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Type, type TObject, type TSchema } from 'typebox';
import type { Db } from '../db/client.js';
import { notFound } from '../errors.js';

type Row = Record<string, unknown>;

export interface CrudOptions {
  /** Collection path, for example "/blocks". */
  path: string;
  /** Singular name used in messages and the OpenAPI document. */
  name: string;
  table: SQLiteTable & { id: SQLiteColumn };
  input: TObject;
  row: TSchema;
  orderBy?: SQLiteColumn[];
  /**
   * Runs before a write with the incoming fields and, on update, the stored row.
   * Throw an HttpError to reject. Return extra columns to write with the body.
   */
  prepare?: (db: Db, body: Row, existing: Row | null) => Row | void;
}

const IdParams = Type.Object({ id: Id });

function defined(body: Row): Row {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

/** Registers list, read, create, patch and delete for one table. */
export function crud(options: CrudOptions): FastifyPluginAsyncTypebox {
  const { path, name, table, input, row, prepare } = options;
  const order = (options.orderBy ?? [table.id]).map((c) => asc(c));
  const tags = [name];

  return async (app) => {
    const db = app.db;
    const find = (id: number) =>
      db.select().from(table).where(eq(table.id, id)).get() as Row | undefined;

    app.get(path, { schema: { tags, response: { 200: Type.Array(row) } } }, () =>
      db
        .select()
        .from(table)
        .orderBy(...order)
        .all(),
    );

    app.get(
      `${path}/:id`,
      { schema: { tags, params: IdParams, response: { 200: row } } },
      (req) => {
        const found = find(req.params.id);
        if (!found) throw notFound(name);
        return found;
      },
    );

    app.post(path, { schema: { tags, body: input, response: { 201: row } } }, (req, reply) => {
      const body = defined(req.body as Row);
      const extra = prepare?.(db, body, null) ?? {};
      const created = db
        .insert(table)
        .values({ ...body, ...extra } as never)
        .returning()
        .get();
      void reply.status(201);
      return created;
    });

    app.patch(
      `${path}/:id`,
      { schema: { tags, params: IdParams, body: Type.Partial(input), response: { 200: row } } },
      (req) => {
        const existing = find(req.params.id);
        if (!existing) throw notFound(name);
        const body = defined(req.body as Row);
        const extra = prepare?.(db, body, existing) ?? {};
        const changes = { ...body, ...extra };
        if (Object.keys(changes).length === 0) return existing;
        return db
          .update(table)
          .set(changes as never)
          .where(eq(table.id, req.params.id))
          .returning()
          .get();
      },
    );

    app.delete(
      `${path}/:id`,
      { schema: { tags, params: IdParams, response: { 204: Type.Null() } } },
      (req, reply) => {
        if (!find(req.params.id)) throw notFound(name);
        db.delete(table).where(eq(table.id, req.params.id)).run();
        void reply.status(204);
        return null;
      },
    );
  };
}
