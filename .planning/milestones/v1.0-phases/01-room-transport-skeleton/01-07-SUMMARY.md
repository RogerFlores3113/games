---
phase: 01-room-transport-skeleton
plan: 07
subsystem: infra
tags: [durable-objects, partyserver, websocket, hibernation, alarm-api, wrangler, integration-testing]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "apps/worker/src/room-state.ts pure state machine (Plan 04), seat-identity.ts RT-07/D-08 boundary (Plan 05), scheduler.ts unified alarm scheduler + persistence.ts versioned load/save (Plan 06), packages/schema wire protocol and RoomState/RoomView schemas (Plan 03)"
provides:
  - "apps/worker/src/room-do.ts: RoomDO extends partyserver Server<Env> — the only stateful component in the system, assembling all four Wave 2 pure modules behind onConnect/onMessage/onClose/onError/onStart/onAlarm"
  - "apps/worker/src/index.ts rewritten to route via routePartykitRequest at /parties/room/:code; Wave 0 smoke sentinels moved to /__smoke"
  - "apps/worker/src/room-do.test.ts: 9-test integration suite driving the real DO over real WebSockets against a spawned wrangler dev process, including a genuine forced-eviction restart-durability test (D-17)"
affects: [01-09-lobby-and-game-flow, 02-toy-game-redaction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "#viewFor is the sole literal toSeatView( call site in room-do.ts, wrapped once and reused by both the joined reply and #pushState, so grep -c 'toSeatView(' stays at exactly 1 even though the view is produced for two different message types"
    - "#commit(room, now) factors saveRoom + computeRoomTimers + #syncAlarm into one method so no call site can forget one of the three after a mutation"
    - "#syncAlarm reads ctx.storage.getAlarm() before ever calling setAlarm, and is the ONLY setAlarm call site in the file — the guard comment on it is deliberately marked as the most deletable-looking safety line, per the plan's own warning"
    - "Actor seat id is always resolved from the in-memory bindings connection map (never the message body) for set_variant/start_game/game_action/leave — the T-1-04 boundary is structural, not conventional"
    - "Integration tests wait on a message PREDICATE (type + shape), never an index or count — joined and the first state push can arrive in the same network tick well within a single polling interval, so 'the Nth message' or 'the most recent message' assumptions are a real race, not a hypothetical one"

key-files:
  created:
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-do.test.ts
    - .planning/phases/01-room-transport-skeleton/deferred-items.md
  modified:
    - apps/worker/src/index.ts
    - apps/worker/src/smoke.test.ts
    - e2e/smoke.spec.ts
    - vitest.config.ts
    - apps/worker/tsconfig.json
    - apps/worker/package.json
    - package-lock.json

key-decisions:
  - "Integration-test approach: spawn `npx wrangler dev` as a detached child PROCESS GROUP, not @cloudflare/vitest-pool-workers. The pool package (0.22.0) installs cleanly against wrangler@4.128.0/vitest@4.1.11, but wiring it in as a second workerd-runtime Vitest project alongside the existing Node-runtime worker project (which 5 other test files depend on via the cloudflare:workers shim) was judged a materially larger harness change than this plan's glue-only scope warranted. Verified installable, then reverted to keep footprint minimal."
  - "D-17 restart test kills the wrangler dev process GROUP via `process.kill(-pid, 'SIGKILL')`, not just the immediate npx child — npx fans out into wrangler's CLI -> the workerd binary that actually holds the port; killing only npx left workerd alive and bound, which would have made a killed-and-respawned test silently pass against the OLD process (a false positive worse than no test). Confirmed via `lsof`/`ps` that the full tree is gone after killAndWait."
  - "Origin allowlist: https://games.rogerflores.dev (production), http://localhost:3000 and http://127.0.0.1:3000 (Next dev). A request with NO Origin header is allowed through (defense-in-depth, not the confidentiality control — per-seat projection is)."
  - "Wave 0 smoke sentinels moved from the root path to a dedicated /__smoke path in index.ts, since routePartykitRequest now owns / and any unmatched path returns 404 — preserves the Task 1 bundle-resolution grep and the Playwright worker smoke test without a second serializer or routing hack."
  - "apps/worker/tsconfig.json's types array widened to include \"node\" alongside \"@cloudflare/workers-types\" — the integration test needs node:child_process/fs/os/path, and this combination type-checks with zero global conflicts (fetch/Response/WebSocket etc. did not collide)."

patterns-established:
  - "Every outbound RoomView is produced by a single wrapper method (#viewFor) around the room layer's toSeatView — Phase 2's HIDE-02 redaction hardening has exactly one call site to touch, not two, despite two different message types (joined, state) needing a view."
  - "Integration tests for future plans (09 lobby/game-flow, later reconnect hardening) can reuse this room-do.test.ts's spawn/kill/predicate-wait harness pattern directly — openSocket/collectMessages/waitFor are generic to any RoomDO WebSocket flow, not specific to these 9 assertions."

requirements-completed: [ROOM-04, ROOM-07, ROOM-08, RT-07, FDN-01]

# Metrics
duration: ~25min
completed: 2026-09-02
---

# Phase 1 Plan 7: Room & Transport Skeleton — Room Durable Object Summary

**Assembled the four Wave 2 pure modules into `RoomDO`, a hibernation-enabled `partyserver` Durable Object with exactly one alarm writer and one outbound view serializer, proven live over real WebSockets against a spawned `wrangler dev` process — including a restart test that kills and respawns the whole process tree to prove D-17 persistence survives genuine eviction, not just a closed socket.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-02T16:19:00Z
- **Tasks:** 3 (all auto)
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- `RoomDO extends Server<Env>` wires `onConnect`/`onMessage`/`onClose`/`onError`/`onStart`/`onAlarm` directly onto the nine pure `room-state.ts` functions, `seat-identity.ts`'s token resolution/rebinding, `scheduler.ts`'s timer table, and `persistence.ts`'s versioned load/save — no new business logic, exactly the "thin glue" the plan called for
- Exactly one `ctx.storage.setAlarm` call site (`#syncAlarm`, guarded by a `getAlarm()` comparison) and exactly one literal `toSeatView(` call site (wrapped once in `#viewFor`, reused by both the `joined` reply and `#pushState`) — both grep-verified per the plan's own top-level `<verification>` block, which does NOT exclude comments (two doc-comment wordings had to be adjusted to avoid tripping the count)
- `onAlarm` drains ALL due timers in one wake (not just the earliest), transfers host, releases lobby seats, and self-destructs abandoned rooms via `ctx.storage.deleteAll()` without rescheduling (ROOM-08) — wrapped in try/catch so one bad event can't permanently disarm a room's GC
- 9-test integration suite (`room-do.test.ts`) drives a real `wrangler dev` instance over real WebSockets: ROOM-04 live connection status, per-seat projection with raw-byte seat-token-leak assertions, RT-07/D-08 reclaim + supersede + close 4001, RT-07 fabricated-token rejection, ROOM-07/D-14 in-progress refusal, three robustness cases (malformed input keeps the socket alive), and D-17 restart durability via a genuinely killed-and-respawned process
- Full `apps/worker` suite: 74/74 tests passing in ~4s; full repo suite: 125/125 in ~4s; `wrangler deploy --dry-run` bundles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement RoomDO connection lifecycle and message dispatch** — `ae04434` (feat) — also includes Task 2's `onAlarm` implementation (see Deviations)
2. **Task 2: Implement the unified onAlarm handler and room self-destruction** — implemented and verified as part of `ae04434`; no separate commit was needed since the file was written as one coherent class in Task 1 (see Deviations, mirrors Plan 05's precedent)
3. **Task 3: Integration-test RoomDO against a live wrangler dev instance** — `f8fcccd` (test)
4. **Fix: reword a comment tripping the plan's own broadcast-forbidden grep** — `8e8b305` (fix)

## Files Created/Modified

- `apps/worker/src/room-do.ts` — `RoomDO extends Server<Env>`: connection lifecycle, message dispatch, `#commit`/`#syncAlarm`/`#pushState`/`#viewFor` private helpers, `onAlarm` unified timer drain + idle-GC self-destruction
- `apps/worker/src/index.ts` — rewritten to `routePartykitRequest`-based routing; Wave 0 sentinels moved to `/__smoke`
- `apps/worker/src/room-do.test.ts` — 9-test integration suite against a spawned `wrangler dev` process
- `apps/worker/src/smoke.test.ts`, `e2e/smoke.spec.ts` — updated to hit `/__smoke` instead of `/`
- `vitest.config.ts` — inlined `partyserver` in the worker project (Rule 3 fix: its own `cloudflare:workers` import bypassed the existing alias, since Vite externalizes node_modules deps by default) and raised `testTimeout`/`hookTimeout` for the network-bound integration suite
- `apps/worker/tsconfig.json` — widened `types` to include `node` alongside `@cloudflare/workers-types` (integration test needs `node:child_process`/`fs`/`os`/`path`)
- `apps/worker/package.json`, `package-lock.json` — added `@types/node@26.4.1` (exact pin) and a `test:integration` script
- `.planning/phases/01-room-transport-skeleton/deferred-items.md` — logs an out-of-scope Playwright `apps/web` dev-server anomaly discovered during final verification

## WebSocket URL Shape (for Plan 09's client)

`partyserver`'s `camelCaseToKebabCase` special-cases all-uppercase binding names (`"ROOM"` → `"room"`, not `"r-o-o-m"`), confirmed against the installed `partyserver@0.5.10` source. The room's WebSocket URL is:

```
ws(s)://<worker-host>/parties/room/<ROOM_CODE>
```

`partysocket` (Plan 09) should point at this path pattern directly.

## Decisions Made

- **Integration-test approach: spawned `wrangler dev` process, not `@cloudflare/vitest-pool-workers`.** The pool package installs cleanly (verified: `@cloudflare/vitest-pool-workers@0.22.0` against `wrangler@4.128.0`/`vitest@4.1.11`, no peer conflicts), but wiring it in as a second, workerd-runtime Vitest project alongside the existing Node-runtime `worker` project (which the other 5 `apps/worker` test files already depend on via the `cloudflare:workers` shim) was judged materially larger than this plan's glue-only scope. Installed, verified, then reverted in favor of the simpler spawn approach.
- **D-17 restart test kills the process GROUP, not just the immediate child.** `npx wrangler dev` fans out into `npx` → wrangler's CLI → the `workerd` binary that actually holds the port. An earlier attempt that killed only the `npx` process left `workerd` alive and still bound to the port — the next test run's `beforeAll` spawn then silently failed to bind, and the OLD process kept answering, producing message-ordering symptoms that looked like a RoomDO bug but were actually a leaked process. Fixed with `detached: true` at spawn plus `process.kill(-pid, "SIGKILL")` at teardown; confirmed clean via `ps`/`lsof` after every run.
- **Origin allowlist: `https://games.rogerflores.dev`, `http://localhost:3000`, `http://127.0.0.1:3000`.** A request with no `Origin` header is allowed through — defense-in-depth per RESEARCH.md Pitfall 7/T-1-05, not the confidentiality control (per-seat projection is).
- **Wave 0 smoke sentinels moved to `/__smoke`.** `routePartykitRequest` now owns the root path; an unmatched path falls through to 404. Moving the sentinels preserves both the Task 1 bundle-resolution proof and the Playwright worker smoke test without adding a second response-serializing code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `partyserver`'s own `cloudflare:workers` import bypassed the existing Vitest alias**
- **Found during:** Task 1, first `npx vitest run --project worker` after wiring `RoomDO extends Server<Env>`
- **Issue:** `partyserver`'s compiled JS itself does `import { DurableObject, env } from "cloudflare:workers"`. Vite/Vitest externalizes `node_modules` dependencies by default, which skips `resolve.alias` entirely for that import — so the existing `cloudflare:workers` → shim alias (Plan 01) only covered `apps/worker`'s own source, not this transitive import, and the worker test project failed with `Error: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'cloudflare:'`.
- **Fix:** Added `test.server.deps.inline: ["partyserver"]` to the worker project in `vitest.config.ts`, forcing `partyserver` through the same transform/alias pipeline as first-party source.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run --project worker` — all 6 pre-existing test files (65 tests) plus the new smoke assertion pass.
- **Committed in:** `ae04434` (Task 1 commit)

**2. [Rule 1 - Bug] Two separate literal-grep collisions between explanatory comments and the plan's own top-level `<verification>` checks**
- **Found during:** Task 1 (mid-implementation) and again after Task 3 (final full-plan verification pass)
- **Issue:** The plan's top-level `<verification>` block runs `grep -c 'setAlarm'`, `grep -c 'toSeatView('`, and `grep -c 'this.broadcast('` WITHOUT excluding comment lines (unlike Task 1's own acceptance criterion for `this.broadcast(`, which does exclude comments). Doc comments describing the file's own structural invariants used those literal strings in prose, inflating the counts past 1/1/0.
- **Fix:** Reworded three comments (two for `setAlarm`/`toSeatView(` during Task 1, one for `this.broadcast(` found in the final verification pass) to describe the invariant without using the exact literal call-site string.
- **Files modified:** `apps/worker/src/room-do.ts`
- **Verification:** `grep -c 'setAlarm'` → 1, `grep -c 'toSeatView('` → 1, `grep -c 'this.broadcast('` → 0, matching the plan's `<verification>` block exactly.
- **Committed in:** `ae04434` (first two), `8e8b305` (third, found during final re-verification after Task 3)

**3. [Rule 3 - Blocking] `apps/worker/tsconfig.json` had no Node ambient types, but the integration test needs `node:child_process`/`fs`/`os`/`path`**
- **Found during:** Task 3, first `npx tsc --noEmit -p apps/worker/tsconfig.json` after adding `room-do.test.ts`
- **Issue:** The tsconfig's `types` array was `["@cloudflare/workers-types"]` only — correct for the Workers runtime the source ships to, but the integration test runs under Node and needs Node's builtin module types, which weren't resolvable.
- **Fix:** Added `"node"` to the `types` array (via `@types/node@26.4.1`, exact-pinned as an explicit `apps/worker` devDependency matching the project's exact-pin convention). Verified no global type conflicts (`fetch`, `Response`, `WebSocket`, etc.) between the two type packages.
- **Files modified:** `apps/worker/tsconfig.json`, `apps/worker/package.json`, `package-lock.json`
- **Verification:** `npx tsc --noEmit -p apps/worker/tsconfig.json` clean; full `apps/worker` build (`wrangler deploy --dry-run`) unaffected since it only bundles `src/index.ts`'s reachable graph, not test files.
- **Committed in:** `f8fcccd` (Task 3 commit)

**4. [Rule 1 - Bug] Integration test's own count-based message assertions raced against real network timing**
- **Found during:** Task 3, first `npx vitest run --project worker room-do` run — all 9 tests initially failed with "expected 'state' to be 'joined'"
- **Issue:** The test harness's first draft waited for "N messages received" then read `raw[raw.length - 1]` (the most recent message). Because the server's `joined` reply and its immediately-following `state` push from `#pushState` can both arrive within a single 25ms polling interval, `waitForCount(1)` would sometimes already have 2 messages buffered by the time it resolved, and `parseLast` picked the wrong one.
- **Fix:** Rewrote the message-collection helper to wait on a PREDICATE (message type + shape) rather than a count/index, searching the full buffer for the first match. This is the correct pattern for asynchronous message-based protocols and is now the harness future integration tests (Plan 09+) should reuse.
- **Files modified:** `apps/worker/src/room-do.test.ts`
- **Verification:** All 9 tests pass consistently across repeated runs.
- **Committed in:** `f8fcccd` (Task 3 commit)

**5. [Rule 1 - Bug] Killing only the immediate `npx` process left `workerd` alive and bound to the port**
- **Found during:** Task 3, second test run — after fixing deviation 4, all 9 tests still timed out at exactly 5000ms, and `ps`/`lsof` showed a `workerd` process still bound to port 18787 from the FIRST (already-failed) test run
- **Issue:** `npx wrangler dev` is a multi-process tree (`npx` → wrangler CLI → `workerd`). The original `killAndWait` called `proc.kill("SIGKILL")` on only the `npx` child, which does not propagate to `workerd`'s deeper process. The next test run's `beforeAll` then tried to bind the same port, which the leaked process still held — this is exactly the kind of false-eviction bug the D-17 test exists to catch, discovered ironically in the test's OWN process management rather than in `RoomDO`.
- **Fix:** Spawn with `detached: true` (own process group) and kill via `process.kill(-pid, "SIGKILL")` (negative pid signals the whole group). Manually verified via `ps aux`/`lsof -i` that no `wrangler`/`workerd` processes remain after `killAndWait` in every subsequent run.
- **Files modified:** `apps/worker/src/room-do.test.ts`
- **Verification:** 9/9 tests pass; `ps`/`lsof` confirm zero leaked processes after the suite completes.
- **Committed in:** `f8fcccd` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (2 blocking, 3 bug fixes — one discovered and fixed twice at different points in execution). All were necessary to satisfy the plan's own acceptance criteria and verification blocks, or to make the integration test itself trustworthy (deviations 4 and 5 both concern the test harness's own correctness, not `RoomDO`). No scope creep — no feature or behavior was added beyond the plan's explicit scope.

## Issues Encountered

- **Task 1/Task 2 commit granularity.** Task 2's `onAlarm` handler was implemented as part of writing the single `room-do.ts` class file in Task 1 (the class needed to compile as one coherent unit), so there is no separate Task 2 commit — mirrors Plan 05's documented precedent ("Task 1/Task 2 split was a documentation split, not a file-write split"). Task 2's acceptance criteria were verified independently against the already-committed `ae04434` and all passed cleanly.
- **`npm run typecheck` (`tsc -b` from repo root) fails with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'`.** Confirmed via `git stash` that this is pre-existing (fails identically on `main` before this plan's changes) — a missing root `tsconfig.json` for project references, not something this plan introduced or is in scope to fix. `npx tsc --noEmit -p apps/worker/tsconfig.json` (the command this plan's own acceptance criteria actually specify) passes clean.
- **Playwright `apps/web` smoke test failure, logged in `deferred-items.md`.** During final verification, `e2e/smoke.spec.ts`'s web smoke test returned an unrelated portfolio site's HTML instead of this repo's App Router shell — an environment/`webServer` config anomaly unrelated to `apps/worker` (out of scope for this plan; the corresponding worker smoke test passes cleanly). Logged, not fixed, per the scope-boundary policy.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 09 (lobby & game-flow UI) can point `partysocket` at `ws(s)://<worker-host>/parties/room/<ROOM_CODE>` and drive the exact wire protocol (`join`/`set_variant`/`start_game`/`game_action`/`leave` → `joined`/`state`/`refused`/`superseded`/`error`) that `room-do.ts` implements — no further worker-side wiring is needed for the D-15 counter game path.
- `apps/worker/src/room-do.test.ts`'s spawn/kill/predicate-wait harness is directly reusable for Plan 09+'s own integration tests (multi-seat game-action flows, reconnect-after-refresh scenarios) without modification to the harness itself.
- Phase 2's HIDE-02 redaction work has exactly one call site to touch in the worker (`#viewFor` in `room-do.ts`, itself delegating to `room-state.ts`'s `toSeatView`) — both are grep-provable as singular.
- `npx vitest run --project worker` — 7 test files, 74 tests, all green, ~4s. `npx vitest run --project worker room-do` (or `npm run test:integration --workspace apps/worker`) for the integration suite alone.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 4 created files verified present on disk. All 4 commit hashes (ae04434, f8fcccd, 8e8b305, c52a946) verified in git log.
