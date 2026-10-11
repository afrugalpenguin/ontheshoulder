import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // The api and the proxy share one .env in the repo root so the port cannot drift.
  const env = loadEnv(mode, repoRoot, 'OTS_');
  const apiPort = env.OTS_PORT || '3001';

  // The same proxy serves the dev server and `vite preview` of the built bundle.
  const proxy = {
    '/api': {
      target: `http://127.0.0.1:${apiPort}`,
      rewrite: (path: string) => path.slice('/api'.length),
    },
  };

  return {
    plugins: [react()],
    server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
