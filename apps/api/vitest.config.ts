import { defineConfig } from 'vitest/config';

// A name filter (`pnpm --filter api test engine`) runs part of the suite, so the
// coverage thresholds only apply to a full run.
const filtered = process.argv.slice(2).some((arg) => !arg.startsWith('-') && arg !== 'run');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/server.ts', 'src/db/migrate.ts'],
      reporter: ['text'],
      thresholds: filtered
        ? {}
        : { 'src/routes/**': { lines: 80, functions: 80, statements: 80, branches: 80 } },
    },
  },
});
