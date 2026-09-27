---
phase: 12
slug: phaser-shell
status: draft
nyquist_compliant: true
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
| **Quick run command** | `npx vitest run --project web lib/expedition` |
| **Full suite command** | `npm run test && npm run test:e2e` |
| **Estimated runtime** | ~60 seconds (unit), several minutes with e2e |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project web lib/expedition`
- **After every plan wave:** Run `npm run test && npx playwright test e2e/expedition-*.spec.ts`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the production-bundle grep for `__expeditionTest` (must be empty) and a manual Strict-Mode double-mount check
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-T1 | 01 | 1 | SCENE-01 | T-12-01 | Expedition config reads null; other games' hidden fields never leak | unit | `npx vitest run --project web create-room-form` | ❌ W0 | ⬜ pending |
| 12-01-T2 | 01 | 1 | SCENE-01 | T-12-01 | Native (no-JS) create works; bad names still rejected | e2e | `npx playwright test e2e/expedition-create.spec.ts` | ❌ W0 | ⬜ pending |
| 12-02-T1 | 02 | 1 | SCENE-02 | T-12-04 | Display catalogue carries no functions/modifiers | unit | `npx vitest run --project rules catalog-display` | ❌ W0 | ⬜ pending |
| 12-02-T2 | 02 | 1 | SCENE-03 | T-12-03 | Requests only on Confirm, exact wire keys | unit | `npx vitest run --project web local-ui` | ❌ W0 | ⬜ pending |
| 12-02-T3 | 02 | 1 | SCENE-12 | — | Stable bridge id scheme | unit | `npx vitest run --project web expedition-ids` | ❌ W0 | ⬜ pending |
| 12-03-T1 | 03 | 1 | SCENE-10 | — | Integer zoom, integer layout | unit | `npx vitest run --project web compute-zoom layout.test` | ❌ W0 | ⬜ pending |
| 12-03-T2 | 03 | 1 | SCENE-10 | — | Canvas palette bound to globals.css | unit | `npx vitest run --project web palette` | ❌ W0 | ⬜ pending |
| 12-03-T3 | 03 | 1 | SCENE-08 | T-12-06 | Pref local-only, tamper-safe | unit | `npx vitest run --project web expedition-card-pack-pref` | ❌ W0 | ⬜ pending |
| 12-04-T1..T3 | 04 | 1 | SCENE-01, SCENE-12 | T-12-SC, T-12-08, T-12-09 | Owner-gated install; Phaser confined; bridge absent from prod | unit + build-check | `npx vitest run --project web phaser-import-confinement` + `npm run build:web && npm run check:expedition-build --workspace apps/web` | ❌ W0 | ⬜ pending |
| 12-05-T1 | 05 | 2 | SCENE-02, SCENE-03, SCENE-04 | T-12-10, T-12-11 | Renders only view fields; dimming from yourLegalCardIds; reveals at fromSeatId | unit (TDD) | `npx vitest run --project web build-scene-model` | ❌ W0 | ⬜ pending |
| 12-05-T2 | 05 | 2 | SCENE-11 | — | Stub model pure/deterministic | unit (TDD) | `npx vitest run --project web between-camps-model` | ❌ W0 | ⬜ pending |
| 12-06-T1..T3 | 06 | 2 | SCENE-08, SCENE-10 | T-12-13 | No fillText, integer-only card drawing | unit (contract) | `npx vitest run --project web glyphs-5x7 card-packs.contract` | ❌ W0 | ⬜ pending |
| 12-07-T1..T2 | 07 | 2 | SCENE-09 | T-12-14 | Interactables never import socket/store/dispatch | unit (contract) | `npx vitest run --project web interactables.contract` | ❌ W0 | ⬜ pending |
| 12-08-T1 | 08 | 3 | SCENE-11 | T-12-19 | dispatch exactly once, never while reconnecting | unit | `npx vitest run --project web expedition-scene-store` | ❌ W0 | ⬜ pending |
| 12-08-T2..T3 | 08 | 3 | SCENE-01, SCENE-10, SCENE-12 | T-12-16, T-12-17, T-12-18 | Strict-Mode-safe mount; literal NODE_ENV guard | typecheck + build-check | `npm run typecheck && npm run build:web && npm run check:expedition-build --workspace apps/web` | ❌ W0 | ⬜ pending |
| 12-09-T1..T3 | 09 | 4 | SCENE-02, SCENE-03, SCENE-04 | T-12-20 | Fixed request literals; gear/whisper only via Confirm | typecheck + build-check (behaviour in 12-13) | `npm run typecheck && npm run check:expedition-build --workspace apps/web` | ❌ W0 | ⬜ pending |
| 12-11-T1..T2 | 11 | 4 | SCENE-08 | T-12-25, T-12-27 | Host controls UX-only; server re-checks | unit (render) | `npx vitest run --project web expedition-settings-modal-render` | ❌ W0 | ⬜ pending |
| 12-10-T1..T2 | 10 | 5 | SCENE-01, SCENE-10, SCENE-11 | T-12-23 | One canvas, no leak across navigation; integer zoom | e2e | `npx playwright test e2e/expedition-mount.spec.ts` | ❌ W0 | ⬜ pending |
| 12-12-T1..T2 | 12 | 6 | SCENE-01, SCENE-12 | T-12-28, T-12-29 | Phaser never on landing/Hanabi; bridge absent in prod | e2e + build-check | `npx playwright test e2e/expedition-create.spec.ts` + `npm run check:expedition-build --workspace apps/web` | ❌ W0 | ⬜ pending |
| 12-13-T1..T2 | 13 | 7 | SCENE-02..04, 08, 09, 11, 12 | T-12-30, T-12-31 | Reveal only to audience; interactables send no game_action | e2e | `npx playwright test e2e/expedition-camp.spec.ts` | ❌ W0 | ⬜ pending |
| 12-14-T2 | 14 | 8 | SCENE-02..04, SCENE-10 | — | Owner sign-off (D-14) | manual | checkpoint | n/a | ⬜ pending |

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
