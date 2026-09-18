---
phase: 7
slug: variant-support-rainbow-black
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 07-CONTEXT.md test strategy (D-04, D-11, D-16, D-17, D-18). Research was skipped (`--skip-research`), so this file is derived from CONTEXT rather than a RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (projects: schema, rules, worker, web) + fast-check 4.9.0 + Playwright 1.62.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run --project rules` (engine tasks) / `npx vitest run --project web` (UI tasks) |
| **Full suite command** | `npm test && npm run typecheck && npx playwright test` |
| **Estimated runtime** | ~5-10 seconds quick; several minutes full (e2e against real `wrangler dev` + `next dev`) |

Notes:
- The web Vitest project has no DOM environment. Unit tests are pure-function tests in `apps/web/lib/`; component behaviour is proven by Playwright.
- **Before any Playwright run**, kill the full orphaned dev-server tree listening on ports 3100 and 8787 by PID (e.g. `lsof -ti :3100 -ti :8787` then kill each PID and its process group). Reused stale servers have poisoned several prior runs.

---

## Sampling Rate

- **After every task commit:** Run the quick command for the package the task touched.
- **After every plan wave:** Run `npm test && npm run typecheck`; run `npx playwright test` after any wave touching `apps/web` or `e2e/`.
- **Before `/gsd:verify-work`:** Full suite green, `tsc -b` clean, owner sign-off checkpoint passed.
- **Max feedback latency:** 10 seconds (quick run).

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement → test mapping:

| Requirement / Decision | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|------------------------|----------|------------|-----------|-------------------|-------------|--------|
| RULES-14 (D-01, D-02) | `canClue` rejects any colour value outside `variantConfig(variant).cluableColors` with a dedicated reason, before the touch check, in base / Rainbow / Black | T-07-01 (forged "rainbow" clue frame) | unit (regression) | `npx vitest run --project rules -t canClue` | ✅ extend `legality.test.ts` | ⬜ pending |
| RULES-14 (D-02) | New reason threaded through `adapter.ts`, `packages/schema/src/messages.ts`, worker `mapAdapterError`; a forged clue frame is refused on the wire | T-07-01 | unit + worker | `npx vitest run --project rules --project schema --project worker` | ✅ extend | ⬜ pending |
| RULES-14 (D-04) | Property: no accepted clue in any variant ever carries a non-nameable colour value | T-07-01 | property (fast-check) | `npx vitest run --project rules -t nameable` | ❌ W0 / extend `variant-matrix.test.ts` | ⬜ pending |
| RULES-14 (D-05..D-07) | Rainbow tile popover offers the five nameable colours, never "Rainbow"; each sends an ordinary colour clue | — | unit (web lib) + e2e | `npx vitest run --project web` + `npx playwright test e2e/variant-rainbow.spec.ts` | ❌ W0 | ⬜ pending |
| RULES-14 (D-18) | Rainbow e2e: clicking a teammate's rainbow tile, picking a colour, rings the rainbow tile and every tile of that suit on the receiver's hand; no "Rainbow" option anywhere | T-07-02 (deck/seed override leaking to prod) | e2e | `npx playwright test e2e/variant-rainbow.spec.ts` | ❌ W0 | ⬜ pending |
| UI-07 (D-11) | Rainbow `glyphPath` differs from every other suit; `SuitGlyph` renders a gradient `url(#…)` fill for rainbow | — | unit (web lib) | `npx vitest run --project web -t rainbow` | ✅ extend | ⬜ pending |
| UI-07 (D-11) | Rainbow face renders the gradient at every size it appears (teammate tile, played-stack slot, compact discard, discard overlay) | — | e2e | `npx playwright test e2e/variant-rainbow.spec.ts` | ❌ W0 | ⬜ pending |
| SC-3 (D-16) | Engine: each variant reaches each end condition (fuse-out, deck-exhaustion final round, perfect score via constructed state); `score`, `maxScoreFor`, `scoreBand` agree | — | unit | `npx vitest run --project rules -t variant` | ✅ extend `variant-matrix.test.ts` | ⬜ pending |
| SC-3 (D-17) | E2E UI-10 full game parametrized over base / rainbow / black: end overlay `/ 25`, `/ 30`, `/ 30`; score equals tiles on played stacks; six columns for box variants; no per-variant branches beyond the expected-numbers table | — | e2e | `npx playwright test e2e/start-game.spec.ts` | ✅ extend | ⬜ pending |
| Regression guard | 1280x720 floor fit and fixed board geometry stay green: `e2e/start-game.spec.ts` "UI-11" and "UAT gap 1 fixed geometry" (popover adds no flow height) | — | e2e | `npx playwright test e2e/start-game.spec.ts -g "UI-11\|fixed geometry"` | ✅ | ⬜ pending |
| Regression guard | Own-hand boundary: own-hand components take ids + clue facts only; any new own-hand file listed in `own-hand-source.test.ts` | — | unit | `npx vitest run --project web -t own-hand` | ✅ | ⬜ pending |
| Regression guard | No hex colour literal outside `@theme` in `apps/web/app/globals.css` | — | grep | `grep -rnE "#[0-9A-Fa-f]{3,8}\b" apps/web/components apps/web/lib` returns no new matches | ✅ | ⬜ pending |
| T-07-02 | No deck/seed override reachable in production (if a dev-only var is added, it is gated like `SOCKET_STALE_MS` / `ZOMBIE_SWEEP_INTERVAL_MS` and absent from production config) | T-07-02 | unit + grep | worker test asserting the override is ignored without the dev var; `grep` of `wrangler` production config | ❌ W0 if mechanism chosen | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Nameable-colour regression cases in `packages/rules/src/hanabi/legality.test.ts` (fail before the `canClue` fix)
- [ ] Property test (new or in `variant-matrix.test.ts`) asserting no accepted clue carries a non-nameable colour
- [ ] Rainbow e2e spec (e.g. `e2e/variant-rainbow.spec.ts`) plus `e2e/helpers.ts` support for the rainbow tile's colour row
- [ ] Any tests asserting old behaviour (disabled rainbow colour button, `clue_touches_nothing` for "rainbow" in base) updated in the SAME task that changes the behaviour

*Existing Vitest / fast-check / Playwright infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rainbow tile reads as unambiguous on a live Rainbow board; rainbow lavender distinct from `--color-turn` (D-12) | UI-07 | Aesthetic judgement | Owner plays a Rainbow game at 1280x720; confirms rainbow tiles and the turn highlight are distinct |
| Rainbow popover colour row acceptable in look and placement at hand edges | RULES-14 | Owner visual approval | Owner clicks a teammate's rainbow tile at the left and right hand edges |
| Full games in base, Rainbow, Black feel correct end to end | SC-3 | Final owner sign-off | Owner sign-off checkpoint (`autonomous: false`), run after the full gate is green |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
