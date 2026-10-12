import { expect, test } from '@playwright/test';

// One flow, phone-sized: fresh database, setup with the starter template, land
// on Week with today open and both of the day's sessions on the first screen,
// dismiss the protein prompt, check in with no Save button, tick the vest walk
// in one tap, watch the header line appear, then skip the optional Sunday run.
// The browser clock starts on a synthetic Monday morning so the day has a vest
// walk and the prompt is live. A second test comes back that evening for the
// prompt about tomorrow, and a third looks at the page on a wide screen.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
const MONDAY_8AM = new Date(Date.UTC(2031, 0, 6, 8, 0, 0));
const MONDAY_8PM = new Date(Date.UTC(2031, 0, 6, 20, 5, 0));

test('first morning: setup, week, check-in, prompt, vest walk, compliance', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: MONDAY_8AM });
  await page.goto('/');

  // Setup wizard
  await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible();
  await page.getByLabel('Your name').fill('Test Runner');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Event name').fill('Example 100');
  await page.getByLabel('Date').fill('2031-06-07');
  await page.getByLabel('Distance (km)').fill('161');
  await page.getByLabel('Time limit (hours)').fill('48');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('checkbox', { name: 'I have a barbell' }).check();
  await page.getByRole('button', { name: 'Add standard set' }).click();
  await page.getByRole('checkbox', { name: 'I have a vest' }).check();
  await expect(page.getByText('32 loads, 20 to 97.5kg')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  const preview = page.getByRole('region', { name: 'Week preview' });
  await expect(preview).toContainText('Vest walk (am)');
  await expect(preview).toContainText('Sat nothing');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByLabel('Data folder')).toContainText('ots-e2e');
  await page.getByRole('button', { name: 'Finish' }).click();

  // Week is home: four tabs, a short header, today open and the rest one line each.
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toContainText('6 to 12 Jan');
  await expect(title).toContainText('2031-W02');
  await expect(page.getByText('Example 100 in 21 weeks, 5 days')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Week',
    'Strength',
    'Trends',
    'Settings',
  ]);
  // A brand-new install has nothing to report: no line of zeros, no streaks, no
  // word about the optional session.
  const line = page.getByLabel('This week so far');
  await expect(line).toHaveCount(0);
  const header = (await page.locator('.page-head').innerText()).replace(/\s+/g, ' ');
  console.log(`header on a new install: ${header}`);
  expect(header.replace('2031-W02', '')).not.toMatch(/\b0\b|not this week|in a row/i);

  const monday = page.getByRole('region', { name: 'Monday 6 Jan' });
  await expect(monday.getByRole('button', { name: /^Mon/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(monday).toBeInViewport();
  const tuesday = page.getByRole('region', { name: 'Tuesday 7 Jan' });
  await expect(tuesday.getByRole('button', { name: /^Tue/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(tuesday.getByRole('article')).toHaveCount(0);

  // The day first: both of Monday's sessions have their primary button on the
  // first screen, with nothing scrolled, and the check-in comes after them.
  const walk = monday.getByRole('article', { name: 'Vest walk' });
  const ride = monday.getByRole('article', { name: 'Turbo long ride' });
  const walkDone = walk.getByRole('button', { name: 'Done' });
  const rideLog = ride.getByRole('button', { name: 'Log', exact: true });
  await expect(walkDone).toBeInViewport({ ratio: 1 });
  await expect(rideLog).toBeInViewport({ ratio: 1 });
  const checkin = monday.getByRole('region', { name: 'Check-in' });
  const bottoms = {
    viewport: page.viewportSize(),
    walk_done: await walkDone.boundingBox(),
    ride_log: await rideLog.boundingBox(),
    checkin: await checkin.boundingBox(),
  };
  console.log(`first screen at 390 x 844: ${JSON.stringify(bottoms)}`);
  expect((bottoms.checkin?.y ?? 0) > (bottoms.ride_log?.y ?? Infinity)).toBe(true);
  await page.screenshot({ path: 'e2e-results/week-first-screen.png' });
  // And from the top of the page, for the header.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'e2e-results/week-new-install.png' });

  // The protein prompt is live before noon; "not today" hides it.
  await expect(page.getByText('Oi. Protein.')).toBeVisible();
  await page.getByRole('button', { name: 'Not today: Protein shake' }).click();
  await expect(page.getByText('Oi. Protein.')).toBeHidden();

  // Check-in: weight and the habit chips, nothing else. Every tap saves, there
  // is no Save button, and the treadmill habit is not asked.
  await expect(checkin.getByRole('button', { name: /save/i })).toHaveCount(0);
  await expect(checkin.getByRole('radiogroup')).toHaveCount(0);
  await expect(checkin.getByRole('group', { name: 'Habits' }).getByRole('button')).toHaveText([
    'Alcohol free',
    'Prehab done',
    'Protein shake',
  ]);
  await page.screenshot({ path: 'e2e-results/week-checkin-open.png', fullPage: true });
  await checkin.getByRole('button', { name: 'Alcohol free' }).click();
  await expect(checkin.getByRole('button', { name: 'Alcohol free' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await checkin.getByRole('textbox', { name: 'Weight' }).fill('70');
  await checkin.getByRole('textbox', { name: 'Weight' }).press('Enter');
  await checkin.getByRole('button', { name: 'Increase Weight' }).click();

  // With the weight in, the card folds to one line.
  const folded = checkin.getByRole('button', { name: '70.1 kg · alcohol free' });
  await expect(folded).toBeVisible();
  await expect(checkin.getByRole('textbox', { name: 'Weight' })).toHaveCount(0);

  // The dismissal and the check-in live on the server, so they survive a reload.
  await page.reload();
  await expect(folded).toBeVisible();
  await expect(page.getByText('Oi. Protein.')).toBeHidden();
  const saved = await (await request.get(`${API}/checkins/2031-01-06`)).json();
  console.log(`check-in after reload: ${JSON.stringify(saved)}`);
  expect(saved).toMatchObject({
    sleep_quality: null,
    energy: null,
    ankle_score: null,
    weight_kg: 70.1,
    habits: { alcohol_free: true },
    dismissed_prompts: ['protein_shake'],
  });
  const habits = await (await request.get(`${API}/habits`)).json();
  const treadmill = habits.find((h: { key: string }) => h.key === 'treadmill_done');
  console.log(`treadmill habit row: ${JSON.stringify(treadmill)}`);
  expect(treadmill).toMatchObject({ key: 'treadmill_done', enabled: false });

  // The vest walk in one tap, from a cold load: Done logs it as planned.
  await expect(walk).toContainText('60 min, 20kg');
  await expect(walk.getByRole('link', { name: 'Start timer' })).toBeVisible();
  let taps = 0;
  await walkDone.click();
  taps++;
  console.log(`taps to log the vest walk: ${taps}`);
  expect(taps).toBe(1);

  await expect(page.getByRole('status')).toContainText('Vest walk logged');
  await expect(walk).toContainText('Done');
  await expect(line).toHaveText('Mornings 1 of 4 · 1 morning in a row');
  const walks = await (
    await request.get(`${API}/activities?from=2031-01-06&to=2031-01-06&kind=walk_vest`)
  ).json();
  console.log(`vest walk activity row: ${JSON.stringify(walks[0])}`);
  expect(walks).toHaveLength(1);
  expect(walks[0]).toMatchObject({ duration_min: 60, detail: { vest_kg: 20 }, source: 'manual' });
  await page.screenshot({ path: 'e2e-results/week-after-logging.png', fullPage: true });

  // Skip the optional Sunday run with a reason. It is reported as a bonus, not a miss.
  const sunday = page.getByRole('region', { name: 'Sunday 12 Jan' });
  await expect(sunday.getByLabel('Long run: Planned')).toBeVisible();
  await sunday.getByRole('button', { name: /^Sun/ }).click();
  const longRun = sunday.getByRole('article', { name: 'Long run' });
  await expect(longRun).toContainText('optional');
  await longRun.getByRole('button', { name: 'More for Long run' }).click();
  await longRun.getByRole('button', { name: 'Skip' }).click();
  await page
    .getByRole('dialog', { name: 'Why skip?' })
    .getByRole('button', { name: 'family' })
    .click();
  await expect(longRun).toContainText('Skipped: family');
  await expect(line).toHaveText('Mornings 1 of 4 · 1 morning in a row');
});

test('that evening: the prompt about tomorrow shows from 20:00 and its tick persists', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: MONDAY_8PM });
  await page.goto('/');
  const tuesday = page.getByRole('region', { name: 'Tuesday 7 Jan' });
  await expect(tuesday.getByText(/^Tomorrow: .+\. Kit out\?$/)).toBeVisible();
  console.log(`prompt: ${await tuesday.locator('.kit-banner').innerText()}`);

  const tick = tuesday.getByRole('checkbox', { name: 'Kit out for tomorrow' });
  await expect(tick).not.toBeChecked();
  await tick.click();
  await expect(tick).toBeChecked();
  await page.reload();
  await expect(tick).toBeChecked();

  const tomorrow = await (await request.get(`${API}/checkins/2031-01-07`)).json();
  console.log(`tomorrow's check-in: ${JSON.stringify(tomorrow)}`);
  expect(tomorrow.habits).toEqual({ kit_ready: true });
});

test('on a wide screen Week is the same single centred column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: MONDAY_8AM });
  await page.goto('/');
  const main = page.getByRole('main');
  const monday = page.getByRole('region', { name: 'Monday 6 Jan' });
  const tuesday = page.getByRole('region', { name: 'Tuesday 7 Jan' });
  await expect(monday).toBeVisible();
  const box = {
    main: await main.boundingBox(),
    monday: await monday.boundingBox(),
    tuesday: await tuesday.boundingBox(),
  };
  console.log(`week at 1440 wide: ${JSON.stringify(box)}`);
  // About 480px wide, the same space either side, and the days one under another.
  expect(box.main?.width).toBeLessThanOrEqual(480);
  expect(box.main?.width).toBeGreaterThan(400);
  expect(Math.abs((box.main?.x ?? 0) * 2 + (box.main?.width ?? 0) - 1440)).toBeLessThanOrEqual(20);
  expect(box.tuesday?.x).toBe(box.monday?.x);
  expect(box.tuesday?.y).toBeGreaterThan(box.monday?.y ?? Infinity);
  await page.screenshot({ path: 'e2e-results/week-1440.png' });
});
