import {
  isoWeekOf,
  mondayOf,
  type Equipment,
  type Event,
  type SessionKind,
  type SessionTemplate,
  type Slot,
} from '@ots/shared';
import { api } from '../api.js';

export interface HandRow {
  weekday: number;
  slot: Slot;
  kind: SessionKind;
  name: string;
  minutes: string;
}

export interface SetupState {
  name: string;
  event: { name: string; date: string; distance_km: string; time_limit_h: string; url: string };
  equipment: Equipment;
  mode: 'starter' | 'hand';
  starter: string;
  rows: HandRow[];
}

const numberOrNull = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Saves everything the wizard collected and generates the first week. Each
 * step is safe to repeat, so a failure part way can simply be retried.
 */
export async function finishSetup(state: SetupState, today: string): Promise<void> {
  await api('PUT', '/athlete', {
    display_name: state.name.trim(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

  const event = {
    name: state.event.name.trim(),
    date: state.event.date,
    distance_km: numberOrNull(state.event.distance_km),
    time_limit_h: numberOrNull(state.event.time_limit_h),
    url: state.event.url.trim() || null,
    priority: 'A',
  };
  const existing = (await api<Event[]>('GET', '/events')).find((e) => e.priority === 'A');
  if (existing) await api('PATCH', `/events/${existing.id}`, event);
  else await api('POST', '/events', event);

  await api('PUT', '/equipment', state.equipment);

  if (state.mode === 'starter') {
    await api('POST', `/setup/apply-template/${state.starter}`, { start_date: mondayOf(today) });
  } else {
    const fixtures = [];
    for (const row of state.rows) {
      const minutes = numberOrNull(row.minutes);
      const template = await api<SessionTemplate>('POST', '/session-templates', {
        kind: row.kind,
        name: row.name.trim(),
        default_duration_min: minutes,
        structure: minutes === null ? null : { duration_min: minutes },
      });
      fixtures.push({ weekday: row.weekday, slot: row.slot, template_id: template.id });
    }
    await api('PUT', '/fixtures', { fixtures });
  }

  await api('POST', `/weeks/${isoWeekOf(today)}/generate`);
}
