import { defineConfig, devices } from '@playwright/test';

// Determinism rules exist because flake in this layer poisons every later
// review: a green suite is the only regression signal the pipeline has.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // demos share seeded fixture state
  forbidOnly: !!process.env.CI,
  retries: 0,                    // a retry that passes is still a bug worth seeing
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },   // pinned: screenshot diffs depend on it
    trace: 'retain-on-failure',
    launchOptions: { args: ['--force-prefers-reduced-motion'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
