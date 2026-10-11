import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CueName } from '../timer/cues.js';
import { RestBar } from './RestBar.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(seconds = 150) {
  const cues: CueName[] = [];
  const onDone = vi.fn();
  const view = render(
    <RestBar
      seconds={seconds}
      resetKey={1}
      next="Back squat, 60 kg"
      onDone={onDone}
      cue={(c) => cues.push(c)}
    />,
  );
  const again = (resetKey: number) =>
    view.rerender(
      <RestBar
        seconds={seconds}
        resetKey={resetKey}
        next="Back squat, 60 kg"
        onDone={onDone}
        cue={(c) => cues.push(c)}
      />,
    );
  return { cues, onDone, again };
}
const forward = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const digits = () => screen.getByRole('timer').textContent;

describe('RestBar', () => {
  it('shows the time left, the progress and what is next', () => {
    setup();
    expect(digits()).toBe('2:30');
    expect(screen.getByText('Next: Back squat, 60 kg')).toBeTruthy();
    forward(30_000);
    expect(digits()).toBe('2:00');
    const bar = document.querySelector('progress') as HTMLProgressElement;
    expect(bar.max).toBe(150_000);
    expect(Math.round(bar.value / 1000)).toBe(30);
  });

  it('cues once at 10 seconds left and once at zero, and reports done once', () => {
    const { cues, onDone } = setup();
    forward(139_000);
    expect(cues).toEqual([]);
    forward(1_200);
    expect(cues).toEqual(['rest_warning']);
    forward(5_000);
    expect(cues).toEqual(['rest_warning']);
    expect(onDone).not.toHaveBeenCalled();
    forward(5_000);
    expect(cues).toEqual(['rest_warning', 'finish']);
    expect(onDone).toHaveBeenCalledTimes(1);
    forward(5_000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a rest of 10 seconds or less has no warning cue', () => {
    const { cues } = setup(10);
    forward(10_400);
    expect(cues).toEqual(['finish']);
  });

  it('Skip ends it at once with no cue', () => {
    const { cues, onDone } = setup();
    forward(20_000);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cues).toEqual([]);
  });

  it('starts again from the full rest when the next set is logged', () => {
    const { cues, again } = setup();
    forward(145_000);
    expect(cues).toEqual(['rest_warning']);
    again(2);
    expect(digits()).toBe('2:30');
    forward(141_000);
    // The warning sounds again for the new rest.
    expect(cues).toEqual(['rest_warning', 'rest_warning']);
  });

  it('stays right after the page has been in the background: one late tick catches up', () => {
    const { cues, onDone } = setup();
    // No timer callbacks for two minutes, as on a locked phone, then one tick.
    const later = performance.now() + 120_000;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(later);
    forward(200);
    clock.mockRestore();
    expect(digits()).toBe('0:30');
    expect(cues).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
  });
});
