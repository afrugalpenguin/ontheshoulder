import type { Habit } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activePrompts } from '../lib/prompts.js';
import { HABITS, emptyCheckin } from '../test/fixtures.js';
import { PromptsStrip } from './PromptsStrip.js';

afterEach(cleanup);

const DAY = '2031-01-06';
const keysOf = (habits: Habit[]) => habits.map((h) => h.key);

describe('prompt timing logic', () => {
  it.each([
    ['06:30', ['protein_shake']],
    ['11:59', ['protein_shake']],
    ['12:00', []],
    ['18:45', []],
  ])('at %s the seeded protein prompt gives %j', (time, expected) => {
    expect(keysOf(activePrompts(HABITS, emptyCheckin(DAY), time))).toEqual(expected);
  });

  it('hides a prompt once its habit is ticked', () => {
    const checkin = emptyCheckin(DAY, { habits: { protein_shake: true } });
    expect(activePrompts(HABITS, checkin, '08:00')).toEqual([]);
  });

  it('still prompts when the habit is explicitly unticked', () => {
    const checkin = emptyCheckin(DAY, { habits: { protein_shake: false } });
    expect(keysOf(activePrompts(HABITS, checkin, '08:00'))).toEqual(['protein_shake']);
  });

  it('hides a prompt dismissed for today', () => {
    const checkin = emptyCheckin(DAY, { dismissed_prompts: ['protein_shake'] });
    expect(activePrompts(HABITS, checkin, '08:00')).toEqual([]);
  });

  it('a new day starts with the prompt back', () => {
    // Dismissals and ticks live on the day's check-in, so tomorrow's is clean.
    expect(keysOf(activePrompts(HABITS, emptyCheckin('2031-01-07'), '08:00'))).toEqual([
      'protein_shake',
    ]);
  });

  it('ignores disabled habits and habits without prompt text', () => {
    const habits: Habit[] = HABITS.map((h) =>
      h.key === 'protein_shake' ? { ...h, enabled: false } : h,
    );
    expect(activePrompts(habits, emptyCheckin(DAY), '08:00')).toEqual([]);
  });

  it('a prompt with no cut-off shows all day', () => {
    const habits: Habit[] = [
      {
        id: 9,
        key: 'stretch',
        label: 'Stretch',
        prompt_text: 'Stretch.',
        prompt_until: null,
        enabled: true,
      },
    ];
    expect(keysOf(activePrompts(habits, emptyCheckin(DAY), '23:59'))).toEqual(['stretch']);
  });
});

describe('PromptsStrip', () => {
  it('renders nothing when there are no prompts', () => {
    const { container } = render(
      <PromptsStrip prompts={[]} onDone={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows the prompt text with Done and Not today', async () => {
    const onDone = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptsStrip
        prompts={HABITS.filter((h) => h.prompt_text)}
        onDone={onDone}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('Oi. Protein.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Done: Protein shake' }));
    expect(onDone).toHaveBeenCalledWith('protein_shake');
    await user.click(screen.getByRole('button', { name: 'Not today: Protein shake' }));
    expect(onDismiss).toHaveBeenCalledWith('protein_shake');
  });
});
