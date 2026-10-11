import type {
  Athlete,
  Block,
  Checkin,
  CheckinInput,
  Compliance,
  Equipment,
  Event,
  Exercise,
  Fixture,
  GeneratedWeek,
  Habit,
  Health,
  Metric,
  ProgrammeDay,
  SessionTemplate,
  SetupStatus,
  StarterTemplate,
  StrengthHistoryEntry,
  TrendWeek,
  Week,
} from '@ots/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.js';

// One place for query keys and the calls behind them.

export const keys = {
  setup: ['setup'] as const,
  health: ['health'] as const,
  athlete: ['athlete'] as const,
  events: ['events'] as const,
  equipment: ['equipment'] as const,
  fixtures: ['fixtures'] as const,
  habits: ['habits'] as const,
  blocks: ['blocks'] as const,
  templates: ['session-templates'] as const,
  starters: ['starters'] as const,
  programmeDays: ['programme-days'] as const,
  exercises: ['exercises'] as const,
  dayHistory: (id: number) => ['programme-day-history', id] as const,
  week: (isoWeek: string) => ['week', isoWeek] as const,
  compliance: (isoWeek: string) => ['compliance', isoWeek] as const,
  checkin: (date: string) => ['checkin', date] as const,
  lastWeight: (date: string) => ['last-weight', date] as const,
  weeklyTrends: (from: string, to: string) => ['trends-weekly', from, to] as const,
};

export const useSetupStatus = () =>
  useQuery({ queryKey: keys.setup, queryFn: () => api<SetupStatus>('GET', '/setup/status') });

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: () => api<Health>('GET', '/health') });

export const useAthlete = () =>
  useQuery({
    queryKey: keys.athlete,
    queryFn: async () => {
      try {
        return await api<Athlete>('GET', '/athlete');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });

export const useEvents = () =>
  useQuery({ queryKey: keys.events, queryFn: () => api<Event[]>('GET', '/events') });

export const useEquipment = () =>
  useQuery({ queryKey: keys.equipment, queryFn: () => api<Equipment | null>('GET', '/equipment') });

export const useFixtures = () =>
  useQuery({ queryKey: keys.fixtures, queryFn: () => api<Fixture[]>('GET', '/fixtures') });

export const useHabits = () =>
  useQuery({ queryKey: keys.habits, queryFn: () => api<Habit[]>('GET', '/habits') });

export const useBlocks = () =>
  useQuery({ queryKey: keys.blocks, queryFn: () => api<Block[]>('GET', '/blocks') });

export const useTemplates = () =>
  useQuery({
    queryKey: keys.templates,
    queryFn: () => api<SessionTemplate[]>('GET', '/session-templates'),
  });

export const useStarters = () =>
  useQuery({
    queryKey: keys.starters,
    queryFn: () => api<StarterTemplate[]>('GET', '/templates/starters'),
  });

export const useProgrammeDays = () =>
  useQuery({
    queryKey: keys.programmeDays,
    queryFn: () => api<ProgrammeDay[]>('GET', '/programme-days'),
  });

export const useExercises = () =>
  useQuery({ queryKey: keys.exercises, queryFn: () => api<Exercise[]>('GET', '/exercises') });

export const useDayHistory = (id: number) =>
  useQuery({
    queryKey: keys.dayHistory(id),
    queryFn: () => api<StrengthHistoryEntry[]>('GET', `/programme-days/${id}/history`),
  });

/** History for several days at once, in the order asked for. Undefined until all have loaded. */
export function useDayHistories(ids: number[]): StrengthHistoryEntry[][] | undefined {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.dayHistory(id),
      queryFn: () => api<StrengthHistoryEntry[]>('GET', `/programme-days/${id}/history`),
    })),
    combine: (results) =>
      results.every((r) => r.data)
        ? results.map((r) => r.data as StrengthHistoryEntry[])
        : undefined,
  });
}

export const useWeek = (isoWeek: string) =>
  useQuery({ queryKey: keys.week(isoWeek), queryFn: () => api<Week>('GET', `/weeks/${isoWeek}`) });

/** Several weeks at once, in the order asked for. Undefined until every one has loaded. */
export function useWeeks(isoWeeks: string[]): Week[] | undefined {
  return useQueries({
    queries: isoWeeks.map((isoWeek) => ({
      queryKey: keys.week(isoWeek),
      queryFn: () => api<Week>('GET', `/weeks/${isoWeek}`),
    })),
    combine: (results) =>
      results.every((r) => r.data) ? results.map((r) => r.data as Week) : undefined,
  });
}

export const useWeeklyTrends = (from: string, to: string) =>
  useQuery({
    queryKey: keys.weeklyTrends(from, to),
    queryFn: () => api<TrendWeek[]>('GET', `/trends/weekly?from=${from}&to=${to}`),
  });

export const useCompliance = (isoWeek: string) =>
  useQuery({
    queryKey: keys.compliance(isoWeek),
    queryFn: () => api<Compliance>('GET', `/weeks/${isoWeek}/compliance`),
  });

export const useCheckin = (date: string) =>
  useQuery({
    queryKey: keys.checkin(date),
    queryFn: () => api<Checkin>('GET', `/checkins/${date}`),
  });

/** Most recent weight on or before a date, for prefilling the check-in. */
export const useLastWeight = (date: string) =>
  useQuery({
    queryKey: keys.lastWeight(date),
    queryFn: async () => {
      const rows = await api<Metric[]>('GET', `/metrics?metric=weight_kg&to=${date}`);
      return rows.at(-1)?.value ?? null;
    },
  });

/** Saves part of a day's check-in, showing the change at once and rolling back on failure. */
export function useSaveCheckin(date: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: CheckinInput) => api<Checkin>('PUT', `/checkins/${date}`, changes),
    onMutate: async (changes) => {
      await client.cancelQueries({ queryKey: keys.checkin(date) });
      const before = client.getQueryData<Checkin>(keys.checkin(date));
      if (before) {
        client.setQueryData<Checkin>(keys.checkin(date), {
          ...before,
          ...changes,
          habits: { ...before.habits, ...(changes.habits ?? {}) },
        } as Checkin);
      }
      return { before };
    },
    onError: (_err, _changes, context) => {
      if (context?.before) client.setQueryData(keys.checkin(date), context.before);
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.checkin(date) }),
  });
}

/** Refetches everything that depends on what is planned or done in a week. */
export function useRefreshWeek() {
  const client = useQueryClient();
  return (isoWeek: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.week(isoWeek) }),
      client.invalidateQueries({ queryKey: keys.compliance(isoWeek) }),
      client.invalidateQueries({ queryKey: ['trends-weekly'] }),
    ]);
}

export const generateWeek = (isoWeek: string, force = false) =>
  api<GeneratedWeek>('POST', `/weeks/${isoWeek}/generate${force ? '?force=true' : ''}`);
