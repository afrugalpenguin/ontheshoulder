import { join } from 'node:path';
import type { FastifyServerOptions } from 'fastify';

export const LOG_RETENTION_DAYS = 14;

/**
 * Logger options for the running api, SPEC 9.4: structured logs to stdout and
 * to a daily rolling file in the log folder, 14 files kept.
 */
export function loggerOptions(level: string, logDir: string): FastifyServerOptions['logger'] {
  return {
    level,
    transport: {
      targets: [
        { target: 'pino/file', level, options: { destination: 1 } },
        {
          target: 'pino-roll',
          level,
          options: {
            file: join(logDir, 'ots'),
            extension: '.log',
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            limit: { count: LOG_RETENTION_DAYS },
            mkdir: true,
          },
        },
      ],
    },
  };
}
