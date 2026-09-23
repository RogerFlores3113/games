---
phase: 01-room-transport-skeleton
plan: 05
subsystem: security
tags: [nanoid, seat-identity, rt-07, d-08, timing-safe-comparison, cloudflare-workers]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "Branded RoomCode/SeatToken schemas and ROOM_CODE_ALPHABET/SEAT_TOKEN_LENGTH constants (Plan 03)"
provides:
  - "apps/worker/src/seat-identity.ts: mintRoomCode, mintSeatToken, mintSeatId, resolveSeatByToken, rebindSeatConnection"
  - "SeatBindings: an in-memory, non-persisted seatId -> connectionId map for D-08 rebinding"
affects: [01-07-room-durable-object]

# Tech tracking
tech-stack:
  added: ["nanoid@6.0.1 (exact pin, apps/worker dependency, WebCrypto-based, no nodejs_compat)"]
  patterns:
    - "resolveSeatByToken and rebindSeatConnection take plain seat/binding shapes (TokenBearingSeat, SeatBindings), never a RoomState-shaped parameter — the seat-hijack and second-tab boundaries are structurally incapable of touching persisted room state, grep-provable rather than convention"
    - "Timing-safe-by-construction string comparison (full-length XOR, no early return) used for seat-token resolution as defense-in-depth beyond the friend-group threat model's strict requirements"

key-files:
  created:
    - apps/worker/src/seat-identity.ts
    - apps/worker/src/seat-identity.test.ts
  modified:
    - apps/worker/package.json
    - package-lock.json

key-decisions:
  - "nanoid pinned to exact 6.0.1 (no ^ range) as an explicit apps/worker dependency, matching the exact-pin convention Plan 01 established for TypeScript/Next.js/wrangler/partyserver — it was previously only present as a transitive/hoisted dependency (nanoid@3.3.18 at root, nanoid@5.1.16 nested under partyserver), neither of which is the researched/approved 6.0.1"
  - "resolveSeatByToken and rebindSeatConnection implemented in the same file write as mintRoomCode/mintSeatToken/mintSeatId (plan's Task 1/Task 2 split was a documentation split, not a file-write split) — committed across two commits by re-diffing so Task 1's commit still only contains the minting functions and Task 2's commit adds the resolution/rebinding functions plus tests, preserving the plan's intended one-commit-per-task granularity"

requirements-completed: [RT-07]

# Metrics
duration: ~15min
completed: 2026-09-02
---

# Phase 1 Plan 5: Room & Transport Skeleton — Seat Identity & RT-07 Boundary Summary

**Three non-interchangeable identifier kinds (RoomCode, SeatId, SeatToken) minted with distinct alphabets and entropy, plus a timing-safe token-resolution function and a room-state-free, D-08-compliant newest-socket-wins rebinding map — 14 tests including a 200-run fast-check property and 1,000-sample entropy checks.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-02T15:39:36Z
- **Tasks:** 2 (both auto)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `mintRoomCode`/`mintSeatToken` are proven to draw from genuinely different alphabets (a 1,000-sample test asserts at least one minted seat token contains a character outside `ROOM_CODE_ALPHABET`) and validate through their branded Zod schemas at mint time, so a future constant change that breaks the invariant fails at mint, not at join
- `resolveSeatByToken` explicitly rejects a room code presented as a seat token — the exact RT-07 confusion this plan exists to prevent — verified by a test named for RT-07, plus `undefined`, empty-string, and tampered-token rejection, plus a 200-run fast-check property proving it never throws and only resolves on exact match
- `rebindSeatConnection` operates on a plain `SeatBindings` map with no persisted-room-state parameter anywhere in its signature or body — grep-provable (`grep -qE 'RoomState' apps/worker/src/seat-identity.ts` exits 1) — so D-08's second-tab rebinding is structurally incapable of corrupting seat state
- Seat-token comparison uses a full-length XOR loop with no early return (timing-safe-by-construction), five lines of defense-in-depth beyond what the friend-group threat model strictly requires
- `nanoid@6.0.1` (the researched/approved version, WebCrypto-based) added as an explicit, exact-pinned `apps/worker` dependency rather than relying on the mismatched transitive versions (3.3.18, 5.1.16) already hoisted into `node_modules`

## Task Commits

Each task was committed atomically:

1. **Task 1: Mint room codes and seat tokens as two distinct, non-interchangeable identifiers** — `aa9d99b` (feat)
2. **Task 2: Implement token→seat resolution and newest-socket-wins rebinding** — `9db1c11` (test)

## Files Created/Modified
- `apps/worker/src/seat-identity.ts` — `mintRoomCode`, `mintSeatToken`, `mintSeatId`, `TokenBearingSeat`, `resolveSeatByToken`, `SeatBindings`, `RebindResult`, `rebindSeatConnection`; module-level comment enumerating the three identifier kinds
- `apps/worker/src/seat-identity.test.ts` — 14 tests: entropy/shape (1,000-sample uniqueness, alphabet divergence, room-code pattern match), RT-07 resolution (undefined/empty/room-code/tampered/exact-match + fast-check property), D-08 rebinding (supersede, idempotent reconnect, cross-seat isolation, room-state-free signature)
- `apps/worker/package.json` — added `nanoid: 6.0.1` (exact pin) as a direct dependency
- `package-lock.json` — lockfile entry for the newly nested `apps/worker/node_modules/nanoid@6.0.1`

## Exact Exported Signatures (for Plan 07 wiring)

```ts
function mintRoomCode(): RoomCode;
function mintSeatToken(): SeatToken;
function mintSeatId(): string;

interface TokenBearingSeat { readonly seatId: string; readonly seatToken: SeatToken }
function resolveSeatByToken<TSeat extends TokenBearingSeat>(
  seats: readonly TSeat[],
  presented: string | undefined,
): TSeat | null;

type SeatBindings = Record<string, string>; // seatId -> connectionId, in-memory only, NOT persisted
interface RebindResult { readonly bindings: SeatBindings; readonly supersededConnectionId: string | null }
function rebindSeatConnection(
  bindings: SeatBindings,
  seatId: string,
  newConnectionId: string,
): RebindResult;
```

`SeatBindings` is reconstructable from scratch on a Durable Object wake — a connection id has no meaning after hibernation eviction, so Plan 07 must never write it to `ctx.storage`. On `rebindSeatConnection` returning a non-null `supersededConnectionId`, Plan 07 sends that connection `{type:"superseded"}` and closes it with `SUPERSEDED_CLOSE_CODE` (4001, from `packages/schema/src/constants.ts`).

## Decisions Made
- **nanoid pinned to exact `6.0.1` as an explicit `apps/worker` dependency.** The package was previously only reachable transitively (root `nanoid@3.3.18` via other tooling, `partyserver`'s nested `nanoid@5.1.16`) — neither is the version research approved (`01-RESEARCH.md`: `nanoid@6.0.1`, WebCrypto-based, no `nodejs_compat` needed). Installed with `npm install nanoid@6.0.1 -w apps/worker` and pinned to an exact literal, matching the exact-pin convention Plan 01 set for every other researched dependency.
- **Comments reworded to avoid the literal string "RoomState".** The plan's own verification step greps `seat-identity.ts` for `RoomState` and requires a non-zero (not-found) exit. Two explanatory comments originally used that literal string in prose; reworded to "persisted room-state" / "persisted seat/room-state types" to preserve the grep-provable purity guarantee without losing the explanation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] nanoid was not an explicit `apps/worker` dependency at the pinned research version**
- **Found during:** Task 1, before writing `seat-identity.ts`
- **Issue:** `apps/worker/package.json` had no `nanoid` dependency at all; only mismatched transitive versions were hoisted into `node_modules` (root `nanoid@3.3.18`, `partyserver`'s nested `nanoid@5.1.16`). Importing `nanoid` from `apps/worker/src/seat-identity.ts` without an explicit dependency would have resolved to whichever transitive copy npm's hoisting happened to expose, an unverified version drifting from research.
- **Fix:** `npm install nanoid@6.0.1 -w apps/worker`, then edited the resulting `^6.0.1` range down to an exact `6.0.1` pin to match the project's established exact-pin convention.
- **Files modified:** `apps/worker/package.json`, `package-lock.json`
- **Verification:** `npx tsc --noEmit -p apps/worker/tsconfig.json` clean; `apps/worker/node_modules/nanoid/package.json` confirms `6.0.1` nested correctly; `wrangler.jsonc` unchanged (no `nodejs_compat` added).
- **Committed in:** `aa9d99b` (Task 1 commit)

**2. [Rule 1 - Bug] Two explanatory comments contained the literal string "RoomState", tripping the plan's own purity grep**
- **Found during:** Task 2, running the plan's verification block
- **Issue:** `grep -qE 'RoomState' apps/worker/src/seat-identity.ts` is one of the plan's four top-level `<verification>` checks and must exit non-zero (string absent). Two doc comments explaining why the module avoids persisted room state used the literal type name "RoomState" in prose, causing the grep to match and the check to fail.
- **Fix:** Reworded both comments to describe "persisted room-state" / "persisted seat/room-state types" without using the literal identifier, preserving the explanation's meaning.
- **Files modified:** `apps/worker/src/seat-identity.ts`
- **Verification:** `grep -qE 'RoomState' apps/worker/src/seat-identity.ts` now exits 1; `npx tsc --noEmit -p apps/worker/tsconfig.json` and `npx vitest run --project worker seat-identity` both still pass.
- **Committed in:** `9db1c11` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking dependency-pin fix, 1 bug fix to satisfy the plan's own verification). Both were necessary to make the plan's own acceptance criteria pass; no scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 07 (the real Durable Object) can import `mintRoomCode`/`mintSeatToken`/`mintSeatId` directly for room creation and `joinRoom`'s `mintSeatId`/`mintSeatToken` callbacks (Plan 04's `JoinInput` shape), and `resolveSeatByToken`/`rebindSeatConnection` for the WebSocket `onConnect` reconnect flow.
- `SeatBindings` is explicitly documented as connection-layer-only and must never be written to `ctx.storage` — Plan 07 should keep it as DO-instance memory, reconstructed empty on every wake (hibernation evictions make old connection ids meaningless anyway).
- On a non-null `supersededConnectionId`, Plan 07 sends `{type:"superseded"}` (from `packages/schema/src/messages.ts`) to that connection and closes it with `SUPERSEDED_CLOSE_CODE` (4001).
- `npx vitest run --project worker seat-identity` for a scoped re-run; `npx vitest run` (whole repo) is now 11 files / 83 tests, all green.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 2 created files verified present on disk. Both commit hashes (aa9d99b, 9db1c11) verified in git log.
