// Vitest runs apps/worker's tests in Node, not the actual Workers runtime,
// so the built-in "cloudflare:workers" module specifier is unresolvable there
// (it only exists inside workerd / `wrangler dev`). This shim provides just
// enough of the surface (`DurableObject`) for Wave 0's smoke test to import
// apps/worker/src/index.ts without pulling in the real Workers runtime.
// Real DO behavior is exercised via `wrangler dev` (Playwright e2e) and the
// `wrangler deploy --dry-run` bundle check in Task 4 — both use the actual
// Workers runtime/bundler, not this shim.
export class DurableObject {
  ctx: unknown;
  env: unknown;
  constructor(ctx?: unknown, env?: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
