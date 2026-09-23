---
phase: 1
slug: room-transport-skeleton
status: approved
nyquist_compliant: true
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

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 0 | FDN-01 | — | Test harness + deploy-shape smoke (retires RESEARCH A3) | setup | `npx vitest run` · `wrangler deploy --dry-run` | ❌ W0 | ⬜ pending |
| 01-02 | 1 | FDN-01 | — | Adapter takes an action *request*, never a state patch; no whole-state serializer | unit | `npx vitest run --project rules` | ❌ W0 | ⬜ pending |
| 01-03 | 1 | ROOM-02, ROOM-05, ROOM-07, RT-07 | V5 | Zod-validate every inbound message before dispatch; room code and seat token are distinct branded types | unit | `npx vitest run --project schema` | ❌ W0 | ⬜ pending |
| 01-04 | 2 | ROOM-03, ROOM-05, ROOM-06, ROOM-07, FDN-01 | V4 | Server-authoritative room state; start gated 2–5 seated, host-only; variant locks at start | unit | `npx vitest run --project worker` | ❌ W0 | ⬜ pending |
| 01-05 | 2 | RT-07 | V3, V4 | Seat token server-minted, 24-char nanoid, validated server-side every connect | unit | `npx vitest run --project worker` | ❌ W0 | ⬜ pending |
| 01-06 | 2 | ROOM-08 | — | Unified single-slot timer table; pure scheduler makes alarm clobbering impossible by construction | unit (explicit timestamps) | `npx vitest run --project worker` | ❌ W0 | ⬜ pending |
| 01-07 | 3 | ROOM-04, ROOM-07, ROOM-08, RT-07, FDN-01 | V3, V4, V5 | Single `setAlarm` call site; `toSeatView` chokepoint (no shared-state broadcast); forged-token rejection; **D-17 restart durability via forced DO eviction** | integration (live WS) | `npx vitest run --project worker` | ❌ W0 | ⬜ pending |
| 01-08 | 2 | ROOM-01, ROOM-05 | — | Lazy DO creation; `@theme` dark tokens (D-16), no light-mode default | unit + build | `npx vitest run` · `npm run build --workspace apps/web` | ❌ W0 | ⬜ pending |
| 01-09 | 4 | ROOM-01, ROOM-02, ROOM-04, ROOM-06, ROOM-07 | V3 | Live seat list + connection status; superseded-tab notice (D-08); no ready toggle (D-10) | build + **human-verify (13 steps)** | `npx vitest run && npm run build` | ❌ W0 | ⬜ pending |
| 01-10 | 5 | ROOM-01, ROOM-02, ROOM-04, ROOM-06, ROOM-07, RT-07 | V3, V4 | Adversarial forged-seat-token E2E proves RT-07 with an executable attacker | E2E | `npx playwright test` | ❌ W0 | ⬜ pending |
| 01-11 | 6 | RT-02, FDN-03, FDN-04 | — | N/A — deploy, DNS, billing verification | **manual-only** | N/A — see Manual-Only Verifications | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Synced against the 11 finalized plans on 2026-09-02.*

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-02 — synced against the 11 finalized plans; gsd-plan-checker confirmed no `--watch` flags and no 3-consecutive-tasks-without-automated-verify.
