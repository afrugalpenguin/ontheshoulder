import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { defineConfig } from '@playwright/test';

// The flows run against a real api on a fresh database in a temp folder, and
// the built web bundle served by `vite preview` proxying to it (build first). Ports are off the dev defaults so a
// running `pnpm dev` is left alone.
const API_PORT = process.env.OTS_E2E_API_PORT ?? '3183';
const WEB_PORT = process.env.OTS_E2E_WEB_PORT ?? '5183';
const dataDir = process.env.OTS_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'ots-e2e-'));
// The api gets its data folder from a config file, as an installed one does,
// so the flow that moves the folder from Settings is the real thing. The file
// sits beside the data folder, not in it. Tests read it through OTS_E2E_CONFIG.
const configFile = join(dataDir, '..', `${basename(dataDir)}-config.json`);
if (!existsSync(configFile)) {
  writeFileSync(
    configFile,
    JSON.stringify({
      data_dir: dataDir,
      port: Number(API_PORT),
      lan_guard: true,
      log_level: 'info',
    }),
  );
}
process.env.OTS_E2E_CONFIG = configFile;
process.env.OTS_E2E_DATA_DIR = dataDir;
const env = {
  OTS_CONFIG: configFile,
  // The preview server's proxy reads the port from here.
  OTS_PORT: API_PORT,
  OTS_HOST: '127.0.0.1',
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'UTC',
    locale: 'en-GB',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @ots/api exec tsx src/server.ts',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @ots/web exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
