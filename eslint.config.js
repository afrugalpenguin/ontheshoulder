import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'services/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.{ts,mjs}', 'apps/web/vite.config.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
