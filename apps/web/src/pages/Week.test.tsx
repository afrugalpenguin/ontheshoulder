import type { Week as WeekData } from '@ots/shared';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCompliance, emptyWeek, renderApp, stubApi } from '../test/api.js';
import { HABITS, session } from '../test/fixtures.js';
import { Week } from './Week.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A synthetic week: 2031-W02 runs Monday 6 January to Sunday 12 January.
const WEEK: WeekData = {
  ...emptyWeek('2031-W02'),
  sessions: [
    session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 }, { id: 1 }),
    session('run', 'Midweek run', { duration_min: 45 }, { id: 2, date: '2031-01-07', slot: 'pm' }),
    session('prehab', 'Prehab', { duration_min: 10 }, { id: 3, date: '2031-01-08' }),
    session(
      'run',
      'Long run',
      { duration_min: 55 },
      { id: 4, date: '2031-01-12', status: 'skipped', skip_reason: 'family', optional: true },
    ),
  ],
};
const NEXT_WEEK: WeekData = {
  ...emptyWeek('2031-W03'),
  sessions: [
    session('walk_vest', 'Vest walk', { duration_min: 60 }, { id: 9, date: '2031-01-13' }),
  ],
};

/** Draws Week with the clock held at a local date and time. */
function open(now: Date, path = '/') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const api = stubApi({
    '/weeks/2031-W02': WEEK,
    '/weeks/2031-W03': NEXT_WEEK,
    '/habits': HABITS,
  });
  renderApp(
    <Routes>
      <Route path="/" element={<Week />} />
      <Route path="/week/:isoWeek" element={<Week />} />
    </Routes>,
    path,
  );
  return api;
}
const at = (day: number, hour: number, minute = 0) => new Date(2031, 0, day, hour, minute);
const day = (name: string) => screen.findByRole('region', { name });
const toggleOf = (region: HTMLElement) =>
  within(region).getAllByRole('button')[0] as HTMLButtonElement;

describe('Week', () => {
  it('opens today with its session cards before its check-in, and leaves the other days as one line', async () => {
    open(at(6, 8));
    const monday = await day('Monday 6 Jan');
    expect(toggleOf(monday).getAttribute('aria-expanded')).toBe('true');
    const checkin = await within(monday).findByRole('region', { name: 'Check-in' });
    const walk = within(monday).getByRole('article', { name: 'Vest walk' });
    // The day comes first: sessions above, the check-in last.
    expect(walk.compareDocumentPosition(checkin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Weight and habit chips only: nothing asks for sleep, energy or the ankle.
    expect(within(checkin).getByRole('textbox', { name: 'Weight' })).toBeTruthy();
    expect(within(checkin).queryByRole('radiogroup')).toBeNull();
    expect(checkin.textContent).not.toMatch(/Sleep|Energy|Ankle|Treadmill/);

    const tuesday = await day('Tuesday 7 Jan');
    expect(toggleOf(tuesday).getAttribute('aria-expanded')).toBe('false');
    expect(within(tuesday).queryByRole('article')).toBeNull();
    expect(within(tuesday).getByLabelText('Midweek run: Planned').textContent).toBe('Run');

    const sunday = await day('Sunday 12 Jan');
    const skipped = within(sunday).getByLabelText('Long run: Skipped');
    expect(skipped.className).toContain('tone-warning');
    expect(within(await day('Saturday 11 Jan')).getByText('Nothing planned')).toBeTruthy();
  });

  it('a tap opens another day and a second tap closes it', async () => {
    open(at(6, 8));
    const tuesday = await day('Tuesday 7 Jan');
    fireEvent.click(toggleOf(tuesday));
    expect(within(tuesday).getByRole('article', { name: 'Midweek run' })).toBeTruthy();
    // The check-in belongs to today only.
    expect(within(tuesday).queryByRole('region', { name: 'Check-in' })).toBeNull();
    fireEvent.click(toggleOf(tuesday));
    expect(within(tuesday).queryByRole('article')).toBeNull();
  });

  it('the primary button depends on the kind of session', async () => {
    open(at(6, 8));
    const monday = await day('Monday 6 Jan');
    const walk = await within(monday).findByRole('article', { name: 'Vest walk' });
    // A walk is ticked in one tap, with the timer as the smaller second button.
    expect(within(walk).getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(within(walk).getByRole('link', { name: 'Start timer' }).getAttribute('href')).toBe(
      '/timer/1',
    );
    fireEvent.click(within(walk).getByRole('button', { name: 'More for Vest walk' }));
    expect(within(walk).getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect(within(walk).getByRole('button', { name: 'Log different time' })).toBeTruthy();

    const tuesday = await day('Tuesday 7 Jan');
    fireEvent.click(toggleOf(tuesday));
    expect(within(tuesday).getByRole('button', { name: 'Log' })).toBeTruthy();
    const wednesday = await day('Wednesday 8 Jan');
    fireEvent.click(toggleOf(wednesday));
    expect(within(wednesday).getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('saves the check-in on each tap with no Save button', async () => {
    const api = open(at(6, 8));
    const checkin = await screen.findByRole('region', { name: 'Check-in' });
    fireEvent.click(within(checkin).getByRole('button', { name: 'Protein shake' }));
    await waitFor(() =>
      expect(api.writes()).toEqual([
        { method: 'PUT', path: '/checkins/2031-01-06', body: { habits: { protein_shake: true } } },
      ]),
    );
    expect(within(checkin).queryByRole('button', { name: /save/i })).toBeNull();
    await waitFor(() =>
      expect(
        within(checkin).getByRole('button', { name: 'Protein shake' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('the check-in folds to one line once the weight is saved, and a tap opens it again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(6, 8));
    const api = stubApi({
      '/weeks/2031-W02': WEEK,
      '/habits': HABITS,
      '/metrics?metric=weight_kg&to=2031-01-06': [{ value: 71.2 }],
    });
    renderApp(<Week />);
    const checkin = await screen.findByRole('region', { name: 'Check-in' });
    fireEvent.click(within(checkin).getByRole('button', { name: 'Same today' }));
    await waitFor(() =>
      expect(api.writes()).toEqual([
        { method: 'PUT', path: '/checkins/2031-01-06', body: { weight_kg: 71.2 } },
      ]),
    );

    const line = await screen.findByRole('button', { name: '71.2 kg' });
    expect(screen.queryByRole('textbox', { name: 'Weight' })).toBeNull();
    fireEvent.click(line);
    expect(await screen.findByRole('textbox', { name: 'Weight' })).toBeTruthy();
  });

  it('a walk is logged as planned in one tap and one call', async () => {
    const api = open(at(6, 8));
    const walk = await screen.findByRole('article', { name: 'Vest walk' });
    fireEvent.click(within(walk).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: '/activities',
        body: {
          date: '2031-01-06',
          kind: 'walk_vest',
          planned_session_id: 1,
          duration_min: 60,
          rpe: null,
          notes: null,
          detail: { vest_kg: 20 },
        },
      },
    ]);
  });

  it('an earlier day still to do says so on its chip, opens on a tap and can be ticked late', async () => {
    const api = open(at(8, 8));
    const monday = await day('Monday 6 Jan');
    const chip = await within(monday).findByLabelText('Vest walk: To do');
    expect(chip.textContent).toBe('Vest walk to do');
    // Today and later days keep the plain status.
    expect(within(await day('Sunday 12 Jan')).getByLabelText('Long run: Skipped')).toBeTruthy();

    fireEvent.click(chip);
    fireEvent.click(within(monday).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: '/activities',
      body: { date: '2031-01-06', planned_session_id: 1, duration_min: 60 },
    });
  });

  it('shows no prompt about tomorrow before 20:00', async () => {
    open(at(6, 19, 59));
    const tuesday = await day('Tuesday 7 Jan');
    await screen.findByRole('region', { name: 'Check-in' });
    expect(toggleOf(tuesday).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Kit out\?/)).toBeNull();
  });

  it('from 20:00 opens tomorrow with a quiet prompt, and the tick is saved on tomorrow', async () => {
    const api = open(at(6, 20, 0));
    const tuesday = await day('Tuesday 7 Jan');
    expect(await within(tuesday).findByText('Tomorrow: run, 45 min. Kit out?')).toBeTruthy();
    expect(toggleOf(tuesday).getAttribute('aria-expanded')).toBe('true');

    const tick = within(tuesday).getByRole('checkbox', { name: 'Kit out for tomorrow' });
    expect((tick as HTMLInputElement).checked).toBe(false);
    fireEvent.click(tick);
    await waitFor(() =>
      expect(api.writes()).toEqual([
        { method: 'PUT', path: '/checkins/2031-01-07', body: { habits: { kit_ready: true } } },
      ]),
    );
    await waitFor(() => expect((tick as HTMLInputElement).checked).toBe(true));
  });

  it('the prompt appears when the clock passes 20:00 with the page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(at(6, 19, 59));
    stubApi({ '/weeks/2031-W02': WEEK, '/habits': HABITS });
    renderApp(<Week />);
    await screen.findByRole('region', { name: 'Check-in' });
    expect(screen.queryByText(/Kit out\?/)).toBeNull();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(await screen.findByText('Tomorrow: run, 45 min. Kit out?')).toBeTruthy();
  });

  it('on a Sunday evening the prompt is about Monday of next week', async () => {
    open(at(12, 21));
    expect(await screen.findByText('Tomorrow: vest walk, 60 min, no vest. Kit out?')).toBeTruthy();
  });

  it('shows another week without opening any day', async () => {
    open(at(6, 8), '/week/2031-W03');
    const monday = await day('Monday 13 Jan');
    expect(await within(monday).findByLabelText('Vest walk: Planned')).toBeTruthy();
    expect(toggleOf(monday).getAttribute('aria-expanded')).toBe('false');
    // The title is the date range, with the ISO week small under it.
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.textContent).toBe('13 to 19 Jan2031-W03');
    expect(title.querySelector('.sub')?.textContent).toBe('2031-W03');
  });

  it('adds the run minutes logged this week to the header line', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(6, 8));
    stubApi({
      '/weeks/2031-W02': WEEK,
      '/habits': HABITS,
      '/trends/weekly?from=2031-01-06&to=2031-01-12': [{ iso_week: '2031-W02', run_minutes: 95 }],
    });
    renderApp(<Week />);
    const line = await screen.findByLabelText('This week so far');
    expect(line.textContent).toBe('Run 95 min');
  });

  it('shows a time-boxed run as a range on its card', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(7, 8));
    const boxed = {
      ...WEEK,
      sessions: [
        session('run', 'Midweek run', { min_min: 40, max_min: 50 }, { id: 2, date: '2031-01-07' }),
      ],
    };
    stubApi({ '/weeks/2031-W02': boxed, '/habits': HABITS });
    renderApp(<Week />);
    const card = await screen.findByRole('article', { name: 'Midweek run' });
    expect(card.textContent).toContain('40 to 50 min, your pace');
    expect(within(card).getByRole('button', { name: 'Log' })).toBeTruthy();
  });

  it('a prehab card lists its exercises from the template, always in view, and logs with one tap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(7, 8));
    const exercises = [
      { name: 'Synthetic balance', dose: '30 s each' },
      { name: 'Synthetic raises', dose: '3 x 12' },
    ];
    const prehab = session(
      'prehab',
      'Prehab',
      { duration_min: 8 },
      {
        id: 5,
        date: '2031-01-07',
        template: {
          key: 'prehab',
          kind: 'prehab',
          name: 'Prehab',
          structure: { duration_min: 8, exercises },
          programme_day_id: null,
        },
      },
    );
    const walk = session(
      'walk',
      'Treadmill walk',
      { duration_min: 50 },
      { id: 6, date: '2031-01-07' },
    );
    const api = stubApi({
      '/weeks/2031-W02': { ...WEEK, sessions: [prehab, walk] },
      '/habits': HABITS,
    });
    renderApp(<Week />);
    const card = await screen.findByRole('article', { name: 'Prehab' });
    // Above the treadmill walk, in the order the api gives.
    const cards = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(cards).toEqual(['Prehab', 'Treadmill walk']);
    // The list is whatever the template holds, with nothing to expand.
    const list = within(card).getByRole('list', { name: 'Prehab exercises' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Synthetic balance30 s each', 'Synthetic raises3 x 12']);
    expect(card.querySelector('details')).toBeNull();
    expect(within(card).queryByRole('link', { name: 'Start timer' })).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: '/activities',
      body: { date: '2031-01-07', kind: 'prehab', planned_session_id: 5, duration_min: 8 },
    });
  });

  it('on a Tuesday the check-in asks about last night, on a Monday it does not', async () => {
    open(at(7, 8));
    const tuesday = await screen.findByRole('region', { name: 'Check-in' });
    expect(within(tuesday).getByRole('radiogroup', { name: 'Last night' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    open(at(6, 8));
    const monday = await screen.findByRole('region', { name: 'Check-in' });
    expect(within(monday).queryByRole('radiogroup', { name: 'Last night' })).toBeNull();
    expect(within(monday).getByRole('button', { name: 'Protein shake' })).toBeTruthy();
  });

  it('the header leaves out every part with nothing to say yet', async () => {
    open(at(6, 8));
    await screen.findByRole('region', { name: 'Check-in' });
    const header = document.querySelector('.page-head') as HTMLElement;
    // Nothing done, no event and no streak: the title and nothing else.
    expect(header.textContent).toBe('<6 to 12 Jan2031-W02>');
    expect(screen.queryByLabelText('This week so far')).toBeNull();
  });

  it('the header line joins compliance, run minutes and streaks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(8, 8));
    stubApi({
      '/weeks/2031-W02': {
        ...WEEK,
        sessions: WEEK.sessions.map((s) => (s.id === 1 ? { ...s, status: 'done' } : s)),
      },
      '/weeks/2031-W02/compliance': {
        ...emptyCompliance('2031-W02'),
        required: [
          { template_key: 'midweek_run', planned: 1, done: 1, met: true },
          { template_key: 'strength_a', planned: 1, done: 0, met: false },
        ],
        treadmill: { days_done: 2, days_needed: 4, met: false },
        optional_planned: 1,
      },
      '/habits': HABITS,
      '/trends/weekly?from=2031-01-06&to=2031-01-12': [{ iso_week: '2031-W02', run_minutes: 45 }],
      '/trends/weekly?from=2030-07-08&to=2031-01-08': [
        { iso_week: '2030-W52', complete: true },
        { iso_week: '2031-W01', complete: true },
        { iso_week: '2031-W02', complete: false },
      ],
      '/events': [{ id: 1, name: 'Example 100', date: '2031-06-07', priority: 'A' }],
    });
    renderApp(<Week />);
    const line = await screen.findByLabelText('This week so far');
    expect(line.textContent).toBe(
      'Key sessions 1 of 2 · mornings 2 of 4 · run 45 min · 2 weeks in a row',
    );
    expect(screen.getByText('Example 100 in 21 weeks, 3 days')).toBeTruthy();
  });
});
