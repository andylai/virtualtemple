import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Reports are throttled and some tests wait for them.
    testTimeout: 20_000,
    // Halls and the directory keep their state in memory; start every test with none.
    setupFiles: ['./test/setup.ts'],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Reports to the directory are throttled; one second keeps the tests quick.
      miniflare: { bindings: { HALL_REPORT_INTERVAL_SEC: '1' } },
    }),
  ],
});
