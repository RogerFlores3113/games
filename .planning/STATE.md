---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 04 complete (9/9) — ready to discuss Phase 5
last_updated: 2026-09-16T20:23:54.946Z
last_activity: 2026-09-16
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 31
  completed_plans: 31
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-01)

**Core value:** A friend clicks a link and is playing Hanabi within seconds — and the game does not break, stall, or lose their seat for the next 25 minutes.
**Current focus:** Phase 5 — reconnect & session durability hardening

## Current Position

Phase: 5
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-16

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 39
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 11 | - | - |
| 2 | 6 | - | - |
| 3 | 5 | - | - |
| 4 | 8 | - | - |
| 04 | 9 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 13 | 4 tasks | 33 files |
| Phase 01 P02 | 10 | 3 tasks | 5 files |
| Phase 01 P03 | 12 | 2 tasks | 6 files |
| Phase 01 P04 | 18min | 3 tasks | 5 files |
| Phase 01 P05 | 15min | 2 tasks | 4 files |
| Phase 01 P06 | 6min | 2 tasks | 4 files |
| Phase 01 P08 | 25min | 3 tasks | 13 files |
| Phase 01 P07 | 25min | 3 tasks | 10 files |
| Phase 01 P09 | 70min | 3 tasks | 11 files |
| Phase 01 P10 | ~50min | 2 tasks | 13 files |
| Phase 02 P01 | 20min | 3 tasks | 9 files |
| Phase 02 P02 | 15min | 3 tasks | 8 files |
| Phase 02 P03 | 35min | 3 tasks | 9 files |
| Phase 02 P04 | 9min | 3 tasks | 3 files |
| Phase 02 P05 | 25min | 3 tasks | 10 files |
| Phase 02 P06 | ~10min | 0 tasks | 1 files |
| Phase 03 P01 | 5min | 2 tasks | 5 files |
| Phase 03 P02 | 25min | 3 tasks | 8 files |
| Phase 03 P03 | 45min | 3 tasks | 5 files |
| Phase 03 P04 | 35min | 3 tasks | 8 files |
| Phase 03 P05 | 50min | 3 tasks | 7 files |
| Phase 04 P01 | 35min | 2 tasks | 6 files |
| Phase 04 P02 | 33min | 3 tasks | 7 files |
| Phase 04 P03 | 55min | 4 tasks | 6 files |
| Phase 04 P04 | 35min | 3 tasks | 4 files |
| Phase 04-wire-engine-into-room-actor P05 | 9min | 2 tasks | 2 files |
| Phase 04 P06 | 35min | 3 tasks | 4 files |
| Phase 04 P07 | 55min | 3 tasks | 3 files |
| Phase 04 P08 | unknown | 3 tasks | 8 files |
| Phase 04 P09 | 12min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Horizontal-layers structure chosen deliberately (per user/research) over vertical slices — transport/redaction proven on a toy game, then a pure rules engine, then wiring, then reconnect hardening, then UI, then variants.
- Roadmap: RULES-03 (parametrized suit count) placed in Phase 3 so the engine is variant-ready from the start; Phase 7 only enables/tests Rainbow and Black, not restructure the engine.
- Roadmap: HIDE-02 and HIDE-04 placed in Phase 2, before the real rules engine exists, so the redaction contract is proven cheaply against a toy game.
- [Phase ?]: TypeScript pinned to exact 5.9.3 (pin-5x), matching CLAUDE.md's 5.7+ constraint and the major every other pinned tool in research was validated against
- [Phase ?]: vitest's slopcheck TYPOSQUAT_RISK flag accepted as false positive (name-similarity to vite only)
- [Phase ?]: apps/worker/src/index.ts must never re-export plain constants as top-level named exports (wrangler Modules format reserves top-level named exports for Worker entrypoints)
- [Phase ?]: Variant type duplicated locally in packages/rules/src/adapter.ts (not imported from @games/schema) to keep packages/rules at zero runtime dependencies per FDN-02; Plan 04 adds a compile-time mutual-assignability check
- [Phase ?]: GameAdapter interface has no whole-state serializer; toPlayerView is the only exit point from adapter state to the wire, enforced by grep in the plan's acceptance criteria
- [Phase ?]: Sequenced schema/src/index.ts re-exports to match Plan 03 task order (constants+room, then +messages) so each task commit is independently buildable
- [Phase ?]: SeatTokenSchema/RoomCodeSchema use zod4's z.brand() for the RT-07 seat-hijack boundary, making conflation a compile error rather than a review convention
- [Phase ?]: packages/schema/src/room.ts hostSeatId widened to nullable to represent the pre-first-seat empty-room state (Plan 04, Rule 1 fix)
- [Phase ?]: AdapterError collapses onto RefusalReason's bad_request rather than widening the shared wire enum for a placeholder game Phase 2 deletes (Plan 04)
- [Phase ?]: nanoid pinned to exact 6.0.1 as explicit apps/worker dependency (was only transitive/mismatched before)
- [Phase ?]: resolveSeatByToken/rebindSeatConnection take plain seat/binding shapes, never a room-state parameter, structurally preventing D-08 rebinding from corrupting persisted seat state
- [Phase ?]: scheduler.ts computeRoomTimers recomputes the whole timer table from RoomState on every call rather than mutating incrementally, structurally preventing the single-alarm-slot clobber bug (RESEARCH.md Pitfall 1)
- [Phase ?]: persistence.ts reads schemaVersion from its own top-level storage key before ever touching the room blob; a version mismatch resets via deleteAll() without deserializing the old blob (D-17, RESEARCH.md Pitfall 3)
- [Phase ?]: lucide-react pinned to exact 1.39.0 (was 'latest' in Wave 0 scaffold), matching the project's exact-pin convention
- [Phase ?]: nanoid added to apps/web at exact 6.0.1, mirroring apps/worker's Plan 05 pin; both mint room codes independently from the same @games/schema constants
- [Phase ?]: sessionStorage key room:{code}:displayName carries the host's entered name into the lobby so Plan 09 can auto-join without a retype (D-03)
- [Phase 01-07]: RoomDO integration tests spawn wrangler dev as a detached process group and kill it via process.kill(-pid) to prove D-17 persistence survives genuine eviction, not just a closed socket
- [Phase 01-07]: toSeatView wrapped in a single private #viewFor method so the literal call-site count stays 1 even though both the joined reply and #pushState need a view
- [Phase 01-07]: apps/worker/tsconfig.json types widened to include node alongside @cloudflare/workers-types since the integration test needs Node builtins; no global type conflicts
- [Phase ?]: [Phase 01-09]: RECONNECT_PLACEHOLDER_NAME ("Player") sent as displayName when only a saved seat token is known — server treats any seatToken match as a reclaim and ignores the presented name
- [Phase ?]: [Phase 01-09]: origin allowlist changed from an exact-port match to loopback-any-port (apps/worker/src/origin.ts) after port 3000 being occupied blanked the lobby in verification
- [Phase ?]: [Phase 01-09]: Tailwind v4 custom spacing tokens renamed --spacing-* to --space-* to avoid the reserved Tailwind namespace collision that collapsed every page's layout
- [Phase 01]: Web dev server pinned to port 3100 (playwright.config.ts) to sidestep a real, observed port-3000 collision with an unrelated personal site on this machine
- [Phase 01]: SeatRow gained an optional test-only seatId prop (data-seat-id attribute) for E2E observability, additive to the UI-SPEC's required prop shape
- [Phase 02-01]: sfc32 seeded with all 4 cyrb128 words (128-bit state) for shuffle.ts, matching mintGameSeed's 128-bit secret — a 32-bit PRNG seed space is brute-forceable against visible cards; 128-bit state keeps deck order unguessable
- [Phase 02-01]: checkSeatViewForLeaks/secretsForSeat live in packages/rules, designed for reuse by apps/worker's later D-11 layers 2/3 — avoids duplicating the checker; the file header documents the intended cross-layer reuse
- [Phase 02-02]: ForeheadCardViewSchema lives under packages/schema/src/games/, reachable only via subpath export/alias, never re-exported from the generic barrel (D-06, FDN-01)
- [Phase 02-02]: ErrorMessageSchema.detail closed to z.enum(["view_unavailable"]) — error frames can no longer carry free-text state (D-08)
- [Phase 02]: 02-03: game-registration.ts's compile-time contract check uses one-element-tuple-wrapped conditional types assigned to underscore-prefixed consts
- [Phase 02]: 02-03: seat-projection.ts's OutboundFrame built now with Exclude/Extract/Omit over ServerMessage, ready for Plan 04's #send/#viewFor consolidation
- [Phase 02]: 02-03: ROOM_SCHEMA_VERSION bump alone closes the persisted adapterId=counter gap; no second reset trigger added to persistence.ts
- [Phase 02]: 02-04: source-structure.test.ts uses a character-scanner comment stripper (not regex) and exact-count structural assertions to enforce D-08/D-09/D-10 chokepoints in apps/worker/src
- [Phase 02]: 02-04: source-structure.test.ts derives SRC_DIR via URL.pathname rather than fileURLToPath, avoiding a tsc type clash between @cloudflare/workers-types and node's URL types
- [Phase 02]: 02-05: isForeheadCardView narrows through explicit otherCards/revealed in-checks before array casts, avoiding a too-narrow TS intersection type from a single-property guard
- [Phase 02-06]: Manual verification recorded as user's plain approval with no fabricated frame contents or observations - user replied 'approved' with no caveats
- [Phase 03]: Round-robin card dealing (one card per seat per round) chosen for dealInitialHands, matching how a physical deck is dealt — Interfaces block only required per-seat hand sizes; round-robin is the more faithful/realistic dealing order
- [Phase ?]: HistoryEntryView added to state.ts as the non-readonly plain-array mirror of HistoryEntry (03-02)
- [Phase ?]: AdapterError widened to 8 members per D-03; GameAdapter interface's five members unchanged, apps/worker's mapAdapterError unaffected (03-02)
- [Phase 03-03]: isClueRequest validates against the generic ALL_SUITS/RANKS closed sets (no state param available); variant-specific cluability is enforced downstream by canClue's clue_touches_nothing check
- [Phase 03-03]: cardsTouchedByClue imported under a namespace in actions.ts so it resolves once and is reused for the clue-fact update and history entry
- [Phase 03]: Array.from(...) used instead of array-spread in projection.ts to keep the file's own forbidden-construct grep clean without weakening the no-object-spread discipline
- [Phase 03]: Hanabi leak checker's typed identity-count check is a second, independent recursive walk (collectIdentityCounts), matching the plan's explicit separate-pass instruction
- [Phase 03-05]: secretsForHanabiSeat bumps allowedIdentityCounts once per play/discard history entry, closing a false-positive leak where a played/discarded card's identity legitimately appears twice in a view (discard pile/stack plus history log)
- [Phase ?]: 04-01: ClueValueSchema stays a single z.strictObject, not a z.discriminatedUnion("type", ...), because HanabiView's Clue-like wire fields are the loose { type; value: Suit|Rank } shape, which a narrower union cannot absorb without breaking game-registration.ts's compile-time assignability assertion
- [Phase ?]: 04-01: hanabi.test.ts fixtures use named consts instead of array-indexing (baseValidView.yourHand[0]) because noUncheckedIndexedAccess makes indexed access possibly-undefined and fails tsc -b
- [Phase 04]: actionId bounds 1-64 chars; ErrorDetail members named identically to AdapterError for lossless 1:1 mapping
- [Phase ?]: legalActionFor priority order (clue > discard > play) implemented independently per test file, per plan's file-scoped task boundaries
- [Phase ?]: Layer-3 leak test's allowedIdentityCounts computed as element-wise max across a seat's own captured frames
- [Phase ?]: room-state.test.ts deck-exhaustion test rewritten to drive a Hanabi game to its natural end via legalActionFor
- [Phase ?]: Dedup check must run unconditionally before adapter.applyAction for every action type (D-09) because a repeated clue is legal and would otherwise spend a second token
- [Phase ?]: mapAdapterError is an exhaustive switch over AdapterError with a never-typed default, mirroring variantConfig's exhaustiveness idiom
- [Phase ?]: RT-09 duplicate-send proof records parsed.length before the second send and requires the matching frame's index at or beyond it, since the dedup branch resends a byte-identical view a naive waitFor would vacuously match
- [Phase 04]: clueTouchCountForTarget only counts visible cards, delegating to variantConfig predicates rather than hand-rolled rules
- [Phase 04]: Own-hand slots render position and raw positiveClues/negativeClues only, never possibleSuits/possibleRanks (Phase 6 UI-05 owns narrowed candidates)
- [Phase ?]: start-game.spec.ts's table-action assertion uses play, not discard, since clue tokens start at 8/8 (max) and D-12 disables discard at max tokens
- [Phase ?]: RT-03 proves same-seat reattachment via the OTHER page's other-hand-{seatId} testid, since the board never renders the viewer's own seatId
- [Phase ?]: [Phase 04-08]: Human phase-gate sign-off recorded as user's plain approval, quoting verbatim reply 'confirmed' - no fabricated frame contents or observations
- [Phase 04-09]: fusesRemainingForView added to hanabi-board-logic.ts alongside bandForView; MAX_FUSES re-exported from @games/rules barrel — Closes UAT test 10 fuse-counter-direction gap without touching engine/wire fuses semantics

### Pending Todos

### Blockers/Concerns

- Phase 1 needs a pre-planning research refresh: Cloudflare Durable Objects / `partyserver` API surface and free-tier limits were flagged MEDIUM confidence and move quickly — re-verify before planning.
- Phase 6 needs original design work at plan time: no existing implementation combines luminosity-as-signal theming with colorblind-safe rendering.
- Plan 01-09 checkpoint left D-08 (second-tab supersede) and ROOM-07/D-14 (in-progress refusal screen) without browser-level manual verification — flagged as must-cover Playwright scenarios for Plan 01-10

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-16T20:19:20.106Z
Stopped at: Completed 04-09-PLAN.md
Resume file: None
