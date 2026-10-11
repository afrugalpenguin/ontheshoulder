import type { CheckinInput } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HABITS, emptyCheckin } from '../test/fixtures.js';
import { CheckinStrip } from './CheckinStrip.js';

afterEach(cleanup);

const MONDAY = '2031-01-06';
const SUNDAY = '2031-01-12';

function setup(date = MONDAY, lastWeight: number | null = null) {
  const onSave = vi.fn<(changes: CheckinInput) => void>();
  render(
    <CheckinStrip
      checkin={emptyCheckin(date)}
      habits={HABITS}
      lastWeight={lastWeight}
      onSave={onSave}
    />,
  );
  return { onSave, user: userEvent.setup() };
}

describe('CheckinStrip', () => {
  it('cannot be saved until sleep and energy are chosen', async () => {
    const { onSave, user } = setup();
    const save = screen.getByRole('button', { name: 'Save check-in' });
    expect(save).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('radio', { name: 'Sleep 4' }));
    expect(save).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('radio', { name: 'Energy 3' }));
    expect(save).toHaveProperty('disabled', false);
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('saves sleep, energy, weight, habits and ankle in one call', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Sleep 4' }));
    await user.click(screen.getByRole('radio', { name: 'Energy 2' }));
    await user.type(screen.getByLabelText('Weight (kg)'), '70.5');
    await user.click(screen.getByRole('checkbox', { name: 'Alcohol free' }));
    await user.click(screen.getByRole('checkbox', { name: 'Prehab done' }));
    await user.click(screen.getByRole('radio', { name: 'Ankle 1' }));
    await user.click(screen.getByRole('button', { name: 'Save check-in' }));

    expect(onSave).toHaveBeenCalledWith({
      sleep_quality: 4,
      energy: 2,
      weight_kg: 70.5,
      ankle_score: 1,
      habits: {
        treadmill_done: false,
        alcohol_free: true,
        prehab_done: true,
        protein_shake: false,
      },
    });
  });

  it('prefills the last weight and leaves the optional ankle row empty', async () => {
    const { onSave, user } = setup(MONDAY, 71.2);
    expect(screen.getByLabelText('Weight (kg)')).toHaveProperty('value', '71.2');
    await user.click(screen.getByRole('radio', { name: 'Sleep 3' }));
    await user.click(screen.getByRole('radio', { name: 'Energy 3' }));
    await user.click(screen.getByRole('button', { name: 'Save check-in' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ weight_kg: 71.2, ankle_score: null });
  });

  it('lets the ankle score be cleared by tapping it again', async () => {
    const { user } = setup();
    const two = screen.getByRole('radio', { name: 'Ankle 2' });
    await user.click(two);
    expect(two.getAttribute('aria-checked')).toBe('true');
    await user.click(two);
    expect(two.getAttribute('aria-checked')).toBe('false');
  });

  it('shows the got-up toggle only on a Sunday and sends it', async () => {
    setup(MONDAY);
    expect(screen.queryByRole('checkbox', { name: 'Got up for it' })).toBeNull();
    cleanup();

    const { onSave, user } = setup(SUNDAY);
    await user.click(screen.getByRole('checkbox', { name: 'Got up for it' }));
    await user.click(screen.getByRole('radio', { name: 'Sleep 5' }));
    await user.click(screen.getByRole('radio', { name: 'Energy 5' }));
    await user.click(screen.getByRole('button', { name: 'Save check-in' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ sunday_got_up: true });
  });

  it('keeps a habit already ticked from a prompt', () => {
    render(
      <CheckinStrip
        checkin={emptyCheckin(MONDAY, { habits: { protein_shake: true } })}
        habits={HABITS}
        lastWeight={null}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Protein shake' })).toHaveProperty('checked', true);
  });
});
