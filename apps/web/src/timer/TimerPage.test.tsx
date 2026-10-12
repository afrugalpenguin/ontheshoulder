import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyWeek, renderApp, stubApi } from '../test/api.js';
import { session } from '../test/fixtures.js';
import { TimerPage } from './TimerPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WALK = session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 }, { id: 1 });

/** Opens the timer for the vest walk, starts it and ends it at once. */
async function finishAfterSeconds() {
  const api = stubApi({
    '/planned-sessions/1': WALK,
    '/weeks/2031-W02': { ...emptyWeek('2031-W02'), sessions: [WALK] },
  });
  renderApp(
    <Routes>
      <Route path="/timer/:sessionId" element={<TimerPage />} />
      <Route path="/" element={<p>Week</p>} />
    </Routes>,
    '/timer/1',
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'End early' }));
  return api;
}

describe('TimerPage: a timer finished under the threshold', () => {
  it('offers the planned duration and saves nothing until a choice is made', async () => {
    const api = await finishAfterSeconds();
    const prompt = await screen.findByRole('alertdialog', { name: 'Which time to log' });
    expect(prompt.textContent).toContain('Log the planned 60 min instead?');
    expect(screen.getByRole('button', { name: 'Log 60 min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log 0:00' })).toBeTruthy();
    // No form to submit yet, and nothing sent.
    expect(screen.queryByRole('form', { name: 'Log timed session' })).toBeNull();
    expect(api.writes()).toEqual([]);
    console.log(`writes before a choice: ${api.writes().length}`);
  });

  it('choosing the planned duration logs it, with the timed seconds kept in the detail', async () => {
    const api = await finishAfterSeconds();
    fireEvent.click(await screen.findByRole('button', { name: 'Log 60 min' }));
    const form = screen.getByRole('form', { name: 'Log timed session' });
    expect(form.textContent).toContain('60 min, as planned');
    expect(api.writes()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    const saved = api.writes()[0];
    console.log(`saved after choosing planned: ${JSON.stringify(saved?.body)}`);
    expect(saved).toMatchObject({
      method: 'POST',
      path: '/activities',
      body: {
        kind: 'walk_vest',
        planned_session_id: 1,
        duration_min: 60,
        detail: { vest_kg: 20, timer: { total_sec: 0, ended_early: true } },
      },
    });
  });

  it('choosing the actual time logs the elapsed seconds, as before', async () => {
    const api = await finishAfterSeconds();
    fireEvent.click(await screen.findByRole('button', { name: 'Log 0:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    console.log(`saved after choosing actual: ${JSON.stringify(api.writes()[0]?.body)}`);
    expect(api.writes()[0]).toMatchObject({ body: { duration_min: 0 } });
  });
});
