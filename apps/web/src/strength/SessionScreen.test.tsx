import type { Equipment, ProgrammeDay, StrengthHistoryEntry } from '@ots/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY, DUMBBELLS_ONLY, FULL_KIT, LIBRARY, NO_KIT, SQUAT_SLOT, past } from './fixtures.js';
import { SessionScreen } from './StrengthSession.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Renders the session screen with fetch stubbed; returns the calls it made. */
function setup(
  options: {
    day?: ProgrammeDay;
    equipment?: Equipment;
    history?: StrengthHistoryEntry[];
  } = {},
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        path: String(input).replace(/^\/api/, ''),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Promise.resolve(Response.json({}));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SessionScreen
          day={options.day ?? DAY}
          exercises={LIBRARY}
          equipment={options.equipment ?? FULL_KIT}
          history={options.history ?? []}
          today="2031-01-15"
          plannedSessionId={5}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const WITH_START: ProgrammeDay = {
  ...DAY,
  slots: DAY.slots.map((s) => (s.id === SQUAT_SLOT.id ? { ...s, start_load_kg: 60 } : s)),
};
const LAST_WEEK = [past('2031-01-08', [[SQUAT_SLOT, [5, 5, 5, 5, 5], 60]])];

const card = (name: string) => within(screen.getByRole('article', { name }));
const tapSet = (exercise: string, n: number) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${exercise} set ${n}:`) }));

describe('set logging flow', () => {
  it('shows the progressed load with its plate breakdown and logs sets at a tap', async () => {
    const { calls } = setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    expect(squat.getByLabelText('Back squat load').textContent).toBe('62.5kg');
    expect(squat.getByText('bar + 2 x 20 + 2 x 1.25')).toBeTruthy();
    expect(squat.getByText('completed last time, up 2.5kg')).toBeTruthy();
    expect(squat.getByText('5 x 5')).toBeTruthy();

    for (let n = 1; n <= 5; n++) tapSet('Back squat', n);
    expect(
      squat.getByRole('button', { name: /^Back squat set 3: logged, 5 reps at 62.5kg/ }),
    ).toBeTruthy();

    // Not every slot is done, so it saves as partial.
    fireEvent.click(screen.getByRole('button', { name: 'Finish (save as partial)' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST') as Call;
    expect(post.path).toBe('/activities');
    expect(post.body).toMatchObject({
      date: '2031-01-15',
      kind: 'strength',
      planned_session_id: 5,
      strength_session: { programme_day_id: 1, partial: true },
    });
    const sets = (post.body as { strength_session: { sets: Record<string, unknown>[] } })
      .strength_session.sets;
    expect(sets).toHaveLength(5);
    expect(sets[0]).toMatchObject({
      slot_id: 11,
      set_no: 1,
      reps: 5,
      load_kg: 62.5,
      exercise_id: null,
    });

    // The closing summary shows the next session's loads.
    const next = within(await screen.findByRole('region', { name: 'Next session' }));
    expect(next.getByText(/65kg \(bar \+ 2 x 20 \+ 2 x 2.5\)/)).toBeTruthy();
  });

  it('plus and minus step through achievable loads only', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    fireEvent.click(squat.getByRole('button', { name: 'Heavier Back squat' }));
    expect(squat.getByLabelText('Back squat load').textContent).toBe('65kg');
    expect(squat.getByText('bar + 2 x 20 + 2 x 2.5')).toBeTruthy();
    expect(squat.getByText('adjusted by you')).toBeTruthy();
    fireEvent.click(squat.getByRole('button', { name: 'Lighter Back squat' }));
    fireEvent.click(squat.getByRole('button', { name: 'Lighter Back squat' }));
    expect(squat.getByLabelText('Back squat load').textContent).toBe('60kg');

    tapSet('Back squat', 1);
    expect(squat.getByRole('button', { name: /set 1: logged, 5 reps at 60kg/ })).toBeTruthy();
  });

  it('a second tap undoes a set, and Adjust changes reps and adds RPE and a note', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    tapSet('Back squat', 1);
    tapSet('Back squat', 1);
    expect(squat.getByRole('button', { name: /set 1: 5 reps at 62.5kg. Tap to log/ })).toBeTruthy();

    fireEvent.click(squat.getByRole('button', { name: 'Adjust Back squat set 2' }));
    const editor = within(screen.getByRole('form', { name: 'Adjust Back squat set 2' }));
    fireEvent.change(editor.getByLabelText('Reps'), { target: { value: '4' } });
    fireEvent.click(editor.getByRole('radio', { name: 'RPE 9' }));
    fireEvent.change(editor.getByLabelText('Note'), { target: { value: 'grindy' } });
    fireEvent.click(editor.getByRole('button', { name: 'Log set 2' }));
    expect(
      squat.getByRole('button', { name: /set 2: logged, 4 reps at 62.5kg, RPE 9/ }),
    ).toBeTruthy();
  });

  it('a long press opens the same editor instead of logging', () => {
    vi.useFakeTimers();
    setup({ day: WITH_START, history: LAST_WEEK });
    const row = screen.getByRole('button', { name: /^Back squat set 1:/ });
    fireEvent.pointerDown(row);
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(screen.getByRole('form', { name: 'Adjust Back squat set 1' })).toBeTruthy();
    expect(row.getAttribute('aria-pressed')).toBe('false');
  });

  it('logs timed bodyweight sets with no load', () => {
    setup({ day: WITH_START });
    const bug = card('Dead bug');
    expect(bug.queryByLabelText('Dead bug load')).toBeNull();
    tapSet('Dead bug', 1);
    expect(bug.getByRole('button', { name: /set 1: logged, done/ })).toBeTruthy();
  });

  it('cannot finish before a set is logged', () => {
    setup({ day: WITH_START });
    expect(screen.getByRole('button', { name: 'Finish (save as partial)' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('start-load prompt', () => {
  it('asks once for a slot with no history and no start load, and saves the snapped answer', async () => {
    const { calls } = setup();
    const squat = card('Back squat');
    expect(squat.queryByLabelText('Back squat load')).toBeNull();
    expect(squat.queryByRole('button', { name: /^Back squat set 1/ })).toBeNull();

    const prompt = within(screen.getByRole('form', { name: 'Starting load for Back squat' }));
    fireEvent.change(prompt.getByLabelText('What did you last back squat for 5? (kg)'), {
      target: { value: '61' },
    });
    fireEvent.click(prompt.getByRole('button', { name: 'Set starting load' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/programme-slots/11',
      body: { start_load_kg: 60 },
    });
  });

  it('does not ask when the slot already has a start load or history', () => {
    setup({ day: WITH_START });
    expect(screen.queryByRole('form', { name: 'Starting load for Back squat' })).toBeNull();
    expect(card('Back squat').getByLabelText('Back squat load').textContent).toBe('60kg');
    cleanup();
    setup({ history: LAST_WEEK });
    expect(screen.queryByRole('form', { name: 'Starting load for Back squat' })).toBeNull();
  });
});

describe('substitution when kit is missing', () => {
  it('with dumbbells only, the squat slot offers a dumbbell substitute and swaps for this session', async () => {
    const { calls } = setup({ day: WITH_START, equipment: DUMBBELLS_ONLY });
    const squat = card('Back squat');
    expect(squat.getByText('No kit for this.')).toBeTruthy();
    const options = within(squat.getByRole('group', { name: 'Substitutes for Back squat' }));
    expect(options.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Dumbbell goblet squat (dumbbell)',
      'Bodyweight squat (bodyweight)',
    ]);

    fireEvent.click(options.getByRole('button', { name: 'Dumbbell goblet squat (dumbbell)' }));
    const sub = card('Dumbbell goblet squat');
    expect(sub.getByText('In place of Back squat today.')).toBeTruthy();

    // The substitute has its own starting load, kept for this session only.
    const prompt = within(
      screen.getByRole('form', { name: 'Starting load for Dumbbell goblet squat' }),
    );
    fireEvent.change(prompt.getByRole('textbox'), { target: { value: '12' } });
    fireEvent.click(prompt.getByRole('button', { name: 'Set starting load' }));
    expect(sub.getByLabelText('Dumbbell goblet squat load').textContent).toBe('12.5kg');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    tapSet('Dumbbell goblet squat', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Finish (save as partial)' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST') as Call;
    expect(
      (post.body as { strength_session: { sets: unknown[] } }).strength_session.sets[0],
    ).toMatchObject({ slot_id: 11, exercise_id: 5, load_kg: 12.5, reps: 5 });
  });

  it('offers to make the swap permanent, and to undo it', async () => {
    const { calls } = setup({ day: WITH_START, equipment: DUMBBELLS_ONLY });
    fireEvent.click(screen.getByRole('button', { name: 'Bodyweight squat (bodyweight)' }));
    const sub = card('Bodyweight squat');
    fireEvent.click(sub.getByRole('button', { name: 'Undo swap' }));
    expect(card('Back squat').getByText('No kit for this.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bodyweight squat (bodyweight)' }));
    fireEvent.click(card('Bodyweight squat').getByRole('button', { name: 'Make permanent' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/programme-slots/11',
      body: { exercise_id: 6, increment_kg: null },
    });
  });

  it('with no kit at all, every slot offers bodyweight or says none, and nothing crashes', () => {
    setup({ day: WITH_START, equipment: NO_KIT });
    expect(
      within(card('Back squat').getByRole('group'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Bodyweight squat (bodyweight)']);
    expect(
      within(card('Reverse lunge').getByRole('group'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Bodyweight reverse lunge (bodyweight)']);
    // Bodyweight slots are unaffected.
    expect(card('Dead bug').getByRole('button', { name: /^Dead bug set 1/ })).toBeTruthy();
  });

  it('says no substitute is available when the library has none for the pattern', () => {
    const carryDay: ProgrammeDay = {
      id: 1,
      name: 'Carry day',
      slots: [{ ...SQUAT_SLOT, exercise_id: 8, reps: null, load_rule: 'fixed', sets: 3 }],
    };
    setup({ day: carryDay, equipment: NO_KIT });
    expect(card('Suitcase carry').getByText('No substitute available.')).toBeTruthy();
  });
});

describe('rest timer integration', () => {
  it('starts the slot rest on each logged set and highlights the next set when it ends', () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance', 'Date', 'setTimeout', 'clearTimeout'],
    });
    setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    expect(squat.queryByText(/rest, tap to skip/)).toBeNull();

    tapSet('Back squat', 1);
    expect(squat.getByText('2:30')).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(squat.getByText('1:30')).toBeTruthy();

    // Logging the next set resets the rest to the slot's full 150 seconds.
    tapSet('Back squat', 2);
    expect(squat.getByText('2:30')).toBeTruthy();

    const third = squat.getByRole('button', { name: /^Back squat set 3:/ });
    expect(third.className).not.toContain('is-next');
    act(() => vi.advanceTimersByTime(150_200));
    act(() => vi.advanceTimersByTime(400));
    expect(squat.getByRole('status').textContent).toBe('Rest over');
    expect(third.className).toContain('is-next');
    expect(within(third).getByText('Go')).toBeTruthy();
  });

  it('uses each slot own rest length', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
    setup({ day: WITH_START });
    tapSet('Dead bug', 1);
    expect(card('Dead bug').getByText('0:45')).toBeTruthy();
    expect(card('Back squat').queryByText(/tap to skip/)).toBeNull();
  });
});
