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

  // Without this nothing serves the app: CI brings up docker services but never
  // the application itself, so every browser demo — which is also the entire
  // regression suite — would fail on connection refused.
  //
  // In CI, test the built artifact rather than the dev server: dev-only error
  // overlays and unminified timing are not what ships, and a demo screenshot is
  // supposed to show the real thing. `reuseExistingServer` keeps local runs fast
  // when you already have `npm run dev` going.
  webServer: {
    command: process.env.CI ? 'npm run build && npm run preview' : 'npm run dev',
    url: process.env.BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
