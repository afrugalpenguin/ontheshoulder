import { describe, expect, it } from 'vitest';
import { achievableLoads, describeLoad, platesEachSide, snapLoad } from './equipment.js';
import type { Equipment } from './schemas.js';

const kit = (over: Partial<Equipment> = {}): Equipment => ({
  bar_kg: null,
  plates: [],
  dumbbells: [],
  kettlebells: [],
  vest_kg: null,
  ...over,
});

const FULL_PLATES = [
  { kg: 20, count: 1 },
  { kg: 10, count: 1 },
  { kg: 5, count: 1 },
  { kg: 2.5, count: 1 },
  { kg: 1.25, count: 1 },
];

/** 20, 22.5, ... 97.5: every 2.5kg step the full set can make on a 20kg bar. */
const FULL_SET_LOADS = Array.from({ length: 32 }, (_, i) => 20 + i * 2.5);

describe('achievableLoads', () => {
  const cases: [string, Equipment, Record<string, number[]>][] = [
    ['no kit', kit(), { barbell: [], dumbbell: [], kettlebell: [], plate: [], bodyweight: [] }],
    ['bar only', kit({ bar_kg: 20 }), { barbell: [20], dumbbell: [], plate: [] }],
    [
      'bar plus one pair of 20s',
      kit({ bar_kg: 20, plates: [{ kg: 20, count: 1 }] }),
      { barbell: [20, 60], plate: [20] },
    ],
    [
      'a full plate set',
      kit({ bar_kg: 20, plates: FULL_PLATES }),
      { barbell: FULL_SET_LOADS, plate: [1.25, 2.5, 5, 10, 20] },
    ],
    [
      'dumbbells only',
      kit({ dumbbells: [15, 10, 12.5, 10] }),
      { barbell: [], dumbbell: [10, 12.5, 15], kettlebell: [] },
    ],
    [
      'mixed',
      kit({
        bar_kg: 15,
        plates: [
          { kg: 10, count: 2 },
          { kg: 5, count: 1 },
          { kg: 2.5, count: 0 },
        ],
        dumbbells: [8],
        kettlebells: [20, 12, 16],
      }),
      {
        barbell: [15, 25, 35, 45, 55, 65],
        dumbbell: [8],
        kettlebell: [12, 16, 20],
        plate: [5, 10],
        bodyweight: [],
      },
    ],
  ];

  for (const [name, equipment, expected] of cases) {
    for (const [type, loads] of Object.entries(expected)) {
      it(`${name}: ${type}`, () => {
        expect(achievableLoads(equipment, type as Parameters<typeof achievableLoads>[1])).toEqual(
          loads,
        );
      });
    }
  }

  it('returns exactly 32 loads for a 20kg bar and one pair each of 20, 10, 5, 2.5, 1.25', () => {
    const loads = achievableLoads(kit({ bar_kg: 20, plates: FULL_PLATES }), 'barbell');
    expect(loads).toHaveLength(32);
    expect(loads[0]).toBe(20);
    expect(loads[31]).toBe(97.5);
  });

  it('plates without a bar make no barbell loads', () => {
    expect(achievableLoads(kit({ plates: FULL_PLATES }), 'barbell')).toEqual([]);
  });

  it('deduplicates loads that different plate combinations both make', () => {
    const loads = achievableLoads(
      kit({
        bar_kg: 20,
        plates: [
          { kg: 10, count: 1 },
          { kg: 5, count: 2 },
        ],
      }),
      'barbell',
    );
    expect(loads).toEqual([20, 30, 40, 50, 60]);
  });
});

describe('snapLoad', () => {
  const loads = [20, 22.5, 25, 30];
  const cases: [number, 'down' | 'up' | 'nearest', number][] = [
    [25, 'down', 25],
    [27, 'down', 25],
    [10, 'down', 20],
    [27, 'up', 30],
    [22.5, 'up', 22.5],
    [99, 'up', 30],
    [23, 'nearest', 22.5],
    [24, 'nearest', 25],
    [27.5, 'nearest', 25],
    [5, 'nearest', 20],
    [80, 'nearest', 30],
  ];
  it.each(cases)('%s %s gives %s', (load, direction, expected) => {
    expect(snapLoad(load, loads, direction)).toBe(expected);
  });

  it('defaults to nearest and ignores input order', () => {
    expect(snapLoad(29, [30, 20, 25])).toBe(30);
  });

  it('returns null when there is nothing to snap to', () => {
    expect(snapLoad(50, [], 'down')).toBeNull();
  });
});

describe('describeLoad', () => {
  const full = kit({
    bar_kg: 20,
    plates: FULL_PLATES,
    dumbbells: [12.5],
    kettlebells: [16],
  });

  it('matches the snapshot for a range of barbell loads', () => {
    const described = Object.fromEntries(
      [20, 22.5, 60, 62.5, 70, 97.5].map((load) => [load, describeLoad(load, full)]),
    );
    expect(described).toEqual({
      20: 'bar only',
      22.5: 'bar + 2 x 1.25',
      60: 'bar + 2 x 20',
      62.5: 'bar + 2 x 20 + 2 x 1.25',
      70: 'bar + 2 x 20 + 2 x 5',
      97.5: 'bar + 2 x 20 + 2 x 10 + 2 x 5 + 2 x 2.5 + 2 x 1.25',
    });
  });

  it('snapshot: how to load a spread of loads across every kit type', () => {
    const lines = [20, 25, 42.5, 60, 62.5, 77.5, 97.5].map(
      (load) => `${load}: ${describeLoad(load, full)}`,
    );
    lines.push(`dumbbell 12.5: ${describeLoad(12.5, full, 'dumbbell')}`);
    lines.push(`kettlebell 16: ${describeLoad(16, full, 'kettlebell')}`);
    lines.push(`plate 5: ${describeLoad(5, full, 'plate')}`);
    lines.push(`unmakeable 61: ${describeLoad(61, full)}`);
    expect(lines).toMatchInlineSnapshot(`
      [
        "20: bar only",
        "25: bar + 2 x 2.5",
        "42.5: bar + 2 x 10 + 2 x 1.25",
        "60: bar + 2 x 20",
        "62.5: bar + 2 x 20 + 2 x 1.25",
        "77.5: bar + 2 x 20 + 2 x 5 + 2 x 2.5 + 2 x 1.25",
        "97.5: bar + 2 x 20 + 2 x 10 + 2 x 5 + 2 x 2.5 + 2 x 1.25",
        "dumbbell 12.5: 12.5kg dumbbells",
        "kettlebell 16: 16kg kettlebell",
        "plate 5: 5kg plate",
        "unmakeable 61: null",
      ]
    `);
  });

  it('uses the fewest plates when several combinations work', () => {
    const equipment = kit({
      bar_kg: 20,
      plates: [
        { kg: 25, count: 1 },
        { kg: 15, count: 2 },
        { kg: 2.5, count: 2 },
      ],
    });
    // Per side 30kg: 25 + 2.5 + 2.5 is three plates, 15 + 15 is two.
    expect(describeLoad(80, equipment)).toBe('bar + 4 x 15');
    expect(describeLoad(75, equipment)).toBe('bar + 2 x 25 + 2 x 2.5');
    expect(describeLoad(140, equipment)).toBe('bar + 2 x 25 + 4 x 15 + 4 x 2.5');
  });

  it('prefers the larger plates when two combinations use the same number', () => {
    const equipment = kit({
      bar_kg: 20,
      plates: [
        { kg: 15, count: 1 },
        { kg: 10, count: 2 },
        { kg: 5, count: 4 },
      ],
    });
    expect(describeLoad(60, equipment)).toBe('bar + 2 x 15 + 2 x 5');
  });

  it('describes the other kit types', () => {
    expect(describeLoad(12.5, full, 'dumbbell')).toBe('12.5kg dumbbells');
    expect(describeLoad(16, full, 'kettlebell')).toBe('16kg kettlebell');
    expect(describeLoad(10, full, 'plate')).toBe('10kg plate');
    expect(describeLoad(0, full, 'bodyweight')).toBe('bodyweight');
  });

  it('returns null for a load the kit cannot make', () => {
    expect(describeLoad(61, full)).toBeNull();
    expect(describeLoad(14, full, 'dumbbell')).toBeNull();
    expect(describeLoad(60, kit())).toBeNull();
  });
});

describe('platesEachSide', () => {
  const full = kit({ bar_kg: 20, plates: FULL_PLATES });

  it.each([
    [20, []],
    [60, [{ kg: 20, count: 1 }]],
    [
      65,
      [
        { kg: 20, count: 1 },
        { kg: 2.5, count: 1 },
      ],
    ],
    [
      62.5,
      [
        { kg: 20, count: 1 },
        { kg: 1.25, count: 1 },
      ],
    ],
    [97.5, FULL_PLATES],
  ])('%skg on a 20kg bar', (load, expected) => {
    expect(platesEachSide(load, full)).toEqual(expected);
  });

  it('uses two of a plate on each side when the kit has two pairs', () => {
    const doubled = kit({ bar_kg: 20, plates: [{ kg: 20, count: 2 }] });
    expect(platesEachSide(100, doubled)).toEqual([{ kg: 20, count: 2 }]);
  });

  it('is null with no bar, or for a load the kit cannot make', () => {
    expect(platesEachSide(60, kit({ plates: FULL_PLATES }))).toBeNull();
    expect(platesEachSide(61, full)).toBeNull();
  });
});
