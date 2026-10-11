import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Strength A logged set by set in a phone-sized browser, twice, to see the
// loads progress; then the same screens with dumbbells only and with no kit.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
const at = (day: number, hour: number) => new Date(Date.UTC(2031, 0, day, hour, 0, 0));

const FULL_KIT = {
  bar_kg: 20,
  plates: [20, 10, 5, 2.5, 1.25].map((kg) => ({ kg, count: 1 })),
  dumbbells: [10, 12.5, 15],
  kettlebells: [12, 16, 20],
  vest_kg: 20,
};
const DUMBBELLS_ONLY = {
  bar_kg: null,
  plates: [],
  dumbbells: [10, 12.5, 15],
  kettlebells: [],
  vest_kg: null,
};
const NO_KIT = { bar_kg: null, plates: [], dumbbells: [], kettlebells: [], vest_kg: null };

interface Slot {
  id: number;
  sets: number;
}
interface Day {
  id: number;
  name: string;
  slots: Slot[];
}
interface SavedSet {
  slot_id: number;
  set_no: number;
  reps: number;
  load_kg: number | null;
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
  for (const week of ['2031-W02', '2031-W03']) {
    const existing = await (await request.get(`${API}/weeks/${week}`)).json();
    if (existing.sessions.length === 0) await request.post(`${API}/weeks/${week}/generate`);
  }
}

/** Answers a starting-load prompt on the card for an exercise. */
async function setStart(page: Page, exercise: string, kg: string) {
  const form = page.getByRole('form', { name: `Starting load for ${exercise}` });
  await form.getByRole('textbox').fill(kg);
  await form.getByRole('button', { name: 'Set starting load' }).click();
  await expect(form).toBeHidden();
}

/** Taps every set row on the page that is not logged yet. */
async function logEverySet(page: Page, day: Day) {
  const total = day.slots.reduce((sum, s) => sum + s.sets, 0);
  const open = page.getByRole('button', { name: /set \d+: .*Tap to log$/ });
  for (let i = 0; i < total; i++) await open.first().click();
  await expect(open).toHaveCount(0);
}

const summarise = (sets: SavedSet[], day: Day) =>
  day.slots.map((slot, index) => {
    const mine = sets.filter((s) => s.slot_id === slot.id);
    return `slot ${index + 1}: ${mine.length} x ${mine[0]?.reps} @ ${mine[0]?.load_kg ?? 'bodyweight'}`;
  });

test('Strength A twice: second session shows progressed loads with plate breakdowns', async ({
  page,
  request,
}) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: FULL_KIT });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayA = days.find((d) => d.name === 'Strength A') as Day;

  // Session one, Wednesday of week one.
  await page.clock.setFixedTime(at(8, 18));
  await page.goto('/strength');
  const link = page.getByRole('link', { name: 'Start Strength A' });
  await expect(link).toContainText('Not done yet');
  await expect(link).toContainText('Next session: Starting loads to set');
  await link.click();

  await setStart(page, 'Back squat', '60');
  await setStart(page, 'Romanian deadlift', '50');
  await setStart(page, 'Reverse lunge', '10');
  await setStart(page, 'Standing calf raise in rack', '41');
  await setStart(page, 'Suitcase carry', '20');

  const squat = page.getByRole('article', { name: 'Back squat' });
  await expect(squat.getByLabel('Back squat load')).toHaveText('60kg');
  await expect(squat).toContainText('bar + 2 x 20');
  // 41 is not a load this kit makes; it was snapped to the nearest that is.
  await expect(
    page.getByRole('article', { name: 'Standing calf raise in rack' }).getByLabel(/load$/),
  ).toHaveText('40kg');

  await logEverySet(page, dayA);
  // Logging a set starts that slot's rest timer.
  await expect(page.getByRole('button', { name: /^Rest, \d+ seconds left/ })).toBeVisible();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByRole('heading', { name: 'Strength A saved' })).toBeVisible();
  const next = page.getByRole('region', { name: 'Next session' });
  await expect(next).toContainText('Back squat 62.5kg (bar + 2 x 20 + 2 x 1.25)');
  await expect(next).toContainText('Romanian deadlift 52.5kg');
  await expect(next).toContainText('Reverse lunge 12.5kg (12.5kg dumbbells)');

  // Session two, a week later.
  await page.clock.setFixedTime(at(15, 18));
  await page.goto('/strength');
  await expect(page.getByRole('link', { name: 'Start Strength A' })).toContainText(
    'Last done Wednesday 8 January',
  );
  await expect(page.getByRole('link', { name: 'Start Strength A' })).toContainText(
    'Next session: Back squat 62.5kg, Romanian deadlift 52.5kg',
  );
  await page.getByRole('link', { name: 'Start Strength A' }).click();
  await expect(squat.getByLabel('Back squat load')).toHaveText('62.5kg');
  await expect(squat).toContainText('bar + 2 x 20 + 2 x 1.25');
  await expect(squat).toContainText('completed last time, up 2.5kg');
  await logEverySet(page, dayA);
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByRole('heading', { name: 'Strength A saved' })).toBeVisible();

  // Both saved activities, and what changed between them.
  const activities = await (
    await request.get(`${API}/activities?kind=strength&from=2031-01-08&to=2031-01-15`)
  ).json();
  expect(activities).toHaveLength(2);
  const [first, second] = activities;
  for (const a of [first, second]) {
    console.log(
      `activity ${a.date}: ${JSON.stringify({ id: a.id, kind: a.kind, duration_min: a.duration_min, partial: a.strength_session.partial, sets: a.strength_session.sets.length })}`,
    );
    for (const line of summarise(a.strength_session.sets, dayA)) console.log(`  ${line}`);
  }
  expect(first.strength_session.partial).toBe(false);
  expect(summarise(first.strength_session.sets, dayA)).toEqual([
    'slot 1: 5 x 5 @ 60',
    'slot 2: 3 x 8 @ 50',
    'slot 3: 3 x 8 @ 10',
    'slot 4: 3 x 12 @ 40',
    'slot 5: 3 x 1 @ 20',
    'slot 6: 3 x 1 @ bodyweight',
  ]);
  expect(summarise(second.strength_session.sets, dayA)).toEqual([
    'slot 1: 5 x 5 @ 62.5',
    'slot 2: 3 x 8 @ 52.5',
    'slot 3: 3 x 8 @ 12.5',
    'slot 4: 3 x 12 @ 42.5',
    'slot 5: 3 x 1 @ 20',
    'slot 6: 3 x 1 @ bodyweight',
  ]);

  // The planned Strength A sessions of both weeks were marked done.
  for (const week of ['2031-W02', '2031-W03']) {
    const w = await (await request.get(`${API}/weeks/${week}`)).json();
    const planned = w.sessions.find(
      (s: { template: { key: string } }) => s.template.key === 'strength_a',
    );
    expect(planned.status).toBe('done');
  }
});

test('dumbbells only: the squat slot offers a dumbbell substitute', async ({ page, request }) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: DUMBBELLS_ONLY });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayA = days.find((d) => d.name === 'Strength A') as Day;

  await page.clock.setFixedTime(at(22, 18));
  await page.goto(`/strength/day/${dayA.id}`);
  const squat = page.getByRole('article', { name: 'Back squat' });
  await expect(squat).toContainText('No kit for this.');
  const options = squat.getByRole('group', { name: 'Substitutes for Back squat' });
  await expect(options.getByRole('button')).toHaveText([
    'Dumbbell goblet squat (dumbbell)',
    'Bodyweight squat (bodyweight)',
  ]);
  await options.getByRole('button', { name: 'Dumbbell goblet squat (dumbbell)' }).click();
  const sub = page.getByRole('article', { name: 'Dumbbell goblet squat' });
  await expect(sub).toContainText('In place of Back squat today.');
  await expect(sub.getByRole('button', { name: 'Make permanent' })).toBeVisible();
  await page.screenshot({ path: 'e2e-results/strength-dumbbells-only.png', fullPage: true });
  await request.put(`${API}/equipment`, { data: FULL_KIT });
});

test('no kit: every Strength B slot offers bodyweight or says none, nothing crashes', async ({
  page,
  request,
}) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: NO_KIT });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayB = days.find((d) => d.name === 'Strength B') as Day;
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.clock.setFixedTime(at(24, 18));
  await page.goto(`/strength/day/${dayB.id}`);
  await expect(page.getByRole('heading', { name: 'Strength B' })).toBeVisible();
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(dayB.slots.length);

  const found: string[] = [];
  for (const card of await cards.all()) {
    const name = await card.getAttribute('aria-label');
    await expect(card).toContainText('No kit for this.');
    const substitutes = await card.getByRole('group').getByRole('button').allTextContents();
    if (substitutes.length === 0) await expect(card).toContainText('No substitute available.');
    else expect(substitutes.every((s) => s.endsWith('(bodyweight)'))).toBe(true);
    found.push(
      `${name}: ${substitutes.length ? substitutes.join(', ') : 'no substitute available'}`,
    );
  }
  console.log(`no kit, Strength B:\n  ${found.join('\n  ')}`);
  expect(errors).toEqual([]);

  // Picking a bodyweight substitute gives loggable sets.
  await cards.first().getByRole('group').getByRole('button').first().click();
  await page
    .getByRole('button', { name: /set 1: .*Tap to log$/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /set 1: logged/ })).toBeVisible();
  expect(errors).toEqual([]);
  await request.put(`${API}/equipment`, { data: FULL_KIT });
});
