import type { TrendWeek } from '@ots/shared';

/**
 * The weekly review: this week against last, one sentence per metric, built
 * from fixed templates. It states what changed and nothing else: no targets,
 * no judgement, no advice.
 */

const fmt = (n: number, unit = ''): string => `${Math.round(n * 100) / 100}${unit}`;

function compare(label: string, now: number, before: number | null, unit = ''): string {
  if (before === null) return `${label} ${fmt(now, unit)}.`;
  if (now > before) return `${label} ${fmt(now, unit)}, up from ${fmt(before, unit)}.`;
  if (now < before) return `${label} ${fmt(now, unit)}, down from ${fmt(before, unit)}.`;
  return `${label} ${fmt(now, unit)}, same as last week.`;
}

export function reviewSentences(thisWeek: TrendWeek, lastWeek: TrendWeek | null): string[] {
  const out: string[] = [];
  out.push(compare('Run minutes', thisWeek.run_minutes, lastWeek?.run_minutes ?? null));
  out.push(compare('Vest walk hours', thisWeek.vest_walk_hours, lastWeek?.vest_walk_hours ?? null));
  out.push(
    compare('Strength sessions', thisWeek.strength_sessions, lastWeek?.strength_sessions ?? null),
  );
  for (const name of Object.keys(thisWeek.lifts).sort()) {
    out.push(compare(name, thisWeek.lifts[name] as number, lastWeek?.lifts[name] ?? null, 'kg'));
  }
  if (thisWeek.run_rpe_mean !== null) {
    out.push(compare('Run RPE mean', thisWeek.run_rpe_mean, lastWeek?.run_rpe_mean ?? null));
  }
  if (thisWeek.ankle_mean !== null) {
    out.push(compare('Ankle mean', thisWeek.ankle_mean, lastWeek?.ankle_mean ?? null));
  }
  out.push(thisWeek.complete ? 'Week complete.' : 'Week not complete yet.');
  if (thisWeek.optional_planned > 0) {
    out.push(thisWeek.optional_done > 0 ? 'Bonus done.' : 'Bonus: not this week.');
  }
  return out;
}
