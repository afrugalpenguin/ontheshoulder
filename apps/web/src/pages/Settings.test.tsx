import type { About, DataStatus, Health } from '@ots/shared';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.js';
import { renderApp, stubApi } from '../test/api.js';
import { AboutSection, DataSection, bytesText, diagnosticsText } from './DataSection.js';
import { Settings } from './Settings.js';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DATA: DataStatus = {
  data_dir: '/data/ontheshoulder',
  db_bytes: 1_572_864,
  backup: { last: '2031-01-06T02:00:00.000Z', count: 12 },
  config_path: '/config/ontheshoulder/config.json',
  configured_data_dir: '/data/ontheshoulder',
  restart_required: false,
  can_restart: true,
  env_overrides: [],
  port: 3001,
  lan_guard: true,
  log_level: 'info',
};
const ABOUT: About = {
  version: '1.1.0',
  licence: 'MIT',
  repository: 'https://example.test/ontheshoulder',
};
const HEALTH: Health = {
  ok: true,
  version: '1.1.0',
  uptime_s: 12,
  db: { ok: true, migration: '0003_warmups' },
  backup: { last: '2031-01-06T02:00:00.000Z', count: 12 },
  garmin: { last_sync: null },
};
const ROUTES = { '/admin/data': DATA, '/admin/about': ABOUT, '/health': HEALTH };

const TITLES = [
  'Athlete and events',
  'Fixtures',
  'Equipment',
  'Habits and prompts',
  'Blocks and rules',
  'Data',
  'About',
];
const toggle = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) });

describe('Settings layout', () => {
  it('has the seven sections in order, each a card that starts closed', () => {
    stubApi(ROUTES);
    renderApp(<Settings />);
    const sections = screen.getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(TITLES);
    for (const title of TITLES) {
      expect(toggle(title).getAttribute('aria-expanded')).toBe('false');
    }
    // Closed sections draw nothing and ask the api for nothing of their own.
    expect(screen.queryByLabelText('Data folder')).toBeNull();
  });

  it('every section opens and closes on its title', async () => {
    stubApi(ROUTES);
    renderApp(<Settings />);
    for (const title of TITLES) {
      fireEvent.click(toggle(title));
      expect(toggle(title).getAttribute('aria-expanded')).toBe('true');
      const body = document.getElementById(toggle(title).getAttribute('aria-controls') as string);
      expect(body).not.toBeNull();
      fireEvent.click(toggle(title));
      expect(toggle(title).getAttribute('aria-expanded')).toBe('false');
      expect(
        document.getElementById(toggle(title).getAttribute('aria-controls') as string),
      ).toBeNull();
    }
    await act(async () => undefined);
  });

  it('remembers which sections were left open across a reload', async () => {
    stubApi(ROUTES);
    const first = renderApp(<Settings />);
    fireEvent.click(toggle('Data'));
    fireEvent.click(toggle('About'));
    fireEvent.click(toggle('Fixtures'));
    fireEvent.click(toggle('Fixtures'));
    expect(JSON.parse(localStorage.getItem('ots.settings.open') as string)).toEqual([
      'data',
      'about',
    ]);
    first.unmount();

    renderApp(<Settings />);
    expect(TITLES.filter((t) => toggle(t).getAttribute('aria-expanded') === 'true')).toEqual([
      'Data',
      'About',
    ]);
    expect(await screen.findByLabelText('Data folder')).toBeTruthy();
  });

  it('ignores a damaged saved state', () => {
    localStorage.setItem('ots.settings.open', '{ not json');
    stubApi(ROUTES);
    renderApp(<Settings />);
    expect(toggle('Data').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Data section', () => {
  it('shows the folder, database size, last backup and backup count', async () => {
    stubApi(ROUTES);
    renderApp(<DataSection />);
    const facts = within(await screen.findByLabelText('Data folder'));
    expect(facts.getByText('/data/ontheshoulder')).toBeTruthy();
    expect(facts.getByText('1.5 MB')).toBeTruthy();
    expect(facts.getByText('12')).toBeTruthy();
    expect(facts.getByText(new Date(DATA.backup.last as string).toLocaleString())).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Restart required' })).toBeNull();
  });

  it('has the exports and the backup download under it', async () => {
    stubApi(ROUTES);
    renderApp(<DataSection />);
    await screen.findByLabelText('Data folder');
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Download everything (JSON)')).toBe('/api/export/json');
    expect(href('Download table (CSV)')).toBe('/api/export/csv/activity');
    expect(href('Download latest backup')).toBe('/api/admin/backup/latest');
    fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'set_log' } });
    expect(href('Download table (CSV)')).toBe('/api/export/csv/set_log');
  });

  it('changing the folder sends the path, then shows that a restart is required', async () => {
    const api = stubApi(ROUTES);
    const moved = { ...DATA, configured_data_dir: '/new/place', restart_required: true };
    api.respond('POST', '/admin/data/move', () => {
      api.set('/admin/data', moved);
      return {
        from: DATA.data_dir,
        to: '/new/place',
        tables: 19,
        rows: 82,
        backups: 12,
        marker: '/data/ontheshoulder/MOVED-2031-01-07.txt',
        restart_required: true,
      };
    });
    renderApp(<DataSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change folder' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Change data folder' }));
    expect(sheet.getByText(/not a network share/)).toBeTruthy();
    const submit = sheet.getByRole('button', { name: 'Copy and switch' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(sheet.getByLabelText('New folder'), { target: { value: '/new/place' } });
    fireEvent.click(submit);

    const notice = await screen.findByRole('status', { name: 'Restart required' });
    expect(notice.textContent).toContain('/new/place');
    expect(api.writes()).toEqual([
      { method: 'POST', path: '/admin/data/move', body: { path: '/new/place' } },
    ]);
    expect(within(notice).getByRole('button', { name: 'Restart now' })).toBeTruthy();
    expect(
      screen
        .getAllByRole('status')
        .some((s) => /Copied 82 rows in 19 tables/.test(s.textContent ?? '')),
    ).toBe(true);
  });

  it('shows what the api says when the move fails, and stays on the sheet', async () => {
    const api = stubApi(ROUTES);
    api.respond('POST', '/admin/data/move', () => {
      throw new ApiError(
        409,
        'The data folder was not moved: EROFS: read-only file system. Nothing was changed.',
        'path',
      );
    });
    renderApp(<DataSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change folder' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Change data folder' }));
    fireEvent.change(sheet.getByLabelText('New folder'), { target: { value: '/read/only' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Copy and switch' }));
    expect((await sheet.findByRole('alert')).textContent).toBe(
      'The data folder was not moved: EROFS: read-only file system. Nothing was changed.',
    );
    expect(screen.queryByRole('status', { name: 'Restart required' })).toBeNull();
    expect((sheet.getByLabelText('New folder') as HTMLInputElement).value).toBe('/read/only');
  });

  it('Restart now asks the api to restart and waits for it to come back', async () => {
    const api = stubApi({ ...ROUTES, '/admin/data': { ...DATA, restart_required: true } });
    api.respond('POST', '/admin/restart', () => ({ restarting: true }));
    renderApp(<DataSection />);
    const notice = within(await screen.findByRole('status', { name: 'Restart required' }));
    fireEvent.click(notice.getByRole('button', { name: 'Restart now' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(await notice.findByRole('button', { name: 'Restarting' })).toBeTruthy();
  });

  it('in dev it explains that the server must be restarted by hand', async () => {
    stubApi({
      ...ROUTES,
      '/admin/data': { ...DATA, restart_required: true, can_restart: false },
    });
    renderApp(<DataSection />);
    const notice = within(await screen.findByRole('status', { name: 'Restart required' }));
    expect(notice.getByText(/Stop the dev server and start it again by hand/)).toBeTruthy();
    expect(notice.queryByRole('button')).toBeNull();
  });

  it('turns Change folder off when OTS_DATA_DIR overrides the config file, and says why', async () => {
    stubApi({ ...ROUTES, '/admin/data': { ...DATA, env_overrides: ['data_dir'] } });
    renderApp(<DataSection />);
    const button = (await screen.findByRole('button', {
      name: 'Change folder',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/set by OTS_DATA_DIR/)).toBeTruthy();
  });

  it('bytesText reads sizes the way a person would', () => {
    expect(bytesText(512)).toBe('512 B');
    expect(bytesText(1536)).toBe('1.5 kB');
    expect(bytesText(1_572_864)).toBe('1.5 MB');
  });
});

describe('About section', () => {
  it('shows the version, licence and a link to the code', async () => {
    stubApi(ROUTES);
    renderApp(<AboutSection />);
    const facts = within(await screen.findByLabelText('About'));
    expect(facts.getByText('1.1.0')).toBeTruthy();
    expect(facts.getByText('MIT')).toBeTruthy();
    expect(facts.getByRole('link').getAttribute('href')).toBe('https://example.test/ontheshoulder');
  });

  it('copies diagnostics to the clipboard: health and config with the data path', async () => {
    stubApi(ROUTES);
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { userAgent: 'test-browser', clipboard: { writeText } });
    renderApp(<AboutSection />);
    const button = await screen.findByRole('button', { name: 'Copy diagnostics' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = JSON.parse((writeText.mock.calls[0] as unknown as [string])[0]);
    expect(copied).toEqual(JSON.parse(diagnosticsText(ABOUT, HEALTH, DATA)));
    expect(copied.config).toMatchObject({
      data_dir: '/data/ontheshoulder',
      config_path: '/config/ontheshoulder/config.json',
      port: 3001,
    });
    expect(copied.health).toMatchObject({ ok: true, db: { migration: '0003_warmups' } });
    expect(await screen.findByText('Diagnostics copied')).toBeTruthy();
  });

  it('shows the text to copy by hand where the browser has no clipboard (plain http)', async () => {
    stubApi(ROUTES);
    vi.stubGlobal('navigator', { userAgent: 'test-browser' });
    renderApp(<AboutSection />);
    const button = await screen.findByRole('button', { name: 'Copy diagnostics' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    const text = (await screen.findByLabelText('Diagnostics text')) as HTMLTextAreaElement;
    expect(JSON.parse(text.value).config.data_dir).toBe('/data/ontheshoulder');
  });
});
