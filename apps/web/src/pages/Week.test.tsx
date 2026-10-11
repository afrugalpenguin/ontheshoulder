import type { Week as WeekData } from '@ots/shared';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyWeek, renderApp, stubApi } from '../test/api.js';
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
  it('opens today with its check-in and session cards, and leaves the other days as one line', async () => {
    open(at(6, 8));
    const monday = await day('Monday 6 Jan');
    expect(toggleOf(monday).getAttribute('aria-expanded')).toBe('true');
    expect(await within(monday).findByRole('region', { name: 'Check-in' })).toBeTruthy();
    expect(within(monday).getByRole('article', { name: 'Vest walk' })).toBeTruthy();

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
    expect(within(walk).getByRole('link', { name: 'Start' }).getAttribute('href')).toBe('/timer/1');

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
    fireEvent.click(within(checkin).getByRole('radio', { name: 'Sleep 4' }));
    await waitFor(() =>
      expect(api.writes()).toEqual([
        { method: 'PUT', path: '/checkins/2031-01-06', body: { sleep_quality: 4 } },
      ]),
    );
    expect(within(checkin).queryByRole('button', { name: /save/i })).toBeNull();
    await waitFor(() =>
      expect(
        within(checkin).getByRole('radio', { name: 'Sleep 4' }).getAttribute('aria-checked'),
      ).toBe('true'),
    );
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
    expect(screen.getByRole('heading', { name: /2031-W03/ })).toBeTruthy();
  });

  it('shows the two streaks in the header', async () => {
    open(at(6, 8));
    const streaks = await screen.findByLabelText('Streaks');
    await waitFor(() => expect(streaks.textContent).toBe('Weeks in a row0Mornings in a row0'));
  });
});
