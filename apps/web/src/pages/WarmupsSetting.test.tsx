import type { ProgrammeDay } from '@ots/shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUG_SLOT, DAY, LUNGE_SLOT, SQUAT_SLOT } from '../strength/fixtures.js';
import { renderApp, stubApi } from '../test/api.js';
import { WarmupsSetting } from './Settings.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY_B: ProgrammeDay = {
  id: 2,
  name: 'Strength B',
  slots: [{ ...SQUAT_SLOT, id: 21, programme_day_id: 2 }],
};
const box = () =>
  screen.getByRole('checkbox', { name: 'Warm-up sets before barbell lifts' }) as HTMLInputElement;

describe('WarmupsSetting', () => {
  it('is on when every linear slot has warm-ups on', () => {
    stubApi();
    renderApp(<WarmupsSetting days={[DAY, DAY_B]} />);
    expect(box().checked).toBe(true);
  });

  it('is off when any one of them is off', () => {
    stubApi();
    const mixed = { ...DAY_B, slots: [{ ...SQUAT_SLOT, id: 21, warmups_enabled: false }] };
    renderApp(<WarmupsSetting days={[DAY, mixed]} />);
    expect(box().checked).toBe(false);
  });

  it('switching it off sets every linear slot, and leaves the others alone', async () => {
    const api = stubApi();
    renderApp(<WarmupsSetting days={[DAY, DAY_B]} />);
    fireEvent.click(box());
    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(api.writes()).toEqual([
      { method: 'PATCH', path: '/programme-slots/11', body: { warmups_enabled: false } },
      { method: 'PATCH', path: '/programme-slots/21', body: { warmups_enabled: false } },
    ]);
    const touched = api.writes().map((c) => c.path);
    expect(touched).not.toContain(`/programme-slots/${LUNGE_SLOT.id}`);
    expect(touched).not.toContain(`/programme-slots/${BUG_SLOT.id}`);
  });

  it('is not shown when no slot progresses linearly', () => {
    stubApi();
    renderApp(<WarmupsSetting days={[{ ...DAY, slots: [LUNGE_SLOT, BUG_SLOT] }]} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
