import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API tests share one database, so test files run one at a time.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
  },
});
