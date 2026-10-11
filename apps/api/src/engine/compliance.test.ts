import type { ComplianceRule, SessionStatus } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { computeCompliance, type ComplianceSession } from './compliance.js';

const RULE: ComplianceRule = {
  required_templates: ['midweek_run', 'strength_a', 'strength_b'],
  treadmill: { slot: 'am', weekdays: [1, 2, 3, 4, 5], min_days: 4 },
  optional_weekdays: [7],
};

type Row = [date: string, slot: 'am' | 'pm', key: string, optional?: boolean];
const WEEK: Row[] = [
  ['2031-01-06', 'am', 'vest_walk'],
  ['2031-01-06', 'pm', 'long_ride'],
  ['2031-01-07', 'am', 'midweek_run'],
  ['2031-01-08', 'am', 'vest_walk'],
  ['2031-01-08', 'pm', 'strength_a'],
  ['2031-01-09', 'am', 'vest_walk'],
  ['2031-01-09', 'pm', 'swim'],
  ['2031-01-10', 'am', 'treadmill_walk'],
  ['2031-01-10', 'pm', 'strength_b'],
  ['2031-01-12', 'am', 'long_run', true],
];

/** The starter week with a status per session, in the order above. */
const week = (statuses: SessionStatus[]): ComplianceSession[] =>
  WEEK.map(([date, slot, template_key, optional], i) => ({
    date,
    slot,
    template_key,
    optional: optional ?? false,
    status: statuses[i] ?? 'planned',
  }));

const D: SessionStatus = 'done';
const P: SessionStatus = 'planned';
const S: SessionStatus = 'skipped';

describe('compliance with and without the optional session', () => {
  it('is complete with the run, both strength sessions and four treadmill mornings', () => {
    //                       Mon   ride Tue  Wed  A   Thu  swim Fri  B   Sun
    const result = computeCompliance(RULE, week([D, P, D, D, D, D, P, P, D, P]));
    expect(result).toEqual({
      complete: true,
      required: [
        { template_key: 'midweek_run', planned: 1, done: 1, met: true },
        { template_key: 'strength_a', planned: 1, done: 1, met: true },
        { template_key: 'strength_b', planned: 1, done: 1, met: true },
      ],
      treadmill: { days_done: 4, days_needed: 4, met: true },
      optional_planned: 1,
      optional_done: 0,
      sessions_planned: 9,
      sessions_done: 6,
    });
  });

  it('a done Sunday is reported as a bonus and changes nothing else', () => {
    const without = computeCompliance(RULE, week([D, P, D, D, D, D, P, P, D, P]));
    const withBonus = computeCompliance(RULE, week([D, P, D, D, D, D, P, P, D, D]));
    expect(withBonus.optional_done).toBe(1);
    expect({ ...withBonus, optional_done: 0 }).toEqual(without);
  });

  it('a skipped Sunday never fails the week', () => {
    const result = computeCompliance(RULE, week([D, P, D, D, D, D, P, P, D, S]));
    expect(result).toMatchObject({ complete: true, optional_done: 0 });
  });

  it('a done Sunday cannot rescue an incomplete week', () => {
    const result = computeCompliance(RULE, week([D, P, P, D, D, D, P, D, D, D]));
    expect(result.complete).toBe(false);
    expect(result.required[0]).toMatchObject({ template_key: 'midweek_run', met: false });
    expect(result).toMatchObject({ treadmill: { days_done: 4, met: true }, optional_done: 1 });
  });

  it.each([
    ['only three treadmill mornings', [D, P, D, D, D, P, P, P, D, P], { days_done: 3, met: false }],
    ['all five treadmill mornings', [D, P, D, D, D, D, P, D, D, P], { days_done: 5, met: true }],
  ] as const)('%s', (_name, statuses, treadmill) => {
    const result = computeCompliance(RULE, week([...statuses]));
    expect(result.treadmill).toMatchObject(treadmill);
    expect(result.complete).toBe(treadmill.met);
  });

  it('is incomplete when a strength session is missing or was skipped', () => {
    expect(computeCompliance(RULE, week([D, P, D, D, S, D, P, D, D, P])).complete).toBe(false);
    const noStrengthB = week([D, P, D, D, D, D, P, D, D, P]).filter(
      (s) => s.template_key !== 'strength_b',
    );
    const result = computeCompliance(RULE, noStrengthB);
    expect(result.complete).toBe(false);
    expect(result.required[2]).toEqual({
      template_key: 'strength_b',
      planned: 0,
      done: 0,
      met: false,
    });
  });

  it('does not count pm sessions or weekend mornings as treadmill days', () => {
    const sessions: ComplianceSession[] = [
      { date: '2031-01-06', slot: 'pm', template_key: 'x', optional: false, status: 'done' },
      { date: '2031-01-11', slot: 'am', template_key: 'x', optional: false, status: 'done' },
      { date: '2031-01-07', slot: 'am', template_key: 'x', optional: false, status: 'done' },
      { date: '2031-01-07', slot: 'am', template_key: 'y', optional: false, status: 'done' },
    ];
    expect(computeCompliance(RULE, sessions).treadmill.days_done).toBe(1);
  });

  it('with no rule, complete means every non-optional session is done', () => {
    const all = computeCompliance(undefined, week([D, D, D, D, D, D, D, D, D, P]));
    expect(all).toMatchObject({ complete: true, required: [], optional_done: 0 });
    expect(computeCompliance(undefined, week([D, D, D, D, D, D, D, D, P, D])).complete).toBe(false);
    expect(computeCompliance(undefined, []).complete).toBe(false);
  });
});
