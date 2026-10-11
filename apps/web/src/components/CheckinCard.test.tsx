import type { Checkin, CheckinInput } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HABITS, emptyCheckin } from '../test/fixtures.js';
import { CheckinCard } from './CheckinCard.js';

afterEach(cleanup);

const MONDAY = '2031-01-06';
const SUNDAY = '2031-01-12';

function setup(checkin: Checkin = emptyCheckin(MONDAY), lastWeight: number | null = null) {
  const onSave = vi.fn<(changes: CheckinInput) => void>();
  render(<CheckinCard checkin={checkin} habits={HABITS} lastWeight={lastWeight} onSave={onSave} />);
  return { onSave, user: userEvent.setup() };
}

describe('CheckinCard', () => {
  it('has no Save button: each tap saves just that field', async () => {
    const { onSave, user } = setup();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Sleep 4' }));
    expect(onSave).toHaveBeenLastCalledWith({ sleep_quality: 4 });
    await user.click(screen.getByRole('radio', { name: 'Energy 3' }));
    expect(onSave).toHaveBeenLastCalledWith({ energy: 3 });
    await user.click(screen.getByRole('button', { name: 'Alcohol free' }));
    expect(onSave).toHaveBeenLastCalledWith({ habits: { alcohol_free: true } });
    await user.click(screen.getByRole('radio', { name: 'Ankle 0' }));
    expect(onSave).toHaveBeenLastCalledWith({ ankle_score: 0 });
    expect(onSave).toHaveBeenCalledTimes(4);
  });

  it('shows what is saved, and a second tap on a habit unticks it', async () => {
    const { onSave, user } = setup(
      emptyCheckin(MONDAY, { sleep_quality: 2, habits: { alcohol_free: true } }),
    );
    expect(screen.getByRole('radio', { name: 'Sleep 2' }).getAttribute('aria-checked')).toBe(
      'true',
    );
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

  it('records the same weight as last time in one tap', async () => {
    const { onSave, user } = setup(emptyCheckin(MONDAY), 71.2);
    await user.click(screen.getByRole('button', { name: 'Same today' }));
    expect(onSave).toHaveBeenLastCalledWith({ weight_kg: 71.2 });
  });

  it('a recorded weight is shown as recorded', () => {
    setup(emptyCheckin(MONDAY, { weight_kg: 70.4 }), 71.2);
    expect((screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement).value).toBe(
      '70.4',
    );
    expect(screen.queryByRole('button', { name: 'Same today' })).toBeNull();
  });

  it('leaves out the kit habit, which belongs to the evening banner', () => {
    setup();
    const habits = screen.getByRole('group', { name: 'Habits' });
    expect([...habits.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Treadmill done',
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
