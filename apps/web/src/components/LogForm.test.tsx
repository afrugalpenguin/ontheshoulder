import type { ActivityInput, WeekSession } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasTimer, primaryAction } from '../lib/activity.js';
import { session } from '../test/fixtures.js';
import { LogForm } from './LogForm.js';

afterEach(cleanup);

function setup(s: WeekSession) {
  const onSubmit = vi.fn<(activity: ActivityInput) => void>();
  render(<LogForm session={s} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}
const value = (label: string) =>
  (screen.getByRole('textbox', { name: label }) as HTMLInputElement).value;
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

describe('LogForm', () => {
  it('is pre-filled from the plan, so saving is one tap', async () => {
    const { onSubmit, user } = setup(session('ride', 'Long ride', { duration_min: 90 }));
    expect(value('Minutes')).toBe('90');
    expect(value('RPE')).toBe('');
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind: 'ride',
      planned_session_id: 7,
      duration_min: 90,
      rpe: null,
      notes: null,
    });
  });

  it('a time-boxed run is pre-filled at the midpoint and logs in one tap', async () => {
    const { onSubmit, user } = setup(session('run', 'Long run', { min_min: 50, max_min: 60 }));
    expect(value('Minutes')).toBe('55');
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith({
      date: '2031-01-06',
      kind: 'run',
      planned_session_id: 7,
      duration_min: 55,
      rpe: null,
      notes: null,
    });
  });

  it('a run takes an optional "how was it" chip, and a second tap takes it back', async () => {
    const { onSubmit, user } = setup(session('run', 'Midweek run', { min_min: 40, max_min: 50 }));
    const chips = screen.getByRole('group', { name: 'How was it' });
    expect([...chips.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'good',
      'fine',
      'grim',
    ]);
    await user.click(screen.getByRole('button', { name: 'grim' }));
    await save(user);
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ duration_min: 45, detail: { feel: 'grim' } }),
    );
    await user.click(screen.getByRole('button', { name: 'grim' }));
    await save(user);
    expect(onSubmit.mock.lastCall?.[0]).not.toHaveProperty('detail');
  });

  it('a run asks for minutes, effort and the chips, and nothing else', () => {
    setup(session('run', 'Midweek run', { min_min: 40, max_min: 50 }));
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual([
      'Minutes',
      'RPE',
    ]);
    for (const field of [/pace/i, /distance/i, /heart/i, /hr/i, /notes/i]) {
      expect(screen.queryByLabelText(field)).toBeNull();
    }
  });

  it('minutes and effort move with the steppers, and the note is trimmed', async () => {
    const { onSubmit, user } = setup(session('ride', 'Long ride', { duration_min: 45 }));
    await user.click(screen.getByRole('button', { name: 'Decrease Minutes' }));
    await user.click(screen.getByRole('button', { name: 'Increase RPE' }));
    await user.click(screen.getByRole('button', { name: 'Increase RPE' }));
    await user.type(screen.getByLabelText('Notes'), '  steady  ');
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ride', duration_min: 40, rpe: 6, notes: 'steady' }),
    );
  });

  it('a vest walk carries the planned vest weight without asking for it', async () => {
    const { onSubmit, user } = setup(
      session('walk_vest', 'Vest walk', { duration_min: 60, vest_kg: 20 }),
    );
    expect(screen.queryByRole('textbox', { name: /vest/i })).toBeNull();
    await save(user);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_min: 60, detail: { vest_kg: 20 } }),
    );
  });

  it('anything but a run has minutes, effort and notes', () => {
    setup(session('swim', 'Swim', { duration_min: 45 }));
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))).toEqual([
      'Minutes',
      'RPE',
      null,
    ]);
  });

  it('falls back to the template duration when the week gives none', () => {
    setup(
      session(
        'swim',
        'Swim',
        {},
        {
          template: {
            key: null,
            kind: 'swim',
            name: 'Swim',
            structure: { duration_min: 30 },
            programme_day_id: null,
          },
        },
      ),
    );
    expect(value('Minutes')).toBe('30');
  });

  it('shows a save error and keeps the button busy while saving', () => {
    const s = session('ride', 'Long ride', { duration_min: 90 });
    render(<LogForm session={s} onSubmit={vi.fn()} busy error="database is locked" />);
    expect(screen.getByRole('alert').textContent).toBe('database is locked');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('primaryAction', () => {
  it.each([
    ['walk_vest', 'done'],
    ['walk', 'done'],
    ['strength', 'start'],
    ['run', 'log'],
    ['ride', 'log'],
    ['swim', 'log'],
    ['prehab', 'done'],
    ['mobility', 'done'],
    ['rest', 'done'],
  ] as const)('%s sessions get %s', (kind, action) => {
    expect(primaryAction(kind)).toBe(action);
  });

  it('only walks get the second, smaller Start timer button', () => {
    expect(hasTimer('walk_vest')).toBe(true);
    expect(hasTimer('walk')).toBe(true);
    expect(hasTimer('strength')).toBe(false);
    expect(hasTimer('run')).toBe(false);
  });
});
