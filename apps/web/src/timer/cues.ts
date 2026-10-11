import type { CueKind } from './machine.js';

/** A tone: frequency in Hz, when it starts and how long it lasts, in seconds. */
type Tone = [frequency: number, start: number, length: number];

// Each transition has its own shape so it can be told apart without looking.
const TONES: Record<CueKind | 'rest_warning', Tone[]> = {
  countdown: [[880, 0, 0.09]],
  warmup: [[523, 0, 0.25]],
  main: [[659, 0, 0.25]],
  work: [
    [784, 0, 0.14],
    [1047, 0.18, 0.3],
  ],
  rest: [
    [523, 0, 0.14],
    [392, 0.18, 0.3],
  ],
  cooldown: [
    [659, 0, 0.16],
    [523, 0.2, 0.16],
    [392, 0.4, 0.32],
  ],
  halfway: [
    [659, 0, 0.16],
    [659, 0.26, 0.16],
  ],
  finish: [
    [523, 0, 0.16],
    [659, 0.2, 0.16],
    [784, 0.4, 0.16],
    [1047, 0.6, 0.45],
  ],
  rest_warning: [[659, 0, 0.12]],
};

const VIBRATION: Record<CueKind | 'rest_warning', number[]> = {
  countdown: [40],
  warmup: [150],
  main: [150],
  work: [120, 80, 250],
  rest: [250],
  cooldown: [120, 80, 120, 80, 250],
  halfway: [120, 120, 120],
  finish: [200, 100, 200, 100, 400],
  rest_warning: [80],
};

export type CueName = CueKind | 'rest_warning';
export type CuePlayer = (cue: CueName) => void;

let context: AudioContext | null = null;

/**
 * Creates (or wakes) the audio context. Browsers only allow this from a tap,
 * so call it from the Start button. Safe to call again.
 */
export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
  } catch {
    // No audio on this device; vibration and the screen still work.
  }
}

/** Plays the tone for a cue and vibrates where the device supports it. Never throws. */
export const playCue: CuePlayer = (cue) => {
  try {
    if (context) {
      const now = context.currentTime;
      for (const [frequency, start, length] of TONES[cue]) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.5, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
        osc.connect(gain).connect(context.destination);
        osc.start(now + start);
        osc.stop(now + start + length + 0.02);
      }
    }
    navigator.vibrate?.(VIBRATION[cue]);
  } catch {
    // A failed cue must never stop the timer.
  }
};
