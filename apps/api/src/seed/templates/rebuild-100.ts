import type { StarterTemplateData } from './types.js';

/**
 * Starter template: 100-mile rebuild, Block 1. The prose version is
 * docs/PLAN.md; this file is the source of truth.
 */
export const rebuild100: StarterTemplateData = {
  name: 'rebuild-100',
  title: '100-mile rebuild, Block 1',
  description:
    'Ten weeks for a returning runner with a weekday treadmill slot, a long ride and a swim ' +
    'already in the week, and home strength kit. Two runs, two strength sessions, Sunday optional.',

  habits: [
    { key: 'treadmill_done', label: 'Treadmill done' },
    { key: 'alcohol_free', label: 'Alcohol free' },
    { key: 'prehab_done', label: 'Prehab done' },
    {
      key: 'protein_shake',
      label: 'Protein shake',
      prompt_text: 'Oi. Protein.',
      prompt_until: '12:00',
    },
    // Ticked from the evening banner about tomorrow. {session} is replaced by what is planned.
    {
      key: 'kit_ready',
      label: 'Kit out for tomorrow',
      prompt_text: 'Tomorrow: {session}. Kit out?',
    },
  ],

  exercises: [
    { name: 'Back squat', pattern: 'squat', equipment: 'barbell' },
    { name: 'Romanian deadlift', pattern: 'hinge', equipment: 'barbell' },
    { name: 'Reverse lunge', pattern: 'lunge', equipment: 'dumbbell', unilateral: true },
    { name: 'Standing calf raise in rack', pattern: 'calf', equipment: 'barbell' },
    { name: 'Suitcase carry', pattern: 'carry', equipment: 'kettlebell', unilateral: true },
    { name: 'Dead bug', pattern: 'core', equipment: 'bodyweight' },
    { name: 'Deadlift', pattern: 'hinge', equipment: 'barbell' },
    { name: 'Bulgarian split squat', pattern: 'lunge', equipment: 'dumbbell', unilateral: true },
    {
      name: 'Single-leg Romanian deadlift',
      pattern: 'hinge',
      equipment: 'kettlebell',
      unilateral: true,
    },
    { name: 'Step-up, knee height', pattern: 'lunge', equipment: 'dumbbell', unilateral: true },
    { name: 'Kettlebell swing', pattern: 'hinge', equipment: 'kettlebell' },
    { name: 'Seated calf raise, plate on knees', pattern: 'calf', equipment: 'plate' },

    // Not in the programme: same-pattern alternatives offered when kit is missing.
    { name: 'Goblet squat', pattern: 'squat', equipment: 'kettlebell' },
    { name: 'Dumbbell goblet squat', pattern: 'squat', equipment: 'dumbbell' },
    { name: 'Bodyweight squat', pattern: 'squat', equipment: 'bodyweight' },
    { name: 'Dumbbell Romanian deadlift', pattern: 'hinge', equipment: 'dumbbell' },
    { name: 'Kettlebell deadlift', pattern: 'hinge', equipment: 'kettlebell' },
    { name: 'Glute bridge', pattern: 'hinge', equipment: 'bodyweight' },
    {
      name: 'Bodyweight reverse lunge',
      pattern: 'lunge',
      equipment: 'bodyweight',
      unilateral: true,
    },
    { name: 'Bodyweight step-up', pattern: 'lunge', equipment: 'bodyweight', unilateral: true },
    { name: 'Dumbbell calf raise', pattern: 'calf', equipment: 'dumbbell' },
    { name: 'Single-leg calf raise', pattern: 'calf', equipment: 'bodyweight', unilateral: true },
    { name: 'Farmer carry', pattern: 'carry', equipment: 'dumbbell' },
    { name: 'Plank', pattern: 'core', equipment: 'bodyweight' },
  ],

  programme_days: [
    {
      name: 'Strength A',
      slots: [
        {
          exercise: 'Back squat',
          sets: 5,
          reps: 5,
          rest_sec: 150,
          load_rule: 'linear',
          increment_kg: 2.5,
        },
        {
          exercise: 'Romanian deadlift',
          sets: 3,
          reps: 8,
          rest_sec: 90,
          load_rule: 'double',
          increment_kg: 2.5,
        },
        {
          exercise: 'Reverse lunge',
          sets: 3,
          reps: 8,
          rest_sec: 75,
          load_rule: 'double',
          notes: 'Each leg. Moves to the next dumbbell pair.',
        },
        {
          exercise: 'Standing calf raise in rack',
          sets: 3,
          reps: 12,
          rest_sec: 60,
          load_rule: 'double',
          increment_kg: 2.5,
        },
        {
          exercise: 'Suitcase carry',
          sets: 3,
          rest_sec: 60,
          load_rule: 'fixed',
          notes: '30 m each side with your heaviest kettlebell.',
        },
        { exercise: 'Dead bug', sets: 3, seconds: 45, rest_sec: 45, load_rule: 'bodyweight' },
      ],
    },
    {
      name: 'Strength B',
      slots: [
        {
          exercise: 'Deadlift',
          sets: 5,
          reps: 5,
          rest_sec: 150,
          load_rule: 'linear',
          increment_kg: 2.5,
        },
        {
          exercise: 'Bulgarian split squat',
          sets: 3,
          reps: 8,
          rest_sec: 90,
          load_rule: 'double',
          notes: 'Each leg. Moves to the next dumbbell pair.',
        },
        {
          exercise: 'Single-leg Romanian deadlift',
          sets: 3,
          reps: 8,
          rest_sec: 75,
          load_rule: 'double',
          notes: 'Each leg. Moves to the next kettlebell.',
        },
        {
          exercise: 'Step-up, knee height',
          sets: 3,
          reps: 10,
          rest_sec: 75,
          load_rule: 'double',
          notes: 'Each leg. Moves to the next dumbbell pair.',
        },
        {
          exercise: 'Kettlebell swing',
          sets: 3,
          reps: 15,
          rest_sec: 60,
          load_rule: 'fixed',
          notes: 'A moderate kettlebell, around 15kg or the nearest you own.',
        },
        {
          exercise: 'Seated calf raise, plate on knees',
          sets: 3,
          reps: 15,
          rest_sec: 60,
          load_rule: 'double',
          increment_kg: 5,
        },
      ],
    },
  ],

  session_templates: [
    {
      key: 'vest_walk',
      kind: 'walk_vest',
      name: 'Vest walk',
      default_duration_min: 60,
      structure: { duration_min: 60 },
      tags: ['treadmill'],
    },
    {
      key: 'treadmill_walk',
      kind: 'walk',
      name: 'Treadmill walk',
      default_duration_min: 50,
      structure: { duration_min: 50 },
      notes: 'No vest. Prehab first.',
      tags: ['treadmill'],
    },
    {
      key: 'midweek_run',
      kind: 'run',
      name: 'Midweek run',
      default_duration_min: 34,
      structure: { warmup_min: 5, repeats: 8, run_sec: 120, walk_sec: 60, cooldown_min: 5 },
      notes: 'Inside the treadmill slot, after prehab. Movable to any weekday.',
      tags: ['treadmill'],
    },
    {
      key: 'long_run',
      kind: 'run',
      name: 'Long run',
      default_duration_min: 40,
      structure: { warmup_min: 5, repeats: 10, run_sec: 120, walk_sec: 60, cooldown_min: 5 },
      notes: 'Early. Optional: done is a bonus, missed is normal.',
    },
    { key: 'long_ride', kind: 'ride', name: 'Turbo long ride', notes: 'Conversational.' },
    { key: 'swim', kind: 'swim', name: 'Coached swim' },
    {
      key: 'strength_a',
      kind: 'strength',
      name: 'Strength A',
      default_duration_min: 40,
      programme_day: 'Strength A',
    },
    {
      key: 'strength_b',
      kind: 'strength',
      name: 'Strength B',
      default_duration_min: 35,
      programme_day: 'Strength B',
    },
  ],

  // Weekday 1 is Monday. Saturday is empty on purpose.
  fixtures: [
    { weekday: 1, slot: 'am', template: 'vest_walk' },
    { weekday: 1, slot: 'pm', template: 'long_ride' },
    { weekday: 2, slot: 'am', template: 'midweek_run' },
    { weekday: 3, slot: 'am', template: 'vest_walk' },
    { weekday: 3, slot: 'pm', template: 'strength_a' },
    { weekday: 4, slot: 'am', template: 'vest_walk' },
    { weekday: 4, slot: 'pm', template: 'swim' },
    { weekday: 5, slot: 'am', template: 'treadmill_walk' },
    { weekday: 5, slot: 'pm', template: 'strength_b' },
    { weekday: 7, slot: 'am', template: 'long_run' },
  ],

  block: {
    name: 'Block 1: rebuild',
    purpose: 'rebuild',
    weeks: 10,
    // SPEC 6.3. Interpreted by the plan engine; editable per block once applied.
    progression_rules: {
      midweek_run: {
        template_key: 'midweek_run',
        warmup_min: 5,
        cooldown_min: 5,
        repeats: 8,
        walk_sec: 60,
        start_run_sec: 120,
        run_sec_increment: 30,
        continuous_at_run_sec: 300,
        continuous_start_min: 25,
        continuous_increment_min: 5,
        continuous_cap_min: 45,
      },
      long_run: {
        template_key: 'long_run',
        warmup_min: 5,
        cooldown_min: 5,
        run_sec: 120,
        walk_sec: 60,
        start_repeats: 10,
        repeats_increment: 3,
        repeats_cap: 30,
      },
      vest: { default_kg: 20, unloaded_weekdays: [5] },
      compliance: {
        required_templates: ['midweek_run', 'strength_a', 'strength_b'],
        treadmill: { slot: 'am', weekdays: [1, 2, 3, 4, 5], min_days: 4 },
        optional_weekdays: [7],
      },
    },
  },
};
