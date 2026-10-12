import type {
  EquipmentType,
  ExercisePattern,
  LoadRule,
  SessionKind,
  SessionStructure,
  Slot,
} from '@ots/shared';

/**
 * A starter template is plain data: the shape of a week and the first block.
 * It never holds an athlete, an event, kit or loads; those come from setup.
 * Rows refer to each other by key or name so applying it twice changes nothing.
 */
export interface StarterTemplateData {
  name: string;
  title: string;
  description: string;
  habits: {
    key: string;
    label: string;
    prompt_text?: string;
    prompt_until?: string;
    /** False for a habit kept for its history but no longer asked. */
    enabled?: boolean;
    /** ISO weekdays it is asked on; every day when left out. */
    weekdays?: number[];
    /** [yes, no] makes it a two-answer habit instead of a tick. */
    answer_labels?: [string, string];
  }[];
  exercises: {
    name: string;
    pattern: ExercisePattern;
    equipment: EquipmentType;
    unilateral?: boolean;
    cues?: string;
  }[];
  programme_days: {
    name: string;
    slots: {
      exercise: string;
      sets: number;
      reps?: number;
      seconds?: number;
      rest_sec: number;
      load_rule: LoadRule;
      increment_kg?: number;
      notes?: string;
    }[];
  }[];
  session_templates: {
    key: string;
    kind: SessionKind;
    name: string;
    default_duration_min?: number;
    structure?: SessionStructure;
    programme_day?: string;
    notes?: string;
    tags?: string[];
  }[];
  fixtures: { weekday: number; slot: Slot; template: string }[];
  block: {
    name: string;
    purpose: 'rebuild' | 'base' | 'build' | 'peak' | 'taper' | 'recovery';
    weeks: number;
    progression_rules: unknown;
  };
}
