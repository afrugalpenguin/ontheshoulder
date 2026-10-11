import type { Health } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConfig } from './config.js';
import { resolveDataDir } from './db/client.js';
import { makeApp, type TestApp } from './test/helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(() => t.close());

describe('GET /health', () => {
  it('reports ok with version, uptime, db status and migration version', async () => {
    const res = await t.call<Health>('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(res.body.db.ok).toBe(true);
    expect(res.body.db.migration).toMatch(/^\d{4}_/);
  });

  it('reports not ok when the database is unusable', async () => {
    const broken = await makeApp();
    broken.app.sqlite.close();
    const res = await broken.call<Health>('GET', '/health');
    expect(res.body).toMatchObject({ ok: false, db: { ok: false, migration: null } });
    await broken.close();
  });
});

describe('GET /docs/json', () => {
  it('serves an OpenAPI document that lists the routes', async () => {
    const res = await t.call<{ openapi: string; paths: Record<string, unknown> }>(
      'GET',
      '/docs/json',
    );
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/setup/status',
        '/api/events/{id}',
        '/api/checkins/{date}',
        '/api/health',
      ]),
    );
  });
});

describe('unknown routes', () => {
  it('returns 404 in the standard error shape', async () => {
    const res = await t.call<{ statusCode: number }>('GET', '/nope');
    expect(res.status).toBe(404);
  });
});

describe('readConfig', () => {
  it('defaults to 0.0.0.0:3001', () => {
    expect(readConfig({})).toMatchObject({
      host: '0.0.0.0',
      port: 3001,
      logLevel: 'info',
      lanGuard: true,
      logDir: null,
      overrides: [],
    });
  });

  it.each(['abc', '0', '70000', '30.5'])('rejects port %s', (port) => {
    expect(() => readConfig({ OTS_PORT: port })).toThrow(/OTS_PORT/);
  });
});

describe('resolveDataDir', () => {
  it('uses OTS_DATA_DIR when set', () => {
    expect(resolveDataDir({ OTS_DATA_DIR: t.dataDir })).toBe(t.dataDir);
  });

  it('defaults to a per-user folder outside the repo', () => {
    const dir = resolveDataDir({});
    expect(dir).toMatch(/ontheshoulder$/);
    expect(dir.startsWith(process.cwd())).toBe(false);
  });
});
