---
phase: 12
slug: phaser-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-27
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit / scene-model logic), Playwright (e2e) |
| **Config file** | existing workspace vitest config / `playwright.config.ts` |
| **Quick run command** | `npm run test -- apps/web/lib/expedition` |
| **Full suite command** | `npm run test && npm run test:e2e` |
| **Estimated runtime** | ~60 seconds (unit), several minutes with e2e |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- apps/web/lib/expedition`
- **After every plan wave:** Run `npm run test && npx playwright test e2e/expedition-*.spec.ts`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the production-bundle grep for `__expeditionTest` (must be empty) and a manual Strict-Mode double-mount check
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (planner fills) | — | — | SCENE-01 | — | Phaser never in landing/Hanabi bundles | unit (source scan) + e2e | `npm run test -- game-ui` + `npx playwright test e2e/expedition-create.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-02 | — | Renders only fields present on `ExpeditionView` | unit | `npm run test -- build-scene-model` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-03 | — | Dimming derived from `yourLegalCardIds`, never recomputed | unit | `npm run test -- build-scene-model` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-04 | — | N/A | unit + e2e | model test + `e2e/expedition-camp.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-08 | — | Pref is local-only, never sent to server | unit | `npm run test -- expedition-card-pack-pref` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-09 | — | Interactables never import socket/store | unit (contract) | `npm run test -- interactables` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-10 | — | N/A | unit + manual | `npm run test -- compute-zoom` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-11 | — | Seat token resumes same seat | e2e | `npx playwright test e2e/expedition-camp.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SCENE-12 | T-12 test bridge | Bridge absent from production build | build-check + e2e | `next build` then `grep -r "__expeditionTest" apps/web/.next/static` (empty) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/expedition/build-scene-model.test.ts` — SCENE-02/03/04
- [ ] `apps/web/lib/expedition/expedition-card-pack-pref.test.ts` — SCENE-08
- [ ] interactables registry contract test — SCENE-09
- [ ] zoom/scaling unit test — SCENE-10
- [ ] Phaser-import boundary source-scan test — SCENE-01
- [ ] production-build test-bridge absence check — SCENE-12
- [ ] `e2e/expedition-create.spec.ts`, `e2e/expedition-camp.spec.ts` — SCENE-01/04/11/12
- [ ] `npm install phaser --workspace apps/web` (version per plan)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pixel art crisp at 1280×720 and above | SCENE-10 | Visual fidelity | Open an Expedition room at 1280×720 and 1920×1080; confirm no blurred placeholder sprites |
| No double-mount / WebGL leak under Strict Mode | SCENE-01/03 | Browser devtools inspection | Dev mode: navigate in/out of a room 5×; confirm one canvas, no "Too many active WebGL contexts" warning |
| Owner sign-off on placeholder camp scene | Success criterion 5 | Owner judgment | Owner reviews the placeholder camp scene and approves before the art pass |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
