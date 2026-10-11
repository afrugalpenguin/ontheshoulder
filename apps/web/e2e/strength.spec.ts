import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Strength A in a phone-sized browser, the StrongLifts way: a circle per set,
// tap to count, a rest bar at the bottom, plates on demand. Four sessions a
// week apart show the loads go up, hold after a failed set, and deload after a
// second; then the same screen with dumbbells only and with no kit.

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
/** Starting loads by slot position, as answered once before the first session. */
const STARTS = [60, 50, 10, 40, 20];

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
  warmup: boolean;
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
  for (const week of ['2031-W02', '2031-W03', '2031-W04', '2031-W05']) {
    const existing = await (await request.get(`${API}/weeks/${week}`)).json();
    if (existing.sessions.length === 0) await request.post(`${API}/weeks/${week}/generate`);
  }
}

const circles = (page: Page) => page.getByRole('button', { name: / set \d+: / });
const emptyCircles = (page: Page) => page.getByRole('button', { name: / set \d+: not done/ });

/** Taps every empty working-set circle once. Returns the number of taps. */
async function tapEverySet(page: Page, day: Day): Promise<number> {
  const total = day.slots.reduce((sum, s) => sum + s.sets, 0);
  await expect(circles(page)).toHaveCount(total);
  for (let i = 0; i < total; i++) await emptyCircles(page).first().click();
  await expect(emptyCircles(page)).toHaveCount(0);
  return total;
}

const summarise = (sets: SavedSet[], day: Day) =>
  day.slots.map((slot, index) => {
    const mine = sets.filter((s) => s.slot_id === slot.id && !s.warmup);
    const reps = [...new Set(mine.map((s) => s.reps))].join('/');
    return `slot ${index + 1}: ${mine.length} x ${reps} @ ${mine[0]?.load_kg ?? 'bodyweight'}`;
  });

async function sessionOn(request: APIRequestContext, date: string) {
  const found = await (
    await request.get(`${API}/activities?kind=strength&from=${date}&to=${date}`)
  ).json();
  return found[0];
}

test('Strength A four times: sets plus one tap, progress, hold after a miss, then deload', async ({
  page,
  request,
}) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: FULL_KIT });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayA = days.find((d) => d.name === 'Strength A') as Day;
  for (const [index, kg] of STARTS.entries()) {
    await request.patch(`${API}/programme-slots/${dayA.slots[index]?.id}`, {
      data: { start_load_kg: kg },
    });
  }
  const totalSets = dayA.slots.reduce((sum, s) => sum + s.sets, 0);
  const squat = page.getByRole('article', { name: 'Back squat' });
  const squatLoad = squat.getByRole('button', { name: /^Back squat load:/ });
  const squatNext = page.getByLabel('Back squat next session');
  const squatSet = (n: number) => page.getByRole('button', { name: `Back squat set ${n}:` });

  // Session one, Wednesday of week one: only set circles and Finish.
  await page.clock.setFixedTime(at(8, 18));
  await page.goto('/strength');
  const cardA = page.getByRole('region', { name: 'Strength A', exact: true });
  await expect(cardA).toContainText('Not done yet');
  await expect(cardA).toContainText('Next up: Back squat 60 kg');
  let taps = 0;
  await cardA.getByRole('link', { name: 'Start Strength A' }).click();
  await expect(squatLoad).toHaveText('60 kg');
  taps += await tapEverySet(page, dayA);
  await expect(squatNext).toContainText('Next session: 62.5 kg');
  await page.getByRole('button', { name: 'Finish' }).click();
  taps++;
  console.log(`session 1: ${totalSets} sets, ${taps} taps from Start to saved (sets plus one)`);
  expect(taps).toBe(totalSets + 1);

  // Back on the Strength tab: a quiet toast, the next load with an up arrow, and history.
  await expect(page.getByRole('status')).toContainText('Strength A saved');
  await expect(cardA).toContainText('Last done Wednesday 8 January');
  await expect(cardA).toContainText('Next up: Back squat 62.5 kg');
  await expect(cardA.getByRole('img', { name: 'up from 60 kg last time' })).toBeVisible();
  const history = page.getByRole('region', { name: 'Recent sessions' });
  await expect(history.getByRole('listitem')).toHaveText(['8 JanStrength ABack squat 60 kg']);
  await expect(history.getByRole('img', { name: 'every set done' })).toBeVisible();

  // Session two, a week later: progressed loads, and the plates for the bar.
  await page.clock.setFixedTime(at(15, 18));
  await page.goto(`/strength/day/${dayA.id}`);
  await expect(squatLoad).toHaveText('62.5 kg');
  await squatLoad.click();
  const plates = page.getByRole('dialog', { name: 'Back squat: 62.5 kg' });
  await expect(plates).toContainText('20 + 1.25');
  await expect(plates).toContainText('each side, bar 20');
  console.log(
    `session 2 plates: ${(await plates.locator('.load').innerText()).trim()} each side, bar 20`,
  );
  await plates.getByRole('radio', { name: 'Show Total kg' }).click();
  await expect(plates).toContainText('bar + 2 x 20 + 2 x 1.25');
  await plates.getByRole('radio', { name: 'Show Each side' }).click();
  await plates.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /^Reverse lunge load: 12.5 kg/ }).click();
  await expect(page.getByRole('dialog', { name: 'Reverse lunge: 12.5 kg' })).toContainText(
    'The 12.5 kg dumbbells',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await tapEverySet(page, dayA);
  await expect(squatNext).toContainText('Next session: 65 kg');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('status')).toContainText('Strength A saved');

  const first = await sessionOn(request, '2031-01-08');
  const second = await sessionOn(request, '2031-01-15');
  for (const a of [first, second]) {
    console.log(
      `activity ${a.date}: ${JSON.stringify({ id: a.id, kind: a.kind, partial: a.strength_session.partial, sets: a.strength_session.sets.length })}`,
    );
    for (const line of summarise(a.strength_session.sets, dayA)) console.log(`  ${line}`);
  }
  console.log(`session 1 squat sets: ${JSON.stringify(first.strength_session.sets.slice(0, 5))}`);
  console.log(`session 2 squat sets: ${JSON.stringify(second.strength_session.sets.slice(0, 5))}`);
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

  // Session three at 65: fail a set (tap it down to 3). The next-session line holds.
  await page.clock.setFixedTime(at(22, 18));
  await page.goto(`/strength/day/${dayA.id}`);
  await expect(squatLoad).toHaveText('65 kg');
  await tapEverySet(page, dayA);
  await squatSet(4).click();
  await squatSet(4).click();
  await expect(squatSet(4)).toHaveText('3');
  await expect(squatNext).toContainText('Next session: 65 kg');
  console.log(`session 3, set 4 tapped down to 3: ${(await squatNext.innerText()).trim()}`);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('status')).toContainText('Strength A saved');
  // Held, so no arrow; and the history marks the miss.
  await expect(cardA).toContainText('Next up: Back squat 65 kg');
  await expect(cardA.getByRole('img')).toHaveCount(0);
  await expect(history.getByRole('listitem').first()).toHaveText(
    '22 JanStrength ABack squat 65 kg',
  );
  await expect(
    history.getByRole('listitem').first().getByRole('img', { name: 'reps missed' }),
  ).toBeVisible();

  // Session four, still 65: fail again. Deload ten per cent, snapped to a load the kit makes.
  await page.clock.setFixedTime(at(29, 18));
  await page.goto(`/strength/day/${dayA.id}`);
  await expect(squatLoad).toHaveText('65 kg');
  await tapEverySet(page, dayA);
  await squatSet(5).click();
  await squatSet(5).click();
  await expect(squatSet(5)).toHaveText('3');
  // 65 less ten per cent is 58.5; the nearest load at or below it is 57.5.
  await expect(squatNext).toContainText('Next session: 57.5 kg');
  console.log(`session 4, set 5 tapped down to 3: ${(await squatNext.innerText()).trim()}`);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(cardA).toContainText('Next up: Back squat 57.5 kg');
  await expect(cardA.getByRole('img', { name: 'down from 65 kg last time' })).toBeVisible();
  await page.screenshot({ path: 'e2e-results/strength-home.png', fullPage: true });

  // The planned Strength A sessions of all four weeks were marked done.
  for (const week of ['2031-W02', '2031-W03', '2031-W04', '2031-W05']) {
    const w = await (await request.get(`${API}/weeks/${week}`)).json();
    const planned = w.sessions.find(
      (s: { template: { key: string } }) => s.template.key === 'strength_a',
    );
    expect(planned.status, week).toBe('done');
  }
});

test('rest bar: counts down after a set, and the next circle highlights at zero', async ({
  page,
  request,
}) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: FULL_KIT });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayB = days.find((d) => d.name === 'Strength B') as Day;
  await request.patch(`${API}/programme-slots/${dayB.slots[0]?.id}`, {
    data: { start_load_kg: 80 },
  });

  await page.clock.install({ time: at(10, 18) });
  await page.goto(`/strength/day/${dayB.id}`);
  const set = (n: number) => page.getByRole('button', { name: `Deadlift set ${n}:` });
  await expect(page.getByRole('timer')).toHaveCount(0);

  // Warm-ups sit collapsed above the working sets and do not start a rest.
  const deadlift = page.getByRole('article', { name: 'Deadlift' });
  await deadlift.getByText('Warm-up').click();
  await deadlift.getByRole('button', { name: /^Deadlift warm-up 1 at 20 kg/ }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);

  await set(1).click();
  const bar = page.getByRole('complementary', { name: 'Rest' });
  await expect(bar).toBeVisible();
  await expect(bar).toBeInViewport();
  const started = await page.getByRole('timer').innerText();
  await expect(bar).toContainText('Next: Deadlift, 80 kg');
  await page.clock.fastForward('01:00');
  const afterAMinute = await page.getByRole('timer').innerText();
  console.log(`rest bar: ${started} at the tap, ${afterAMinute} a minute later`);
  expect(started).toBe('2:30');
  expect(afterAMinute).toBe('1:30');
  await expect(set(2)).not.toHaveClass(/is-next/);

  await page.clock.fastForward('01:31');
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(set(2)).toHaveClass(/is-next/);
  console.log('rest bar: gone at zero, set 2 highlighted');

  // Skip does the same at once.
  await set(2).click();
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Skip' }).click();
  await expect(bar).toBeHidden();
  await expect(set(3)).toHaveClass(/is-next/);
  await page.screenshot({ path: 'e2e-results/strength-session.png', fullPage: true });
});

test('dumbbells only: the squat slot offers a dumbbell substitute', async ({ page, request }) => {
  await seed(request);
  await request.put(`${API}/equipment`, { data: DUMBBELLS_ONLY });
  const days: Day[] = await (await request.get(`${API}/programme-days`)).json();
  const dayA = days.find((d) => d.name === 'Strength A') as Day;

  await page.clock.setFixedTime(at(23, 18));
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
  await expect(sub.getByRole('button', { name: 'Undo swap' })).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Starting load for Dumbbell goblet squat' }),
  ).toBeVisible();
  console.log('dumbbells only: Back squat swapped for Dumbbell goblet squat, v1 flow intact');
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
    const substitutes = await card
      .getByRole('group', { name: /^Substitutes for/ })
      .getByRole('button')
      .allTextContents();
    if (substitutes.length === 0) await expect(card).toContainText('No substitute available.');
    else expect(substitutes.every((s) => s.endsWith('(bodyweight)'))).toBe(true);
    found.push(
      `${name}: ${substitutes.length ? substitutes.join(', ') : 'no substitute available'}`,
    );
  }
  console.log(`no kit, Strength B:\n  ${found.join('\n  ')}`);
  expect(errors).toEqual([]);

  // Picking a bodyweight substitute gives circles to tap.
  await cards
    .first()
    .getByRole('group', { name: /^Substitutes for/ })
    .getByRole('button')
    .first()
    .click();
  await emptyCircles(page).first().click();
  await expect(page.getByRole('button', { name: / set 1: done/ })).toBeVisible();
  expect(errors).toEqual([]);
  await request.put(`${API}/equipment`, { data: FULL_KIT });
});
