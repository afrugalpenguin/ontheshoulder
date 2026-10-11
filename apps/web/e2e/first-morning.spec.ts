import { expect, test } from '@playwright/test';

// One flow, phone-sized: fresh database, setup with the starter template, land
// on Week with today open, check in with no Save button, dismiss the protein
// prompt, do the vest walk in two taps, watch compliance move, then skip the
// optional Sunday run. The browser clock starts on a synthetic Monday morning
// so the day has a vest walk and the prompt is live. A second test comes back
// that evening for the prompt about tomorrow.

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

  // Week is home: four tabs, the header line, today open and the rest one line each.
  await expect(page.getByRole('heading', { name: /2031-W02/ })).toBeVisible();
  await expect(page.getByText('Example 100 in 21 weeks, 5 days')).toBeVisible();
  const compliance = page.getByLabel('Week compliance');
  await expect(compliance).toContainText('mornings 0 of 4');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Week',
    'Strength',
    'Trends',
    'Settings',
  ]);
  await expect(page.getByLabel('Streaks')).toContainText('Weeks in a row0');
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

  // The protein prompt is live before noon; "not today" hides it.
  await expect(page.getByText('Oi. Protein.')).toBeVisible();
  await page.getByRole('button', { name: 'Not today: Protein shake' }).click();
  await expect(page.getByText('Oi. Protein.')).toBeHidden();

  // Check-in: every tap saves, there is no Save button.
  const checkin = monday.getByRole('region', { name: 'Check-in' });
  await expect(checkin.getByRole('button', { name: /save/i })).toHaveCount(0);
  await checkin.getByRole('radio', { name: 'Sleep 4' }).click();
  await checkin.getByRole('radio', { name: 'Energy 3' }).click();
  await checkin.getByRole('textbox', { name: 'Weight' }).fill('70');
  await checkin.getByRole('textbox', { name: 'Weight' }).press('Enter');
  await checkin.getByRole('button', { name: 'Increase Weight' }).click();
  await checkin.getByRole('button', { name: 'Alcohol free' }).click();
  await expect(checkin.getByRole('button', { name: 'Alcohol free' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The dismissal and the check-in live on the server, so they survive a reload.
  await page.reload();
  await expect(checkin.getByRole('radio', { name: 'Sleep 4' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(checkin.getByRole('radio', { name: 'Energy 3' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(checkin.getByRole('textbox', { name: 'Weight' })).toHaveValue('70.1');
  await expect(checkin.getByRole('button', { name: 'Alcohol free' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Oi. Protein.')).toBeHidden();
  const saved = await (await request.get(`${API}/checkins/2031-01-06`)).json();
  console.log(`check-in after reload: ${JSON.stringify(saved)}`);
  expect(saved).toMatchObject({
    sleep_quality: 4,
    energy: 3,
    weight_kg: 70.1,
    habits: { alcohol_free: true },
    dismissed_prompts: ['protein_shake'],
  });

  // The vest walk in two taps: Start (the timer runs at once), then Finish.
  const walk = monday.getByRole('article', { name: 'Vest walk' });
  await expect(walk).toContainText('60 min, 20kg');
  let taps = 0;
  await walk.getByRole('link', { name: 'Start' }).click();
  taps++;
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('01:00:01');
  await page.getByRole('button', { name: 'Finish' }).click();
  taps++;
  console.log(`taps to log the vest walk: ${taps}`);
  expect(taps).toBe(2);

  await expect(page.getByRole('status')).toContainText('Vest walk logged');
  await expect(walk).toContainText('Done');
  await expect(compliance).toContainText('mornings 1 of 4');
  await expect(page.getByLabel('Streaks')).toContainText('Mornings in a row1');
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
  await expect(compliance).toContainText('Bonus: not this week');
  await expect(compliance).toContainText('mornings 1 of 4');
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
