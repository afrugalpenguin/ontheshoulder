import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '../test/api.js';
import { DAY, FULL_KIT, LIBRARY, SQUAT_SLOT, past } from './fixtures.js';
import { StrengthHome } from './StrengthHome.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIVES = [5, 5, 5, 5, 5];
const DAY_B = { ...DAY, id: 2, name: 'Strength B', slots: [{ ...SQUAT_SLOT, id: 21 }] };

function open(histories: Record<number, unknown>, state?: unknown) {
  const api = stubApi({
    '/programme-days': [DAY, DAY_B],
    '/exercises': LIBRARY,
    '/equipment': FULL_KIT,
    '/programme-days/1/history': histories[1] ?? [],
    '/programme-days/2/history': histories[2] ?? [],
  });
  renderApp(
    <Routes>
      <Route path="/strength" element={<StrengthHome />} />
    </Routes>,
    state ? ({ pathname: '/strength', state } as unknown as string) : '/strength',
  );
  return api;
}
const dayCard = async (name: string) => within(await screen.findByRole('region', { name }));

describe('StrengthHome', () => {
  it('shows each day as a card with last done, the next main-lift load and Start', async () => {
    open({
      1: [past('2031-01-08', [[SQUAT_SLOT, FIVES, 60]])],
    });
    const a = await dayCard('Strength A');
    expect(a.getByText('Last done Wednesday 8 January')).toBeTruthy();
    expect(a.getByText('62.5 kg')).toBeTruthy();
    expect(a.getByRole('img', { name: 'up from 60 kg last time' })).toBeTruthy();
    expect(a.getByRole('link', { name: 'Start Strength A' }).getAttribute('href')).toBe(
      '/strength/day/1',
    );

    const b = await dayCard('Strength B');
    expect(b.getByText('Not done yet')).toBeTruthy();
    expect(b.getByText('starting load to set')).toBeTruthy();
    expect(b.queryByRole('img')).toBeNull();
  });

  it('shows a down arrow after a deload and none while the load holds', async () => {
    const missed = (date: string) => past(date, [[SQUAT_SLOT, [5, 5, 4, 3, 3], 62.5]]);
    open({
      1: [missed('2031-01-22'), missed('2031-01-15')],
      2: [past('2031-01-17', [[{ ...SQUAT_SLOT, id: 21 }, [5, 5, 5, 5, 4], 70]])],
    });
    const a = await dayCard('Strength A');
    expect(a.getByText('55 kg')).toBeTruthy();
    expect(a.getByRole('img', { name: 'down from 62.5 kg last time' })).toBeTruthy();
    const b = await dayCard('Strength B');
    expect(b.getByText('70 kg')).toBeTruthy();
    expect(b.queryByRole('img')).toBeNull();
  });

  it('lists recent sessions newest first with a tick or a cross for the main lift', async () => {
    open({
      1: [
        past('2031-01-15', [[SQUAT_SLOT, [5, 5, 5, 4, 3], 62.5]]),
        past('2031-01-08', [[SQUAT_SLOT, FIVES, 60]]),
      ],
      2: [past('2031-01-10', [[{ ...SQUAT_SLOT, id: 21 }, FIVES, 70]])],
    });
    const list = within(await screen.findByRole('region', { name: 'Recent sessions' }));
    const rows = list.getAllByRole('listitem').map((li) => ({
      text: li.textContent,
      mark: within(li).getByRole('img').getAttribute('aria-label'),
    }));
    expect(rows).toEqual([
      { text: '15 JanStrength ABack squat 62.5 kg', mark: 'reps missed' },
      { text: '10 JanStrength BBack squat 70 kg', mark: 'every set done' },
      { text: '8 JanStrength ABack squat 60 kg', mark: 'every set done' },
    ]);
  });

  it('has no history section before anything is logged', async () => {
    open({});
    await dayCard('Strength A');
    expect(screen.queryByRole('region', { name: 'Recent sessions' })).toBeNull();
  });

  it('coming back from Finish shows a quiet toast, with RPE as an optional extra', async () => {
    const api = open({}, { saved: { activityId: 9, name: 'Strength A', partial: true } });
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('Strength A saved as a partial session');

    fireEvent.click(within(toast).getByRole('button', { name: 'Add RPE' }));
    const sheet = within(screen.getByRole('dialog', { name: 'How hard was Strength A?' }));
    await act(async () => {
      fireEvent.click(sheet.getByRole('radio', { name: 'RPE 7' }));
    });
    await waitFor(() =>
      expect(api.writes()).toEqual([{ method: 'PATCH', path: '/activities/9', body: { rpe: 7 } }]),
    );
  });
});
