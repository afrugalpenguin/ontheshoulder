import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN_SCHEDULE, dueWeek } from './schedule.js';

// 2031-01-12 is a Sunday in ISO week 2031-W02; next week is 2031-W03.
const at = (day: number, hour: number, minute = 0) => new Date(2031, 0, day, hour, minute);

describe('dueWeek', () => {
  it('is not due before the scheduled time', () => {
    expect(dueWeek(at(12, 20, 59), DEFAULT_PLAN_SCHEDULE, null)).toBeNull();
    expect(dueWeek(at(8, 23), DEFAULT_PLAN_SCHEDULE, null)).toBeNull();
  });

  it('is due from the scheduled minute on, for next week', () => {
    expect(dueWeek(at(12, 21), DEFAULT_PLAN_SCHEDULE, null)).toBe('2031-W03');
    expect(dueWeek(at(12, 23, 59), DEFAULT_PLAN_SCHEDULE, '2031-W02')).toBe('2031-W03');
  });

  it('is not due again once that week has been handled, including after a restart', () => {
    expect(dueWeek(at(12, 21, 1), DEFAULT_PLAN_SCHEDULE, '2031-W03')).toBeNull();
    expect(dueWeek(at(12, 23), DEFAULT_PLAN_SCHEDULE, '2031-W03')).toBeNull();
  });

  it('starts a fresh cycle on Monday: nothing due until the next scheduled time', () => {
    expect(dueWeek(at(13, 0, 1), DEFAULT_PLAN_SCHEDULE, '2031-W03')).toBeNull();
    expect(dueWeek(at(19, 21), DEFAULT_PLAN_SCHEDULE, '2031-W03')).toBe('2031-W04');
  });

  it('catches up if the PC was off at the scheduled time on a midweek schedule', () => {
    const friday = { weekday: 5, time: '18:00' };
    expect(dueWeek(at(10, 17, 59), friday, null)).toBeNull();
    expect(dueWeek(at(10, 18), friday, null)).toBe('2031-W03');
    expect(dueWeek(at(11, 9), friday, null)).toBe('2031-W03');
    expect(dueWeek(at(11, 9), friday, '2031-W03')).toBeNull();
  });
});
