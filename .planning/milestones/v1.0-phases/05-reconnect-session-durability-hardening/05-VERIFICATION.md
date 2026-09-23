---
phase: 05-reconnect-session-durability-hardening
verified: 2026-09-16T16:20:00Z
status: human_needed
score: 4/4 must-haves verified (code/structural/unit level); 1 human verification item outstanding (owner-waived, deferred)
overrides_applied: 0
human_verification:
  - test: "Real phone backgrounded/locked for 10+ minutes mid-game, per docs/manual-checks/mobile-background.md"
    expected: "Phone resumes the same seat, same turn, same hand, with no reload; laptop shows Disconnected/Waiting-for-X-disconnected while the phone is away and pause-in-place (unchanged clue tokens/deck count); Use this tab reclaim works without seat duplication"
    why_human: "Real OS-level tab suspension on a physical device cannot be faithfully reproduced by CDP freeze + setOffline in CI (RESEARCH.md Pitfall 4 / Assumption A2). The owner explicitly waived this check for now (verbatim: \"just skip. we can do the phone check once the game is entirely finalized and polished and ui done.\"), recorded in docs/manual-checks/mobile-background.md's Log and 05-VALIDATION.md. This is a deliberate, recorded deferral, not a fabricated pass — the literal 10+-minute real-device proof for RT-04 remains outstanding."
---

# Phase 5: Reconnect / Session Durability Hardening Verification Report

**Phase Goal:** The failure modes that a quick manual-refresh test does not surface — a mobile tab backgrounded for many minutes during a voice call, two tabs open to one seat — are explicitly exercised and hardened, since this is the expected usage pattern for this project, not a corner case.

**Verified:** 2026-09-16T16:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Important context for this verification

A code review (`05-REVIEW.md`) found 2 critical + 6 warning issues in the as-executed Phase 5 code (a zombie-sweep alarm-loop bug, a missed "seat marked connected with no live socket" case, an over-eager alt-tab reconnect, a latch race, a stray-error-frame bounce, and under-tested paths). All 8 in-scope findings were subsequently fixed (`05-REVIEW-FIX.md`, commits `b660ae7`..`972c41b`), which materially changed `room-do.ts`, `heartbeat.ts` (both worker and web), and `room-socket.ts` **after** the plan SUMMARYs were written. This verification reads the current code (post-fix), not the SUMMARYs' narration of the original implementation, per the task instructions.

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|------|--------|----------|
| 1 | Dropped/backgrounded 10+ min player reconnects to same seat and resumes | ⚠️ PARTIAL — VERIFIED at code/automated level; real-device 10+ min proof explicitly waived by owner | Server: `apps/worker/src/room-do.ts` zombie sweep (onAlarm `zombie_sweep` branch) detects half-open sockets via `getWebSocketAutoResponseTimestamp` + `boundAt`, closes with non-terminal `STALE_SOCKET_CLOSE_CODE` (4003), and CR-02 fix also reaps seats left `connected:true` with no live socket at all (`orphanedConnectedSeatIds`, heartbeat.ts:79-84). Client: `apps/web/lib/room-socket.ts` force-reconnects on `visibilitychange`/`online` via `resumeAction` (heartbeat.ts:76-98), now WR-02/WR-05-fixed to only force-reconnect a healthy OPEN socket when silence exceeds `SOCKET_STALE_MS` (not a 30s alt-tab false positive), and reconnect replays the same stored seat token via the unchanged `onOpen` join path. Unit tests (`npm test`, self-run: 503/503 green) exercise all of this. The literal "10+ minutes on a real phone" claim is NOT independently proven — the owner waived it verbatim, recorded in `docs/manual-checks/mobile-background.md`'s Log ("just skip. we can do the phone check once the game is entirely finalized and polished and ui done.") and `05-VALIDATION.md` explicitly states "The literal 10+ minute real-device proof for RT-04 is NOT recorded as passing." |
| 2 | Reconnect uses the exact same state-delivery function as fresh join | ✓ VERIFIED | `apps/worker/src/room-do.ts` `#viewFor` is the sole `projectSeatView` call site (source-structure P5 audit, `apps/worker/src/source-structure.test.ts`, self-run: 25/25 passed); both `#handleJoin`'s `joined` frame and `#pushState`'s `state` frame route through it. `apps/worker/src/source-structure.test.ts` also asserts zero occurrences of any `resume`/`reconnected` frame type across worker sources and `packages/schema/src/messages.ts` — there is no separate resume serializer. |
| 3 | Remaining players see a clear disconnected indicator and game pauses in place | ✓ VERIFIED | `apps/web/lib/hanabi-board-logic.ts` exports `isSeatConnected`/`turnIndicatorText` (em-dash "— disconnected" suffix); `apps/web/components/HanabiBoard.tsx` renders `seat-status-{seatId}` with `data-connected` for every hand (own and other) and disables all action controls while `reconnecting`. Pause-in-place is enforced structurally: `source-structure.test.ts` P5-7 forbids `transferHost`/`releaseSeat`/`applyGameAction` inside the `zombie_sweep` onAlarm branch, and the branch only calls `markConnected` via `#disconnectSeat`. |
| 4 | Second tab for an already-connected seat does not corrupt or duplicate seat state | ✓ VERIFIED | `#handleJoin`'s CR-01-guarded supersede detaches (`setState(null)`) the losing connection before closing it with `SUPERSEDED_CLOSE_CODE`; `#disconnectSeat`'s `liveOwner` guard refuses to flip a seat a different live connection now holds. Client: `apps/web/app/room/[code]/RoomClient.tsx` renders `use-this-tab-button` calling `reclaimSeat()` (room-socket.ts), and WR-03's fix latches `stopReconnectingRef` from the 4001 close code itself (not only the parsed frame), closing the two-tab auto-ping-pong risk the reviewer identified. |

**Score:** 4/4 truths hold at the code/structural/unit-test level; truth #1's literal "10+ minutes, real phone" clause is explicitly deferred by the owner, not verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/schema/src/constants.ts` | HEARTBEAT_PING/PONG, timing constants, STALE_SOCKET_CLOSE_CODE | ✓ VERIFIED | All 7 named exports present with invariant tests |
| `apps/worker/src/heartbeat.ts` | resolveHeartbeatTiming, socketLastSeenAt, isSocketStale, orphanedConnectedSeatIds, resolveAlarmWrite, isHeartbeatPing | ✓ VERIFIED | All present; `resolveAlarmWrite`/`orphanedConnectedSeatIds`/`isHeartbeatPing` were added post-review (CR-01/CR-02/WR-04) and are wired into `room-do.ts` |
| `apps/worker/src/room-do.ts` | zombie sweep, shared `#disconnectSeat`, CR-01/CR-02-fixed alarm logic | ✓ VERIFIED | Read in full; sweep decided from live state every alarm firing (not from a possibly-stale persisted table), orphaned-seat detection present, `#syncAlarm` routes through `resolveAlarmWrite` |
| `apps/web/lib/heartbeat.ts` | resolveClientHeartbeatTiming, resumeAction, isPongOverdue | ✓ VERIFIED | `resumeAction` WR-02/WR-05-fixed: CONNECTING → none, CLOSING/CLOSED → reconnect, OPEN → ping unless silence > socketStaleMs |
| `apps/web/lib/room-socket.ts` | heartbeat, resume listeners, no-queue, reclaimSeat, WR-03/WR-04 fixes | ✓ VERIFIED | `maxEnqueuedMessages: 0`, `send(HEARTBEAT_PING)` raw literal, visibility/online listeners call `resumeAction`, latch set from close code (WR-03), stray error frames gated by `joinReplyPendingRef` (WR-04) |
| `apps/web/components/HanabiBoard.tsx`, `Lobby.tsx`, `ReconnectingBanner.tsx` | per-seat status, reconnecting banner, disabled controls | ✓ VERIFIED | `seat-status-`, `turnIndicatorText(`, `reconnecting-banner`, `|| reconnecting` disables all confirmed by grep and read |
| `apps/app/room/[code]/RoomClient.tsx` | `use-this-tab-button`, reconnecting prop wiring | ✓ VERIFIED | `reclaimSeat()` wired to button; `reconnecting={status === "reconnecting"}` passed to both Board and Lobby |
| `e2e/hanabi-realtime.spec.ts`, `e2e/seat-takeover.spec.ts` | RT-04/RT-06/RT-08 browser proofs | ✓ EXISTS, content verified by reading; **execution not independently reproduced this session** (see Data-Flow / Spot-Check notes below) |
| `docs/manual-checks/mobile-background.md` | Real-phone manual check with Log | ✓ VERIFIED | Full 5-section structure present; Log row recorded with owner's verbatim waiver, dated 2026-09-16 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `room-do.ts onAlarm` | `heartbeat.ts` | `isSocketStale(socketLastSeenAt(...))` | ✓ WIRED | Confirmed in current onAlarm zombie_sweep branch |
| `room-do.ts onClose` + `onAlarm` | `#disconnectSeat` | shared CR-01-guarded helper | ✓ WIRED | Both call sites present; `markConnected(` appears exactly once (inside `#disconnectSeat`) |
| `room-socket.ts` | `heartbeat.ts` (web) | `resumeAction`/`isPongOverdue` | ✓ WIRED | Both imported and called in resume effect and `sendPing`'s pong-timeout check |
| `HanabiBoard.tsx` | `hanabi-board-logic.ts` | `turnIndicatorText(game, view.seats, labelFor)` | ✓ WIRED | Confirmed at line 142 |
| `RoomClient.tsx` | `room-socket.ts reclaimSeat` | Use this tab onClick | ✓ WIRED | Confirmed |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit/integration suite | `npm test` (self-run) | 503/503 tests passed, 44 files | ✓ PASS |
| Type-check | `npx tsc -b apps/web packages/rules packages/schema apps/worker` (self-run) | exit 0 | ✓ PASS |
| Structural audit (P5-1..P5-7) | `npx vitest run --project worker source-structure` (self-run) | 25/25 passed | ✓ PASS |
| Playwright e2e suite | `E2E_WEB_PORT=3101 E2E_WORKER_PORT=8788 npx playwright test` (self-run, this session) | **Could not execute**: Next.js refuses a second `next dev` instance for the `apps/web` directory whenever *any* `next dev` is already running for that directory, regardless of the port requested — the user's own dev server (port 3000, per git-status context) blocked every alternate-port attempt. This lockfile behavior is directory-scoped, not port-scoped, and is independently documented as a known issue in `05-05-SUMMARY.md`'s own key-decisions section. Per the task's explicit instruction not to kill the user's dev servers, e2e execution was not forced. | ? SKIP (environment, not a code defect) |

**On the e2e gap:** `05-REVIEW-FIX.md` states the fixer independently ran `npx playwright test` on the same alternate ports after the WR-06 commit and reports "The full `npx playwright test` run passed (18 tests)". I could not reproduce that run this session due to the pre-existing dev-server lock. I did read every relevant e2e spec file, the helpers, and the components/hooks the specs exercise, and the wiring is internally consistent with the specs' assertions (testids match, close-code/latch logic matches, disabled-control logic matches). This is a **WARNING**, not a BLOCKER: the unit/structural/tsc layers are self-verified green, and the e2e code itself is sound on inspection, but a fresh, independent e2e run should be done once the stray dev server is free (documented here for the human record rather than silently assumed).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| RT-04 | 05-02, 05-03, 05-05, 05-06 | A player who loses connection or whose mobile tab is suspended rejoins their same seat and resumes the game in progress | ⚠️ SATISFIED (automated) / human-verification outstanding | Zombie sweep + client resume logic verified; real-device 10+ min proof waived by owner |
| RT-05 | 05-01, 05-02 | Reconnecting uses the same state-delivery path as initial join | ✓ SATISFIED | `#viewFor`/`projectSeatView` single-path structural proof |
| RT-06 | 05-02, 05-04, 05-05 | Remaining players see a clear disconnected indicator; game pauses in place | ✓ SATISFIED | `seat-status-*`, turn-text, P5-7 pause-in-place structural proof |
| RT-08 | 05-02, 05-03, 05-04, 05-05 | A second tab does not corrupt or duplicate a seat | ✓ SATISFIED | CR-01 guard, supersede + reclaim path, WR-03 latch fix |

No orphaned requirements found — REQUIREMENTS.md's Phase 5 row set (RT-04, RT-05, RT-06, RT-08) matches exactly what the six plans (05-01..05-06) declare in their `requirements:` frontmatter.

### Anti-Patterns Found

No blocking debt markers (`TBD`/`FIXME`/`XXX`) found in the Phase 5 files read. No stub patterns, empty handlers, or hardcoded-empty renders found in the reconnect-critical files (`room-do.ts`, `heartbeat.ts` x2, `room-socket.ts`, `HanabiBoard.tsx`, `RoomClient.tsx`, `Lobby.tsx`).

**Info-level finding, not a Phase 5 blocker:** `05-REVIEW-FIX.md`'s "Notes for the developer" section documents a *pre-existing* (not introduced by Phase 5) bounded (~30s) alarm re-arm loop that can occur in a lobby where the host is disconnected and no seat is connected (`transferHost` becomes a no-op, the recomputed `host_transfer` due time is already past, and `onAlarm` re-arms it in the past until `seat_release` fires ~30s later). This does not affect RT-04/05/06/08 and was correctly left out of this phase's scope by the fixer — noting it here per the task's explicit request to assess relevance. It is bounded in time and self-resolving, so it does not block Phase 5's goal.

### Human Verification Required

### 1. Real-phone 10+ minute background/lock check (RT-04)

**Test:** Follow every numbered step in `docs/manual-checks/mobile-background.md` with a real phone and a laptop against production, backgrounding/locking the phone for 10+ minutes by stopwatch.
**Expected:** Phone returns to the exact same seat, same turn, same hand/clue/deck state, without a reload; laptop shows "Disconnected" / "Waiting for {name} — disconnected" while the phone is away and nothing about the game changes; "Use this tab" reclaim works with no duplicate hand.
**Why human:** Real OS-level tab suspension cannot be faithfully reproduced by CDP freeze + `setOffline` in CI (documented gap in RESEARCH.md Pitfall 4 / Assumption A2, and empirically confirmed in 05-05: a bare CDP freeze did not reliably stop the client's heartbeat interval in the installed Chromium). The owner has already been asked and explicitly deferred this ("just skip. we can do the phone check once the game is entirely finalized and polished and ui done."), which is a legitimate, recorded decision — but it means the literal "10+ minutes on a mobile device" success-criterion clause remains open, not passed. This item should be re-surfaced for a human check after Phase 6/7's UI work lands, per the deferral note in `docs/manual-checks/mobile-background.md`'s own "When to re-run" section.

### 2. Independent e2e re-run

**Test:** Run `E2E_WEB_PORT=3101 E2E_WORKER_PORT=8788 npx playwright test` (or equivalent free ports) once no other `next dev`/`wrangler dev` process is running for `apps/web`/`apps/worker`.
**Expected:** All 18 tests reported by `05-REVIEW-FIX.md` pass, in particular the two new "Phase 5 reconnect hardening" tests in `e2e/hanabi-realtime.spec.ts` and the new RT-08 test in `e2e/seat-takeover.spec.ts`.
**Why human:** This session's environment had a pre-existing `next dev` instance for `apps/web` (started outside this verification) that Next.js's directory-scoped dev-server lock refuses to share with a second instance regardless of the port requested, and the task instructions explicitly forbade stopping the user's dev servers. This is an environment limitation, not a code defect — code inspection shows the specs and the implementation they test are internally consistent — but an independent, fresh execution has not been captured by this verification pass.

### Gaps Summary

No BLOCKER-level gaps found. All four ROADMAP success criteria are implemented and hold at the unit/structural/type-check level, and the two critical + six warning code-review findings were verified fixed by direct code inspection (not just trusting the REVIEW-FIX narrative — every changed file was read and the fix logic traced). The phase's own explicit acknowledgment that the literal real-device 10+-minute proof is outstanding (owner-waived, not fabricated) is exactly the kind of honest self-reporting this verification is designed to check for, and it is preserved here as a human-verification item rather than silently upgraded to "passed." The e2e-execution gap in this session is an environment artifact (pre-existing dev server lock), not a code gap, and is listed as a second human-verification item for a clean re-run.

---

_Verified: 2026-09-16T16:20:00Z_
_Verifier: Claude (gsd-verifier)_
