import type { ProgressionRules, Targets } from '@ots/shared';
import { describe, expect, it } from 'vitest';
import { rebuild100 } from '../seed/templates/rebuild-100.js';
import {
  generateWeek,
  longRunTarget,
  midweekRunTarget,
  type EngineFixture,
  type ExistingSession,
  type GenerateInput,
} from './generate.js';

const SEEDED = rebuild100.block.progression_rules as Required<ProgressionRules>;
// Most of this file tests the run-walk ladder, so its rules select that mode.
// The time box, the starter's default, has its own section at the end.
const RULES: Required<ProgressionRules> = { ...SEEDED, runs: { mode: 'runwalk' } };

/** The starter template's fixtures as the engine sees them, with ids in list order. */
const FIXTURES: EngineFixture[] = rebuild100.fixtures.map((f) => {
  const index = rebuild100.session_templates.findIndex((t) => t.key === f.template);
  const t = rebuild100.session_templates[index];
  if (!t) throw new Error(`no template ${f.template}`);
  return {
    weekday: f.weekday,
    slot: f.slot,
    template: {
      id: index + 1,
      key: t.key,
      kind: t.kind,
      name: t.name,
      default_duration_min: t.default_duration_min ?? null,
      structure: t.structure ?? null,
    },
  };
});
const idOf = (key: string) => rebuild100.session_templates.findIndex((t) => t.key === key) + 1;
const MIDWEEK = idOf('midweek_run');
const LONG = idOf('long_run');
const VEST = idOf('vest_walk');
const PREHAB = idOf('prehab');

const input = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  isoWeek: '2031-W02',
  rules: RULES,
  fixtures: FIXTURES,
  previous: [],
  existing: [],
  vestKg: undefined,
  ...over,
});

/** Runs a rule forward `weeks` weeks, feeding each week's targets into the next. */
function progress(
  step: (previous: Targets | undefined) => { targets: Targets; reason: string | null },
  weeks: number,
) {
  const out: { targets: Targets; reason: string | null }[] = [];
  let previous: Targets | undefined;
  for (let i = 0; i < weeks; i++) {
    const result = step(previous);
    out.push(result);
    previous = result.targets;
  }
  return out;
}

describe('midweek run: 120s to 270s, the switch to continuous, and the cap', () => {
  const weeks = progress((p) => midweekRunTarget(RULES.midweek_run, p), 13);
  const row = (t: Targets) => [t.repeats, t.run_block_sec, t.walk_block_sec, t.duration_min];

  it.each([
    [1, [8, 120, 60, 34]],
    [2, [8, 150, 60, 38]],
    [3, [8, 180, 60, 42]],
    [4, [8, 210, 60, 46]],
    [5, [8, 240, 60, 50]],
    [6, [8, 270, 60, 54]],
    // Week 7 would be 300s, so it is the first continuous run of 25 min instead.
    [7, [1, 1500, 0, 35]],
    [8, [1, 1800, 0, 40]],
    [9, [1, 2100, 0, 45]],
    [10, [1, 2400, 0, 50]],
    [11, [1, 2700, 0, 55]],
    // Capped at 45 min of running.
    [12, [1, 2700, 0, 55]],
    [13, [1, 2700, 0, 55]],
  ])('week %i is %j (repeats, run s, walk s, total min)', (week, expected) => {
    expect(row((weeks[week - 1] as { targets: Targets }).targets)).toEqual(expected);
  });

  it('explains each target in a sentence', () => {
    expect(weeks.map((w) => w.reason)).toEqual([
      'Midweek run: 8 x 120s run / 60s walk, the starting point.',
      'Midweek run: 8 x 150s run / 60s walk, run block up 30s from last week.',
      'Midweek run: 8 x 180s run / 60s walk, run block up 30s from last week.',
      'Midweek run: 8 x 210s run / 60s walk, run block up 30s from last week.',
      'Midweek run: 8 x 240s run / 60s walk, run block up 30s from last week.',
      'Midweek run: 8 x 270s run / 60s walk, run block up 30s from last week.',
      'Midweek run: 25 min continuous, the first continuous run.',
      'Midweek run: 30 min continuous, up 5 min from last week.',
      'Midweek run: 35 min continuous, up 5 min from last week.',
      'Midweek run: 40 min continuous, up 5 min from last week.',
      'Midweek run: 45 min continuous, up 5 min from last week.',
      'Midweek run: 45 min continuous, held at the 45 min cap.',
      'Midweek run: 45 min continuous, held at the 45 min cap.',
    ]);
  });

  it('progresses from last week whether or not it was done, and from an edited target', () => {
    // The engine only ever sees targets. An edit down to 90s moves on from 90s.
    const edited = midweekRunTarget(RULES.midweek_run, { repeats: 6, run_block_sec: 90 });
    expect(edited.targets).toMatchObject({ repeats: 8, run_block_sec: 120 });
  });

  it('starts over when last week had no run block to build on', () => {
    expect(midweekRunTarget(RULES.midweek_run, { duration_min: 30 }).targets.run_block_sec).toBe(
      120,
    );
  });
});

describe('long run: cadence and cap', () => {
  const weeks = progress((p) => longRunTarget(RULES.long_run, p), 10);

  it('adds 3 repeats a week from 10 and caps at 30, blocks fixed at 120s / 60s', () => {
    expect(weeks.map((w) => w.targets.repeats)).toEqual([10, 13, 16, 19, 22, 25, 28, 30, 30, 30]);
    expect(weeks.every((w) => w.targets.run_block_sec === 120)).toBe(true);
    expect(weeks.every((w) => w.targets.walk_block_sec === 60)).toBe(true);
  });

  it('counts warm-up and cool-down in the total', () => {
    expect(weeks.map((w) => w.targets.duration_min)).toEqual([
      40, 49, 58, 67, 76, 85, 94, 100, 100, 100,
    ]);
  });

  it('explains the start, the step, the partial step into the cap and the hold', () => {
    expect([0, 1, 7, 8].map((i) => (weeks[i] as { reason: string }).reason)).toEqual([
      'Long run: 10 x 120s run / 60s walk, the starting point.',
      'Long run: 13 x 120s run / 60s walk, up 3 repeats from last week.',
      'Long run: 30 x 120s run / 60s walk, up 2 repeats from last week.',
      'Long run: 30 x 120s run / 60s walk, held at the 30 repeat cap.',
    ]);
  });

  it('starts over when last week had no repeats to build on', () => {
    expect(longRunTarget(RULES.long_run, { duration_min: 60 }).targets.repeats).toBe(10);
  });
});

describe('generateWeek: fixtures, optional flag and vest', () => {
  const first = generateWeek(input());

  it('creates one session per fixture on the right dates', () => {
    expect(first.create.map((s) => [s.date, s.slot, s.template_id])).toEqual([
      ['2031-01-06', 'am', VEST],
      ['2031-01-06', 'pm', idOf('long_ride')],
      ['2031-01-07', 'am', MIDWEEK],
      ['2031-01-07', 'am', PREHAB],
      ['2031-01-08', 'am', VEST],
      ['2031-01-08', 'pm', idOf('strength_a')],
      ['2031-01-09', 'am', VEST],
      ['2031-01-09', 'pm', idOf('swim')],
      ['2031-01-10', 'am', idOf('treadmill_walk')],
      ['2031-01-10', 'am', PREHAB],
      ['2031-01-10', 'pm', idOf('strength_b')],
      ['2031-01-12', 'am', LONG],
    ]);
    expect(first).toMatchObject({ update: [], keep: [], remove: [] });
  });

  it('the optional flag follows the rules, not the weekday name', () => {
    expect(first.create.filter((s) => s.optional).map((s) => s.date)).toEqual(['2031-01-12']);

    const wednesday: ProgressionRules = {
      ...RULES,
      compliance: { ...RULES.compliance, optional_weekdays: [3] },
    };
    const moved = generateWeek(input({ rules: wednesday }));
    expect(moved.create.filter((s) => s.optional).map((s) => s.date)).toEqual([
      '2031-01-08',
      '2031-01-08',
    ]);

    const none = generateWeek(input({ rules: { ...RULES, compliance: undefined } }));
    expect(none.create.some((s) => s.optional)).toBe(false);
  });

  it('takes the vest weight from saved kit, else the rule default, and unloads listed weekdays', () => {
    const vest = (r: typeof first) =>
      r.create.filter((s) => s.template_id === VEST).map((s) => s.targets.vest_kg);
    expect(vest(first)).toEqual([20, 20, 20]);
    expect(vest(generateWeek(input({ vestKg: 12 })))).toEqual([12, 12, 12]);
    expect(vest(generateWeek(input({ vestKg: null })))).toEqual([0, 0, 0]);

    const mondayOff: ProgressionRules = {
      ...RULES,
      vest: { default_kg: 20, unloaded_weekdays: [1] },
    };
    const result = generateWeek(input({ rules: mondayOff }));
    expect(vest(result)).toEqual([0, 20, 20]);
    expect(result.reasoning).toContain('Vest walks: 20kg, unloaded.');
  });

  it('uses the template structure for sessions no rule covers', () => {
    const noRules = generateWeek(input({ rules: {} }));
    const midweek = noRules.create.find((s) => s.template_id === MIDWEEK);
    expect(midweek?.targets).toEqual({ min_min: 40, max_min: 50 });
    const walk = noRules.create.find((s) => s.template_id === idOf('treadmill_walk'));
    expect(walk?.targets).toEqual({ duration_min: 50 });
    const ride = noRules.create.find((s) => s.template_id === idOf('long_ride'));
    expect(ride?.targets).toEqual({});
    // With no vest rule and no saved kit there is nothing to load the vest with.
    expect(noRules.create.find((s) => s.template_id === VEST)?.targets.vest_kg).toBe(0);
  });

  it('carries progression from the previous week into the new one', () => {
    const next = generateWeek(
      input({
        isoWeek: '2031-W03',
        previous: first.create.map((s) => ({ template_id: s.template_id, targets: s.targets })),
      }),
    );
    expect(next.create.find((s) => s.template_id === MIDWEEK)?.targets.run_block_sec).toBe(150);
    expect(next.create.find((s) => s.template_id === LONG)?.targets.repeats).toBe(13);
    expect(next.reasoning).toEqual([
      'Midweek run: 8 x 150s run / 60s walk, run block up 30s from last week.',
      'Long run: 13 x 120s run / 60s walk, up 3 repeats from last week.',
      'Vest walks: 20kg.',
    ]);
  });
});

describe('regeneration preserves edits and linked sessions', () => {
  const first = generateWeek(input());
  const existing = (
    change: (s: ExistingSession, index: number) => Partial<ExistingSession> = () => ({}),
  ): ExistingSession[] =>
    first.create.map((s, index) => {
      const base: ExistingSession = {
        id: index + 1,
        date: s.date,
        template_id: s.template_id,
        slot: s.slot,
        status: 'planned',
        edited_by_user: false,
        linked_activity_id: null,
      };
      return { ...base, ...change(base, index) };
    });

  it('refreshes untouched planned sessions in place and creates nothing', () => {
    const again = generateWeek(input({ existing: existing() }));
    expect(again.create).toEqual([]);
    expect(again.update.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(again.remove).toEqual([]);
  });

  it('keeps an edited session and says so', () => {
    const again = generateWeek(
      input({
        existing: existing((s) => (s.template_id === MIDWEEK ? { edited_by_user: true } : {})),
      }),
    );
    expect(again.keep).toEqual([3]);
    expect(again.update.some((s) => s.id === 3)).toBe(false);
    expect(again.reasoning).toContain('Midweek run on 2031-01-07: kept your edit.');
  });

  it('keeps a session with a linked activity, and done or skipped ones', () => {
    const again = generateWeek(
      input({
        existing: existing((s, i) => {
          if (i === 0) return { linked_activity_id: 77, status: 'done' };
          if (s.template_id === LONG) return { status: 'skipped' };
          return {};
        }),
      }),
    );
    expect(again.keep.sort((a, b) => a - b)).toEqual([1, 12]);
    expect(again.remove).toEqual([]);
    expect(again.reasoning).toContain('Vest walk on 2031-01-06: kept, it has a logged activity.');
    expect(again.reasoning).toContain('Long run on 2031-01-12: kept, it is marked skipped.');
  });

  it('does not recreate a session the user moved to another day', () => {
    const again = generateWeek(
      input({
        existing: existing((s) =>
          s.template_id === MIDWEEK ? { date: '2031-01-09', edited_by_user: true } : {},
        ),
      }),
    );
    expect(again.create).toEqual([]);
    expect(again.keep).toEqual([3]);
    expect(again.reasoning).toContain('Midweek run on 2031-01-09: kept your edit.');
  });

  it('removes a stale planned session when its fixture is gone, but never a kept one', () => {
    const fewer = FIXTURES.filter(
      (f) => f.template.key !== 'swim' && f.template.key !== 'long_ride',
    );
    const again = generateWeek(
      input({
        fixtures: fewer,
        existing: existing((s) =>
          s.template_id === idOf('swim') ? { linked_activity_id: 5 } : {},
        ),
      }),
    );
    expect(again.remove).toEqual([2]);
    expect(again.keep).toEqual([8]);
  });
});

describe('runs as a time box', () => {
  const runs = (r: ReturnType<typeof generateWeek>) =>
    [MIDWEEK, LONG].map((id) => r.create.find((s) => s.template_id === id)?.targets);
  const previousOf = (r: ReturnType<typeof generateWeek>) =>
    r.create.map((s) => ({ template_id: s.template_id, targets: s.targets }));

  it('is what the starter template asks for', () => {
    expect(SEEDED.runs).toEqual({ mode: 'timebox' });
  });

  it('a timebox run generates identical targets week on week', () => {
    const week1 = generateWeek(input({ rules: SEEDED }));
    expect(runs(week1)).toEqual([
      { min_min: 40, max_min: 50 },
      { min_min: 50, max_min: 60 },
    ]);
    let previous = previousOf(week1);
    for (const isoWeek of ['2031-W03', '2031-W04', '2031-W05', '2031-W06', '2031-W07']) {
      const week = generateWeek(input({ rules: SEEDED, isoWeek, previous }));
      expect(runs(week), isoWeek).toEqual(runs(week1));
      previous = previousOf(week);
    }
  });

  it('says so in the reasoning, with no ladder lines', () => {
    expect(generateWeek(input({ rules: SEEDED })).reasoning).toEqual([
      'Midweek run: 40 to 50 min at your own pace, the same every week.',
      'Long run: 50 to 60 min at your own pace, the same every week.',
      'Vest walks: 20kg.',
    ]);
  });

  it('switching the mode to runwalk restores the ladder from its starting point', () => {
    const boxed = generateWeek(input({ rules: SEEDED }));
    const week2 = generateWeek(
      input({ rules: RULES, isoWeek: '2031-W03', previous: previousOf(boxed) }),
    );
    expect(runs(week2)).toEqual([
      { repeats: 8, run_block_sec: 120, walk_block_sec: 60, duration_min: 34 },
      { repeats: 10, run_block_sec: 120, walk_block_sec: 60, duration_min: 40 },
    ]);
    const week3 = generateWeek(
      input({ rules: RULES, isoWeek: '2031-W04', previous: previousOf(week2) }),
    );
    expect(runs(week3).map((t) => [t?.repeats, t?.run_block_sec])).toEqual([
      [8, 150],
      [13, 120],
    ]);
  });

  it('rules without a runs section keep the ladder, as blocks saved before the mode existed do', () => {
    const legacy: ProgressionRules = { ...RULES };
    delete legacy.runs;
    expect(runs(generateWeek(input({ rules: legacy })))).toEqual(
      runs(generateWeek(input({ rules: RULES }))),
    );
  });

  it('switching back to timebox drops the ladder targets again', () => {
    const laddered = generateWeek(input({ rules: RULES }));
    const back = generateWeek(
      input({ rules: SEEDED, isoWeek: '2031-W03', previous: previousOf(laddered) }),
    );
    expect(runs(back)).toEqual([
      { min_min: 40, max_min: 50 },
      { min_min: 50, max_min: 60 },
    ]);
  });

  it('a structured run-walk template on a fixture keeps its structure in timebox mode', () => {
    const template = rebuild100.session_templates.find((t) => t.key === 'runwalk_short');
    if (!template) throw new Error('no runwalk_short template');
    const fixtures: EngineFixture[] = [
      {
        weekday: 2,
        slot: 'am',
        template: {
          id: 99,
          key: template.key,
          kind: template.kind,
          name: template.name,
          default_duration_min: template.default_duration_min ?? null,
          structure: template.structure ?? null,
        },
      },
    ];
    const week = generateWeek(input({ rules: SEEDED, fixtures }));
    expect(week.create[0]?.targets).toEqual({
      repeats: 8,
      run_block_sec: 120,
      walk_block_sec: 60,
      duration_min: 34,
    });
  });
});
