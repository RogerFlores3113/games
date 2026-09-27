---
phase: 11
slug: adapter-schemas-worker-wiring
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-27
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + fast-check 4.x |
| **Config file** | `vitest.config.ts` (root; per-package `--project` selection) |
| **Quick run command** | `npx vitest run --project rules <touched test file>` |
| **Full suite command** | `npm run typecheck && npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command against touched test files
- **After every plan wave:** Run `npm run typecheck && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | — | — | COMM-03 | Information Disclosure | No seat's view/log contains another seat's card except via an addressed reveal, at every step | property | `npx vitest run --project rules packages/rules/src/expedition/run/run.property.test.ts` | ❌ W0 | ⬜ pending |
| (filled by planner) | — | — | ENG-03 | — | 3/4/5 players, every boss twist, random loadouts: always end, never throw, conserve cards, never leak | property | same as above | ✅ harness / ❌ leak assertion | ⬜ pending |
| (filled by planner) | — | — | COMM-03 | Information Disclosure | Thick Fog face-down objectives omitted from the per-seat view payload | unit | `npx vitest run --project rules packages/rules/src/expedition/view.test.ts` | ❌ W0 | ⬜ pending |
| (filled by planner) | — | — | — | Tampering | `ExpeditionAdapter` never throws on hostile `request`, never mutates state | unit | `npx vitest run --project rules packages/rules/src/expedition/adapter.test.ts` | ❌ W0 | ⬜ pending |
| (filled by planner) | — | — | — | — | View/error Zod schemas match adapter types; registry resolves `"expedition"` | unit + typecheck | `npm run typecheck && npx vitest run --project schema --project worker` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rules/src/expedition/adapter.test.ts` — adapter conformance
- [ ] `packages/rules/src/expedition/view.test.ts` — per-seat view allowlist + Thick Fog omission
- [ ] `packages/schema/src/games/expedition.test.ts` — wire schema conformance
- [ ] Real per-seat leak assertion replacing the "interim" checks in `run.property.test.ts`, `gear.contract.test.ts`, `boss.contract.test.ts`
- [ ] Worker registry test for the Expedition entry

*Framework already installed project-wide.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-27 (plan-checker: every task has an automated verify; Wave 0 test files are created within plans 11-01..11-07)
