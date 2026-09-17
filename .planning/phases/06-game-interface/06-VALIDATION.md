---
phase: 6
slug: game-interface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (projects: schema, rules, worker, web) + Playwright 1.62.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run --project web` |
| **Full suite command** | `npm test && npx playwright test` |
| **Estimated runtime** | ~5 seconds quick; several minutes full (e2e against real `wrangler dev` + `next dev`) |

Note: the web Vitest project has no DOM environment — unit tests are pure-function tests in `apps/web/lib/`; component behaviour is proven by Playwright.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project web`
- **After every plan wave:** Run `npm test && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite green, `tsc -b` clean, owner visual sign-off (D-25)
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement → test mapping:

| Requirement | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-------------------|-------------|--------|
| UI-01 | e2e | `npx playwright test e2e/start-game.spec.ts` | ✅ extend | ⬜ pending |
| UI-02 | e2e | `npx playwright test e2e/hanabi-realtime.spec.ts` | ✅ extend | ⬜ pending |
| UI-03 | e2e | `npx playwright test e2e/start-game.spec.ts` | ✅ extend | ⬜ pending |
| UI-04 | unit + e2e | `npx vitest run --project web -t touchedCardIdsFromLatestClue` | ❌ W0 | ⬜ pending |
| UI-05 | unit | `npx vitest run --project web -t candidateDisplayFor` | ❌ W0 | ⬜ pending |
| UI-06 | unit + e2e | `npx vitest run --project web -t SuitGlyph` | ❌ W0 | ⬜ pending |
| UI-08 | unit | `npx vitest run --project web -t luminosityStepFor` | ❌ W0 | ⬜ pending |
| UI-09 | manual | owner visual sign-off | — | ⬜ pending |
| UI-10 | unit + e2e | `npx vitest run --project web -t endReasonForView` | ❌ W0 | ⬜ pending |
| UI-11 | e2e (viewport) | `npx playwright test` | ❌ W0 | ⬜ pending |
| RULES-11 | unit + e2e | `npx vitest run --project web -t disabledReasonFor` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/hanabi-visual-logic.ts` + `.test.ts` — luminosityStepFor, candidateDisplayFor, touchedCardIdsFromLatestClue, disabledReasonFor, endReasonForView
- [ ] `clueTouchIdsForTarget` (or extension of `clueTouchCountForTarget`) with cases in `hanabi-board-logic.test.ts`
- [ ] Suit glyph/hue exhaustiveness test over `ALL_SUITS`
- [ ] Playwright coverage for UI-11 viewport and UI-02 redundant active-player signals

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fireworks-night look, luminosity legibility, glyph distinguishability | UI-08, UI-09 | Aesthetic judgement | Owner plays a game at 1280×720 and 1920×1080; reply recorded verbatim |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
