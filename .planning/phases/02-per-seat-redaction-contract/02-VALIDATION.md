---
phase: 2
slug: per-seat-redaction-contract
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (four `projects`: schema, rules, worker, web) + fast-check 4.9.0 + Playwright (e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run --project rules && npx vitest run --project schema` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~10 seconds; full ~60 seconds (includes `wrangler dev` integration harness) |

---

## Sampling Rate

- **After every task commit:** Run the quick command (plus `npx vitest run --project worker` when the task touches `apps/worker`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the e2e specs touched this phase
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Task IDs are filled in by the planner; the rows below map each requirement to its verification layer.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T3 | 02-01 | 1 | HIDE-01, HIDE-04 | own-hand leak (T-02-01) | No seat's toPlayerView carries own card identity, deck, or seed over random games (D-11 layer 1) | property | `npx vitest run --project rules forehead-card.property` | ✅ | ✅ green |
| 02-01-T3 | 02-01 | 1 | HIDE-04 | silent test (T-02-05) | Leak checker flags own value, value: null, value: undefined, own card in otherCards, deck, seed (D-13 canary) | unit (canary) | `npx vitest run --project rules forehead-card-leak-check` | ✅ | ✅ green |
| 02-01-T2 | 02-01 | 1 | HIDE-03 | spread/null projection (T-02-01) | Own card projected as { id, hidden: true } with exact key set; ids opaque (D-04, D-05) | unit + conformance | `npx vitest run --project rules forehead-card adapter` | ✅ | ✅ green |
| 02-02-T1 | 02-02 | 1 | HIDE-03 | null-not-absent leak (T-02-06) | Strict view schema rejects hidden card with any value key incl. undefined; unknown keys at every level | unit | `npx vitest run --project schema games/forehead-card` | ✅ | ✅ green |
| 02-02-T3 | 02-02 | 1 | HIDE-02 | error-frame side channel (T-02-07) | Error detail is a closed enum | unit | `npx vitest run --project schema messages` | ✅ | ✅ green |
| 02-03-T2 | 02-03 | 2 | HIDE-02, HIDE-03 | fail-open validation (T-02-09) | projectSeatView returns null and logs no secrets on schema failure (D-07); counter rooms reset (ROOM_SCHEMA_VERSION 2) | unit | `npx vitest run --project worker seat-projection persistence` | ✅ | ✅ green |
| 02-03-T3 | 02-03 | 2 | HIDE-01, HIDE-04 | wire leak (T-02-13) | Encoded frames for every seat free of own value, deck, seed (D-11 layer 2) | property | `npx vitest run --project worker redaction-wire` | ✅ | ✅ green |
| 02-04-T1/T2 | 02-04 | 3 | HIDE-02 | bypass serializer (T-02-14) | One `.send(`, one `encodeServerMessage(`, one `toSeatView(` call, `toPlayerView(` only in toSeatView, zero `broadcast(` (comment-stripped, literal-aware) | structural source test | `npx vitest run --project worker source-structure` | ✅ | ✅ green |
| 02-04-T3 | 02-04 | 3 | HIDE-01, HIDE-04 | reconnect leak (T-02-17) | Real wrangler-dev frames on join, live update, seat-token reconnect carry no own value or undealt deck (D-11 layer 3) | integration | `npx vitest run --project worker room-do` | ✅ (extended) | ✅ green |
| 02-05-T2 | 02-05 | 3 | HIDE-01 | UI own-card render (T-02-19) | Own-card tile blank; teammate-visible value absent from own tile; toy turn flow works | e2e | `npx playwright test e2e/start-game.spec.ts e2e/in-progress-arrival.spec.ts` | ✅ (updated) | ✅ green |
| 02-06-T1 | 02-06 | 4 | HIDE-01..04 | integration regression | Full gate green | full suite | `npm test && npx playwright test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/rules/src/forehead-card.test.ts` — toy adapter + fast-check projection property (layer 1)
- [x] game-namespaced view schema test (location per plan; research recommends `packages/schema/src/games/`)
- [x] `apps/worker/src/leak-check.ts` + `leak-check.test.ts` — shared checker + D-13 canary
- [x] `apps/worker/src/source-structure.test.ts` — D-09 structural audit
- [x] `apps/worker/src/room-do.test.ts` — extended with join / live-update / reconnect frame capture (layer 3)

*No framework installs needed — vitest, fast-check, zod already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toy game renders own card face-down, others face-up (Plan 02-06 Task 2) | HIDE-01 (UX sanity) | Visual check of minimal toy UI | Open room in two browsers, start game, confirm each sees the other's card but not their own; DevTools WS frames show no own `value` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated gate green 2026-09-15; manual check pending Task 2

---

## Gate Results

- `npm test`: Test Files 30 passed (30); Tests 291 passed (291); Duration 39.90s
- `npx tsc -p packages/rules/tsconfig.json --noEmit`: exit 0
- `npx tsc -p packages/schema/tsconfig.json --noEmit`: exit 0
- `npx tsc -p apps/worker/tsconfig.json --noEmit`: exit 0
- `npx tsc -p apps/web/tsconfig.json --noEmit`: exit 0
- `npm run build:worker`: wrangler deploy --dry-run succeeded (Total Upload 805.44 KiB / gzip 131.81 KiB)
- `npm run build:web`: next build succeeded (4 routes, TypeScript check passed)
- `npx playwright test`: 13 passed (7.7s)
