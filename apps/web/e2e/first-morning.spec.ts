import { expect, test } from '@playwright/test';

// One flow, phone-sized: fresh database, setup with the starter template, land
// on Week with today open and both of the day's sessions on the first screen,
// dismiss the protein prompt, check in with no Save button, tick the vest walk
// in one tap, watch the header line appear, then skip the optional Sunday run.
// The browser clock starts on a synthetic Monday morning so the day has a vest
// walk and the prompt is live. A second test comes back that evening for the
// prompt about tomorrow, and a third looks at the page on a wide screen. Then
// Tuesday and Friday: the prehab card above the morning's session, the question
// about last night, and the weeknights line in Trends.

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
  // Monday: weight and protein only. Last night is asked Tuesday to Friday, and
  // prehab is a session on its own days, not a habit.
  await expect(checkin.getByRole('group', { name: 'Habits' }).getByRole('button')).toHaveText([
    'Protein shake',
  ]);
  await expect(checkin).not.toContainText(/Last night|Alcohol|Prehab/);
  await checkin.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(checkin).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'e2e-results/checkin-monday.png' });
  await checkin.getByRole('button', { name: 'Protein shake' }).click();
  await expect(checkin.getByRole('button', { name: 'Protein shake' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await checkin.getByRole('textbox', { name: 'Weight' }).fill('70');
  await checkin.getByRole('textbox', { name: 'Weight' }).press('Enter');
  await checkin.getByRole('button', { name: 'Increase Weight' }).click();

  // With the weight in, the card folds to one line.
  const folded = checkin.getByRole('button', { name: '70.1 kg · protein shake' });
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
    habits: { protein_shake: true },
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

const TUESDAY_8AM = new Date(Date.UTC(2031, 0, 7, 8, 0, 0));
const FRIDAY_8AM = new Date(Date.UTC(2031, 0, 10, 8, 0, 0));
const EXERCISES = [
  'Single-leg balance, eyes open then closed',
  'Slow calf raises off a step, two up one down',
  'Edge walking, outside then inside edges',
  'Toe spreads and towel scrunches',
  'Ankle circles and alphabet',
];

test('Tuesday: prehab above the run, done in one tap, and the question about last night', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: TUESDAY_8AM });
  await page.goto('/');
  const tuesday = page.getByRole('region', { name: 'Tuesday 7 Jan' });
  await expect(tuesday.getByRole('article')).toHaveText([/^PREPrehab/, /^RUNMidweek run/]);

  // The five exercises and their doses are on the card, with nothing to open.
  const prehab = tuesday.getByRole('article', { name: 'Prehab' });
  const items = prehab.getByRole('list', { name: 'Prehab exercises' }).getByRole('listitem');
  await expect(items).toHaveCount(5);
  for (const [index, name] of EXERCISES.entries()) {
    await expect(items.nth(index)).toContainText(name);
    await expect(items.nth(index)).toBeInViewport({ ratio: 1 });
  }
  console.log(
    `prehab card: ${(await items.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')}`,
  );
  await page.screenshot({ path: 'e2e-results/prehab-tuesday.png' });

  // Tuesday's check-in: weight, protein and Last night, two plain buttons.
  const checkin = tuesday.getByRole('region', { name: 'Check-in' });
  await expect(checkin.getByRole('group', { name: 'Habits' }).getByRole('button')).toHaveText([
    'Protein shake',
  ]);
  const lastNight = checkin.getByRole('radiogroup', { name: 'Last night' });
  await expect(lastNight.getByRole('radio')).toHaveText(['Alcohol-free', 'Had a drink']);
  await checkin.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(lastNight).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'e2e-results/checkin-tuesday.png' });

  // Both buttons look the same until one is chosen, and no warning or success colour is used.
  const colours = await lastNight.getByRole('radio').evaluateAll((buttons) =>
    buttons.map((b) => {
      const style = getComputedStyle(b);
      return `${style.backgroundColor} ${style.color} ${style.borderColor}`;
    }),
  );
  expect(colours[0]).toBe(colours[1]);
  await lastNight.getByRole('radio', { name: 'Last night Alcohol-free' }).click();
  await expect(lastNight.getByRole('radio', { name: 'Last night Alcohol-free' })).toBeChecked();
  const saved = await (await request.get(`${API}/checkins/2031-01-07`)).json();
  console.log(`Tuesday check-in: ${JSON.stringify(saved.habits)}`);
  expect(saved.habits).toMatchObject({ alcohol_free: true });

  // One Done. It is not a treadmill morning, so the header line does not move.
  const line = page.getByLabel('This week so far');
  await expect(line).toHaveText('Mornings 1 of 4 · 1 morning in a row');
  await prehab.getByRole('button', { name: 'Done' }).click();
  await expect(prehab).toContainText('Done');
  await expect(page.getByRole('status')).toContainText('Prehab logged');
  await expect(line).toHaveText('Mornings 1 of 4 · 1 morning in a row');
  const compliance = await (await request.get(`${API}/weeks/2031-W02/compliance`)).json();
  console.log(`compliance after prehab done: ${JSON.stringify(compliance)}`);
  expect(compliance.treadmill.days_done).toBe(1);
});

test('Friday: prehab above the treadmill walk, and the weeknights line in Trends', async ({
  page,
  request,
}) => {
  // Wednesday morning's answer, given the way the check-in gives it.
  await request.put(`${API}/checkins/2031-01-08`, { data: { habits: { alcohol_free: false } } });

  await page.clock.install({ time: FRIDAY_8AM });
  await page.goto('/');
  const friday = page.getByRole('region', { name: 'Friday 10 Jan' });
  await expect(friday.getByRole('article')).toHaveText([
    /^PREPrehab/,
    /^WALKTreadmill walk/,
    /^LIFTStrength B/,
  ]);
  const prehab = friday.getByRole('article', { name: 'Prehab' });
  await expect(prehab.getByRole('listitem')).toHaveCount(5);
  await expect(prehab.getByRole('listitem').last()).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'e2e-results/prehab-friday.png' });

  // Trends: one quiet line. Tuesday yes, Wednesday no, Thursday and Friday not
  // answered: two not recorded, never counted as drinks.
  await page.getByRole('link', { name: 'Trends' }).click();
  const weeknights = page.getByRole('region', { name: 'Weeknights' });
  await expect(weeknights.getByRole('listitem')).toHaveText([
    'Week of 6 Jan. AF weeknights: 1 of 4, 2 not recorded',
  ]);
  console.log(`trends line: ${await weeknights.innerText()}`);
  // Plain muted text: the same colour as any other muted line, no chart inside.
  await expect(weeknights.locator('canvas')).toHaveCount(0);
  await weeknights.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e-results/trends-weeknights.png' });
});
