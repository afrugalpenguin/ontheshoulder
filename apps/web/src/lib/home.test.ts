import type { Habit } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { HABITS, session } from '../test/fixtures.js';
import { kitPrompt } from './kit.js';
import { completeWeekStreak, morningStreak } from './streaks.js';

const run = session('run', 'Midweek run', { duration_min: 45 });
const strength = session('strength', 'Strength A', {});

describe('kitPrompt', () => {
  it.each([
    ['19:59', null],
    ['20:00', 'Tomorrow: run, 45 min. Kit out?'],
    ['23:30', 'Tomorrow: run, 45 min. Kit out?'],
  ])('at %s gives %j', (time, expected) => {
    expect(kitPrompt(HABITS, [run], time)).toBe(expected);
  });

  it('gives a time-boxed run as its range', () => {
    const boxed = session('run', 'Long run', { min_min: 50, max_min: 60 });
    expect(kitPrompt(HABITS, [boxed], '20:00')).toBe('Tomorrow: run, 50 to 60 min. Kit out?');
  });

  it('says nothing when nothing is planned, or only rest or skipped sessions', () => {
    expect(kitPrompt(HABITS, [], '21:00')).toBeNull();
    expect(kitPrompt(HABITS, [session('rest', 'Rest', {})], '21:00')).toBeNull();
    expect(kitPrompt(HABITS, [{ ...run, status: 'skipped' }], '21:00')).toBeNull();
  });

  it('names every session planned', () => {
    expect(kitPrompt(HABITS, [run, strength], '21:00')).toBe(
      'Tomorrow: run, 45 min and strength. Kit out?',
    );
  });

  it('uses the wording saved on the habit, and falls back when the habit is missing', () => {
    const edited: Habit[] = HABITS.map((h) =>
      h.key === 'kit_ready' ? { ...h, prompt_text: 'Lay out kit for {session}.' } : h,
    );
    expect(kitPrompt(edited, [run], '21:00')).toBe('Lay out kit for run, 45 min.');
    const without = HABITS.filter((h) => h.key !== 'kit_ready');
    expect(kitPrompt(without, [run], '21:00')).toBe('Tomorrow: run, 45 min. Kit out?');
  });

  it('is off when the habit is switched off', () => {
    const off: Habit[] = HABITS.map((h) => (h.key === 'kit_ready' ? { ...h, enabled: false } : h));
    expect(kitPrompt(off, [run], '21:00')).toBeNull();
  });
});

describe('completeWeekStreak', () => {
  const weeks = (...complete: boolean[]) =>
    complete.map((c, i) => ({ iso_week: `2031-W0${i + 1}`, complete: c }));

  it('counts back from the newest complete week', () => {
    expect(completeWeekStreak(weeks(false, true, true, true), '2031-W04')).toBe(3);
    expect(completeWeekStreak(weeks(true, false, true, true), '2031-W04')).toBe(2);
  });

  it('does not let the week in progress break the run', () => {
    expect(completeWeekStreak(weeks(true, true, true, false), '2031-W04')).toBe(3);
  });

  it('is broken by an incomplete week that is over', () => {
    expect(completeWeekStreak(weeks(true, true, false, false), '2031-W04')).toBe(0);
  });

  it('is zero with no history', () => {
    expect(completeWeekStreak([], '2031-W04')).toBe(0);
  });
});

describe('morningStreak', () => {
  // 2031-01-06 is a Monday.
  const am = (date: string, status: 'done' | 'planned' | 'skipped' = 'done') => ({
    date,
    slot: 'am' as const,
    status,
  });
  const EARLIEST = '2030-12-30';

  it('counts weekdays in a row and steps over the weekend', () => {
    const sessions = [am('2031-01-02'), am('2031-01-03'), am('2031-01-06'), am('2031-01-07')];
    expect(morningStreak(sessions, '2031-01-07', EARLIEST)).toEqual({ days: 4, capped: false });
  });

  it('does not count today against the run while it is still open', () => {
    const sessions = [am('2031-01-06'), am('2031-01-07'), am('2031-01-08', 'planned')];
    expect(morningStreak(sessions, '2031-01-08', EARLIEST)).toEqual({ days: 2, capped: false });
  });

  it('stops at a missed weekday', () => {
    const sessions = [am('2031-01-06'), am('2031-01-08')];
    expect(morningStreak(sessions, '2031-01-08', EARLIEST).days).toBe(1);
  });

  it('ignores evening sessions', () => {
    const sessions = [{ date: '2031-01-07', slot: 'pm' as const, status: 'done' as const }];
    expect(morningStreak(sessions, '2031-01-08', EARLIEST).days).toBe(0);
  });

  it('says when the run reaches the start of what was loaded', () => {
    const sessions = [am('2031-01-06'), am('2031-01-07')];
    expect(morningStreak(sessions, '2031-01-07', '2031-01-06')).toEqual({ days: 2, capped: true });
  });
});
