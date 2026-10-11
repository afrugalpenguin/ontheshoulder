# Stage 9: trends

Branch: `feat/trends`

SPEC 8.6. Five charts and a review card. The point is a weekly review that takes two minutes. No readiness scores, no load ratios, no warnings.

## Do

1. API: `GET /trends/weekly?from&to` per ISO week: run minutes, vest-walk hours, strength sessions done, compliance result with optional_done separate, mean ankle score if any, mean run RPE, main lift working weights (slots with load_rule linear). `GET /trends/daily?from&to` per day: sleep quality, energy, weight, ankle score, and Garmin metrics if present. Computed in SQL or a thin TypeScript layer with unit tests on fixed data.
2. Web Trends tab, each with a 4, 8, 12 week range toggle:
   - Weekly run minutes and vest hours as stacked bars; ankle score mean as a faint line only if any scores exist.
   - Sleep quality and energy, 7-day rolling, with run RPE as points. Garmin sleep and HRV added to this chart only if present.
   - Weight with a 7-day rolling mean.
   - Compliance grid: one cell per week, complete or not, with the optional Sunday as a separate dot inside the cell.
   - Main lifts: squat and deadlift working weight over time.
3. Charting with a lightweight library (uPlot or Recharts, pick one and record in DECISIONS.md). Must render well at 390px wide. Colours must work in dark mode and not rely on red versus green alone.
4. Weekly review card at the top: this week versus last week in one sentence per metric, generated from the data with fixed templates (no free text generation), e.g. "Run minutes 54, up from 48. Ankle mean 1.5, down from 2.0. Week complete."
5. Tests: the trend queries on a seeded fixture database with known answers; snapshot tests for the review sentences.

## Do not

- Add goals, targets, predictions, readiness or load-ratio metrics.
- Add per-exercise charts beyond the two main lifts.

## Acceptance

- All five charts render on the phone from real data (at least two weeks of logging by now). Screenshots.
- Trend query tests green with hand-checked expected values; show one worked example in the PR description.
- Trends route loads in under one second on the LAN with 90 days of data (seed a synthetic 90 days for the test and time it).
