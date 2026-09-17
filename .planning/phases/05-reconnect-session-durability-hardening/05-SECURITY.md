---
phase: 5
slug: reconnect-session-durability-hardening
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-17
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> RoomDO WebSocket | Untrusted text frames, including the raw heartbeat literal | Client messages, `__ping__` literal (no state) |
| Cloudflare runtime auto-response -> browser | Runtime-generated pong that bypasses DO code | `__pong__` literal (no state) |
| wrangler env vars -> RoomDO | Deploy-time timing overrides (test only) | Numeric config, clamped |
| server -> browser WebSocket | Server frames; client stays a renderer of server views | Per-seat redacted views |
| tab <-> tab (same browser profile) | Two tabs share one localStorage seat token | Seat token |
| store view -> rendered UI / user click -> socket send | UI renders redacted views; actions gated while degraded | Actions with actionId |
| test harness -> dev servers | Test-only timing overrides via env/--var | Numeric config |
| owner reply -> planning record | Human evidence entering the repository | Verbatim owner text |
| production config -> deployed app | Test timing vars must be absent in production | Numeric config |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Information Disclosure | heartbeat pong frame | mitigate | Fixed literal via `setWebSocketAutoResponse`; source-structure P5-1/P5-2 prove it never passes through `#send` | closed |
| T-05-02 | Denial of Service | ping flood | accept | Runtime answers without waking the DO (room-do.ts `onStart`) | closed |
| T-05-03 | Tampering | stray/malformed ping reaching onMessage | mitigate | `isHeartbeatPing` early return in `onMessage` (WR-04 fix, replaces plan's bad_request design); other malformed input still rejected by `parseClientMessage` | closed |
| T-05-04 | Elevation of Privilege | second writer path via heartbeat | mitigate | source-structure P5-3 re-asserts single-writer counts | closed |
| T-05-05 | Tampering | stale onClose flipping winner's seat | mitigate | `#disconnectSeat` CR-01 live-owner guard; detach-before-close; P5-5; D-12 socket test | closed |
| T-05-06 | Denial of Service | false-positive sweep disconnect | mitigate | `SOCKET_STALE_MS` 75s, `boundAt` grace, non-terminal close 4003 | closed |
| T-05-07 | Denial of Service | chatty traffic deferring sweep | mitigate | Sweep runs on every alarm from live state + `resolveAlarmWrite` overdue guard (CR-01/WR-01 fix, replaces in-memory memo); grid-aligned dueAt; Pitfall-3 integration test | closed |
| T-05-08 | Denial of Service | sweep storage/wake cost | mitigate | No-op sweeps skip save/push; `zombie_sweep` scheduled only while a seat is connected | closed |
| T-05-09 | Elevation of Privilege | timing overrides | accept | Deployer-set vars only; parser floors at 500ms with fallback; none committed in wrangler.jsonc | closed |
| T-05-10 | Tampering | sweep mutating game state | mitigate | source-structure P5-7; D-08 integration test | closed |
| T-05-11 | Tampering | stale action replay after reconnect | mitigate | `maxEnqueuedMessages: 0`; disabled controls; `act()`/`send()` guards; Phase 4 actionId dedup | closed |
| T-05-12 | Denial of Service | two-tab supersede loop | mitigate | `stopReconnectingRef` checked on every automatic path; latch set from 4001 close code (WR-03); e2e negative window | closed |
| T-05-13 | Spoofing | reclaim presenting another seat | accept | `reclaimSeat` replays only this browser's token via unchanged join path | closed |
| T-05-14 | Information Disclosure | stale view while reconnecting | accept | Same seat's already-redacted view, display only | closed |
| T-05-15 | Denial of Service | NEXT_PUBLIC override in production | mitigate | Client parser floors at 250ms with fallback; not in committed config | closed |
| T-05-16 | Tampering | actions on stale view | mitigate | Disabled controls, `act()` guard, RoomClient `send()` guard | closed |
| T-05-17 | Denial of Service | Use-this-tab double click | mitigate | `reclaiming` state disables the button | closed |
| T-05-18 | Information Disclosure | per-seat status rendering | accept | `connected` already in every seat view since Phase 1 | closed |
| T-05-19 | Repudiation | misleading disconnected alarm | mitigate | `isSeatConnected` defaults unknown seats to connected; muted styling | closed |
| T-05-20 | Tampering | e2e overrides leaking to production | mitigate | Override vars appear only in playwright.config.ts | closed |
| T-05-21 | Spoofing | second tab duplicating/stealing seat | mitigate | e2e RT-08 asserts one hand with the same seatId before/after reclaim (18/18 recorded after fixes; not re-executed during audit — user dev server held the Next dev lock) | closed |
| T-05-22 | Repudiation | flaky proof masking regression | mitigate | Bounded timeouts; WR-06 fix makes the frozen-tab test depend on the visibility path | closed |
| T-05-23 | Repudiation | fabricated sign-off | mitigate | Owner waiver quoted verbatim in docs/manual-checks/mobile-background.md; real-device leg recorded as outstanding | closed |
| T-05-24 | Denial of Service | test timing vars in production | mitigate | No deploy this phase; no override vars in committed config. Live Cloudflare/Vercel dashboard state not verifiable from code — confirm at deploy | closed |
| T-05-25 | Tampering | unreviewed deploy/push | mitigate | No push (local ahead of origin/main); deploy documented as owner action | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02 | Ping answered by runtime auto-response without DO JS or storage; Cloudflare edge limits apply | Plan 05-01 threat model | 2026-09-16 |
| AR-05-02 | T-05-09 | Timing overrides are deployer-controlled wrangler vars, clamped and falling back on garbage | Plan 05-02 threat model | 2026-09-16 |
| AR-05-03 | T-05-13 | Reclaim can only replay the browser's own stored token; server token validation unchanged | Plan 05-03 threat model | 2026-09-16 |
| AR-05-04 | T-05-14 | Kept view is the seat's own redacted view; nothing new revealed | Plan 05-03 threat model | 2026-09-16 |
| AR-05-05 | T-05-18 | Connection status is already public in every seat view | Plan 05-04 threat model | 2026-09-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-17 | 25 | 25 | 0 | gsd-security-auditor (verified current post-review-fix code; npm test 503/503, tsc clean; Playwright checks corroborated from recorded runs) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-17
