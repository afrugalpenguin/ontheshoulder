import {
  isoWeekDates,
  type LongRunRule,
  type MidweekRunRule,
  type ProgressionRules,
  type SessionKind,
  type SessionStatus,
  type SessionStructure,
  type Slot,
  type Targets,
} from '@ots/shared';

/**
 * Week generation, SPEC 6.2 and 6.3. Pure: plain objects in, a plan out, no
 * database and no clock. Progression is calendar-driven: it reads last week's
 * targets, never whether they were done, and nothing here looks at check-ins.
 */

export interface EngineTemplate {
  id: number;
  key: string | null;
  kind: SessionKind;
  name: string;
  default_duration_min: number | null;
  structure: SessionStructure | null;
}

export interface EngineFixture {
  weekday: number;
  slot: Slot;
  template: EngineTemplate;
}

/** A planned session from the week before the target week. */
export interface PreviousSession {
  template_id: number;
  targets: Targets;
}

/** A planned session that already exists in the target week. */
export interface ExistingSession {
  id: number;
  date: string;
  template_id: number;
  slot: Slot;
  status: SessionStatus;
  edited_by_user: boolean;
  linked_activity_id: number | null;
}

export interface GenerateInput {
  isoWeek: string;
  rules: ProgressionRules;
  fixtures: EngineFixture[];
  previous: PreviousSession[];
  existing: ExistingSession[];
  /** Saved vest weight; null when the user owns none; undefined when no kit is saved yet. */
  vestKg: number | null | undefined;
}

export interface SessionPlan {
  date: string;
  template_id: number;
  slot: Slot;
  targets: Targets;
  optional: boolean;
}

export interface GenerateResult {
  create: SessionPlan[];
  /** Existing sessions whose targets are refreshed. */
  update: (SessionPlan & { id: number })[];
  /** Ids of existing sessions left exactly as they are. */
  keep: number[];
  /** Ids of stale sessions that no fixture produces any more. */
  remove: number[];
  reasoning: string[];
}

interface Target {
  targets: Targets;
  reason: string;
}

const blocks = (repeats: number, runSec: number, walkSec: number) =>
  `${repeats} x ${runSec}s run / ${walkSec}s walk`;

const total = (warmup: number, cooldown: number, repeats: number, run: number, walk: number) =>
  warmup + cooldown + Math.round((repeats * (run + walk)) / 60);

/** A continuous run is stored as one repeat with no walk block. */
const isContinuous = (t: Targets) => t.repeats === 1 && (t.walk_block_sec ?? 0) === 0;

export function midweekRunTarget(rule: MidweekRunRule, previous: Targets | undefined): Target {
  const runWalk = (runSec: number, reason: string): Target => ({
    targets: {
      repeats: rule.repeats,
      run_block_sec: runSec,
      walk_block_sec: rule.walk_sec,
      duration_min: total(rule.warmup_min, rule.cooldown_min, rule.repeats, runSec, rule.walk_sec),
    },
    reason: `Midweek run: ${blocks(rule.repeats, runSec, rule.walk_sec)}, ${reason}.`,
  });
  const continuous = (minutes: number, reason: string): Target => ({
    targets: {
      repeats: 1,
      run_block_sec: minutes * 60,
      walk_block_sec: 0,
      duration_min: rule.warmup_min + rule.cooldown_min + minutes,
    },
    reason: `Midweek run: ${minutes} min continuous, ${reason}.`,
  });

  const last = previous?.run_block_sec;
  if (previous === undefined || last == null) {
    return runWalk(rule.start_run_sec, 'the starting point');
  }
  if (isContinuous(previous)) {
    const before = Math.round(last / 60);
    const next = Math.min(before + rule.continuous_increment_min, rule.continuous_cap_min);
    if (next > before) return continuous(next, `up ${next - before} min from last week`);
    return continuous(next, `held at the ${rule.continuous_cap_min} min cap`);
  }
  const next = last + rule.run_sec_increment;
  if (next >= rule.continuous_at_run_sec) {
    return continuous(rule.continuous_start_min, 'the first continuous run');
  }
  return runWalk(next, `run block up ${rule.run_sec_increment}s from last week`);
}

export function longRunTarget(rule: LongRunRule, previous: Targets | undefined): Target {
  const at = (repeats: number, reason: string): Target => ({
    targets: {
      repeats,
      run_block_sec: rule.run_sec,
      walk_block_sec: rule.walk_sec,
      duration_min: total(rule.warmup_min, rule.cooldown_min, repeats, rule.run_sec, rule.walk_sec),
    },
    reason: `Long run: ${blocks(repeats, rule.run_sec, rule.walk_sec)}, ${reason}.`,
  });
  const last = previous?.repeats;
  if (previous === undefined || last == null) return at(rule.start_repeats, 'the starting point');
  const next = Math.min(last + rule.repeats_increment, rule.repeats_cap);
  if (next > last) return at(next, `up ${next - last} repeats from last week`);
  return at(next, `held at the ${rule.repeats_cap} repeat cap`);
}

function structureTargets(template: EngineTemplate): Targets {
  const s = template.structure ?? {};
  const targets: Targets = {};
  if (s.repeats !== undefined && s.run_sec !== undefined) {
    const walk = s.walk_sec ?? 0;
    targets.repeats = s.repeats;
    targets.run_block_sec = s.run_sec;
    targets.walk_block_sec = walk;
    targets.duration_min = total(
      s.warmup_min ?? 0,
      s.cooldown_min ?? 0,
      s.repeats,
      s.run_sec,
      walk,
    );
    return targets;
  }
  const duration = s.duration_min ?? template.default_duration_min;
  if (duration != null) targets.duration_min = duration;
  return targets;
}

function vestWeight(input: GenerateInput, template: EngineTemplate, weekday: number): number {
  const rule = input.rules.vest;
  if (rule?.unloaded_weekdays.includes(weekday)) return 0;
  if (input.vestKg === null) return 0;
  return input.vestKg ?? rule?.default_kg ?? template.structure?.vest_kg ?? 0;
}

export function generateWeek(input: GenerateInput): GenerateResult {
  const { rules } = input;
  const dates = isoWeekDates(input.isoWeek);
  const optionalDays = rules.compliance?.optional_weekdays ?? [];
  const previousFor = (templateId: number) =>
    input.previous.find((p) => p.template_id === templateId)?.targets;

  const reasoning: string[] = [];
  const planned: { session: SessionPlan; name: string }[] = [];
  const vestLoads = new Set<number>();

  const fixtures = [...input.fixtures].sort(
    (a, b) =>
      a.weekday - b.weekday || a.slot.localeCompare(b.slot) || a.template.id - b.template.id,
  );
  for (const fixture of fixtures) {
    const { template } = fixture;
    let targets: Targets;
    if (rules.midweek_run && template.key === rules.midweek_run.template_key) {
      const result = midweekRunTarget(rules.midweek_run, previousFor(template.id));
      targets = result.targets;
      reasoning.push(result.reason);
    } else if (rules.long_run && template.key === rules.long_run.template_key) {
      const result = longRunTarget(rules.long_run, previousFor(template.id));
      targets = result.targets;
      reasoning.push(result.reason);
    } else {
      targets = structureTargets(template);
      if (template.kind === 'walk_vest') {
        targets.vest_kg = vestWeight(input, template, fixture.weekday);
        vestLoads.add(targets.vest_kg);
      }
    }
    planned.push({
      session: {
        date: dates[fixture.weekday - 1] as string,
        template_id: template.id,
        slot: fixture.slot,
        targets,
        optional: optionalDays.includes(fixture.weekday),
      },
      name: template.name,
    });
  }
  if (vestLoads.size > 0) {
    const loads = [...vestLoads]
      .sort((a, b) => b - a)
      .map((kg) => (kg === 0 ? 'unloaded' : `${kg}kg`));
    reasoning.push(`Vest walks: ${loads.join(', ')}.`);
  }

  // Reconcile with what is already in the week. Edited, logged, done or skipped
  // sessions are never touched; untouched planned ones are refreshed.
  const isKept = (e: ExistingSession) =>
    e.edited_by_user || e.linked_activity_id !== null || e.status !== 'planned';
  const keptWhy = (e: ExistingSession) =>
    e.linked_activity_id !== null
      ? 'kept, it has a logged activity'
      : e.edited_by_user
        ? 'kept your edit'
        : `kept, it is marked ${e.status}`;

  const result: GenerateResult = { create: [], update: [], keep: [], remove: [], reasoning };
  const unmatched = new Map(input.existing.map((e) => [e.id, e]));
  const pending: typeof planned = [];

  for (const plan of planned) {
    const { session, name } = plan;
    const exact = [...unmatched.values()].find(
      (e) =>
        e.date === session.date && e.template_id === session.template_id && e.slot === session.slot,
    );
    if (!exact) {
      pending.push(plan);
      continue;
    }
    unmatched.delete(exact.id);
    if (isKept(exact)) {
      result.keep.push(exact.id);
      reasoning.push(`${name} on ${exact.date}: ${keptWhy(exact)}.`);
    } else {
      result.update.push({ id: exact.id, ...session });
    }
  }
  for (const { session, name } of pending) {
    // A kept session of the same template that the user moved stands in for this one.
    const moved = [...unmatched.values()].find(
      (e) => e.template_id === session.template_id && isKept(e),
    );
    if (moved) {
      unmatched.delete(moved.id);
      result.keep.push(moved.id);
      reasoning.push(`${name} on ${moved.date}: ${keptWhy(moved)}.`);
    } else {
      result.create.push(session);
    }
  }
  for (const leftover of unmatched.values()) {
    if (isKept(leftover)) result.keep.push(leftover.id);
    else result.remove.push(leftover.id);
  }
  return result;
}
