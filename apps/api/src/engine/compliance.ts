import { weekdayOf, type ComplianceRule, type SessionStatus, type Slot } from '@ots/shared';

/**
 * Week compliance, SPEC 6.3 rule 5. Pure. Works only from planned sessions and
 * their status; it never reads check-ins.
 */

export interface ComplianceSession {
  date: string;
  slot: Slot;
  status: SessionStatus;
  optional: boolean;
  template_key: string | null;
}

export interface Compliance {
  /** True when every required template is done and the treadmill days are met. */
  complete: boolean;
  required: { template_key: string; planned: number; done: number; met: boolean }[];
  treadmill: { days_done: number; days_needed: number; met: boolean };
  /** Optional sessions are reported on their own and never change `complete`. */
  optional_planned: number;
  optional_done: number;
  sessions_planned: number;
  sessions_done: number;
}

const isDone = (s: ComplianceSession) => s.status === 'done';

export function computeCompliance(
  rule: ComplianceRule | undefined,
  sessions: ComplianceSession[],
): Compliance {
  const optional = sessions.filter((s) => s.optional);
  const counted = sessions.filter((s) => !s.optional);
  const base = {
    optional_planned: optional.length,
    optional_done: optional.filter(isDone).length,
    sessions_planned: counted.length,
    sessions_done: counted.filter(isDone).length,
  };

  if (!rule) {
    // No rule on the block: complete means every non-optional session was done.
    return {
      complete: counted.length > 0 && counted.every(isDone),
      required: [],
      treadmill: { days_done: 0, days_needed: 0, met: true },
      ...base,
    };
  }

  const required = rule.required_templates.map((template_key) => {
    const matching = counted.filter((s) => s.template_key === template_key);
    const done = matching.filter(isDone).length;
    return { template_key, planned: matching.length, done, met: done > 0 };
  });

  const treadmillDays = new Set(
    counted
      .filter(
        (s) =>
          isDone(s) &&
          s.slot === rule.treadmill.slot &&
          rule.treadmill.weekdays.includes(weekdayOf(s.date)),
      )
      .map((s) => s.date),
  );
  const treadmill = {
    days_done: treadmillDays.size,
    days_needed: rule.treadmill.min_days,
    met: treadmillDays.size >= rule.treadmill.min_days,
  };

  return { complete: required.every((r) => r.met) && treadmill.met, required, treadmill, ...base };
}
