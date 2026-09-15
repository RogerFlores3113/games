import { defineConfig } from "@playwright/test";

// The web dev server's port is pinned explicitly (`-p`) rather than left to
// Next's own fallback behavior, and deliberately avoids 3000/3001: this
// machine runs an unrelated personal site (`my-vercel-website`) whose own
// `next dev` server was observed answering on port 3000 during this plan's
// own test run (confirmed via the HTML payload — Plan 07/09 both logged the
// same anomaly). Port 3000 is not a reliable choice on this machine for
// EITHER "use it" or "let Next silently fall back from it" — 3100 sidesteps
// the collision entirely. Pinning the port means a real conflict fails
// loudly (EADDRINUSE) instead of silently drifting, and `baseURL`/
// `webServer.port` below always agree with what the server actually bound
// to. `apps/worker/src/origin.ts` already allows any loopback origin/port,
// so this choice needs no corresponding worker-side change.
const WEB_PORT = 3100;
const WORKER_PORT = 8787;

// Set PLAYWRIGHT_BASE_URL (e.g. https://games.rogerflores.dev) to run specs
// against a live deployment. Local dev servers are skipped in that mode: the
// deployed web app already dials its deployed Worker.
const REMOTE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: REMOTE_BASE_URL ?? `http://localhost:${WEB_PORT}`,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: REMOTE_BASE_URL
    ? undefined
    : [
        {
          command: `npm run dev --workspace apps/web -- -p ${WEB_PORT}`,
          port: WEB_PORT,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: `npx wrangler dev --port ${WORKER_PORT}`,
          cwd: "apps/worker",
          port: WORKER_PORT,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
