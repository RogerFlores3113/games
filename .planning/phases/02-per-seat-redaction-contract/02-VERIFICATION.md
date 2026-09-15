---
phase: 02-per-seat-redaction-contract
verified: 2026-09-15T16:35:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 2: Per-Seat Redaction Contract Verification Report

**Phase Goal:** The single most important correctness pattern in the project — whitelist-serialize per-seat projection — is proven end to end against a toy secret-holding state before there is real game complexity to hide a leak inside.
**Verified:** 2026-09-15T16:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inspecting the raw network payload for any seat's connection never reveals that seat's own secret value — structurally absent, not nulled | ✓ VERIFIED | `packages/rules/src/forehead-card.ts` `toPlayerView` builds `yourCard: { id, hidden: true }` via field-by-field literal construction (no spread/omit/delete). `HiddenCardView`/`VisibleCardView` are a discriminated union so `value` is structurally unrepresentable on the hidden variant. `packages/schema/src/games/forehead-card.ts` enforces this independently with `z.strictObject` + `z.discriminatedUnion("hidden", ...)`. Confirmed live: I injected `value: ownHand.card.value` into `yourCard` in the adapter and re-ran `npx vitest run --project rules forehead-card.property` — it failed with `structural:yourCard-has-value` / `string:own-value` reasons, then I restored the file (`git status` clean afterward, `npx vitest run --project rules forehead-card` green again). |
| 2 | Every outbound message (join, live update, reconnect) goes through the exact same single projection function; no other code path serializes raw state | ✓ VERIFIED | `apps/worker/src/room-do.ts`: exactly one `#send` method (all frame types route through `this.#send(...)`), exactly one `#viewFor` method which calls `projectSeatView` (the sole `toSeatView` call site, per `seat-projection.ts`), which is the sole `toPlayerView` call site (per `room-state.ts`). Enforced by `apps/worker/src/source-structure.test.ts` (comment-stripped, string-literal-aware structural audit, A1-A9), independently re-run and green. Reconnect and initial join share `#handleJoin` → `#viewFor` (D-10); confirmed in `redaction-wire.test.ts` and the live `wrangler dev` integration test (`room-do.test.ts`, D-11 layer 3) which explicitly captures a reconnect `joined` frame and checks it. |
| 3 | An automated test fails the build if any serialized seat view contains that seat's own true secret, run as part of the standard test suite | ✓ VERIFIED | Three layers all run under plain `npm test`: (1) `packages/rules/src/forehead-card.property.test.ts` (fast-check, 200 runs, in-memory view); (2) `apps/worker/src/redaction-wire.test.ts` (fast-check, 100 runs, over the actual `encodeServerMessage`-produced JSON string, plus an explicit test proving the strict game schema — not the generic `RoomViewSchema.game: z.unknown()` — is what blocks a forced leak); (3) `apps/worker/src/room-do.test.ts` live `wrangler dev` integration test capturing real join/live-update/reconnect frames for 3 seats and running the same `checkSeatViewForLeaks` over them. The checker's ability to actually fail is proven by an 8-case D-13 canary suite (`forehead-card-leak-check.test.ts`) plus my own live injection test above. `npm test` independently re-run: 291/291 passing, 30/30 files. |
| 4 | D-02: D-15 counter placeholder is fully deleted, replaced by the forehead-card toy adapter | ✓ VERIFIED | `find . -iname "*counter-game*" -o -iname "*CounterGame*"` (excluding node_modules) returns nothing. `apps/worker/src/room-state.ts` module-level adapter is `foreheadCardGame`. |
| 5 | D-14: server-only seed and undealt deck order never appear in any seat's view | ✓ VERIFIED | `secretsForSeat` in `forehead-card-leak-check.ts` includes `state.deck` (undealt) and `seed` in `forbiddenTokens`; all three D-11 layers assert these tokens are absent from every seat's serialized frame. Layer 3's integration test additionally asserts non-vacuously that at least 10 of 16 canonical values were never observed in any captured frame (proving the undealt-deck check isn't trivially passing on an empty deck). |
| 6 | D-03: minimal browser UI proves the redaction pattern visually — own card blank, others visible | ✓ VERIFIED | `apps/web/components/ForeheadCardGame.tsx`: own-card tile (`data-testid="own-card"`) renders an empty bordered div with no value; other seats' cards render `entry.card.value` only when `!entry.card.hidden`. `e2e/start-game.spec.ts` and `e2e/in-progress-arrival.spec.ts` drive this UI end to end. Independently re-ran `npx playwright test`: 13/13 passed, including the forehead-card toy spec. Human-verify checkpoint (Plan 02-06 Task 2) was approved by the user 2026-09-15 per `02-VALIDATION.md` (two-browser DevTools frame check, no leaks reported). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/forehead-card.ts` | Toy adapter with whitelist-construction `toPlayerView`, discriminated union card views | ✓ VERIFIED | Field-by-field construction confirmed by reading; no spread/omit found; live leak-injection test proved it's load-bearing, not decorative |
| `packages/rules/src/forehead-card-leak-check.ts` + `-leak-check.test.ts` | Shared leak checker + D-13 canary proving it can fail | ✓ VERIFIED | 8 canaries (A-H) all pass, each targeting a distinct leak shape (own value present, null, undefined, moved to otherCards, hidden-card-with-value, deck leak, seed leak, embedded-in-string) |
| `packages/schema/src/games/forehead-card.ts` | Strict, game-namespaced Zod view schema, not re-exported from `packages/schema/src/index.ts` | ✓ VERIFIED | `z.strictObject` at every nesting level, `z.discriminatedUnion`; `grep forehead packages/schema/src/index.ts` returns nothing |
| `apps/worker/src/seat-projection.ts` | Fail-closed validation gate (`projectSeatView`/`validateGameView`) | ✓ VERIFIED | Returns `null` on schema failure, logs only `seatId`+issue codes, never the raw view; branded `ProjectedRoomView` type |
| `apps/worker/src/room-do.ts` | Single `#send`/`#viewFor` chokepoint | ✓ VERIFIED | grep confirms every frame type funnels through `this.#send(...)`; only `#send` calls `connection.send` |
| `apps/worker/src/source-structure.test.ts` | Structural audit enforcing single call sites and zero `broadcast(` | ✓ VERIFIED | 9 structural assertions (A1-A9), comment-stripping scanner independently sanity-checked by its own canary tests |
| `apps/worker/src/redaction-wire.test.ts` | D-11 layer 2 wire-string property test | ✓ VERIFIED | 100 fast-check runs + full-game-to-`ended` test + explicit proof that the strict game schema (not `RoomViewSchema`) is the actual gate |
| `apps/worker/src/room-do.test.ts` (D-11 layer 3 section) | Live `wrangler dev` integration test, join/live-update/reconnect frame capture | ✓ VERIFIED | Confirmed reconnect frame explicitly checked (`reconnectFrameChecked` assertion), ≥3 game frames per seat, non-vacuous deck-token check |
| `apps/web/components/ForeheadCardGame.tsx` | Minimal toy UI, own card blank | ✓ VERIFIED | No `value` rendered for own card or hidden others |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `room-do.ts#viewFor` | `seat-projection.ts#projectSeatView` | direct call | WIRED | Sole call site per A4/A7 structural tests |
| `seat-projection.ts#projectSeatView` | `room-state.ts#toSeatView` | direct call | WIRED | Sole call site per A4 |
| `room-state.ts#toSeatView` | `foreheadCardGame.toPlayerView` | direct call | WIRED | Sole call site per A5, confirmed inside `toSeatView`'s function body specifically (not just the file) |
| `seat-projection.ts#validateGameView` | `activeGame.viewSchema` (Zod strict schema) | `.safeParse` | WIRED | Confirmed fail-closed: returns `null` on failure, logs no secrets |
| `room-do.ts#send` | `encodeServerMessage` → `connection.send` | direct call | WIRED | Sole `.send(` and sole `encodeServerMessage(` call site per A1/A2 |
| join / live update / reconnect | `#viewFor` | shared handler (D-10) | WIRED | `#handleJoin` used for both first join and reconnect; confirmed via room-do.test.ts capturing a real reconnect `joined` frame through the same path |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ForeheadCardGame.tsx` | `game.otherCards`, `game.revealed`, `game.score`, `game.deckCount` | `view.game` from server-pushed `RoomView` (via `room-store.ts`/WebSocket) | Yes — real per-seat projected values, exercised end to end by Playwright | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Leak checker actually fails on a real injected leak | Temporarily added `value: ownHand.card.value` to `yourCard` in `forehead-card.ts`, ran `npx vitest run --project rules forehead-card.property`, then restored the file | 2 tests failed with `structural:yourCard-has-value`, `string:own-value` reasons; file restored, `git status` clean, tests green again | ✓ PASS |
| Full automated gate green | `npm test` | 291/291 tests, 30/30 files passed | ✓ PASS |
| E2E gate green | `npx playwright test` | 13/13 passed | ✓ PASS |
| Wire-level strict schema catches hidden-card-with-value | `npx vitest run --project schema games/forehead-card` | 17/17 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| HIDE-01 | 02-01, 02-04, 02-05, 02-06 | Client never receives own hand's card identity | ✓ SATISFIED | Discriminated union + structural test + all 3 leak-test layers + e2e |
| HIDE-02 | 02-02, 02-03, 02-04, 02-06 | Single per-seat projection function for every outbound payload type, no bypass | ✓ SATISFIED | `#send`/`#viewFor` chokepoint, D-09 structural audit (A1-A9) |
| HIDE-03 | 02-01, 02-02, 02-04, 02-06 | Wire format structurally lacks fields rather than nulling | ✓ SATISFIED | `HiddenCardView` has no `value` key at the type or schema level; strict Zod schema rejects `value: undefined`/`null` (Canary B/C) |
| HIDE-04 | 02-01, 02-03, 02-04, 02-06 | Automated test fails build on any own-identity leak | ✓ SATISFIED | 3-layer D-11 test suite + D-13 canary, all in `npm test`; independently reproduced a real failure |

REQUIREMENTS.md marks HIDE-01..04 as "Pending" in its table — per the orchestrator's note, this is by design (executors do not tick these; completion is recorded at verification, not during execution). No orphaned requirements found: all four IDs mapped to Phase 2 in REQUIREMENTS.md are claimed by at least one Phase 2 plan's `requirements:` frontmatter.

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`) or unresolved `TODO`/`HACK`/`PLACEHOLDER` found in the phase's non-test source files (`apps/worker/src/*.ts`, `packages/rules/src/forehead-card*.ts`, `packages/schema/src/games/*.ts`, `apps/web/components/ForeheadCardGame.tsx`). No stub patterns (`return null`/empty-object placeholders feeding rendered output) found in the redaction chokepoint.

Known, previously-flagged, non-blocking item (not part of this phase's must-haves): `VisibleCardViewSchema.value` is `z.string().min(1)` rather than an enum of the 16 canonical star names — a stray non-canonical string value would pass the wire schema. This does not weaken HIDE-01/03/04 (a hidden card still cannot carry any `value` key at all, canonical or not) and was already noted as an accepted plan-checker warning, not a redaction gap.

### Human Verification Required

None outstanding. The one human-verify checkpoint for this phase (Plan 02-06 Task 2 — two-browser DevTools frame check) was already completed and approved by the user on 2026-09-15, recorded in `02-VALIDATION.md`.

### Gaps Summary

None. All ROADMAP success criteria and all PLAN-frontmatter must-haves across 02-01 through 02-06 are verified against the actual codebase, not just SUMMARY claims. I independently re-ran the full automated gate (`npm test`: 291/291, `npx playwright test`: 13/13) and additionally performed a live fault-injection test against the redaction chokepoint to confirm the leak-detection tests are not vacuous — injecting a real leak into `toPlayerView` caused the property test to fail with the expected leak reasons, and the file was cleanly restored afterward (verified via `git status`).

---

*Verified: 2026-09-15T16:35:00Z*
*Verifier: Claude (gsd-verifier)*
