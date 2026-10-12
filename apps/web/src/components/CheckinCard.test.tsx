import type { Checkin, CheckinInput } from '@ots/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HABITS, emptyCheckin } from '../test/fixtures.js';
import { COLLAPSE_AFTER_MS, CheckinCard } from './CheckinCard.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const MONDAY = '2031-01-06';
const SUNDAY = '2031-01-12';

function setup(checkin: Checkin = emptyCheckin(MONDAY), lastWeight: number | null = null) {
  const onSave = vi.fn<(changes: CheckinInput) => void>();
  const view = render(
    <CheckinCard checkin={checkin} habits={HABITS} lastWeight={lastWeight} onSave={onSave} />,
  );
  const show = (next: Checkin) =>
    view.rerender(
      <CheckinCard checkin={next} habits={HABITS} lastWeight={lastWeight} onSave={onSave} />,
    );
  return { onSave, show, user: userEvent.setup() };
}

describe('CheckinCard', () => {
  it('is weight and habit chips only, with no Save button: each tap saves just that field', async () => {
    const { onSave, user } = setup();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    // Sleep, energy and the ankle score are no longer asked for.
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/Sleep|Energy|Ankle/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Alcohol free' }));
    expect(onSave).toHaveBeenLastCalledWith({ habits: { alcohol_free: true } });
    await user.click(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(onSave).toHaveBeenLastCalledWith({ weight_kg: 70 });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('shows what is saved, and a second tap on a habit unticks it', async () => {
    const { onSave, user } = setup(emptyCheckin(MONDAY, { habits: { alcohol_free: true } }));
    const habit = screen.getByRole('button', { name: 'Alcohol free' });
    expect(habit.getAttribute('aria-pressed')).toBe('true');
    await user.click(habit);
    expect(onSave).toHaveBeenLastCalledWith({ habits: { alcohol_free: false } });
  });

  it('weight starts from the last value and moves in 0.1 kg steps', async () => {
    const { onSave, user } = setup(emptyCheckin(MONDAY), 71.2);
    expect((screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement).value).toBe(
      '71.2',
    );
    expect(screen.getByText(/Not recorded for today yet/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Decrease Weight' }));
    expect(onSave).toHaveBeenLastCalledWith({ weight_kg: 71.1 });
  });

  it('records the same weight as last time in one tap and folds at once', async () => {
    const { onSave, show, user } = setup(emptyCheckin(MONDAY), 71.2);
    await user.click(screen.getByRole('button', { name: 'Same today' }));
    expect(onSave).toHaveBeenLastCalledWith({ weight_kg: 71.2 });
    show(emptyCheckin(MONDAY, { weight_kg: 71.2 }));
    expect(screen.getByRole('button', { name: '71.2 kg' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Weight' })).toBeNull();
  });

  it('with a weight already saved it is one line saying what is recorded', () => {
    setup(emptyCheckin(MONDAY, { weight_kg: 77, habits: { protein_shake: true } }), 71.2);
    const line = screen.getByRole('button', { name: '77.0 kg · protein shake' });
    expect(line.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Habits' })).toBeNull();
  });

  it('stays open while the weight is being stepped, then folds; opened by hand it stays open', () => {
    vi.useFakeTimers();
    const { show } = setup();
    show(emptyCheckin(MONDAY, { weight_kg: 70 }));
    act(() => void vi.advanceTimersByTime(COLLAPSE_AFTER_MS - 1));
    // Another step before the pause is over starts the wait again.
    show(emptyCheckin(MONDAY, { weight_kg: 70.1 }));
    act(() => void vi.advanceTimersByTime(COLLAPSE_AFTER_MS - 1));
    expect(screen.getByRole('textbox', { name: 'Weight' })).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1));
    const line = screen.getByRole('button', { name: '70.1 kg' });

    fireEvent.click(line);
    expect((screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement).value).toBe(
      '70.1',
    );
    show(emptyCheckin(MONDAY, { weight_kg: 70.2 }));
    act(() => void vi.advanceTimersByTime(COLLAPSE_AFTER_MS * 2));
    expect(screen.getByRole('textbox', { name: 'Weight' })).toBeTruthy();
  });

  it('leaves out a habit that is switched off, and the kit habit, which belongs to the evening banner', () => {
    setup();
    const habits = screen.getByRole('group', { name: 'Habits' });
    expect([...habits.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Alcohol free',
      'Prehab done',
      'Protein shake',
    ]);
  });

  it('asks about getting up only on a Sunday', async () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Got up for it' })).toBeNull();
    cleanup();
    const { onSave, user } = setup(emptyCheckin(SUNDAY));
    await user.click(screen.getByRole('button', { name: 'Got up for it' }));
    expect(onSave).toHaveBeenLastCalledWith({ sunday_got_up: true });
  });
});
