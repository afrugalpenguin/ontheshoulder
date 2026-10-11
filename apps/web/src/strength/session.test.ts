import { describe, expect, it } from 'vitest';
import {
  BUG_SLOT,
  DAY,
  DEAD_BUG,
  DUMBBELLS_ONLY,
  FULL_KIT,
  GOBLET,
  LIBRARY,
  LUNGE,
  LUNGE_SLOT,
  NO_KIT,
  SQUAT,
  SQUAT_SLOT,
  past,
} from './fixtures.js';
import {
  asHistory,
  buildStrengthActivity,
  isComplete,
  nextSummary,
  slotHistory,
  stepLoad,
  suggestionFor,
  targetLabel,
  type SessionSet,
} from './session.js';

const logged = (slotId: number, exerciseId: number, n: number, reps: number, load: number | null) =>
  Array.from({ length: n }, (_, i): SessionSet => ({
    slot_id: slotId,
    exercise_id: exerciseId,
    set_no: i + 1,
    reps,
    load_kg: load,
    rpe: null,
    notes: null,
    done_at: '2031-01-08T18:00:00.000Z',
  }));

describe('targetLabel', () => {
  it('shows sets by reps, by seconds, or just sets', () => {
    expect(targetLabel(SQUAT_SLOT)).toBe('5 x 5');
    expect(targetLabel(BUG_SLOT)).toBe('3 x 45s');
    expect(targetLabel({ sets: 3, reps: null, seconds: null })).toBe('3 sets');
    expect(targetLabel({ sets: 1, reps: null, seconds: null })).toBe('1 set');
  });
});

describe('slotHistory', () => {
  const history = [
    past('2031-01-15', [[SQUAT_SLOT, [5, 5], 16, GOBLET.id]]),
    past('2031-01-08', [
      [SQUAT_SLOT, [5, 5, 5, 5, 5], 60],
      [LUNGE_SLOT, [8, 8, 8], 10],
    ]),
  ];

  it('keeps a substitute apart from the slot own exercise', () => {
    expect(slotHistory(history, SQUAT_SLOT, SQUAT.id)).toEqual([
      Array.from({ length: 5 }, () => ({ reps: 5, load_kg: 60 })),
    ]);
    expect(slotHistory(history, SQUAT_SLOT, GOBLET.id)).toEqual([
      [
        { reps: 5, load_kg: 16 },
        { reps: 5, load_kg: 16 },
      ],
    ]);
    expect(slotHistory(history, LUNGE_SLOT, LUNGE.id)).toHaveLength(1);
    expect(slotHistory(history, BUG_SLOT, DEAD_BUG.id)).toEqual([]);
  });
});

describe('suggestionFor', () => {
  it('progresses the main lift from its own history with the plate breakdown', () => {
    const history = [past('2031-01-08', [[SQUAT_SLOT, [5, 5, 5, 5, 5], 60]])];
    expect(suggestionFor(SQUAT_SLOT, SQUAT, history, FULL_KIT)).toMatchObject({
      load_kg: 62.5,
      how: 'bar + 2 x 20 + 2 x 1.25',
    });
  });

  it('asks for a starting load when there is no history, then uses the one given', () => {
    expect(suggestionFor(SQUAT_SLOT, SQUAT, [], FULL_KIT)).toMatchObject({
      load_kg: null,
      reason: 'no starting load yet',
    });
    expect(suggestionFor({ ...SQUAT_SLOT, start_load_kg: 60 }, SQUAT, [], FULL_KIT).load_kg).toBe(
      60,
    );
  });

  it('a substitute steps through its own kit and starts from the load given for it', () => {
    const slot = { ...SQUAT_SLOT, start_load_kg: 60 };
    expect(suggestionFor(slot, GOBLET, [], FULL_KIT).load_kg).toBeNull();
    expect(suggestionFor(slot, GOBLET, [], FULL_KIT, 16).load_kg).toBe(16);
    const history = [past('2031-01-15', [[SQUAT_SLOT, [5, 5, 5, 5, 5], 16, GOBLET.id]])];
    expect(suggestionFor(slot, GOBLET, history, FULL_KIT)).toMatchObject({
      load_kg: 20,
      how: '20kg kettlebell',
    });
  });

  it('says no kit when the exercise cannot be loaded, and bodyweight when it needs none', () => {
    expect(suggestionFor(SQUAT_SLOT, SQUAT, [], DUMBBELLS_ONLY).reason).toBe('no kit');
    expect(suggestionFor(BUG_SLOT, DEAD_BUG, [], NO_KIT).reason).toBe('bodyweight');
  });
});

describe('stepLoad', () => {
  it('moves through achievable loads only and stops at the ends', () => {
    const loads = [20, 22.5, 25, 30];
    expect(stepLoad(22.5, loads, 1)).toBe(25);
    expect(stepLoad(25, loads, 1)).toBe(30);
    expect(stepLoad(30, loads, 1)).toBe(30);
    expect(stepLoad(22.5, loads, -1)).toBe(20);
    expect(stepLoad(20, loads, -1)).toBe(20);
    expect(stepLoad(23, loads, 1)).toBe(25);
    expect(stepLoad(23, loads, -1)).toBe(22.5);
  });
});

describe('nextSummary', () => {
  it('names the first two loaded lifts', () => {
    const history = [
      past('2031-01-08', [
        [SQUAT_SLOT, [5, 5, 5, 5, 5], 60],
        [LUNGE_SLOT, [8, 8, 8], 10],
      ]),
    ];
    expect(nextSummary(DAY, LIBRARY, history, FULL_KIT)).toBe(
      'Back squat 62.5kg, Reverse lunge 12.5kg',
    );
  });

  it('says when starting loads are still to set, and when the kit loads nothing', () => {
    expect(nextSummary(DAY, LIBRARY, [], FULL_KIT)).toBe('Starting loads to set');
    expect(nextSummary(DAY, LIBRARY, [], NO_KIT)).toBe('No loaded lifts with your kit');
  });
});

describe('buildStrengthActivity', () => {
  const base = {
    day: DAY,
    date: '2031-01-08',
    startedAt: '2031-01-08T18:00:00.000Z',
    finishedAt: '2031-01-08T18:41:20.000Z',
    plannedSessionId: 5,
  };

  it('saves a full session with its sets in slot order, not partial', () => {
    const sets = [
      ...logged(BUG_SLOT.id, DEAD_BUG.id, 3, 1, null),
      ...logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60),
      ...logged(LUNGE_SLOT.id, LUNGE.id, 3, 8, 10),
    ];
    expect(isComplete(DAY, sets)).toBe(true);
    const activity = buildStrengthActivity({ ...base, sets });
    expect(activity).toMatchObject({
      date: '2031-01-08',
      kind: 'strength',
      duration_min: 41,
      planned_session_id: 5,
      strength_session: { programme_day_id: 1, partial: false },
    });
    const saved = activity.strength_session?.sets ?? [];
    expect(saved.map((s) => s.slot_id)).toEqual([11, 11, 11, 11, 11, 12, 12, 12, 13, 13, 13]);
    // The exercise is only recorded for a substitute.
    expect(saved.every((s) => s.exercise_id === null)).toBe(true);
  });

  it('marks a session with missing sets as partial and records a substitute', () => {
    const sets = logged(SQUAT_SLOT.id, GOBLET.id, 2, 5, 16);
    const activity = buildStrengthActivity({ ...base, sets, plannedSessionId: null });
    expect(activity.strength_session).toMatchObject({ partial: true });
    expect(activity.strength_session?.sets.map((s) => s.exercise_id)).toEqual([
      GOBLET.id,
      GOBLET.id,
    ]);
    expect(activity.planned_session_id).toBeNull();
  });

  it('turns the session into history so next loads can be shown at once', () => {
    const entry = asHistory(DAY, logged(SQUAT_SLOT.id, SQUAT.id, 5, 5, 60));
    const slot = { ...SQUAT_SLOT, start_load_kg: 60 };
    expect(suggestionFor(slot, SQUAT, [entry], FULL_KIT).load_kg).toBe(62.5);
  });
});
