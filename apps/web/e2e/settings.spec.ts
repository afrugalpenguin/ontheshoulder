import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

// Settings: seven collapsible cards that remember how they were left, and the
// data folder moved from the UI to a new temp folder. The api under test reads
// its data folder from a config file (see playwright.config.ts), so the move
// is the real procedure: copy, verify, update the config, ask for a restart.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
const CONFIG = process.env.OTS_E2E_CONFIG as string;
const OLD_DIR = process.env.OTS_E2E_DATA_DIR as string;
const TITLES = [
  'Athlete and events',
  'Fixtures',
  'Equipment',
  'Habits and prompts',
  'Blocks and rules',
  'Data',
  'About',
];

const savedConfig = () => JSON.parse(readFileSync(CONFIG, 'utf8')) as { data_dir: string };

async function seed(request: APIRequestContext) {
  const status = await (await request.get(`${API}/setup/status`)).json();
  if (!status.complete) {
    await request.put(`${API}/athlete`, { data: { display_name: 'Test Runner' } });
    await request.post(`${API}/events`, {
      data: { name: 'Example 100', date: '2031-06-07', priority: 'A' },
    });
    await request.post(`${API}/setup/apply-template/rebuild-100`, {
      data: { start_date: '2031-01-06' },
    });
  }
}

/** The api's log lines about the move, oldest first, from its rolling log file. */
function moveLogLines(): { msg: string; [key: string]: unknown }[] {
  const dir = join(OLD_DIR, 'logs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.log'))
    .flatMap((name) => readFileSync(join(dir, name), 'utf8').split('\n'))
    .filter((line) => line.includes('data folder move'))
    .map((line) => JSON.parse(line) as { msg: string });
}

test('every section is collapsible and its state survives a reload', async ({ page, request }) => {
  await seed(request);
  await page.goto('/settings');
  const sections = page.getByRole('region').filter({ has: page.locator('.section-toggle') });
  await expect(sections).toHaveCount(TITLES.length);
  const toggle = (title: string) =>
    page.getByRole('region', { name: title, exact: true }).locator('.section-toggle');
  const states = async () =>
    Promise.all(
      TITLES.map(async (t) => (await toggle(t).getAttribute('aria-expanded')) === 'true'),
    );
  const names = await sections.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(names).toEqual(TITLES);
  expect(await states()).toEqual(TITLES.map(() => false));

  // Open every one, and see that each has contents.
  for (const title of TITLES) {
    await toggle(title).click();
    await expect(toggle(title)).toHaveAttribute('aria-expanded', 'true');
    const body = page.locator(`#${await toggle(title).getAttribute('aria-controls')}`);
    await expect(body).toBeVisible();
    await expect(body.locator('*').first()).toBeVisible();
  }
  await page.screenshot({ path: 'e2e-results/settings-all-open.png', fullPage: true });
  await page.reload();
  expect(await states()).toEqual(TITLES.map(() => true));

  // Close all but two; that is what comes back.
  for (const title of TITLES.filter((t) => t !== 'Data' && t !== 'About')) {
    await toggle(title).click();
    await expect(toggle(title)).toHaveAttribute('aria-expanded', 'false');
  }
  await page.reload();
  const after = await states();
  console.log(
    `sections after closing five and reloading: ${TITLES.map((t, i) => `${t}=${after[i] ? 'open' : 'closed'}`).join(', ')}`,
  );
  expect(after).toEqual(TITLES.map((t) => t === 'Data' || t === 'About'));
  await expect(page.locator('dl[aria-label="Data folder"]')).toBeVisible();
  await expect(page.locator('dl[aria-label="About"]')).toContainText('MIT');
});

test('data folder: bad paths are refused, a good one is copied, verified and switched to', async ({
  page,
  request,
}) => {
  await seed(request);
  const target = join(tmpdir(), `ots-e2e-moved-${Date.now()}`);
  // Whatever the config says now (a retry of this test starts after a move).
  const configuredBefore = savedConfig().data_dir;

  await page.goto('/settings');
  await page.getByRole('region', { name: 'Data', exact: true }).locator('.section-toggle').click();
  const facts = page.locator('dl[aria-label="Data folder"]');
  await expect(facts).toContainText(OLD_DIR);
  await expect(facts).toContainText(/\d+(\.\d)? (kB|MB)/);

  await page.getByRole('button', { name: 'Change folder' }).click();
  const sheet = page.getByRole('dialog', { name: 'Change data folder' });
  const field = sheet.getByLabel('New folder');
  const submit = sheet.getByRole('button', { name: 'Copy and switch' });

  // A network path, a folder inside the repo, and the folder already in use.
  const refused: [string, RegExp][] = [
    ['\\\\nas\\share\\ontheshoulder', /network path\. The data folder must be on this PC/],
    [join(process.cwd(), 'data-here'), /inside the app folder/],
    [OLD_DIR, /current data folder/],
  ];
  for (const [path, message] of refused) {
    await field.fill(path);
    await submit.click();
    await expect(sheet.getByRole('alert')).toContainText(message);
    console.log(`refused: ${(await sheet.getByRole('alert').innerText()).trim()}`);
  }
  expect(savedConfig().data_dir).toBe(configuredBefore);
  expect(existsSync(join(process.cwd(), 'data-here'))).toBe(false);

  // A new temp folder: copied, checked, config updated, restart asked for.
  await field.fill(target);
  await submit.click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByText(/^Copied \d+ rows in \d+ tables\. Restart to switch\.$/),
  ).toBeVisible();
  const notice = page.getByRole('status', { name: 'Restart required' });
  await expect(notice).toContainText(target);
  // Run from source, as here, the api cannot restart itself and the UI says so.
  await expect(notice).toContainText('start it again by hand');

  expect(savedConfig().data_dir).toBe(target);
  expect(existsSync(join(target, 'ots.db'))).toBe(true);
  expect(readdirSync(join(target, 'backups')).length).toBeGreaterThan(0);
  const marker = readdirSync(OLD_DIR).find((name) => /^MOVED-\d{4}-\d{2}-\d{2}\.txt$/.test(name));
  expect(marker).toBeDefined();
  expect(readFileSync(join(OLD_DIR, marker as string), 'utf8')).toContain(target);
  // Nothing was deleted from the old folder, and the running api still uses it.
  expect(existsSync(join(OLD_DIR, 'ots.db'))).toBe(true);
  await expect(facts).toContainText(OLD_DIR);

  // The api's own account of it, from its log file.
  const steps = () => moveLogLines().filter((l) => !/failed/.test(l.msg));
  await expect.poll(() => steps().length % 6 === 0 && steps().length > 0).toBe(true);
  const lines = steps().slice(-6);
  const NOISE = new Set(['msg', 'level', 'time', 'pid', 'hostname', 'reqId']);
  for (const line of lines) {
    const detail = Object.fromEntries(Object.entries(line).filter(([key]) => !NOISE.has(key)));
    console.log(`api log: ${line.msg} ${JSON.stringify(detail)}`);
  }
  const verified = lines.find((l) => /row counts match/.test(l.msg)) as unknown as {
    tables: number;
    rows: number;
  };
  expect(verified.tables).toBeGreaterThan(10);
  expect(verified.rows).toBeGreaterThan(50);
  console.log(`config data_dir is now: ${savedConfig().data_dir}`);
  console.log(`old folder marker: ${marker}`);

  // The state survives a reload: the restart is still owed.
  await page.reload();
  await expect(page.getByRole('status', { name: 'Restart required' })).toContainText(target);
  await page.screenshot({ path: 'e2e-results/settings-restart-required.png', fullPage: true });
});
