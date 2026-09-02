---
phase: 1
slug: room-transport-skeleton
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (root config using `projects`), Playwright 1.6x for E2E, fast-check 4.x for property tests |
| **Config file** | `vitest.config.ts` at repo root — **does not exist yet, Wave 0 creates it** |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~30 seconds (unit sub-second; Playwright dominates) |

> **Vitest 4 note:** `vitest.workspace.ts` was REMOVED in Vitest 4. Monorepo test discovery must use the `projects` field inside the root `vitest.config.ts`. Following older guidance silently discovers zero tests.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` (or the single relevant `--project`)
- **After every plan wave:** Run `npx vitest run` (all projects) + the Playwright specs covering that wave's surface
- **Before `/gsd:verify-work`:** Full suite green, PLUS the three manual-only checks (RT-02, FDN-03, FDN-04) walked and documented
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | N/A | setup | `npx vitest run` (exits 0, discovers projects) | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | FDN-01 | — | Adapter takes an action *request*, never a state patch | unit | `npx vitest run packages/rules` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | ROOM-05 | T-1-04 | Variant locks at game start; client cannot re-assert it | unit | `npx vitest run apps/worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | ROOM-03 | — | Display-name suffixing is display-only; seat ID is authority | unit | `npx vitest run apps/worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | RT-07 | T-1-01 | Seat token is server-minted, long `nanoid`; possession-checked server-side on every connect | unit | `npx vitest run apps/worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | ROOM-08 | — | Unified single-slot alarm scheduler; no independent `setAlarm` calls | unit (fake timers) | `npx vitest run apps/worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | ROOM-06 | T-1-04 | Start gated 2–5 seated, host-only, server-authoritative | unit | `npx vitest run apps/worker` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | ROOM-01 | — | Room code is short/speakable; seat token is NOT | unit + E2E | `npx playwright test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | ROOM-02 | T-1-03 | Join requires no account; inbound msgs Zod-validated | E2E | `npx playwright test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | ROOM-04 | — | Per-seat connection status broadcast live | E2E (2 clients) | `npx playwright test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | ROOM-07 | — | In-progress arrival blocked with a message, no partial state | E2E | `npx playwright test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are filled in by the planner; waves above are the research's expected shape, not a binding assignment.*

---

## Wave 0 Requirements

- [ ] `npm install -D vitest fast-check @playwright/test` at repo root
- [ ] `vitest.config.ts` at repo root using the `projects` field (NOT `vitest.workspace.ts` — removed in Vitest 4)
- [ ] `playwright.config.ts` targeting a locally-run `wrangler dev` + `next dev` pair
- [ ] `apps/worker/src/*.test.ts` stubs — seat-naming, room-state, alarm-scheduler, seat-reclaim
- [ ] `packages/rules/src/adapter.test.ts` — conformance test proving the counter-game satisfies `applyAction` / `toPlayerView` / `checkGameEnd`
- [ ] `docs/manual-checks/cold-start.md` — the RT-02 manual procedure and its audit log

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold link click after a week of total inactivity connects within seconds, no manual step | RT-02 | D-04: real elapsed idle time cannot be faked in CI | 1. Deploy `apps/web` (Vercel) + `apps/worker` (`wrangler deploy`). 2. Do not touch either deployment or open any room for **≥7 days real elapsed time**. 3. From a never-visited browser (incognito), open a room link. 4. Time click → rendered, connected lobby. Confirm (a) succeeds with no redeploy/restart, (b) wait is a couple seconds, not tens. 5. Append date, elapsed idle, observed wait to `docs/manual-checks/cold-start.md`. |
| Whole stack runs on free tiers, no paid plan or stored payment method | FDN-03 | Requires reading Cloudflare + Vercel billing dashboards | Open Cloudflare Workers billing and Vercel billing; confirm both show a free plan with no payment method required to stay reachable. Record in `docs/manual-checks/`. |
| `games.rogerflores.dev` resolves to the deployed app | FDN-04 | DNS propagation + dashboard actions the agent cannot perform | Add the domain in the Vercel project, set the DNS record at the registrar, wait for propagation, load `https://games.rogerflores.dev` in a browser and confirm the room-creation screen renders over TLS. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
