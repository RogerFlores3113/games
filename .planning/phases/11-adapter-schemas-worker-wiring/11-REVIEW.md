---
phase: 11-adapter-schemas-worker-wiring
reviewed: 2026-09-27T00:00:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - apps/web/app/api/room/route.test.ts
  - apps/web/components/expedition/ExpeditionBoard.tsx
  - apps/web/components/game-ui.tsx
  - apps/web/lib/pending-room.test.ts
  - apps/worker/src/expedition-wiring.test.ts
  - apps/worker/src/game-registration.test.ts
  - apps/worker/src/game-registration.ts
  - apps/worker/src/registry.test.ts
  - apps/worker/src/seat-projection.test.ts
  - apps/worker/src/source-structure.test.ts
  - packages/rules/src/expedition/README.md
  - packages/rules/src/expedition/adapter/adapter.test.ts
  - packages/rules/src/expedition/adapter/adapter.ts
  - packages/rules/src/expedition/adapter/request-guards.test.ts
  - packages/rules/src/expedition/adapter/request-guards.ts
  - packages/rules/src/expedition/adapter/view-leak-check.test.ts
  - packages/rules/src/expedition/adapter/view-leak-check.ts
  - packages/rules/src/expedition/adapter/view-types.ts
  - packages/rules/src/expedition/adapter/view.property.test.ts
  - packages/rules/src/expedition/adapter/view.test.ts
  - packages/rules/src/expedition/adapter/view.ts
  - packages/rules/src/expedition/boss/boss.contract.test.ts
  - packages/rules/src/expedition/gear/gear.contract.test.ts
  - packages/rules/src/expedition/purity.test.ts
  - packages/rules/src/expedition/run/run.property.test.ts
  - packages/rules/src/expedition/run/types.ts
  - packages/rules/src/index.ts
  - packages/schema/package.json
  - packages/schema/src/create-room.test.ts
  - packages/schema/src/create-room.ts
  - packages/schema/src/games/expedition-errors.ts
  - packages/schema/src/games/expedition.test.ts
  - packages/schema/src/games/expedition.ts
  - packages/schema/src/games/subpath.test.ts
  - packages/schema/src/messages.test.ts
  - packages/schema/src/messages.ts
  - packages/schema/src/room.test.ts
  - packages/schema/src/room.ts
  - tsconfig.base.json
  - vitest.config.ts
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

Reviewed the Expedition adapter, per-seat projection (`view.ts`), leak checker, request guards, wire schemas, and worker registration, against the diff `b00075c..HEAD`.

**Per-seat projection (`view.ts`):** I found no concrete information leak. Every field is built as an explicit literal. Other seats appear only as `handSizes`. Reveals and log entries are filtered by audience before they are mapped. Face-down objectives are filtered to the viewer's own. Unseated viewers get the least-privileged defaults. `yourLegalCardIds` is intersected with the viewer's own hand. I also followed the supporting calls that feed the view: `evaluateObjective` (reads no hands), `gearAvailability`/`canUse` reason strings (derived only from public or own state), `preDealPendingSeatIds`, and card-id minting (fresh seeded ids per deal, not tied to identity). None of them carry hidden-hand information into the view.

**Leak checker (`view-leak-check.ts`):** This is where the real weaknesses are. It has several false-negative classes:
- The seed scan is opt-in, and one whole-run property suite leaves it off.
- A revealed card id is allowed anywhere in the view, so the checker cannot catch a violation of the WR-03 ruling.
- Hidden ids used as object keys or embedded in strings are not caught.
- The draft-offer and log checks silently skip when their keys are missing.

Today the projection is correct, so none of these hide an existing leak. Their effect is that the "never leaks" proof is weaker than the phase claims, and a future regression in `view.ts` could get past it.

**Web and schema:** There are two wiring problems:
- Expedition rooms can be created on the server, but the board is a placeholder with no exit controls.
- The native-form create path can never produce a valid Expedition request.

## Warnings

### WR-01: Seed scan is opt-in even though `RunState` carries the seed; Property D in `run.property.test.ts` runs without it

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:97-102,162`; `packages/rules/src/expedition/run/run.property.test.ts:141`
**Issue:** `secretsForExpeditionSeat` takes `seed?: string` and only adds a forbidden token when a caller passes one. This copies Hanabi's contract, but here the checker already has `state.seed` (`RunState.seed`, types.ts:115). `run.property.test.ts` Property D calls `secretsForExpeditionSeat(state, id, CATALOG)` with no seed, so its 40-run whole-run check never scans for the seed, even though its header says the property "never leaks". Any future caller that forgets the fourth argument silently loses T-11-03 coverage. The `"seed"` entry in `FORBIDDEN_VIEW_KEYS` only catches a key with that exact name, not the seed value stored under some other key or embedded in a string.
**Fix:** Always derive the token from state, and keep the parameter only as an extra token:
```ts
const forbiddenTokens = [state.seed, ...(seed !== undefined && seed !== state.seed ? [seed] : [])]
  .filter((t) => t.length > 0);
```

### WR-02: The checker cannot detect a WR-03 violation (a revealed card's current holder being disclosed)

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:113-114,132-134`
**Issue:** When a card id is in `revealedToViewer`, it is dropped from `hiddenIds` everywhere. The checker never checks a reveal's `fromSeatId`, and never checks where in the view that id appears. Suppose `view.ts` regressed to re-derive a revealed card's current holder after a Trained Monkey move, for example by setting `fromSeatId` to the new holder or by emitting the card under that seat. The checker would pass: the id is not hidden and the identity count still matches. This is exactly the disclosure the WR-03 ruling forbids (types.ts:49-57). Only one hand-written example test covers it (`view.test.ts:130`); the property suites cannot catch it.
**Fix:** Add the expected reveal tuples to the secrets and compare them exactly:
```ts
// in ExpeditionSeatSecrets
readonly expectedReveals: readonly { cardId: string; fromSeatId: string; source: string }[];
// in checkExpeditionViewForLeaks: compare view.attempt.reveals (minus identity) to expectedReveals
// in order; mismatch -> "structural:reveal-mismatch".
```
Also allow a revealed id only in `attempt.reveals[].cardId`, and in trick plays or `yourHand` when the card is actually there. Do not allow it anywhere in the view.

### WR-03: Hidden ids used as object keys or inside longer strings escape `walkStructural`

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:180-201`
**Issue:** Keys are compared only against `FORBIDDEN_VIEW_KEYS`. `hiddenIds` is checked only against whole string leaf values. A regression that emits a record keyed by card id, such as `{ cardsBySeat: { "seat-1": { abcdefgh: {...} } } }` or `{ [cardId]: true }`, leaks another seat's card ids and is not flagged. If identities are also nested under those keys, the multiset check may catch it. An id-only map, such as a "which ids are in seat B's hand" set, is caught by nothing. Ids embedded in strings (for example `event: "peek:abcdefgh"`) are also missed. The header's collision argument is a reason to avoid raw substring scans, but it does not justify skipping key checks.
**Fix:**
```ts
for (const key of Object.keys(obj)) {
  if ((FORBIDDEN_VIEW_KEYS as readonly string[]).includes(key)) reasons.add(`structural:forbidden-key:${key}`);
  if (hiddenIds.has(key)) reasons.add(`structural:hidden-id-key:${key}`);
}
```
Optionally add a token scan for hidden ids that are delimited by non-letter characters inside string leaves.

### WR-04: Draft-offer and log checks fail open when their keys are missing; other seats' private gear is detected only by exact key name

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:249-264,47-55`
**Issue:**
- The draft-offer comparison runs only `if ("yourDraftOffer" in input.view)`.
- The log count check runs only when `attempt.log` is an array.
- If the view is renamed or restructured, both checks are skipped with no reason emitted.
- Other seats' `draftOffer`/`ownedGearIds` are detected only if the view uses those exact key names. Gear ids are public catalog strings and cannot go into `hiddenIds`. So a regression such as `seats[].offer` or `draftOffers: { [seatId]: [...] }` leaks every seat's private draft (RUN-04) with no signal.
- The log check compares counts only. A view that swaps a private entry addressed to the viewer for one addressed to another seat passes.

**Fix:**
- Treat a missing `yourDraftOffer` key as a reason (`structural:missing-key:yourDraftOffer`), and likewise a missing `attempt.log` when `state.attempt !== null`.
- Add `ownOwnedGearIds` to the secrets and require `yourOwnedGearIds` to match it.
- Check that each `seats[]` entry has exactly the keys `{seatId, equippedGearIds, ready, draftPending}`.
- Compare log entries as an ordered list of `(event, actorSeatId, subjectSeatIds, gearId)`, not by count.

### WR-05: Expedition rooms are creatable server-side, but the placeholder board has no exit controls

**File:** `packages/schema/src/room.ts:25`; `packages/schema/src/create-room.ts:20-24`; `apps/web/components/expedition/ExpeditionBoard.tsx:10-28`; `apps/web/components/game-ui.tsx:54`
**Issue:** `GameIdSchema` and `CreateRoomRequestSchema` now accept `"expedition"`, and `GAME_REGISTRY` can start one. The "coming soon" gate exists only as `disabled: true` on a client-side `<option>`. A crafted JSON POST or join frame creates a real Expedition room. Once 3+ players start it, `ExpeditionBoard` renders a dead-end screen. It ignores `onAction`, `onDeleteRoom`, and `onRestartLobby`, so the host cannot delete or reset the room, and the table is stuck until idle GC runs. That conflicts with the core value ("the game does not break, stall").
**Fix:** Either render the delete and restart controls in the placeholder:
```tsx
export function ExpeditionBoard({ view, onDeleteRoom }: BoardProps) { /* ... */ {onDeleteRoom && <button onClick={onDeleteRoom}>Delete room</button>} }
```
Or refuse `startGame` for Expedition on the server until Phase 12, for example with a registry flag `startable: false`.

### WR-06: The native-form create path can never produce a valid Expedition request

**File:** `packages/schema/src/create-room.ts:20-24` (together with `apps/web/lib/create-room-form.ts:23-24`)
**Issue:** The Expedition branch requires `config: z.null()`. `readCreateRoomForm` returns `config: undefined` when the `config.expedition` field is absent, and a form cannot submit `null`. So the D-17 pre-hydration form POST always redirects to `/?error=create` for Expedition. The problem is hidden today because the option is disabled, but Phase 12 will surface it as soon as the picker is enabled. No test covers the form path for Expedition.
**Fix:** Normalize in the form reader, or accept an absent config for games that have none:
```ts
config: z.null().optional().transform(() => null),
```
Add a form-path test to `route.test.ts` for `gameId=expedition`.

## Info

### IN-01: The identity multiset flags only excess counts, so an omission can mask a leak

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:242-247`
**Issue:** An allowed count is only an upper bound. A view that drops a legitimate occurrence of an identity (for example a face-up objective target, which shares its identity with a card in someone's hand) while exposing that same identity from a hidden hand in id-less form stays within the count. The multiset also recognizes only objects that have both `suit` and `rank`, or `joker`. Any other encoding (such as a `"hearts-7"` string or `{s,r}`) is invisible to it.
**Fix:** Compare exact counts (observed === allowed) at least for the fields the checker can place precisely (`yourHand`, trick plays, `removedCards`), or document this limitation next to the checker.

### IN-02: The checker's header overstates its independence and zero-dependency status

**File:** `packages/rules/src/expedition/adapter/view-leak-check.ts:19-25`
**Issue:** The header says the only runtime import is `rulesFor`, but the file also imports `CATALOG` at runtime (line 25). It also reuses the same `rulesFor(...).objectiveAssignment` decision as the projection, so the face-down/face-up split is shared code rather than an independent derivation, which undercuts the T-11-16 claim.
**Fix:** Correct the comment. Optionally derive face-down mode independently, for example from the fact that under Thick Fog every objective is owned at deal time.

### IN-03: Non-vacuity counters depend on test execution order

**File:** `packages/rules/src/expedition/adapter/view.property.test.ts:167-174`; `apps/worker/src/expedition-wiring.test.ts:292-299`
**Issue:** The non-vacuity `it` reads module-level counters that sibling tests fill in. Running it alone (`-t non-vacuity`) or with `sequence.shuffle` makes it fail spuriously.
**Fix:** Assert the counters in an `afterAll`, or fold them into the property test body, as `run.property.test.ts:176` already does.

### IN-04: The view/wire compile-time assertion is only one-directional below the top level

**File:** `apps/worker/src/game-registration.ts:183-193`; `packages/schema/src/games/expedition.ts:199`
**Issue:** `[ExpeditionView] extends [ExpeditionViewWire]` accepts extra nested keys in `view-types.ts` because of TypeScript width subtyping. Only the top-level key sets are checked in both directions. A nested field added to the view but not to the schema compiles, then fails strict validation at runtime for every seat. That is safe (it fails closed) but takes down the whole table. Similarly, `reason: max(200)` turns any long gear `canUse` string into a table-wide `view_unavailable`.
**Fix:** Add a deep mutual-assignability assertion, for example `[ExpeditionViewWire] extends [ExpeditionView]` as well, and add a contract test that every `canUse` reason string is at most 200 characters.

---

_Reviewed: 2026-09-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
