import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // In development the API runs on :3000; in Docker, nginx does the same proxying.
  server: { port: 5173, proxy: { '/v1': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.tsx'] },
});
