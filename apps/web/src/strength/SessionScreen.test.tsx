import type { Equipment, ProgrammeDay, StrengthHistoryEntry } from '@ots/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY, DUMBBELLS_ONLY, FULL_KIT, LIBRARY, NO_KIT, SQUAT_SLOT, past } from './fixtures.js';
import { SessionScreen, type SavedSession } from './StrengthSession.js';

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
interface SavedSet {
  slot_id: number;
  set_no: number;
  reps: number;
  load_kg: number | null;
  warmup: boolean;
  exercise_id: number | null;
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
  const onSaved = vi.fn<(saved: SavedSession) => void>();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        path: String(input).replace(/^\/api/, ''),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Promise.resolve(Response.json({ id: 77 }));
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
          onSaved={onSaved}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  /** The sets in the saved activity, once Finish has been tapped. */
  const savedSets = async () => {
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST') as Call;
    return (post.body as { strength_session: { partial: boolean; sets: SavedSet[] } })
      .strength_session;
  };
  return { calls, onSaved, savedSets };
}

const WITH_START: ProgrammeDay = {
  ...DAY,
  slots: DAY.slots.map((s) => (s.id === SQUAT_SLOT.id ? { ...s, start_load_kg: 60 } : s)),
};
const FIVES = [5, 5, 5, 5, 5];
const LAST_WEEK = [past('2031-01-08', [[SQUAT_SLOT, FIVES, 60]])];

const card = (name: string) => within(screen.getByRole('article', { name }));
const circle = (exercise: string, n: number) =>
  screen.getByRole('button', { name: new RegExp(`^${exercise} set ${n}:`) });
const tap = (exercise: string, n: number, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(circle(exercise, n));
};
const finish = () => fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

describe('layout', () => {
  it('shows a block per exercise with the load large and a circle per set, and nothing else', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    expect(squat.getByRole('button', { name: /^Back squat load: 62.5 kg/ }).textContent).toBe(
      '62.5 kg',
    );
    const sets = within(squat.getByRole('group', { name: 'Back squat sets' }));
    expect(sets.getAllByRole('button').map((b) => b.textContent)).toEqual(Array(5).fill('5'));
    // No reasons, notes, RPE or adjust buttons on show.
    expect(squat.queryByText(/completed last time/)).toBeNull();
    expect(squat.queryByText(/RPE/)).toBeNull();
    expect(squat.queryByRole('button', { name: /Adjust/ })).toBeNull();
    // Timed work shows its seconds; nothing can be finished yet.
    expect(circle('Dead bug', 1).textContent).toBe('45s');
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  });
});

describe('set circles', () => {
  it('a tap fills with the target reps and logs the set at the working load', async () => {
    const { savedSets } = setup({ day: WITH_START, history: LAST_WEEK });
    tap('Back squat', 1);
    expect(circle('Back squat', 1).className).toContain('is-done');
    expect(circle('Back squat', 1).getAttribute('aria-pressed')).toBe('true');
    finish();
    const saved = await savedSets();
    expect(saved.partial).toBe(true);
    expect(saved.sets).toEqual([
      expect.objectContaining({ slot_id: 11, set_no: 1, reps: 5, load_kg: 62.5, warmup: false }),
    ]);
  });

  it('each further tap takes a rep off: 5, 4, 3, 2, 1, 0, then empty', () => {
    setup({ day: WITH_START });
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      tap('Back squat', 1);
      seen.push(`${circle('Back squat', 1).textContent}`);
    }
    expect(seen).toEqual(['5', '4', '3', '2', '1', '0']);
    expect(circle('Back squat', 1).className).toContain('is-short');
    tap('Back squat', 1);
    expect(circle('Back squat', 1).getAttribute('aria-pressed')).toBe('false');
    expect(circle('Back squat', 1).textContent).toBe('5');
    // Emptied again, so there is nothing to finish.
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  });

  it('saves the reps the circle ended on', async () => {
    const { savedSets } = setup({ day: WITH_START });
    tap('Back squat', 1);
    tap('Back squat', 2, 3);
    finish();
    expect((await savedSets()).sets.map((s) => [s.set_no, s.reps])).toEqual([
      [1, 5],
      [2, 3],
    ]);
  });

  it('logs timed bodyweight sets with no load', async () => {
    const { savedSets } = setup({ day: WITH_START });
    tap('Dead bug', 1);
    finish();
    expect((await savedSets()).sets[0]).toMatchObject({ slot_id: 13, reps: 1, load_kg: null });
  });

  it('a full session is sets plus one tap, and is not partial', async () => {
    // The lunge has no history, so it gets its starting load from the day.
    const day: ProgrammeDay = {
      ...WITH_START,
      slots: WITH_START.slots.map((s) => (s.id === 12 ? { ...s, start_load_kg: 10 } : s)),
    };
    const { savedSets, onSaved } = setup({ day, history: LAST_WEEK });
    let taps = 0;
    for (const button of screen.getAllByRole('button', { name: / set \d+: not done/ })) {
      fireEvent.click(button);
      taps++;
    }
    finish();
    taps++;
    expect(taps).toBe(5 + 3 + 3 + 1);
    const saved = await savedSets();
    expect(saved.partial).toBe(false);
    expect(saved.sets).toHaveLength(11);
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ activityId: 77, name: 'Strength A', partial: false }),
    );
  });
});

describe('load: plates on demand, and the pencil', () => {
  it('tapping the load shows the plates for each side, with the bar', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    fireEvent.click(screen.getByRole('button', { name: /^Back squat load: 62.5 kg/ }));
    const sheet = within(screen.getByRole('dialog', { name: 'Back squat: 62.5 kg' }));
    expect(sheet.getByText('20 + 1.25')).toBeTruthy();
    expect(sheet.getByText('each side, bar 20')).toBeTruthy();

    fireEvent.click(sheet.getByRole('radio', { name: 'Show Total kg' }));
    expect(sheet.getByText('62.5 kg')).toBeTruthy();
    expect(sheet.getByText('bar + 2 x 20 + 2 x 1.25')).toBeTruthy();
  });

  it('for dumbbells it names the pair to pick up', () => {
    const day: ProgrammeDay = {
      ...WITH_START,
      slots: WITH_START.slots.map((s) => (s.id === 12 ? { ...s, start_load_kg: 12.5 } : s)),
    };
    setup({ day });
    fireEvent.click(screen.getByRole('button', { name: /^Reverse lunge load: 12.5 kg/ }));
    const sheet = within(screen.getByRole('dialog', { name: 'Reverse lunge: 12.5 kg' }));
    expect(sheet.getByText('The 12.5 kg dumbbells')).toBeTruthy();
    expect(sheet.queryByRole('radiogroup')).toBeNull();
  });

  it('the pencil steps the load through what the kit can make, for this session', async () => {
    const { savedSets } = setup({ day: WITH_START });
    fireEvent.click(screen.getByRole('button', { name: 'Change Back squat load' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Back squat load' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Heavier Back squat' }));
    expect(sheet.getByText('62.5 kg')).toBeTruthy();
    fireEvent.click(sheet.getByRole('button', { name: 'Lighter Back squat' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Lighter Back squat' }));
    expect(sheet.getByText('57.5 kg')).toBeTruthy();
    tap('Back squat', 1);
    finish();
    expect((await savedSets()).sets[0]).toMatchObject({ load_kg: 57.5 });
  });
});

describe('warm-up sets', () => {
  it('are a collapsed row above the working sets with the snapped ramp', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    const squat = card('Back squat');
    const row = squat.getByRole('group', { name: 'Back squat warm-up sets' });
    expect((row.closest('details') as HTMLDetailsElement).open).toBe(false);
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Back squat warm-up 1 at 20 kg: not done, target 5',
      'Back squat warm-up 2 at 20 kg: not done, target 5',
      'Back squat warm-up 3 at 25 kg: not done, target 5',
      'Back squat warm-up 4 at 37.5 kg: not done, target 5',
    ]);
    // Dumbbell and bodyweight slots have none.
    expect(card('Reverse lunge').queryByText('Warm-up')).toBeNull();
    expect(card('Dead bug').queryByText('Warm-up')).toBeNull();
  });

  it('are saved flagged as warm-ups at their own loads, and do not start a rest', async () => {
    const { savedSets } = setup({ day: WITH_START, history: LAST_WEEK });
    fireEvent.click(screen.getByRole('button', { name: /^Back squat warm-up 3 at 25 kg/ }));
    expect(screen.queryByRole('timer')).toBeNull();
    tap('Back squat', 1);
    finish();
    expect((await savedSets()).sets.map((s) => [s.warmup, s.set_no, s.load_kg])).toEqual([
      [true, 3, 25],
      [false, 1, 62.5],
    ]);
  });

  it('are not offered when switched off for the slot', () => {
    const day: ProgrammeDay = {
      ...WITH_START,
      slots: WITH_START.slots.map((s) => (s.id === 11 ? { ...s, warmups_enabled: false } : s)),
    };
    setup({ day });
    expect(card('Back squat').queryByText('Warm-up')).toBeNull();
  });
});

describe('next-session line', () => {
  const nextLine = () => screen.getByLabelText('Back squat next session').textContent;

  it('appears once every working set is in, and goes up after a clean session', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    for (let n = 1; n <= 4; n++) tap('Back squat', n);
    expect(screen.queryByLabelText('Back squat next session')).toBeNull();
    tap('Back squat', 5);
    expect(nextLine()).toBe('Next session: 65 kg completed last time, up 2.5kg');
  });

  it('holds after a failed set', () => {
    setup({ day: WITH_START, history: LAST_WEEK });
    for (let n = 1; n <= 5; n++) tap('Back squat', n);
    // Tap the fourth set down to 3.
    tap('Back squat', 4, 2);
    expect(circle('Back squat', 4).textContent).toBe('3');
    expect(nextLine()).toBe('Next session: 62.5 kg missed reps last time: hold once');
  });

  it('deloads ten per cent after a second failure, snapped to a load the kit makes', () => {
    const failedLastTime = [
      past('2031-01-15', [[SQUAT_SLOT, [5, 5, 5, 3, 3], 62.5]]),
      ...LAST_WEEK,
    ];
    setup({ day: WITH_START, history: failedLastTime });
    // Held at 62.5 for today.
    expect(screen.getByRole('button', { name: /^Back squat load: 62.5 kg/ })).toBeTruthy();
    for (let n = 1; n <= 5; n++) tap('Back squat', n);
    tap('Back squat', 5, 2);
    // 62.5 less ten per cent is 56.25, which this kit cannot make: 55.
    expect(nextLine()).toBe('Next session: 55 kg second miss in a row: deload 10 per cent');
  });

  it('is only for slots on the linear rule', () => {
    setup({ day: WITH_START });
    for (let n = 1; n <= 3; n++) tap('Dead bug', n);
    expect(screen.queryByLabelText('Dead bug next session')).toBeNull();
  });
});

describe('rest bar', () => {
  const FAKE = [
    'setInterval',
    'clearInterval',
    'performance',
    'Date',
    'setTimeout',
    'clearTimeout',
  ] as const;
  const timer = () => screen.getByRole('timer');

  it('counts down from the slot rest, names the next set, and restarts on the next set', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    setup({ day: WITH_START, history: LAST_WEEK });
    expect(screen.queryByRole('timer')).toBeNull();

    tap('Back squat', 1);
    expect(timer().textContent).toBe('2:30');
    expect(screen.getByText('Next: Back squat, 62.5 kg')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(timer().textContent).toBe('1:30');

    // Taking a rep off the set just done does not restart the rest.
    tap('Back squat', 1);
    expect(timer().textContent).toBe('1:30');

    // Logging the next set does: back to the slot's full 150 seconds.
    tap('Back squat', 2);
    expect(timer().textContent).toBe('2:30');
  });

  it('runs to zero, then collapses and highlights the next empty circle', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    setup({ day: WITH_START, history: LAST_WEEK });
    tap('Back squat', 1);
    expect(circle('Back squat', 2).className).not.toContain('is-next');

    act(() => void vi.advanceTimersByTime(139_000));
    expect(timer().textContent).toBe('0:11');
    act(() => void vi.advanceTimersByTime(1_200));
    expect(timer().textContent).toBe('0:10');
    act(() => void vi.advanceTimersByTime(10_000));
    act(() => void vi.advanceTimersByTime(400));

    expect(screen.queryByRole('timer')).toBeNull();
    expect(circle('Back squat', 2).className).toContain('is-next');
    expect(circle('Back squat', 3).className).not.toContain('is-next');
  });

  it('Skip ends the rest at once and highlights the next circle', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    setup({ day: WITH_START, history: LAST_WEEK });
    tap('Back squat', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('timer')).toBeNull();
    expect(circle('Back squat', 2).className).toContain('is-next');
  });

  it('after the last set of a slot, points at the first set of the next one', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    setup({ day: WITH_START, history: LAST_WEEK });
    for (let n = 1; n <= 5; n++) tap('Back squat', n);
    // The lunge has no load yet, so the next loggable set is the dead bug.
    expect(screen.getByText('Next: Dead bug')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(circle('Dead bug', 1).className).toContain('is-next');
  });

  it('uses each slot own rest length, and does not start after the very last set', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const day: ProgrammeDay = { ...DAY, slots: DAY.slots.filter((s) => s.id === 13) };
    setup({ day });
    tap('Dead bug', 1);
    expect(timer().textContent).toBe('0:45');
    tap('Dead bug', 2);
    tap('Dead bug', 3);
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('start-load prompt', () => {
  it('asks once for a slot with no history and no start load, and saves the snapped answer', async () => {
    const { calls } = setup();
    const squat = card('Back squat');
    expect(squat.queryByRole('button', { name: /^Back squat load/ })).toBeNull();
    expect(squat.queryByRole('button', { name: /^Back squat set 1/ })).toBeNull();

    const prompt = within(screen.getByRole('form', { name: 'Starting load for Back squat' }));
    const field = prompt.getByRole('textbox', { name: 'What did you last back squat for 5?' });
    fireEvent.change(field, { target: { value: '61' } });
    fireEvent.blur(field);
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
    expect(
      card('Back squat').getByRole('button', { name: /^Back squat load: 60 kg/ }),
    ).toBeTruthy();
    cleanup();
    setup({ history: LAST_WEEK });
    expect(screen.queryByRole('form', { name: 'Starting load for Back squat' })).toBeNull();
  });
});

describe('substitution when kit is missing', () => {
  it('with dumbbells only, the squat slot offers a dumbbell substitute and swaps for this session', async () => {
    const { calls, savedSets } = setup({ day: WITH_START, equipment: DUMBBELLS_ONLY });
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
    fireEvent.blur(prompt.getByRole('textbox'));
    fireEvent.click(prompt.getByRole('button', { name: 'Set starting load' }));
    expect(sub.getByRole('button', { name: /^Dumbbell goblet squat load: 12.5 kg/ })).toBeTruthy();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    // A substitute is not a barbell lift, so it has no warm-up ramp.
    expect(sub.queryByText('Warm-up')).toBeNull();

    tap('Dumbbell goblet squat', 1);
    finish();
    expect((await savedSets()).sets[0]).toMatchObject({
      slot_id: 11,
      exercise_id: 5,
      load_kg: 12.5,
      reps: 5,
    });
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
