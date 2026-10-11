import { expect, test } from '@playwright/test';

// One flow, phone-sized: fresh database, setup with the starter template,
// check-in, dismiss the protein prompt, log the vest walk, watch compliance
// move, then skip the optional Sunday run. The browser clock is fixed to a
// synthetic Monday morning so the day has a vest walk and the prompt is live.

const MONDAY_8AM = new Date(Date.UTC(2031, 0, 6, 8, 0, 0));

test('first morning: setup, check-in, prompt, log, compliance', async ({ page }) => {
  await page.clock.setFixedTime(MONDAY_8AM);
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

  // Today
  await expect(page.getByRole('heading', { name: 'Monday 6 January' })).toBeVisible();
  await expect(page.getByText('Example 100 in 21 weeks, 5 days')).toBeVisible();
  const compliance = page.getByLabel('Week compliance');
  await expect(compliance).toContainText('treadmill mornings 0 of 4');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  // The protein prompt is live before noon; "not today" hides it.
  await expect(page.getByText('Oi. Protein.')).toBeVisible();
  await page.getByRole('button', { name: 'Not today: Protein shake' }).click();
  await expect(page.getByText('Oi. Protein.')).toBeHidden();

  // Check-in
  await page.getByRole('radio', { name: 'Sleep 4' }).click();
  await page.getByRole('radio', { name: 'Energy 3' }).click();
  await page.getByLabel('Weight (kg)').fill('70');
  await page.getByRole('checkbox', { name: 'Alcohol free' }).check();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Checked in: sleep 4, energy 3, 70kg')).toBeVisible();

  // Log the vest walk from its pre-filled form.
  const walk = page.getByRole('article', { name: 'Vest walk' });
  await expect(walk).toContainText('60 min, 20kg');
  await walk.getByRole('button', { name: 'Log' }).click();
  await expect(walk.getByLabel('Minutes')).toHaveValue('60');
  await expect(walk.getByLabel('Vest (kg)')).toHaveValue('20');
  await walk.getByRole('radio', { name: 'RPE 3' }).click();
  await walk.getByRole('button', { name: 'Save' }).click();
  await expect(walk).toContainText('Done');
  await expect(compliance).toContainText('treadmill mornings 1 of 4');

  await page.screenshot({ path: 'e2e-results/today-after-logging.png', fullPage: true });

  // The dismissal and the check-in live on the server, so they survive a reload.
  await page.reload();
  await expect(page.getByText('Checked in: sleep 4, energy 3, 70kg')).toBeVisible();
  await expect(page.getByText('Oi. Protein.')).toBeHidden();

  // Week: skip the optional Sunday run with a reason. It is reported as a bonus, not a miss.
  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { name: /2031-W02/ })).toBeVisible();
  const sunday = page.getByRole('region', { name: 'Sunday 12 Jan' });
  const longRun = sunday.getByRole('article', { name: 'Long run' });
  await expect(longRun).toContainText('optional');
  await longRun.getByRole('button', { name: 'Skip' }).click();
  await longRun.getByRole('button', { name: 'family' }).click();
  await expect(longRun).toContainText('Skipped: family');
  await expect(page.getByLabel('Week compliance')).toContainText('Bonus: not this week');
  await expect(page.getByLabel('Week compliance')).toContainText('treadmill mornings 1 of 4');
});
