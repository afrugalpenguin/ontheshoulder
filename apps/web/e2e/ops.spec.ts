import { expect, test, type APIRequestContext } from '@playwright/test';

// Settings as an operations surface: edit a block's rules with validation and a
// diff, dry run next week without writing anything, add a block, take a backup.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
// A Wednesday inside the starter block, in a week no other flow touches.
const NOW = new Date(Date.UTC(2031, 1, 5, 10, 0, 0));
const NEXT_WEEK = '2031-W07';

async function seed(request: APIRequestContext) {
  const status = await (await request.get(`${API}/setup/status`)).json();
  if (!status.complete) {
    await request.put(`${API}/athlete`, { data: { display_name: 'Test Runner' } });
    await request.post(`${API}/events`, {
      data: { name: 'Example 100', date: '2032-06-05', priority: 'A' },
    });
    await request.post(`${API}/setup/apply-template/rebuild-100`, {
      data: { start_date: '2031-01-06' },
    });
  }
}

test('rules editor: validation, diff and a dry run that writes nothing', async ({
  page,
  request,
}) => {
  await seed(request);
  const weekBefore = await (await request.get(`${API}/weeks/${NEXT_WEEK}`)).text();
  const blocksBefore = await (await request.get(`${API}/blocks`)).text();

  await page.clock.setFixedTime(NOW);
  await page.goto('/settings');
  await page.getByText('Blocks and rules').click();

  // The current block's rules open by default.
  const editor = page.getByRole('region', { name: 'Rules for Block 1: rebuild' });
  const input = editor.getByLabel('Progression rules (JSON)');
  await expect(input).toHaveValue(/"run_sec_increment": 30/);
  await expect(editor.getByRole('status')).toHaveText('Valid. Same as saved.');
  const original = await input.inputValue();

  // A typo in a key is caught before anything is sent.
  await input.fill(original.replace('"run_sec_increment"', '"run_sec_incremnt"'));
  await expect(editor.getByRole('alert')).toContainText(
    'midweek_run/run_sec_incremnt is not a known rule key',
  );
  await expect(editor.getByRole('button', { name: 'Save rules' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Dry run next week' })).toBeDisabled();

  // Broken JSON too.
  await input.fill(original.slice(0, -3));
  await expect(editor.getByRole('alert')).toContainText('Not valid JSON');

  // A real change: the long run adds 5 repeats a week instead of 3.
  await input.fill(original.replace('"repeats_increment": 3', '"repeats_increment": 5'));
  await expect(editor.getByRole('status')).toHaveText('Valid. Not saved yet.');
  const diff = editor.getByLabel('Rules diff');
  await expect(diff).toContainText('- "repeats_increment": 3,');
  await expect(diff).toContainText('+ "repeats_increment": 5,');

  await editor.getByRole('button', { name: 'Dry run next week' }).click();
  const result = editor.getByRole('region', { name: 'Dry run result' });
  await expect(result).toContainText(`${NEXT_WEEK}, starting Monday 10 February`);
  await expect(result).toContainText('Nothing was saved.');
  await expect(result).toContainText('Midweek run:');
  await expect(result).toContainText('Long run:');
  await expect(result).toContainText('Vest walks: 20kg.');
  await expect(result.getByRole('listitem').filter({ hasText: 'Long run' }).last()).toContainText(
    '(optional)',
  );
  console.log(
    `dry run reasoning:\n  ${(await result.locator('ul').first().innerText()).replaceAll('\n', '\n  ')}`,
  );

  // Nothing was written: the week and the saved rules are byte for byte the same.
  expect(await (await request.get(`${API}/weeks/${NEXT_WEEK}`)).text()).toBe(weekBefore);
  expect(await (await request.get(`${API}/blocks`)).text()).toBe(blocksBefore);
  console.log(
    `GET /weeks/${NEXT_WEEK} before and after the dry run: identical (${weekBefore.length} bytes, 0 sessions)`,
  );

  // Discard puts the saved rules back.
  await editor.getByRole('button', { name: 'Discard changes' }).click();
  await expect(editor.getByRole('status')).toHaveText('Valid. Same as saved.');
});

test('blocks: an overlapping block is refused, a following one is added', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.clock.setFixedTime(NOW);
  await page.goto('/settings');
  await page.getByText('Blocks and rules').click();

  await page.getByRole('button', { name: 'Add a block' }).click();
  const form = page.getByRole('form', { name: 'Add block' });
  await form.getByLabel('Block name').fill('Overlap test');
  await form.getByLabel('Starts').fill('2031-02-01');
  await form.getByLabel('Ends').fill('2031-02-20');
  await form.getByRole('button', { name: 'Add block' }).click();
  await expect(form.getByRole('alert')).toContainText('overlaps "Block 1: rebuild"');

  await form.getByLabel('Block name').fill('Block 2: base');
  await form.getByLabel('Starts').fill('2031-03-17');
  await form.getByLabel('Ends').fill('2031-05-11');
  await form.getByLabel('Purpose').selectOption('base');
  await form.getByRole('button', { name: 'Add block' }).click();
  await expect(page.getByRole('button', { name: 'Edit Block 2: base' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Block 2: base earlier' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Move Block 1: rebuild earlier' })).toBeDisabled();
});

test('backups: back up now, then the download is on offer', async ({ page, request }) => {
  await seed(request);
  await page.goto('/settings');
  await page.getByText('Data folder and backups').click();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByRole('status')).toContainText(/Saved ots-\d{8}-\d{4}\.db/);
  await expect(page.getByLabel('Backup status')).toContainText('Last backup');
  const link = page.getByRole('link', { name: 'Download latest backup' });
  await expect(link).toHaveAttribute('href', '/api/admin/backup/latest');

  const download = await request.get(`${API}/admin/backup/latest`);
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 15).toString()).toBe('SQLite format 3');
});
