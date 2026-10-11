import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Block, ErrorBody, GeneratedWeek, Health, Week } from '@ots/shared';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { readConfig } from '../config.js';
import { ATHLETE, makeApp, type TestApp } from '../test/helpers.js';
import { backupName, backupStatus, listBackups, nightlyDue, runBackup } from './backup.js';
import { isLanAddress, lanGuard } from './lan-guard.js';
import { loggerOptions } from './logging.js';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
  await t.call('PUT', '/athlete', ATHLETE);
  await t.call('POST', '/setup/apply-template/rebuild-100', { start_date: '2031-01-06' });
});
afterAll(() => t.close());

describe('LAN guard: isLanAddress', () => {
  it.each([
    // loopback
    ['127.0.0.1', true],
    ['127.255.255.254', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    // RFC 1918
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['192.168.99.58', true],
    ['::ffff:192.168.1.20', true],
    // IPv6 local ranges
    ['fe80::1', true],
    ['fe80::1%eth0', true],
    ['fd12:3456:789a::1', true],
    // just outside the private ranges
    ['172.15.255.255', false],
    ['172.32.0.1', false],
    ['192.169.0.1', false],
    ['11.0.0.1', false],
    ['126.255.255.255', false],
    // public
    ['8.8.8.8', false],
    ['203.0.113.7', false],
    ['::ffff:8.8.8.8', false],
    ['2001:db8::1', false],
    ['2606:4700:4700::1111', false],
    // carrier-grade NAT and link-local IPv4 are not RFC 1918
    ['100.64.0.1', false],
    ['169.254.1.1', false],
    // junk
    ['', false],
    ['not-an-ip', false],
    ['999.1.1.1', false],
    ['1.2.3', false],
    [undefined, false],
  ])('%s is LAN: %s', (address, expected) => {
    expect(isLanAddress(address)).toBe(expected);
  });
});

describe('LAN guard: requests', () => {
  const from = (app: TestApp['app'], remoteAddress: string) =>
    app.inject({ method: 'GET', url: '/api/health', remoteAddress });

  it('answers the LAN and loopback, and refuses a public address with 403', async () => {
    expect((await from(t.app, '127.0.0.1')).statusCode).toBe(200);
    expect((await from(t.app, '192.168.1.20')).statusCode).toBe(200);
    const refused = await from(t.app, '203.0.113.7');
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'Forbidden' });
  });

  it('refuses the web app and unknown paths too, not just the api', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/', remoteAddress: '8.8.8.8' });
    expect(res.statusCode).toBe(403);
  });

  it('can be turned off with OTS_LAN_GUARD=false, and rejects a misspelt value', async () => {
    expect(readConfig({ OTS_LAN_GUARD: 'false' }).lanGuard).toBe(false);
    expect(readConfig({ OTS_LAN_GUARD: 'true' }).lanGuard).toBe(true);
    expect(readConfig({}).lanGuard).toBe(true);
    expect(() => readConfig({ OTS_LAN_GUARD: 'off' })).toThrow(/OTS_LAN_GUARD/);

    const dataDir = mkdtempSync(join(tmpdir(), 'ots-test-'));
    const open = await buildApp({ dataDir, lanGuard: false });
    expect((await from(open, '203.0.113.7')).statusCode).toBe(200);
    await open.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('logs the first rejection per address per hour, not every one', () => {
    const warn = vi.fn();
    let now = 1_000_000;
    const hook = lanGuard({ warn } as never, () => now);
    const hit = (ip: string) => {
      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      const done = vi.fn();
      hook({ ip, url: '/api/health' } as never, reply as never, done);
      return { reply, done };
    };

    expect(hit('203.0.113.7').reply.status).toHaveBeenCalledWith(403);
    hit('203.0.113.7');
    hit('203.0.113.7');
    expect(warn).toHaveBeenCalledTimes(1);

    hit('198.51.100.9'); // a different address is logged in its own right
    expect(warn).toHaveBeenCalledTimes(2);

    now += 59 * 60_000;
    hit('203.0.113.7');
    expect(warn).toHaveBeenCalledTimes(2);

    now += 2 * 60_000; // an hour after the first
    hit('203.0.113.7');
    expect(warn).toHaveBeenCalledTimes(3);

    const lan = hit('192.168.1.20');
    expect(lan.done).toHaveBeenCalled();
    expect(lan.reply.status).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe('backups', () => {
  it('names files ots-YYYYMMDD-HHmm.db in local time', () => {
    expect(backupName(new Date(2031, 0, 6, 2, 0))).toBe('ots-20310106-0200.db');
    expect(backupName(new Date(2031, 11, 25, 23, 59))).toBe('ots-20311225-2359.db');
  });

  it('writes a backup that opens as a database with the same data', async () => {
    const before = backupStatus(t.dataDir);
    expect(before).toEqual({ last: null, count: 0, latest: null });

    const result = await runBackup(t.app.openDb, t.app.log, new Date(2031, 0, 6, 2, 0));
    expect(result).toMatchObject({ file: 'ots-20310106-0200.db', count: 1, removed: [] });

    const copy = new Database(join(t.dataDir, 'backups', result.file), { readonly: true });
    const row = copy.prepare('select display_name from athlete').get();
    const habits = copy.prepare('select count(*) as n from habit_definition').get();
    copy.close();
    expect(row).toEqual({ display_name: 'Test Runner' });
    expect(habits).toEqual({ n: 5 });
  });

  it('keeps the newest 30 and deletes older ones, leaving other files alone', async () => {
    const dir = join(t.dataDir, 'backups');
    for (let day = 1; day <= 31; day++) {
      writeFileSync(join(dir, `ots-203012${String(day).padStart(2, '0')}-0200.db`), 'old');
    }
    writeFileSync(join(dir, 'notes.txt'), 'not a backup');
    expect(listBackups(t.dataDir)).toHaveLength(32);

    const result = await runBackup(t.app.openDb, t.app.log, new Date(2031, 0, 7, 2, 0));
    expect(result.count).toBe(30);
    expect(result.removed).toEqual([
      'ots-20301203-0200.db',
      'ots-20301202-0200.db',
      'ots-20301201-0200.db',
    ]);
    const files = listBackups(t.dataDir);
    expect(files).toHaveLength(30);
    expect(files[0]).toBe('ots-20310107-0200.db');
    expect(files.at(-1)).toBe('ots-20301204-0200.db');
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });

  it('knows when the nightly backup is due', () => {
    expect(nightlyDue(new Date(2031, 0, 6, 1, 59), null)).toBe(false);
    expect(nightlyDue(new Date(2031, 0, 6, 2, 0), null)).toBe(true);
    expect(nightlyDue(new Date(2031, 0, 6, 9, 30), '2031-01-05')).toBe(true);
    expect(nightlyDue(new Date(2031, 0, 6, 9, 30), '2031-01-06')).toBe(false);
    expect(nightlyDue(new Date(2031, 0, 7, 0, 30), '2031-01-06')).toBe(false);
  });

  it('POST /admin/backup takes one, and /health reports the last backup and the count', async () => {
    const taken = await t.call<{ file: string; count: number; at: string }>(
      'POST',
      '/admin/backup',
    );
    expect(taken.status).toBe(200);
    expect(taken.body.file).toMatch(/^ots-\d{8}-\d{4}\.db$/);

    const health = await t.call<Health>('GET', '/health');
    expect(health.body.backup.count).toBe(taken.body.count);
    expect(health.body.backup.last).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(health.body.garmin).toEqual({ last_sync: null });
  });

  it('GET /admin/backup/latest streams the newest backup as a download', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/backup/latest' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="ots-\d{8}-\d{4}\.db"/,
    );
    // A SQLite file starts with this header.
    expect(res.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');
  });

  it('GET /admin/backup/latest is 404 when there is none', async () => {
    const fresh = await makeApp();
    expect((await fresh.call('GET', '/admin/backup/latest')).status).toBe(404);
    await fresh.close();
  });

  it('health reports the last Garmin sync once the sidecar has reported', async () => {
    await t.call('POST', '/import/garmin/status', { ok: true });
    const health = await t.call<Health>('GET', '/health');
    expect(health.body.garmin.last_sync).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('production serve', () => {
  it('serves the web app from /, falls back to index.html, and keeps the api under /api', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ots-test-'));
    const webDir = join(dataDir, 'web');
    mkdirSync(join(webDir, 'assets'), { recursive: true });
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>On the Shoulder</title>');
    writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log("app")');
    const app = await buildApp({ dataDir, webDir });
    const get = (url: string) => app.inject({ method: 'GET', url });

    const root = await get('/');
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-type']).toContain('text/html');
    expect(root.body).toContain('On the Shoulder');

    const asset = await get('/assets/app.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');

    // A reload on a client-side route gets the app, not a 404.
    for (const path of ['/week', '/week/2031-W02', '/settings', '/strength/day/1']) {
      const res = await get(path);
      expect(res.statusCode, path).toBe(200);
      expect(res.body).toContain('On the Shoulder');
    }

    // A compressed copy left by the web build is sent to a browser that takes it.
    writeFileSync(join(webDir, 'assets', 'app.js.gz'), gzipSync('console.log("app")'));
    const zipped = await app.inject({
      method: 'GET',
      url: '/assets/app.js',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(zipped.rawPayload).toString()).toBe('console.log("app")');
    expect((await get('/assets/app.js')).headers['content-encoding']).toBeUndefined();

    expect((await get('/api/health')).json()).toMatchObject({ ok: true });
    // An unknown api path is a JSON 404, never the web app.
    const missing = await get('/api/nope');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'Not Found' });
    // Only GET falls back.
    expect((await app.inject({ method: 'POST', url: '/week' })).statusCode).toBe(404);
    // The old unprefixed api paths are gone.
    expect((await get('/health')).body).toContain('On the Shoulder');

    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('without a built web app, everything outside /api is a JSON 404', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404 });
  });
});

describe('logging', () => {
  it('writes to stdout and a daily rolling file, 14 kept, at the level given', () => {
    const options = loggerOptions('debug', join('data', 'logs')) as {
      level: string;
      transport: { targets: { target: string; options: Record<string, unknown> }[] };
    };
    expect(options.level).toBe('debug');
    expect(options.transport.targets.map((x) => x.target)).toEqual(['pino/file', 'pino-roll']);
    expect(options.transport.targets[1]?.options).toMatchObject({
      file: join('data', 'logs', 'ots'),
      frequency: 'daily',
      limit: { count: 14 },
      mkdir: true,
    });
    expect(readConfig({ OTS_LOG_DIR: '/var/log/ots', OTS_LOG_LEVEL: 'warn' })).toMatchObject({
      logDir: '/var/log/ots',
      logLevel: 'warn',
    });
  });
});

describe('rules dry run', () => {
  it('shows next week from the saved rules and writes nothing', async () => {
    await t.call('POST', '/weeks/2031-W02/generate');
    const before = await t.call<Week>('GET', '/weeks/2031-W03');
    expect(before.body.sessions).toEqual([]);

    const dry = await t.call<GeneratedWeek>('POST', '/weeks/2031-W03/dry-run');
    expect(dry.status).toBe(200);
    expect(dry.body.persisted).toBe(false);
    expect(dry.body.week.sessions).toHaveLength(10);
    expect(dry.body.week.reasoning).toContain(
      'Midweek run: 8 x 150s run / 60s walk, run block up 30s from last week.',
    );

    const after = await t.call<Week>('GET', '/weeks/2031-W03');
    expect(after.body).toEqual(before.body);
    expect(readdirSync(t.dataDir)).toContain('ots.db');
  });

  it('tries edited rules without saving them', async () => {
    const block = (await t.call<Block[]>('GET', '/blocks')).body[0] as Block;
    const rules = structuredClone(block.progression_rules) as {
      midweek_run: { run_sec_increment: number };
    };
    rules.midweek_run.run_sec_increment = 60;

    const dry = await t.call<GeneratedWeek>('POST', '/weeks/2031-W03/dry-run', { rules });
    expect(dry.body.week.reasoning).toContain(
      'Midweek run: 8 x 180s run / 60s walk, run block up 60s from last week.',
    );
    const run = dry.body.week.sessions.find((s) => s.template.key === 'midweek_run');
    expect(run?.targets.run_block_sec).toBe(180);

    // The saved rules are untouched, and still nothing is planned.
    const saved = (await t.call<Block[]>('GET', '/blocks')).body[0] as Block;
    expect(saved.progression_rules).toEqual(block.progression_rules);
    expect((await t.call<Week>('GET', '/weeks/2031-W03')).body.sessions).toEqual([]);
  });

  it('rejects bad rules naming the key, and keeps done sessions in the preview', async () => {
    const bad = await t.call<ErrorBody>('POST', '/weeks/2031-W03/dry-run', {
      rules: { vest: { default_kg: 20, unloaded_weekdays: [5], colour: 'red' } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('rules/vest/colour');

    const week = (await t.call<Week>('GET', '/weeks/2031-W02')).body;
    const first = week.sessions[0];
    if (!first) throw new Error('week not generated');
    await t.call('PATCH', `/planned-sessions/${first.id}`, { status: 'skipped' });
    const dry = await t.call<GeneratedWeek>('POST', '/weeks/2031-W02/dry-run');
    expect(dry.status).toBe(200);
    expect(dry.body.week.sessions).toHaveLength(10);
    expect(dry.body.week.sessions.find((s) => s.id === first.id)?.status).toBe('skipped');
  });
});

describe('block editing', () => {
  const make = (name: string, start_date: string, end_date: string) =>
    t.call<Block & ErrorBody>('POST', '/blocks', { name, start_date, end_date, purpose: 'base' });

  it('refuses a block that overlaps another, naming it', async () => {
    // Block 1 runs 2031-01-06 to 2031-03-16.
    const inside = await make('Inside', '2031-02-01', '2031-02-28');
    expect(inside.status).toBe(409);
    expect(inside.body.message).toContain('overlaps "Block 1: rebuild"');
    expect(inside.body.field).toBe('start_date');

    expect((await make('Touching the end', '2031-03-16', '2031-04-01')).status).toBe(409);
    expect((await make('Spanning', '2030-12-01', '2031-12-01')).status).toBe(409);

    const next = await make('Block 2', '2031-03-17', '2031-04-13');
    expect(next.status).toBe(201);

    // Editing a block against itself is fine; stretching it into a neighbour is not.
    expect(
      (await t.call('PATCH', `/blocks/${next.body.id}`, { end_date: '2031-04-20' })).status,
    ).toBe(200);
    const stretched = await t.call('PATCH', `/blocks/${next.body.id}`, {
      start_date: '2031-03-10',
    });
    expect(stretched.status).toBe(409);
  });

  it('reorders blocks back to back from the earliest start, each keeping its length', async () => {
    await make('Block 3', '2031-04-21', '2031-05-04');
    const before = (await t.call<Block[]>('GET', '/blocks')).body;
    expect(before.map((b) => [b.name, b.start_date, b.end_date])).toEqual([
      ['Block 1: rebuild', '2031-01-06', '2031-03-16'],
      ['Block 2', '2031-03-17', '2031-04-20'],
      ['Block 3', '2031-04-21', '2031-05-04'],
    ]);
    const [one, two, three] = before.map((b) => b.id) as [number, number, number];

    const res = await t.call<Block[]>('POST', '/blocks/reorder', { ids: [three, one, two] });
    expect(res.status).toBe(200);
    expect(res.body.map((b) => [b.name, b.start_date, b.end_date])).toEqual([
      ['Block 3', '2031-01-06', '2031-01-19'],
      ['Block 1: rebuild', '2031-01-20', '2031-03-30'],
      ['Block 2', '2031-03-31', '2031-05-04'],
    ]);

    // Put them back for the tests that follow.
    await t.call('POST', '/blocks/reorder', { ids: [one, two, three] });
    const restored = (await t.call<Block[]>('GET', '/blocks')).body;
    expect(restored.map((b) => [b.start_date, b.end_date])).toEqual(
      before.map((b) => [b.start_date, b.end_date]),
    );
  });

  it('rejects a reorder that does not list every block exactly once', async () => {
    const ids = (await t.call<Block[]>('GET', '/blocks')).body.map((b) => b.id);
    for (const bad of [ids.slice(1), [...ids, 9999], [ids[0], ids[0], ids[1]]]) {
      const res = await t.call<ErrorBody>('POST', '/blocks/reorder', { ids: bad });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe('ids');
    }
  });
});
