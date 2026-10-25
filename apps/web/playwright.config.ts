import { defineConfig, devices } from '@playwright/test';

// Runs against the full stack: `docker compose up` locally (http://localhost:8080), or the `web`
// service inside Docker (see `make test`).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // the tests share one database
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    actionTimeout: 10_000, // fail at the stuck step, not at the 30s test timeout
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
