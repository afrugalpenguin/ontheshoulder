import type { ErrorBody } from '@ots/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ATHLETE, makeApp, type TestApp } from '../test/helpers.js';
import { toCsv } from './export.js';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
  await t.call('PUT', '/athlete', ATHLETE);
  await t.call('POST', '/setup/apply-template/rebuild-100');
});
afterAll(() => t.close());

interface Status {
  ok: boolean | null;
  message: string | null;
  at: string | null;
  pending: { daily: number; activity: number };
}

describe('garmin import inbox', () => {
  it('starts with no status and nothing pending', async () => {
    const res = await t.call<Status>('GET', '/import/garmin/status');
    expect(res.body).toEqual({
      ok: null,
      message: null,
      at: null,
      pending: { daily: 0, activity: 0 },
    });
  });

  it('stores daily and activity payloads and answers 202', async () => {
    const daily = await t.call<{ stored: number }>('POST', '/import/garmin/daily', {
      date: '2031-01-13',
      metrics: { sleep_score: 80, resting_hr: 50 },
    });
    expect(daily.status).toBe(202);
    const activity = await t.call<{ stored: number }>('POST', '/import/garmin/activity', {
      garmin_activity_id: '1234567890',
      activity: { type: 'running', duration_s: 2040 },
    });
    expect(activity.status).toBe(202);
    expect(activity.body.stored).toBeGreaterThan(daily.body.stored);

    const status = await t.call<Status>('GET', '/import/garmin/status');
    expect(status.body.pending).toEqual({ daily: 1, activity: 1 });
    // Storing is all that happens: nothing reaches the activity log.
    expect((await t.call<unknown[]>('GET', '/activities')).body).toEqual([]);
  });

  it('rejects malformed payloads without storing them', async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['/import/garmin/daily', { metrics: {} }, 'date'],
      ['/import/garmin/daily', { date: '2031-02-30', metrics: {} }, 'date'],
      ['/import/garmin/daily', { date: '2031-01-13' }, 'metrics'],
      [
        '/import/garmin/activity',
        { garmin_activity_id: 'a b', activity: {} },
        'garmin_activity_id',
      ],
      ['/import/garmin/activity', { garmin_activity_id: '1' }, 'activity'],
    ];
    for (const [url, body, field] of cases) {
      const res = await t.call<ErrorBody>('POST', url, body);
      expect(res.status, field).toBe(400);
      expect(res.body.field).toBe(field);
    }
    const status = await t.call<Status>('GET', '/import/garmin/status');
    expect(status.body.pending).toEqual({ daily: 1, activity: 1 });
  });

  it('records the sidecar status and replaces it on the next report', async () => {
    const bad = await t.call<Status>('POST', '/import/garmin/status', {
      ok: false,
      message: 'login needed',
    });
    expect(bad.body).toMatchObject({ ok: false, message: 'login needed' });
    expect(bad.body.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await t.call('POST', '/import/garmin/status', { ok: true });
    const now = await t.call<Status>('GET', '/import/garmin/status');
    expect(now.body).toMatchObject({ ok: true, message: null });
  });
});

describe('export', () => {
  it('exports every table as JSON', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/export/json' });
    expect(res.headers['content-disposition']).toContain('ontheshoulder-export.json');
    const body = res.json<{ exported_at: string; tables: Record<string, unknown[]> }>();
    expect(Object.keys(body.tables)).toHaveLength(17);
    expect(body.tables.athlete).toMatchObject([{ display_name: 'Test Runner' }]);
    expect(body.tables.exercise).toHaveLength(24);
  });

  it('exports one table as CSV with a header row', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/export/csv/habit_definition' });
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe('id,key,label,prompt_text,prompt_until,enabled');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('4,protein_shake,Protein shake,Oi. Protein.,12:00,true');
  });

  it('exports an empty table as just the header', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/export/csv/activity' });
    expect(res.body.trim().split('\r\n')).toHaveLength(1);
  });

  it('only accepts table names on its list', async () => {
    for (const name of ['app_state', 'sqlite_master', 'constructor', 'athlete;drop']) {
      const res = await t.call('GET', `/export/csv/${encodeURIComponent(name)}`);
      expect(res.status, name).toBe(404);
    }
  });

  it('quotes CSV cells that need it and serialises JSON columns', () => {
    const csv = toCsv(
      ['a', 'b', 'c'],
      [
        { a: 'plain', b: 'has, comma', c: 'say "hi"' },
        { a: null, b: { k: [1, 2] }, c: 'x\ny' },
      ],
    );
    expect(csv).toBe('a,b,c\r\nplain,"has, comma","say ""hi"""\r\n,"{""k"":[1,2]}","x\ny"\r\n');
  });
});
