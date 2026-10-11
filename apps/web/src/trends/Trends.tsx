import type { TrendDay, TrendWeek } from '@ots/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../api.js';
import { shortDate } from '../lib/format.js';
import { useNow } from '../lib/useNow.js';
import { Chart, type SeriesStyle } from './Chart.js';
import {
  RANGES,
  liftsChart,
  rangeFor,
  volumeChart,
  weightChart,
  wellbeingChart,
  type RangeWeeks,
} from './data.js';
import { reviewSentences } from './review.js';

// Series are told apart by shape as well as colour: bars, solid lines, dashed
// lines and points. Nothing depends on telling red from green.
const VOLUME: SeriesStyle[] = [
  { type: 'bar', color: '--accent', unit: ' min' },
  { type: 'bar', color: '--success', unit: ' min' },
  { type: 'line', color: '--fg', scale: 'y2', range: [0, 5], faint: true, dash: [4, 4] },
];
const WELLBEING: SeriesStyle[] = [
  { type: 'line', color: '--accent', range: [1, 5] },
  { type: 'line', color: '--warning', dash: [8, 5], range: [1, 5] },
  { type: 'points', color: '--fg', scale: 'y2', range: [1, 10] },
  { type: 'line', color: '--success', scale: 'y3', faint: true },
  { type: 'line', color: '--muted', scale: 'y3', faint: true, dash: [2, 4] },
];
const WEIGHT: SeriesStyle[] = [
  { type: 'points', color: '--muted', unit: 'kg' },
  { type: 'line', color: '--accent', unit: 'kg' },
];
const LIFTS: SeriesStyle[] = [
  { type: 'line', color: '--accent', unit: 'kg' },
  { type: 'line', color: '--warning', dash: [8, 5], unit: 'kg' },
];

function ComplianceGrid({ weeks }: { weeks: TrendWeek[] }) {
  return (
    <section className="card" aria-label="Compliance">
      <h2>Compliance</h2>
      <ul className="plain grid-weeks">
        {weeks.map((w) => {
          const bonus =
            w.optional_planned === 0 ? '' : w.optional_done > 0 ? ', bonus done' : ', no bonus';
          return (
            <li
              key={w.iso_week}
              className={`week-cell${w.complete ? ' is-complete' : ''}`}
              aria-label={`Week of ${shortDate(w.start_date)}: ${w.complete ? 'complete' : 'not complete'}${bonus}`}
            >
              <span className="week-cell-date" aria-hidden="true">
                {shortDate(w.start_date)}
              </span>
              <span className="week-cell-mark" aria-hidden="true">
                {w.complete ? 'Done' : 'Open'}
              </span>
              {w.optional_done > 0 && <span className="bonus-dot" aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
      <p className="muted legend-note">
        A filled cell marked Done is a complete week. The dot is a done optional session.
      </p>
    </section>
  );
}

/** Trends: a weekly review that takes two minutes. Five charts and a review card. */
export function Trends() {
  const { today } = useNow();
  const [weeks, setWeeks] = useState<RangeWeeks>(8);
  const { from, to } = rangeFor(today, weeks);
  const weekly = useQuery({
    queryKey: ['trends-weekly', from, to],
    queryFn: () => api<TrendWeek[]>('GET', `/trends/weekly?from=${from}&to=${to}`),
  });
  const daily = useQuery({
    queryKey: ['trends-daily', from, to],
    queryFn: () => api<TrendDay[]>('GET', `/trends/daily?from=${from}&to=${to}`),
  });

  const w = weekly.data ?? [];
  const d = daily.data ?? [];
  const thisWeek = w.at(-1);
  const lastWeek = w.at(-2) ?? null;
  const failed = weekly.error ?? daily.error;

  return (
    <main>
      <header className="page-head">
        <h1>Trends</h1>
        <div className="row" role="group" aria-label="Range">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              className="chip grow"
              aria-pressed={weeks === n}
              onClick={() => setWeeks(n)}
            >
              {n} weeks
            </button>
          ))}
        </div>
      </header>

      {failed && (
        <p role="alert" className="error">
          {errorText(failed)}
        </p>
      )}

      {thisWeek && (
        <section className="card" aria-label="Weekly review">
          <h2>This week against last</h2>
          <p className="review">{reviewSentences(thisWeek, lastWeek).join(' ')}</p>
        </section>
      )}

      {weekly.data && daily.data && (
        <>
          <Chart
            title="Running and vest walks"
            data={volumeChart(w)}
            styles={VOLUME}
            stacked
            emptyText="No runs or vest walks logged in this range."
          />
          <Chart
            title="Sleep and energy"
            data={wellbeingChart(d)}
            styles={WELLBEING}
            emptyText="No check-ins in this range."
          />
          <Chart
            title="Weight"
            data={weightChart(d)}
            styles={WEIGHT}
            emptyText="No weights entered in this range."
          />
          <ComplianceGrid weeks={w} />
          <Chart
            title="Main lifts"
            data={liftsChart(w)}
            styles={LIFTS}
            emptyText="No main lift sessions logged in this range."
          />
        </>
      )}
      {(weekly.isPending || daily.isPending) && <p className="muted">Loading...</p>}
    </main>
  );
}
