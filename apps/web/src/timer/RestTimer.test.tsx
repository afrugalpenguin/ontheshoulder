import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CueName } from './cues.js';
import { RestTimer } from './RestTimer.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function setup(props: Partial<Parameters<typeof RestTimer>[0]> = {}) {
  const cues: { name: CueName; at: number }[] = [];
  const started = performance.now();
  const cue = (name: CueName) => cues.push({ name, at: Math.round(performance.now() - started) });
  const onDone = vi.fn();
  const view = render(<RestTimer seconds={30} onDone={onDone} cue={cue} {...props} />);
  return { cues, onDone, view, cue };
}

describe('RestTimer', () => {
  it('counts down from the slot rest and shows the time left', () => {
    setup();
    expect(screen.getByText('0:30')).toBeTruthy();
    advance(12_000);
    expect(screen.getByText('0:18')).toBeTruthy();
  });

  it('with a 30 second rest, cues at 10 seconds left and at zero, and calls onDone once', () => {
    const { cues, onDone } = setup();
    advance(19_800);
    expect(cues).toEqual([]);
    advance(400);
    expect(cues.map((c) => c.name)).toEqual(['rest_warning']);
    expect(cues[0]?.at).toBeGreaterThanOrEqual(20_000);
    expect(cues[0]?.at).toBeLessThanOrEqual(20_200);
    expect(onDone).not.toHaveBeenCalled();

    advance(10_000);
    expect(cues.map((c) => c.name)).toEqual(['rest_warning', 'finish']);
    expect(cues[1]?.at).toBeGreaterThanOrEqual(30_000);
    expect(cues[1]?.at).toBeLessThanOrEqual(30_200);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Rest over');

    advance(60_000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cues).toHaveLength(2);
  });

  it('skips on tap: onDone is called, no finish tone, and it does not fire again', () => {
    const { cues, onDone } = setup();
    advance(5_000);
    fireEvent.click(screen.getByRole('button', { name: /Tap to skip/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cues).toEqual([]);
    advance(60_000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('restarts from full when the parent changes resetKey', () => {
    const { cues, onDone, view, cue } = setup({ resetKey: 1 });
    advance(25_000);
    expect(cues.map((c) => c.name)).toEqual(['rest_warning']);
    view.rerender(<RestTimer seconds={30} onDone={onDone} cue={cue} resetKey={2} />);
    expect(screen.getByText('0:30')).toBeTruthy();
    advance(15_000);
    expect(onDone).not.toHaveBeenCalled();
    advance(5_200);
    advance(10_000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cues.map((c) => c.name)).toEqual(['rest_warning', 'rest_warning', 'finish']);
  });

  it('gives no 10 second warning for a rest of 10 seconds or less', () => {
    const { cues } = setup({ seconds: 8 });
    advance(8_200);
    expect(cues.map((c) => c.name)).toEqual(['finish']);
  });

  it('waits for a tap when autoStart is off', () => {
    const { onDone } = setup({ autoStart: false });
    advance(40_000);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start 0:30 rest' }));
    advance(30_200);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays right after a gap with no ticks, as when the page was in the background', () => {
    const { cues, onDone } = setup();
    // One render after 45 seconds have gone by, as on return from the background.
    advance(45_000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(cues.map((c) => c.name)).toEqual(['finish']);
    expect(screen.getByRole('status').textContent).toBe('Rest over');
  });
});
