---
phase: 8
slug: multi-game-rooms
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-22
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (projects: `schema`, `rules`, `worker`, `web`) + Playwright 1.62.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run --project <project> <file-substring>` for the files touched, plus `npm run typecheck` once the root `tsconfig.json` exists |
| **Full suite command** | `npm test && npm run typecheck && npm run test:e2e` |
| **Estimated runtime** | ~90 s unit, ~60 s e2e |

---

## Sampling Rate

- **After every task commit:** Run the targeted Vitest command for the touched files, plus `npm run typecheck`.
- **After every plan wave:** Run `npm test && npm run typecheck`.
- **Before `/gsd:verify-work`:** The full suite must be green, and `npm run test:e2e` must pass **3 consecutive runs at default parallelism with no create-room timeout** (D-18).
- **Before any Playwright run:** Kill the full process trees on 3100/8787 by PID. Leave the unrelated servers on 3101/8788 alone.
- **Max feedback latency:** 120 seconds.

---

## Per-Task Verification Map

Task IDs are filled in by the planner. This is the requirement-level map the plans must cover:

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| MGR-01 | T-8-01 | A later join cannot assert or change the room's game | unit + e2e | `npx vitest run --project worker room-state` + `npx playwright test create-room` | ✅ modify | ⬜ pending |
| MGR-02 | — | Seat limits come from the room's own game entry | unit | `npx vitest run --project worker room-state` (toy-game cases) | ✅ modify | ⬜ pending |
| MGR-03 | T-8-02 | `set_config` validated against the game's `configSchema`, fail-closed | unit + e2e | `npx vitest run --project worker room-state` + `npx vitest run --project web` + `npx playwright test start-game` | ✅ modify | ⬜ pending |
| MGR-04 | — | N/A | unit + e2e | `npm test && npm run test:e2e` | ✅ existing | ⬜ pending |
| MGR-05 | T-8-03 | A view failing its own game's schema is never sent | unit | `npx vitest run --project worker seat-projection` | ✅ modify | ⬜ pending |
| MGR-06 | T-8-04 | A v4 blob resets via the version path, never deserialised | unit | `npx vitest run --project worker persistence` | ❌ W0 | ⬜ pending |
| MGR-07 | — | N/A | build | `npm run typecheck` | ❌ W0 | ⬜ pending |
| MGR-08 | — | The share link never carries the name, game or config | e2e | `npm run test:e2e` × 3 at default parallelism | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Root `tsconfig.json` with `references`; `packages/schema` and `packages/rules` gain `composite: true` and `noEmit: false` (MGR-07)
- [ ] A new D-13 describe block in `apps/worker/src/persistence.test.ts` asserting the version path (`getCalls` never includes the room key) (MGR-06)
- [ ] A test-only toy-game fixture (D-10), at `apps/worker/test/toy-game.ts` (plan 08-07; outside `src` so the source-structure A5 scan is unaffected)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The production deploy resets saved rooms while no game is in progress | MGR-06 | The deploy is an owner go-ahead, never done by the executor | Follow the new `docs/deployment.md` checklist item; the owner confirms no game is in progress; deploy worker, then web; create a fresh room of each kind |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-23 (plan-checker iteration 2: every task has an automated verify)
