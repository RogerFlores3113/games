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
// Overridable via env so a local run never collides with a wrangler/next dev
// server the operator started independently and is not part of this test
// run (e.g. a long-running manual `wrangler dev --port 8787` session).
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3100;
const WORKER_PORT = Number(process.env.E2E_WORKER_PORT) || 8787;

// Set PLAYWRIGHT_BASE_URL (e.g. https://games.rogerflores.dev) to run specs
// against a live deployment. Local dev servers are skipped in that mode: the
// deployed web app already dials its deployed Worker.
const REMOTE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

// D-15: Phase 5 timing injection. These values are deliberately shortened
// from production defaults (packages/schema's HEARTBEAT_INTERVAL_MS/
// HEARTBEAT_PONG_TIMEOUT_MS/SOCKET_STALE_MS/ZOMBIE_SWEEP_INTERVAL_MS) so that
// e2e/hanabi-realtime.spec.ts and e2e/seat-takeover.spec.ts's Phase 5 tests
// never sleep for real minutes. NOTE: with `reuseExistingServer` (the local
// default), an ALREADY-RUNNING `next dev`/`wrangler dev` process started
// WITHOUT these values will silently be reused and the Phase 5 timing specs
// will time out waiting for disconnected/reconnected indicators that never
// arrive on the shortened schedule. Stop any stray servers on 3100/8787
// before running `npx playwright test` locally.
const E2E_HEARTBEAT_INTERVAL_MS = "1000";
const E2E_HEARTBEAT_PONG_TIMEOUT_MS = "1000";
const E2E_SOCKET_STALE_MS = 5000;
const E2E_ZOMBIE_SWEEP_INTERVAL_MS = 1000;

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
          env: {
            ...process.env,
            NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS: E2E_HEARTBEAT_INTERVAL_MS,
            NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS: E2E_HEARTBEAT_PONG_TIMEOUT_MS,
            // Keep the web app's worker target in sync with the (possibly
            // overridden) WORKER_PORT above — see origin.ts, which already
            // allows any loopback origin/port.
            NEXT_PUBLIC_WORKER_HOST: `localhost:${WORKER_PORT}`,
          },
        },
        {
          command: `npx wrangler dev --port ${WORKER_PORT} --var SOCKET_STALE_MS:${E2E_SOCKET_STALE_MS} --var ZOMBIE_SWEEP_INTERVAL_MS:${E2E_ZOMBIE_SWEEP_INTERVAL_MS}`,
          cwd: "apps/worker",
          port: WORKER_PORT,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
