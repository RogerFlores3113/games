---
phase: 4
slug: wire-engine-into-room-actor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (projects: schema, rules, worker, web) + Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (web dev server on port 3100) |
| **Quick run command** | `npx vitest run --project <narrowest relevant project>` |
| **Full suite command** | `npm test` then `npx playwright test` |
| **Estimated runtime** | quick ~5-40s; full ~60s + e2e ~10s |

*No framework installs needed. `zod` and `nanoid` are already exact-pinned in both `apps/web` and `apps/worker`.*

---

## Sampling Rate

- **After every task commit:** the narrowest relevant project (`schema` while editing the Hanabi view schema, `worker` while editing registration/room-state, `web` for the board)
- **After every plan wave:** `npm test` across all four projects
- **Before `/gsd:verify-work`:** `npm test` + `npx playwright test` green, and per-package `tsc --noEmit` clean (D-16)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Task IDs are filled in by the planner; rows map each requirement to its verification layer.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | RT-01 | — | An action on one client appears on the other without a refresh | e2e, two browser contexts | `npx playwright test e2e/start-game.spec.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | RT-03 | — | Mid-game reload rejoins the same seat with full state and the same turn | e2e, `page.reload()` mid-game | `npx playwright test e2e/in-progress-arrival.spec.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | RT-09 | duplicate action | The same `actionId` sent twice applies once; a repeated **clue** spends one token, not two | integration, raw `ws` vs `wrangler dev` | `npx vitest run --project worker room-do` | ❌ W0 (new case in existing harness) | ⬜ pending |
| TBD | TBD | TBD | D-02 | info disclosure | Wire frames carry no own-hand identity, Hanabi shape | property + frame capture | `npx vitest run --project worker redaction-wire room-do` | ❌ W0 (repoint from toy) | ⬜ pending |
| TBD | TBD | TBD | D-03 | bypass serializer | Chokepoint counts unchanged; game-naming confined to `game-registration.ts` for `hanabiGame` | structural source test | `npx vitest run --project worker source-structure` | ✅ rewrite A9 | ⬜ pending |
| TBD | TBD | TBD | D-05 | null-not-absent leak | Strict Hanabi view schema rejects a hidden card carrying `suit`/`rank`, and unknown keys at every level | unit | `npx vitest run --project schema` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-06 | stale adapter state | Rooms persisted with the toy's state reset instead of being handed to the Hanabi adapter | unit | `npx vitest run --project worker persistence` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | D-10 | state in error frames | Refusal reasons are a closed enum; no free text, no game data | unit | `npx vitest run --project schema messages` + `--project worker room-state` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/schema/src/games/hanabi.ts` + test — strict Hanabi view schema and its subpath wiring (D-05)
- [ ] `apps/worker/src/room-do.test.ts` — new RT-09 double-sent-clue case in the existing `wrangler dev` harness
- [ ] `apps/worker/src/redaction-wire.test.ts` — repointed from the toy's checker to `checkHanabiViewForLeaks` / `secretsForHanabiSeat` (D-02)
- [ ] `apps/worker/src/room-do.test.ts` frame-capture assertions — repointed to the Hanabi view shape (D-02)
- [ ] `apps/worker/src/source-structure.test.ts` — A9 **rewritten** to confine `hanabiGame`, not left passing vacuously against a deleted name (D-03)
- [ ] Playwright mid-game reload coverage for RT-03 — confirm the existing spec's scope first and extend rather than duplicate

*Framework installs: none.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *(none planned)* | — | RT-01/03/09 are all automatable; the interim board is deliberately unstyled, so there is no visual contract to eyeball this phase | — |

*If a plan adds a human checkpoint, record it here rather than leaving it implicit.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
