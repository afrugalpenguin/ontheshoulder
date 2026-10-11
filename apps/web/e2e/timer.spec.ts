import { expect, test, type APIRequestContext } from '@playwright/test';

// The timer in a real browser with a controlled clock. A 60 minute vest walk is
// fast-forwarded (the same thing a locked phone does to a page: no ticks, then
// a jump), and the rest timer demo is run second by second.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}`;
const WEDNESDAY_7AM = new Date(Date.UTC(2031, 0, 8, 7, 0, 0));

/** Makes sure setup is done and the synthetic week exists, whatever ran before. */
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
  const week = await (await request.get(`${API}/weeks/2031-W02`)).json();
  if (week.sessions.length === 0) await request.post(`${API}/weeks/2031-W02/generate`);
}

test('vest walk: 60 minutes with a 10 minute gap, half-way cue state, saved activity', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.clock.install({ time: WEDNESDAY_7AM });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wednesday 8 January' })).toBeVisible();

  const walk = page.getByRole('article', { name: 'Vest walk' });
  await walk.getByRole('link', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Vest walk' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('timer')).toHaveText('60:00');

  await page.getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward('25:00');
  await expect(page.getByRole('timer')).toHaveText('35:00');

  // Ten minutes with no timer callbacks at all, then one: a locked screen.
  await page.clock.fastForward('10:00');
  await expect(page.getByRole('timer')).toHaveText('25:00');
  await expect(page.getByText('Total 35:00')).toBeVisible();

  // Pause does not count; the rest of the hour does.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.fastForward('05:00');
  await expect(page.getByText('Total 35:00')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.fastForward('25:01');

  // Finish: the log is pre-filled with what was executed.
  const form = page.getByRole('form', { name: 'Log timed session' });
  await expect(form).toContainText('60:00');
  await expect(form).toContainText('20kg');
  await form.getByRole('radio', { name: 'RPE 3' }).click();
  await form.getByLabel('Notes').fill('timed in the browser test');
  await form.getByRole('button', { name: 'Save and finish' }).click();

  await expect(page.getByRole('heading', { name: 'Wednesday 8 January' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Vest walk' })).toContainText('Done');

  const activities = await (
    await request.get(`${API}/activities?from=2031-01-08&to=2031-01-08&kind=walk_vest`)
  ).json();
  expect(activities).toHaveLength(1);
  const saved = activities[0];
  console.log(`saved activity: ${JSON.stringify(saved)}`);
  expect(saved).toMatchObject({
    date: '2031-01-08',
    kind: 'walk_vest',
    duration_min: 60,
    rpe: 3,
    detail: { vest_kg: 20, timer: { completed: true, ended_early: false } },
  });
  expect(Math.abs(saved.detail.timer.total_sec - 3600)).toBeLessThanOrEqual(2);
});

test('rest timer demo: 30 second rest cues at 10 seconds left and at zero', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.clock.install({ time: WEDNESDAY_7AM });
  await page.goto('/timer/rest-demo');
  await page.getByRole('button', { name: 'Log a set' }).click();
  const log = page.getByRole('list', { name: 'Cue log' });

  await page.clock.runFor(19_000);
  await expect(log.getByRole('listitem')).toHaveCount(0);
  await page.clock.runFor(1_500);
  await expect(log).toContainText('Cue: 10 seconds left');
  await expect(log.getByRole('listitem')).toHaveCount(1);

  await page.clock.runFor(10_000);
  await expect(log).toContainText('Cue: rest over');
  await expect(log).toContainText('onDone called');
  await expect(page.getByRole('status')).toHaveText('Rest over');

  // Logging the next set resets the rest to full.
  await page.getByRole('button', { name: 'Log the next set (resets the rest)' }).click();
  await expect(page.getByRole('button', { name: /Rest, 30 seconds left/ })).toBeVisible();
});
