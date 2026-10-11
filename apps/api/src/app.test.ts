import type { Health } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

describe('GET /health', () => {
  it('reports ok with a version and uptime', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json<Health>();
    expect(body.ok).toBe(true);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
  });
});

describe('readConfig', () => {
  it('defaults to 0.0.0.0:3001', () => {
    expect(readConfig({})).toEqual({ host: '0.0.0.0', port: 3001, logLevel: 'info' });
  });

  it.each(['abc', '0', '70000', '30.5'])('rejects port %s', (port) => {
    expect(() => readConfig({ OTS_PORT: port })).toThrow(/OTS_PORT/);
  });
});
