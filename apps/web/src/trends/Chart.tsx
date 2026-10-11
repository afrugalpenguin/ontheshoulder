import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { latest, type ChartData } from './data.js';

export interface SeriesStyle {
  type: 'bar' | 'line' | 'points';
  /** Name of a CSS custom property holding the colour, for example "--accent". */
  color: string;
  /** Dashed lines tell series apart without relying on colour. */
  dash?: number[];
  /** Which y scale the series uses. "y" is the left axis, "y2" the right, "y3" has no axis. */
  scale?: 'y' | 'y2' | 'y3';
  /** Fixed range for the series' scale. */
  range?: [number, number];
  faint?: boolean;
  unit?: string;
}

interface Props {
  title: string;
  data: ChartData;
  styles: SeriesStyle[];
  /** Stack the first two series as bars (drawn as a running total). */
  stacked?: boolean;
  /** What to say when there is nothing to draw. */
  emptyText: string;
}

const HEIGHT = 220;

/** A small uPlot chart with a text legend. Colours come from the theme's CSS variables. */
export function Chart({ title, data, styles, stacked, emptyText }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || data.empty) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim() || '#888';
    const axis = {
      stroke: color('--muted'),
      grid: { stroke: color('--line'), width: 1 },
      ticks: { show: false },
    };

    // Stacked bars are drawn back to front: the total first, then the first series over it.
    const drawn = data.series.map((s, i) => {
      if (stacked && i === 1) {
        const first = data.series[0]?.values ?? [];
        return s.values.map((v, j) => (v ?? 0) + (first[j] ?? 0));
      }
      return s.values;
    });
    const order = stacked
      ? [1, 0, ...data.series.map((_, i) => i).slice(2)]
      : data.series.map((_, i) => i);

    const scales: uPlot.Scales = { x: { time: true } };
    for (const style of styles) {
      const key = style.scale ?? 'y';
      scales[key] = style.range ? { range: style.range } : (scales[key] ?? {});
    }
    if (styles.some((s) => s.type === 'bar'))
      scales.y = { range: (_u, _min, max) => [0, Math.max(max, 1) * 1.1] };

    const series: uPlot.Series[] = [
      {},
      ...order.map((i): uPlot.Series => {
        const style = styles[i] as SeriesStyle;
        const stroke = color(style.color);
        const base = { label: data.series[i]?.label, scale: style.scale ?? 'y', spanGaps: true };
        if (style.type === 'bar') {
          return {
            ...base,
            stroke,
            fill: stroke,
            width: 0,
            paths: uPlot.paths.bars?.({ size: [0.6, 48] }),
            points: { show: false },
          };
        }
        if (style.type === 'points') {
          return {
            ...base,
            stroke,
            width: 0,
            points: { show: true, size: 9, fill: stroke, stroke },
          };
        }
        return {
          ...base,
          stroke,
          width: style.faint ? 1.5 : 2.5,
          alpha: style.faint ? 0.6 : 1,
          dash: style.dash,
          points: { show: data.x.length <= 14, size: 6, fill: stroke },
        };
      }),
    ];

    const plot = new uPlot(
      {
        width: el.clientWidth || 320,
        height: HEIGHT,
        scales,
        series,
        axes: [
          { ...axis, space: 60 },
          { ...axis, scale: 'y', size: 44 },
          ...(styles.some((s) => s.scale === 'y2')
            ? [{ ...axis, scale: 'y2', side: 1 as const, size: 34, grid: { show: false } }]
            : []),
        ],
        legend: { show: false },
        cursor: { show: false },
      },
      [data.x, ...order.map((i) => drawn[i] as (number | null)[])],
      el,
    );

    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) plot.setSize({ width: el.clientWidth, height: HEIGHT });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      plot.destroy();
    };
  }, [data, styles, stacked]);

  return (
    <section className="card chart" aria-label={title}>
      <h2>{title}</h2>
      {data.empty ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <>
          <div ref={host} className="chart-host" role="img" aria-label={`${title} chart`} />
          <ul className="plain legend">
            {data.series.map((s, i) => {
              const style = styles[i] as SeriesStyle;
              const value = latest(s);
              return (
                <li key={s.label}>
                  <span
                    className={`swatch swatch-${style.type}${style.dash ? ' swatch-dash' : ''}`}
                    style={{ color: `var(${style.color})` }}
                    aria-hidden="true"
                  />
                  {s.label}
                  {value !== null && (
                    <span className="muted">
                      {' '}
                      latest {value}
                      {style.unit ?? ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
