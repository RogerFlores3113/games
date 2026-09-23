---
phase: 5
slug: reconnect-session-durability-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 05-02 T3, 05-03 T1/T2, 05-05 T2, 05-06 T2 | 05-02, 05-03, 05-05, 05-06 | 2, 2, 5, 5 | RT-04 | — | Reconnect returns the same seat only for a valid token | integration + e2e | `npx vitest run --project worker room-do` / `npx playwright test hanabi-realtime` | ✅ extend | ✅ green (automated) — manual real-device leg (05-06 T2) explicitly WAIVED by owner 2026-09-16, see docs/manual-checks/mobile-background.md Log; deferred to re-run after Phase 6/7 UI is finalized |
| 05-01 T3, 05-02 T2/T3 | 05-01, 05-02 | 1, 2 | RT-05 | — | No resume-specific outbound path; heartbeat does not pass through `#send` | structural | `npx vitest run --project worker source-structure` | ✅ extend | ✅ green |
| 05-02 T3, 05-04 T1/T2, 05-05 T2 | 05-02, 05-04, 05-05 | 2, 4, 5 | RT-06 | — | N/A | e2e + integration | `npx playwright test hanabi-realtime` | ✅ extend | ✅ green |
| 05-02 T3, 05-03 T2, 05-04 T3, 05-05 T3 | 05-02, 05-03, 05-04, 05-05 | 2, 2, 4, 5 | RT-08 | — | Second tab never duplicates or corrupts the seat | e2e + integration | `npx playwright test seat-takeover` | ✅ extend | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/worker/tsconfig.json`: expose the experimental workers-types auto-response declarations (blocks `tsc -b`)
- [x] Spike test proving `wrangler dev` answers a `setWebSocketAutoResponse` ping without invoking `onMessage`
- [x] `docs/manual-checks/mobile-background.md`: manual check for 10+ minutes backgrounded on a real phone (doc written and gate-verified 05-06 T1; owner waived the live real-device run itself 2026-09-16 — see Manual-Only Verifications below)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| A real phone tab backgrounded or locked for 10+ minutes rejoins the same seat | RT-04 | Real OS tab suspension cannot be faithfully faked in CI | `docs/manual-checks/mobile-background.md` | WAIVED by owner 2026-09-16 — verbatim: "just skip. we can do the phone check once the game is entirely finalized and polished and ui done." Deferred; re-run this check once Phase 6 (board rewrite) and Phase 7 (variants/polish) UI is finalized. The literal 10+ minute real-device proof for RT-04 is NOT recorded as passing — only the automated CDP-freeze + network-drop proxy (05-05) is. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — owner explicitly waived the real-phone manual check (verbatim reply recorded in docs/manual-checks/mobile-background.md's Log on 2026-09-16); all automated coverage (npm test 490/490, npx playwright test 18/18, per-package tsc -b) is green. The manual real-device leg of RT-04 remains outstanding/deferred, not passing — see docs/manual-checks/mobile-background.md and 05-06-SUMMARY.md.
