import type { SetupStatus } from '@ots/shared';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { renderApp as renderWithProviders, stubApi } from './test/api.js';
import { setThemeOverride } from './theme.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderApp = () => renderWithProviders(<App />);

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

  it('shows the four tabs once setup is complete, Week first', async () => {
    stubApi({ '/setup/status': status({ complete: true, missing: [] }) });
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
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
