import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/e2e-results/**',
      'services/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      'apps/api/**/*.{ts,mjs}',
      'apps/web/vite.config.ts',
      'apps/web/playwright.config.ts',
      'apps/web/e2e/**/*.ts',
      'apps/web/scripts/**/*.mjs',
      '*.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
