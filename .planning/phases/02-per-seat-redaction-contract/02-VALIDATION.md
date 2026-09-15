---
phase: 2
slug: per-seat-redaction-contract
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | TBD | TBD | HIDE-01 | own-hand leak | No seat's view contains its own card identity (D-11 layers 1–3) | property + integration | `npx vitest run --project rules` / `npx vitest run --project worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIDE-02 | bypass serializer | Single `connection.send` site, single `toSeatView(` call site, zero `broadcast(` (comment-stripped) | structural source test | `npx vitest run --project worker source-structure` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIDE-03 | null-not-absent leak | Strict view schema rejects a hidden card carrying any `value` key, including `undefined` | unit | `npx vitest run --project schema` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIDE-04 | silent test | Leak checker flags a deliberately leaky projection (D-13 canary) | unit (canary) | `npx vitest run --project worker leak-check` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rules/src/forehead-card.test.ts` — toy adapter + fast-check projection property (layer 1)
- [ ] game-namespaced view schema test (location per plan; research recommends `packages/schema/src/games/`)
- [ ] `apps/worker/src/leak-check.ts` + `leak-check.test.ts` — shared checker + D-13 canary
- [ ] `apps/worker/src/source-structure.test.ts` — D-09 structural audit
- [ ] `apps/worker/src/room-do.test.ts` — extended with join / live-update / reconnect frame capture (layer 3)

*No framework installs needed — vitest, fast-check, zod already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toy game renders own card face-down, others face-up | HIDE-01 (UX sanity) | Visual check of minimal toy UI | Open room in two browsers, start game, confirm each sees the other's card but not their own; DevTools WS frames show no own `value` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
