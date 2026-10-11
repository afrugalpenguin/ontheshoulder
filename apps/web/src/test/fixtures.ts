import type { Checkin, Habit, SessionKind, Targets, WeekSession } from '@ots/shared';

// Obviously synthetic data for component tests.

export const HABITS: Habit[] = [
  {
    id: 1,
    key: 'treadmill_done',
    label: 'Treadmill done',
    prompt_text: null,
    prompt_until: null,
    enabled: true,
  },
  {
    id: 2,
    key: 'alcohol_free',
    label: 'Alcohol free',
    prompt_text: null,
    prompt_until: null,
    enabled: true,
  },
  {
    id: 3,
    key: 'prehab_done',
    label: 'Prehab done',
    prompt_text: null,
    prompt_until: null,
    enabled: true,
  },
  {
    id: 4,
    key: 'protein_shake',
    label: 'Protein shake',
    prompt_text: 'Oi. Protein.',
    prompt_until: '12:00',
    enabled: true,
  },
  {
    id: 5,
    key: 'kit_ready',
    label: 'Kit out for tomorrow',
    prompt_text: 'Tomorrow: {session}. Kit out?',
    prompt_until: null,
    enabled: true,
  },
];

export const emptyCheckin = (date: string, over: Partial<Checkin> = {}): Checkin => ({
  id: null,
  date,
  sleep_quality: null,
  energy: null,
  weight_kg: null,
  ankle_score: null,
  sunday_got_up: null,
  habits: {},
  dismissed_prompts: [],
  notes: null,
  ...over,
});

export const session = (
  kind: SessionKind,
  name: string,
  targets: Targets,
  over: Partial<WeekSession> = {},
): WeekSession => ({
  id: 7,
  week_plan_id: 1,
  date: '2031-01-06',
  template_id: 1,
  slot: 'am',
  targets,
  status: 'planned',
  skip_reason: null,
  edited_by_user: false,
  linked_activity_id: null,
  optional: false,
  template: { key: null, kind, name, structure: null, programme_day_id: null },
  ...over,
});
