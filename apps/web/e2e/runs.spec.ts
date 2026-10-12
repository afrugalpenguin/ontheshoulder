import { expect, test, type APIRequestContext } from '@playwright/test';

// Runs as a time box: the same range two weeks running, a run logged in two
// taps and a chip, and the run-walk ladder brought back from the rules editor.
// Uses two weeks late in the starter block that no other flow touches.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
const WEEK_1 = '2031-W09';
const WEEK_2 = '2031-W10';
const TUESDAY_8AM = new Date(Date.UTC(2031, 1, 25, 8, 0, 0));

interface Session {
  date: string;
  template: { key: string; name: string };
  targets: Record<string, number>;
}

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

/** The run sessions of a generated week, trimmed to what matters here. */
async function generateRuns(request: APIRequestContext, isoWeek: string) {
  const res = await (await request.post(`${API}/weeks/${isoWeek}/generate?force=true`)).json();
  return (res.week.sessions as Session[])
    .filter((s) => ['midweek_run', 'long_run'].includes(s.template.key))
    .map((s) => ({ date: s.date, template: s.template.name, targets: s.targets }));
}

test('time box: two weeks the same, and a run logged in two taps plus the chip', async ({
  page,
  request,
}) => {
  await seed(request);
  const first = await generateRuns(request, WEEK_1);
  const second = await generateRuns(request, WEEK_2);
  console.log(`${WEEK_1} runs: ${JSON.stringify(first)}`);
  console.log(`${WEEK_2} runs: ${JSON.stringify(second)}`);
  expect(first.map((s) => s.targets)).toEqual([
    { min_min: 40, max_min: 50 },
    { min_min: 50, max_min: 60 },
  ]);
  expect(second.map((s) => s.targets)).toEqual(first.map((s) => s.targets));

  await page.clock.setFixedTime(TUESDAY_8AM);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: new RegExp(WEEK_1) })).toBeVisible();
  const tuesday = page.getByRole('region', { name: 'Tuesday 25 Feb' });
  const run = tuesday.getByRole('article', { name: 'Midweek run' });
  await expect(run).toContainText('40 to 50 min, your pace');
  const sunday = page.getByRole('region', { name: 'Sunday 2 Mar' });
  await sunday.getByRole('button', { name: /^Sun/ }).click();
  await expect(sunday.getByRole('article', { name: 'Long run' })).toContainText(
    '50 to 60 min, your pace',
  );

  // Log (tap one), the optional chip, Save (tap two).
  let taps = 0;
  await run.getByRole('button', { name: 'Log' }).click();
  taps++;
  const sheet = page.getByRole('dialog', { name: 'Log Midweek run' });
  await expect(sheet.getByRole('textbox', { name: 'Minutes' })).toHaveValue('45');
  await expect(sheet.getByRole('textbox')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'fine' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  taps++;
  console.log(`taps to log the run: ${taps}, plus the chip`);
  expect(taps).toBe(2);

  await expect(run).toContainText('Done');
  await expect(page.getByLabel('This week so far')).toContainText(/run 45 min/i);
  const activities = await (
    await request.get(`${API}/activities?from=2031-02-25&to=2031-02-25&kind=run`)
  ).json();
  console.log(`saved run: ${JSON.stringify(activities[0])}`);
  expect(activities[0]).toMatchObject({
    kind: 'run',
    duration_min: 45,
    distance_km: null,
    avg_hr: null,
    detail: { feel: 'fine' },
  });
});

test('rules editor: runwalk mode brings the ladder back, and an unknown mode is refused', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.clock.setFixedTime(TUESDAY_8AM);
  await page.goto('/settings');
  await page.getByText('Blocks and rules').click();
  const editor = page.getByRole('region', { name: 'Rules for Block 1: rebuild' });
  const input = editor.getByLabel('Progression rules (JSON)');
  await expect(input).toHaveValue(/"mode": "timebox"/);
  const original = await input.inputValue();

  await input.fill(original.replace('"mode": "timebox"', '"mode": "tempo"'));
  await expect(editor.getByRole('alert')).toContainText('runs/mode');
  await expect(editor.getByRole('button', { name: 'Save rules' })).toBeDisabled();

  await input.fill(original.replace('"mode": "timebox"', '"mode": "runwalk"'));
  await expect(editor.getByLabel('Rules diff')).toContainText('+ "mode": "runwalk"');
  await editor.getByRole('button', { name: 'Save rules' }).click();
  await expect(editor.getByText(/^Rules saved/)).toBeVisible();

  // Regenerate next week from Week: the ladder's first week is back on the cards.
  await page.goto(`/week/${WEEK_2}`);
  await page.getByText('Plan', { exact: true }).click();
  await page.getByRole('button', { name: 'Regenerate this week' }).click();
  const tuesday = page.getByRole('region', { name: 'Tuesday 4 Mar' });
  await tuesday.getByRole('button', { name: /^Tue/ }).click();
  await expect(tuesday.getByRole('article', { name: 'Midweek run' })).toContainText(
    '8 x 2:00 / 1:00',
  );
  const sunday = page.getByRole('region', { name: 'Sunday 9 Mar' });
  await sunday.getByRole('button', { name: /^Sun/ }).click();
  await expect(sunday.getByRole('article', { name: 'Long run' })).toContainText('10 x 2:00 / 1:00');

  const week = await (await request.get(`${API}/weeks/${WEEK_2}`)).json();
  const runs = (week.sessions as Session[])
    .filter((s) => ['midweek_run', 'long_run'].includes(s.template.key))
    .map((s) => ({ date: s.date, template: s.template.name, targets: s.targets }));
  console.log(`${WEEK_2} runs in runwalk mode: ${JSON.stringify(runs)}`);
  const following = await generateRuns(request, '2031-W11');
  console.log(`2031-W11 runs in runwalk mode: ${JSON.stringify(following)}`);
  expect(following.map((s) => [s.targets.repeats, s.targets.run_block_sec])).toEqual([
    [8, 150],
    [13, 120],
  ]);

  // Put the block back to time boxes so the flows after this one see the default.
  const block = (await (await request.get(`${API}/blocks`)).json())[0];
  await request.patch(`${API}/blocks/${block.id}`, {
    data: { progression_rules: { ...block.progression_rules, runs: { mode: 'timebox' } } },
  });
  const restored = await generateRuns(request, WEEK_2);
  expect(restored.map((s) => s.targets)).toEqual([
    { min_min: 40, max_min: 50 },
    { min_min: 50, max_min: 60 },
  ]);
});
