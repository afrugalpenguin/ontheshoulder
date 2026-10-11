import type { Health } from '@ots/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { setThemeOverride } from './theme.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the health result from the api', async () => {
    const health: Health = {
      ok: true,
      version: '9.9.9',
      uptime_s: 12,
      db: { ok: true, migration: '0000_init' },
    };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(health)));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('9.9.9')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('shows an error when the api is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );

    render(<App />);

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
