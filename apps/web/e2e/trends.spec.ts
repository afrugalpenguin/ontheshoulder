import { expect, test, type APIRequestContext } from '@playwright/test';

// Trends in a phone-sized browser against 90 days of synthetic history: the
// review card, all five charts actually drawn, and how long the route takes.

const API = `http://127.0.0.1:${process.env.OTS_E2E_API_PORT ?? '3183'}/api`;
const START = '2031-06-02'; // a Monday, clear of the other flows' dates
const DAYS = 90;
const TODAY = new Date(Date.UTC(2031, 7, 30, 9, 0, 0)); // Saturday 30 August, day 90

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));

interface PlannedSession {
  id: number;
  date: string;
  template: { key: string; kind: string };
}

/** Seeds the same deterministic history the api trend tests use, through the api. */
async function seed(request: APIRequestContext) {
  const json = async (res: Promise<{ json: () => Promise<unknown> }>) => (await res).json();
  const status = (await json(request.get(`${API}/setup/status`))) as { complete: boolean };
  if (!status.complete) {
    await request.put(`${API}/athlete`, { data: { display_name: 'Test Runner' } });
    await request.post(`${API}/events`, {
      data: { name: 'Example 100', date: '2032-06-05', priority: 'A' },
    });
    await request.post(`${API}/setup/apply-template/rebuild-100`, {
      data: { start_date: '2031-01-06' },
    });
  }
  // A block over the seeded period, with the starter rules, so compliance has a rule to apply.
  const blocks = (await json(request.get(`${API}/blocks`))) as {
    name: string;
    progression_rules: unknown;
  }[];
  if (!blocks.some((b) => b.name === 'Synthetic summer')) {
    await request.post(`${API}/blocks`, {
      data: {
        name: 'Synthetic summer',
        start_date: START,
        end_date: addDays(START, DAYS + 6),
        purpose: 'base',
        progression_rules: blocks[0]?.progression_rules,
      },
    });
  }
  const days = (await json(request.get(`${API}/programme-days`))) as {
    id: number;
    name: string;
    slots: { id: number }[];
  }[];

  const weeks = new Map<string, PlannedSession[]>();
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(START, i);
    const weekIndex = Math.floor(i / 7);
    const weekday = (i % 7) + 1;
    const monday = addDays(START, weekIndex * 7);
    if (!weeks.has(monday)) {
      const check = (await json(request.get(`${API}/checkins/${monday}`))) as { id: number | null };
      if (check.id !== null) return; // already seeded by an earlier run in this database
      // The week label comes back from the api, so no ISO week maths is needed here.
      const any = (await json(request.get(`${API}/trends/weekly?from=${monday}&to=${monday}`))) as {
        iso_week: string;
      }[];
      const generated = (await json(request.post(`${API}/weeks/${any[0]?.iso_week}/generate`))) as {
        week: { sessions: PlannedSession[] };
      };
      weeks.set(monday, generated.week.sessions);
    }
    const sessions = weeks.get(monday) ?? [];
    const log = async (key: string, body: Record<string, unknown>) => {
      const session = sessions.find((s) => s.date === date && s.template.key === key);
      if (!session) return;
      await request.post(`${API}/activities`, {
        data: { date, kind: session.template.kind, planned_session_id: session.id, ...body },
      });
    };

    await request.put(`${API}/checkins/${date}`, {
      data: {
        sleep_quality: 2 + (i % 3),
        energy: 3 + (i % 2),
        weight_kg: Math.round((72 - i * 0.02) * 10) / 10,
        ankle_score: i % 4,
      },
    });
    if (weekday === 1 || weekday === 3 || weekday === 4) {
      await log('vest_walk', { duration_min: 60, detail: { vest_kg: 20 } });
    }
    if (weekday === 2)
      await log('midweek_run', { duration_min: 34 + weekIndex * 2, rpe: 4 + (weekIndex % 3) });
    if (weekday === 5) await log('treadmill_walk', { duration_min: 50 });
    if (weekday === 7 && weekIndex % 2 === 0)
      await log('long_run', { duration_min: 40 + weekIndex * 5, rpe: 6 });
    const strength = async (key: string, name: string, base: number) => {
      const day = days.find((d) => d.name === name);
      const slot = day?.slots[0];
      if (!day || !slot) return;
      await log(key, {
        duration_min: 40,
        strength_session: {
          programme_day_id: day.id,
          sets: [1, 2, 3, 4, 5].map((set_no) => ({
            slot_id: slot.id,
            set_no,
            reps: 5,
            load_kg: base + weekIndex * 2.5,
          })),
        },
      });
    };
    if (weekday === 3) await strength('strength_a', 'Strength A', 60);
    if (weekday === 5) await strength('strength_b', 'Strength B', 80);
  }
}

test('trends: review card and the charts drawn from 90 days, in under a second', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await seed(request);
  await page.clock.setFixedTime(TODAY);

  // Land on Today first so the timing below is the Trends route, not the app start.
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  const started = Date.now();
  await page.getByRole('link', { name: 'Trends' }).click();
  await page.getByRole('button', { name: '12 weeks' }).click();
  const charts = ['Running and vest walks', 'Weight', 'Main lifts'];
  // Sleep and energy are no longer asked for, so their chart is gone.
  await expect(page.getByRole('region', { name: 'Sleep and energy' })).toHaveCount(0);
  for (const name of charts) {
    await expect(page.getByRole('region', { name }).locator('canvas')).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Compliance' }).getByRole('listitem')).toHaveCount(
    12,
  );
  const elapsed = Date.now() - started;
  console.log(
    `trends route with 90 days of data: ${elapsed} ms to all charts drawn (12 week range)`,
  );
  expect(elapsed).toBeLessThan(1000);

  // Every canvas has something drawn on it, not just an empty frame.
  for (const name of charts) {
    const painted = await page
      .getByRole('region', { name })
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext('2d')
          ?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels) return 0;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 0) count++;
        return count;
      });
    expect(painted, `${name} has drawn pixels`).toBeGreaterThan(500);
  }

  // The review card: fixed sentences from the data. Week 12 of the seed against week 11.
  const review = page.getByRole('region', { name: 'Weekly review' });
  await expect(review).toContainText('Run minutes 58, up from 56.');
  await expect(review).toContainText('Back squat 90kg, up from 87.5kg.');
  await expect(review).toContainText('Deadlift 110kg, up from 107.5kg.');
  await expect(review).toContainText('Strength sessions 2, same as last week.');

  // Compliance grid: complete weeks are labelled in words, not only coloured.
  const compliance = page.getByRole('region', { name: 'Compliance' });
  await expect(compliance.getByRole('listitem').first()).toHaveAttribute(
    'aria-label',
    /^Week of .*: complete/,
  );

  // No sideways scrolling at 390px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({ path: 'e2e-results/trends-12-weeks.png', fullPage: true });

  // The range toggle redraws with fewer weeks.
  await page.getByRole('button', { name: '4 weeks' }).click();
  await expect(compliance.getByRole('listitem')).toHaveCount(4);
});
