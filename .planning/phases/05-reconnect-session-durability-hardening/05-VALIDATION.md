---
phase: 5
slug: reconnect-session-durability-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (root + per-package projects), Playwright 1.62.1 (E2E) |
| **Config file** | root `vitest.config.ts`, `playwright.config.ts` (existing) |
| **Quick run command** | `npx vitest run --project worker <file>` plus `tsc -b` for touched packages |
| **Full suite command** | `npm test && npx playwright test` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched file(s)
- **After every plan wave:** Run `npm test && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green, plus owner sign-off on `docs/manual-checks/mobile-background.md`
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | RT-04 | — | Reconnect returns the same seat only for a valid token | integration + e2e | `npx vitest run --project worker room-do` / `npx playwright test hanabi-realtime` | ✅ extend | ⬜ pending |
| (filled by planner) | | | RT-05 | — | No resume-specific outbound path; heartbeat does not pass through `#send` | structural | `npx vitest run --project worker source-structure` | ✅ extend | ⬜ pending |
| (filled by planner) | | | RT-06 | — | N/A | e2e + integration | `npx playwright test hanabi-realtime` | ✅ extend | ⬜ pending |
| (filled by planner) | | | RT-08 | — | Second tab never duplicates or corrupts the seat | e2e + integration | `npx playwright test seat-takeover` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/worker/tsconfig.json`: expose the experimental workers-types auto-response declarations (blocks `tsc -b`)
- [ ] Spike test proving `wrangler dev` answers a `setWebSocketAutoResponse` ping without invoking `onMessage`
- [ ] `docs/manual-checks/mobile-background.md`: manual check for 10+ minutes backgrounded on a real phone

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real phone tab backgrounded or locked for 10+ minutes rejoins the same seat | RT-04 | Real OS tab suspension cannot be faithfully faked in CI | `docs/manual-checks/mobile-background.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
