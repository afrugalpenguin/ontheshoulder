import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/schemas.ts'],
      reporter: ['text'],
      thresholds: {
        'src/equipment.ts': { lines: 100, functions: 100, statements: 100, branches: 100 },
      },
    },
  },
});
