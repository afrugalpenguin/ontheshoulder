import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { API_PREFIX, buildApp } from '../app.js';

export interface TestApp {
  app: FastifyInstance;
  dataDir: string;
  /** Sends a request and returns the status with the parsed JSON body. */
  call: <T = unknown>(
    method: InjectOptions['method'],
    url: string,
    body?: unknown,
  ) => Promise<{ status: number; body: T }>;
  close: () => Promise<void>;
}

/** An api on a fresh database in its own temp folder. Call close() when done. */
export async function makeApp(): Promise<TestApp> {
  const dataDir = mkdtempSync(join(tmpdir(), 'ots-test-'));
  const app = await buildApp({ dataDir });
  return {
    app,
    dataDir,
    call: async <T>(method: InjectOptions['method'], url: string, body?: unknown) => {
      const res = await app.inject({
        method,
        // Tests name api paths without the prefix every route is mounted under.
        url: `${API_PREFIX}${url}`,
        ...(body === undefined ? {} : { payload: body as object }),
      });
      const text = res.body;
      let parsed: unknown = text;
      try {
        parsed = text === '' ? null : JSON.parse(text);
      } catch {
        // Not JSON (CSV export); keep the text.
      }
      return { status: res.statusCode, body: parsed as T };
    },
    close: async () => {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// Obviously synthetic values for tests. Nothing here describes a real person or event.
export const ATHLETE = { display_name: 'Test Runner' };
export const A_EVENT = {
  name: 'Example 100',
  date: '2031-06-07',
  distance_km: 161,
  time_limit_h: 48,
  priority: 'A',
};
export const KIT = {
  bar_kg: 20,
  plates: [
    { kg: 20, count: 1 },
    { kg: 10, count: 1 },
    { kg: 5, count: 1 },
    { kg: 2.5, count: 1 },
    { kg: 1.25, count: 1 },
  ],
  dumbbells: [10, 12.5, 15],
  kettlebells: [12, 16, 20],
  vest_kg: 20,
};
