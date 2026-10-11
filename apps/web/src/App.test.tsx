import type { SetupStatus } from '@ots/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { setThemeOverride } from './theme.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Stubs fetch with one JSON body per api path; anything else is an empty list. */
function stubApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/api/, '');
    const body = path in routes ? routes[path] : [];
    return Promise.resolve(Response.json(body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const status = (over: Partial<SetupStatus>): SetupStatus => ({
  complete: false,
  missing: ['athlete', 'a_event', 'fixtures'],
  data_dir: '/data/ontheshoulder',
  ...over,
});

describe('App', () => {
  it('shows the setup wizard while setup is incomplete, with no tab bar', async () => {
    stubApi({ '/setup/status': status({}) });
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Set up' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 5: You')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('shows the five tabs once setup is complete', async () => {
    stubApi({ '/setup/status': status({ complete: true, missing: [] }) });
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Today',
      'Week',
      'Strength',
      'Trends',
      'Settings',
    ]);
  });

  it('says so when the api is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );
    renderApp();
    expect((await screen.findByRole('alert')).textContent).toContain('connection refused');
  });
});

describe('setThemeOverride', () => {
  it('sets and clears data-theme on the root element', () => {
    setThemeOverride('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemeOverride(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
