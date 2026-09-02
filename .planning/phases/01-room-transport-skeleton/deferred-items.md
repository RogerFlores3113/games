# Deferred Items — Phase 01

Out-of-scope discoveries logged per the executor's scope-boundary policy
(not fixed, tracked here for a later plan/session).

## From Plan 07

- **`e2e/smoke.spec.ts` "web dev server serves the schema smoke sentinel"
  fails in this sandbox.** Playwright's `webServer` for the `apps/web`
  Next.js dev server returned an unrelated portfolio site's HTML ("Roger
  Flores | Software Engineer") instead of this repo's minimal App Router
  shell — indicates either a stray/cached dev server process from a
  different project answering on port 3000, or a Playwright `webServer`
  config/cwd issue unrelated to `apps/worker`. Out of scope for Plan 07
  (worker-only); the corresponding worker smoke test
  ("worker dev server serves both workspace smoke sentinels") passes
  cleanly. Investigate before relying on the Playwright harness again.
