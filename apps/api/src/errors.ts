import type { ErrorBody } from '@ots/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/** An error with an HTTP status that is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const badRequest = (field: string, message: string) =>
  new HttpError(400, `${field} ${message}`, field);
export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const conflict = (message: string, field?: string) => new HttpError(409, message, field);

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

function body(statusCode: number, message: string, field?: string): ErrorBody {
  return {
    statusCode,
    error: TITLES[statusCode] ?? 'Error',
    message,
    ...(field === undefined ? {} : { field }),
  };
}

/** The field a schema validation error is about, for example "display_name" or "plates/0/kg". */
function validationField(err: FastifyError): string {
  const first = err.validation?.[0];
  if (!first) return 'body';
  const missing = (first.params as { missingProperty?: string }).missingProperty;
  const path = first.instancePath.replace(/^\//, '');
  if (missing) return path ? `${path}/${missing}` : missing;
  return path || err.validationContext || 'body';
}

function sqliteCode(err: unknown): string | undefined {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    const code = (candidate as { code?: unknown } | null | undefined)?.code;
    if (typeof code === 'string' && code.startsWith('SQLITE_')) return code;
  }
  return undefined;
}

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof HttpError) {
    void reply.status(err.statusCode).send(body(err.statusCode, err.message, err.field));
    return;
  }
  if (err.validation) {
    const field = validationField(err);
    void reply.status(400).send(body(400, `${field}: ${err.message}`, field));
    return;
  }
  const code = sqliteCode(err);
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    void reply.status(409).send(body(409, 'a row with the same unique value already exists'));
    return;
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    void reply
      .status(409)
      .send(body(409, 'the row refers to, or is referred to by, another row that blocks this'));
    return;
  }
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    void reply.status(err.statusCode).send(body(err.statusCode, err.message));
    return;
  }
  req.log.error(err, 'unhandled error');
  void reply.status(500).send(body(500, 'internal error'));
}
