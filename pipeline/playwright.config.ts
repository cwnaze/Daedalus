import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// How to serve this project comes from pipeline.json, not from here. The demo
// harness drives the app over HTTP and does not care whether it is served by
// Vite, uvicorn, `go run`, or Rails — only that something answers on the URL.
const manifest = JSON.parse(fs.readFileSync(new URL('./pipeline.json', import.meta.url), 'utf8'));
const serve = manifest.serve ?? {};
const baseURL = process.env.BASE_URL ?? serve.url ?? 'http://localhost:5173';

// Determinism rules exist because flake in this layer poisons every later
// review: a green suite is the only regression signal the pipeline has.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // demos share seeded fixture state
  forbidOnly: !!process.env.CI,
  retries: 0,                    // a retry that passes is still a bug worth seeing
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },   // pinned: screenshot diffs depend on it
    trace: 'retain-on-failure',
    launchOptions: { args: ['--force-prefers-reduced-motion'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Without this nothing serves the app: CI brings up docker services but never
  // the application itself, so every browser demo — which is also the entire
  // regression suite — would fail on connection refused.
  //
  // In CI, serve the built artifact rather than the dev server: dev-only error
  // overlays and unminified timing are not what ships, and a demo screenshot is
  // supposed to show the real thing. `reuseExistingServer` keeps local runs fast
  // when you already have the dev server going.
  //
  // A project with no `serve` block — a CLI, a library — gets no webServer, and
  // its stories use `demoKind: "command"` instead.
  webServer: (process.env.CI ? serve.ci : serve.dev)
    ? {
        command: (process.env.CI ? serve.ci : serve.dev) as string,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: serve.readyTimeoutMs ?? 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
