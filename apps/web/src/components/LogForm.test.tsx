import type { ActivityInput, WeekSession } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '../test/fixtures.js';
import { LogForm } from './LogForm.js';

afterEach(cleanup);

function setup(s: WeekSession) {
  const onSubmit = vi.fn<(activity: ActivityInput) => void>();
  const onCancel = vi.fn();
  render(<LogForm session={s} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel, user: userEvent.setup() };
}
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

describe('LogForm', () => {
  it('vest walk: pre-fills minutes and vest, and sends vest_kg in the detail', async () => {
    const { onSubmit, user } = setup(
      session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 }),
    );
    expect(value('Minutes')).toBe('60');
    expect(value('Vest (kg)')).toBe('20');
    expect(screen.queryByLabelText('Repeats')).toBeNull();
    expect(screen.queryByLabelText('Distance (km)')).toBeNull();

    await user.clear(screen.getByLabelText('Minutes'));
    await user.type(screen.getByLabelText('Minutes'), '55');
    await user.click(screen.getByRole('radio', { name: 'RPE 3' }));
    await user.type(screen.getByLabelText('Notes'), 'steady');
    await save(user);

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind: 'walk_vest',
      planned_session_id: 7,
      duration_min: 55,
      rpe: 3,
      notes: 'steady',
      detail: { vest_kg: 20 },
    });
  });

  it('run-walk: pre-fills the blocks from the plan and sends them in the detail', async () => {
    const { onSubmit, user } = setup(
      session('run', 'Midweek run', {
        repeats: 8,
        run_block_sec: 150,
        walk_block_sec: 60,
        duration_min: 38,
      }),
    );
    expect(value('Repeats')).toBe('8');
    expect(value('Run block (seconds)')).toBe('150');
    expect(value('Walk block (seconds)')).toBe('60');
    expect(value('Minutes')).toBe('38');

    await user.clear(screen.getByLabelText('Repeats'));
    await user.type(screen.getByLabelText('Repeats'), '7');
    await user.type(screen.getByLabelText('Distance (km)'), '4.2');
    await user.selectOptions(screen.getByLabelText('Surface'), 'road');
    await save(user);

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind: 'run',
      planned_session_id: 7,
      duration_min: 38,
      distance_km: 4.2,
      rpe: null,
      notes: null,
      detail: {
        continuous: false,
        repeats: 7,
        run_block_sec: 150,
        walk_block_sec: 60,
        surface: 'road',
      },
    });
  });

  it('continuous run: hides the blocks and marks the activity continuous', async () => {
    const { onSubmit, user } = setup(
      session('run', 'Midweek run', {
        repeats: 1,
        run_block_sec: 1500,
        walk_block_sec: 0,
        duration_min: 35,
      }),
    );
    expect(screen.getByRole('checkbox', { name: 'Continuous (no walk breaks)' })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.queryByLabelText('Repeats')).toBeNull();
    await save(user);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      duration_min: 35,
      detail: { continuous: true, surface: 'treadmill' },
    });

    // Unticking it brings the blocks back for a run that turned into run-walk.
    await user.click(screen.getByRole('checkbox', { name: 'Continuous (no walk breaks)' }));
    expect(screen.getByLabelText('Repeats')).toBeTruthy();
  });

  it.each([
    ['ride', 'Turbo long ride'],
    ['swim', 'Coached swim'],
  ] as const)('%s: minutes and distance only', async (kind, name) => {
    const { onSubmit, user } = setup(session(kind, name, {}));
    expect(value('Minutes')).toBe('');
    expect(screen.queryByLabelText('Vest (kg)')).toBeNull();
    await user.type(screen.getByLabelText('Minutes'), '75');
    await user.type(screen.getByLabelText('Distance (km)'), '30');
    await user.click(screen.getByRole('radio', { name: 'RPE 10' }));
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind,
      planned_session_id: 7,
      duration_min: 75,
      distance_km: 30,
      rpe: 10,
      notes: null,
    });
  });

  it.each([
    ['walk', 'Treadmill walk', { duration_min: 50 }],
    ['strength', 'Strength A', { duration_min: 40 }],
  ] as const)('%s: minutes only', async (kind, name, targets) => {
    const { onSubmit, user } = setup(session(kind, name, targets));
    expect(value('Minutes')).toBe(String(targets.duration_min));
    expect(screen.queryByLabelText('Distance (km)')).toBeNull();
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind,
      planned_session_id: 7,
      duration_min: targets.duration_min,
      rpe: null,
      notes: null,
    });
  });

  it('offers RPE 1 to 10 and can be cancelled', async () => {
    const { onCancel, onSubmit, user } = setup(session('walk', 'Treadmill walk', {}));
    expect(screen.getAllByRole('radio', { name: /^RPE \d+$/ })).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
