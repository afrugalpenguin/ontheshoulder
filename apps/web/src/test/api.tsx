import type { Compliance, Week } from '@ots/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from '../ui/index.js';
import { emptyCheckin } from './fixtures.js';

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

export const emptyWeek = (isoWeek: string): Week => ({
  iso_week: isoWeek,
  start_date: '2031-01-06',
  end_date: '2031-01-12',
  generated_at: null,
  reasoning: [],
  sessions: [],
});

export const emptyCompliance = (isoWeek: string): Compliance => ({
  iso_week: isoWeek,
  complete: false,
  required: [],
  treadmill: { days_done: 0, days_needed: 0, met: true },
  optional_planned: 0,
  optional_done: 0,
  sessions_planned: 0,
  sessions_done: 0,
});

/** What an unlisted GET returns: an empty answer of the right shape for the path. */
function fallback(path: string): unknown {
  const week = /^\/weeks\/([^/?]+)(\/compliance)?/.exec(path);
  if (week) return week[2] ? emptyCompliance(week[1] as string) : emptyWeek(week[1] as string);
  const checkin = /^\/checkins\/([^/?]+)/.exec(path);
  if (checkin) return emptyCheckin(checkin[1] as string);
  return [];
}

/**
 * Stubs fetch. GETs answer from `routes` by path (without /api), falling back
 * to an empty answer; a PUT to a check-in is merged into the stored check-in so
 * a refetch sees it. Every call is recorded.
 */
export function stubApi(routes: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...routes };
  const calls: Call[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });
    if (method === 'PUT' && path.startsWith('/checkins/')) {
      const before = (store[path] ?? fallback(path)) as { habits: Record<string, boolean> };
      const changes = body as { habits?: Record<string, boolean> };
      store[path] = { ...before, ...changes, habits: { ...before.habits, ...changes.habits } };
    }
    return Promise.resolve(Response.json(path in store ? store[path] : fallback(path)));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, writes: () => calls.filter((c) => c.method !== 'GET') };
}

/** Renders inside the providers the app has: queries, router and toasts. */
export function renderApp(ui: ReactElement, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
