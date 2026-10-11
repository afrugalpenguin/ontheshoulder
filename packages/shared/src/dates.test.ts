import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isIsoDate,
  isIsoWeek,
  isoWeekDates,
  isoWeekOf,
  isoWeekStart,
  localDate,
  mondayOf,
  weekdayOf,
} from './dates.js';

describe('dates', () => {
  it.each([
    ['2031-01-06', true],
    ['2032-02-29', true],
    ['2031-02-29', false],
    ['2031-13-01', false],
    ['2031-1-6', false],
    ['tomorrow', false],
  ])('isIsoDate(%s) is %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2031-01-31', 1)).toBe('2031-02-01');
    expect(addDays('2031-12-31', 1)).toBe('2032-01-01');
    expect(addDays('2031-03-30', 1)).toBe('2031-03-31');
    expect(addDays('2031-01-06', -7)).toBe('2030-12-30');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2031-01-06', '2031-01-13')).toBe(7);
    expect(daysBetween('2031-01-13', '2031-01-06')).toBe(-7);
  });

  it('gives ISO weekdays with Monday as 1 and Sunday as 7', () => {
    expect(weekdayOf('2031-01-06')).toBe(1);
    expect(weekdayOf('2031-01-11')).toBe(6);
    expect(weekdayOf('2031-01-12')).toBe(7);
    expect(mondayOf('2031-01-12')).toBe('2031-01-06');
    expect(mondayOf('2031-01-06')).toBe('2031-01-06');
  });

  it.each([
    ['2031-01-06', '2031-W02'],
    ['2031-01-01', '2031-W01'],
    ['2030-12-30', '2031-W01'],
    ['2033-01-02', '2032-W53'],
    ['2032-12-31', '2032-W53'],
    ['2031-12-29', '2032-W01'],
  ])('isoWeekOf(%s) is %s', (date, week) => {
    expect(isoWeekOf(date)).toBe(week);
  });

  it('round-trips week labels and lists the seven days', () => {
    expect(isoWeekStart('2031-W02')).toBe('2031-01-06');
    expect(isoWeekStart('2032-W53')).toBe('2032-12-27');
    expect(isoWeekDates('2031-W02')).toEqual([
      '2031-01-06',
      '2031-01-07',
      '2031-01-08',
      '2031-01-09',
      '2031-01-10',
      '2031-01-11',
      '2031-01-12',
    ]);
  });

  it.each([
    ['2031-W02', true],
    ['2032-W53', true],
    ['2031-W53', false],
    ['2031-W00', false],
    ['2031-02', false],
  ])('isIsoWeek(%s) is %s', (value, expected) => {
    expect(isIsoWeek(value)).toBe(expected);
  });

  it('formats a local date', () => {
    expect(localDate(new Date(2031, 0, 6, 23, 59))).toBe('2031-01-06');
    expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
