---
phase: 10-run-layer-gear-engine-bosses
reviewed: 2026-09-27T00:00:00Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - packages/rules/src/expedition/README.md
  - packages/rules/src/expedition/actions.test.ts
  - packages/rules/src/expedition/actions.ts
  - packages/rules/src/expedition/boss/blind-orders.ts
  - packages/rules/src/expedition/boss/boss-def.ts
  - packages/rules/src/expedition/boss/boss.contract.test.ts
  - packages/rules/src/expedition/boss/eclipse.ts
  - packages/rules/src/expedition/boss/fog-mutiny.test.ts
  - packages/rules/src/expedition/boss/mutiny.ts
  - packages/rules/src/expedition/boss/radio-eclipse.test.ts
  - packages/rules/src/expedition/boss/radio-silence.ts
  - packages/rules/src/expedition/boss/registry.ts
  - packages/rules/src/expedition/gear/broadcast.ts
  - packages/rules/src/expedition/gear/chatter.ts
  - packages/rules/src/expedition/gear/commandeer.ts
  - packages/rules/src/expedition/gear/gear-def.ts
  - packages/rules/src/expedition/gear/gear.contract.test.ts
  - packages/rules/src/expedition/gear/ghost.ts
  - packages/rules/src/expedition/gear/info-gear.test.ts
  - packages/rules/src/expedition/gear/jam.ts
  - packages/rules/src/expedition/gear/objective-gear.test.ts
  - packages/rules/src/expedition/gear/overclock.ts
  - packages/rules/src/expedition/gear/peek.ts
  - packages/rules/src/expedition/gear/pickpocket.ts
  - packages/rules/src/expedition/gear/reassign.ts
  - packages/rules/src/expedition/gear/registry.ts
  - packages/rules/src/expedition/gear/reroll.ts
  - packages/rules/src/expedition/gear/run-gear.test.ts
  - packages/rules/src/expedition/gear/table-gear.test.ts
  - packages/rules/src/expedition/objective-kinds.contract.test.ts
  - packages/rules/src/expedition/purity.test.ts
  - packages/rules/src/expedition/rules.ts
  - packages/rules/src/expedition/run/balance.test.ts
  - packages/rules/src/expedition/run/balance.ts
  - packages/rules/src/expedition/run/catalog.ts
  - packages/rules/src/expedition/run/compose.test.ts
  - packages/rules/src/expedition/run/compose.ts
  - packages/rules/src/expedition/run/draft.test.ts
  - packages/rules/src/expedition/run/draft.ts
  - packages/rules/src/expedition/run/lifecycle.test.ts
  - packages/rules/src/expedition/run/lifecycle.ts
  - packages/rules/src/expedition/run/replay-reset.test.ts
  - packages/rules/src/expedition/run/rng.test.ts
  - packages/rules/src/expedition/run/rng.ts
  - packages/rules/src/expedition/run/run-actions.test.ts
  - packages/rules/src/expedition/run/run-actions.ts
  - packages/rules/src/expedition/run/run-rules.ts
  - packages/rules/src/expedition/run/run-test-support.test.ts
  - packages/rules/src/expedition/run/run-test-support.ts
  - packages/rules/src/expedition/run/run.property.test.ts
  - packages/rules/src/expedition/run/toolkit.test.ts
  - packages/rules/src/expedition/run/toolkit.ts
  - packages/rules/src/expedition/run/types.ts
  - packages/rules/src/expedition/run/use-gear.test.ts
  - packages/rules/src/expedition/run/use-gear.ts
  - packages/rules/src/expedition/run/whisper.test.ts
  - packages/rules/src/expedition/run/whisper.ts
  - packages/rules/src/expedition/state.ts
  - packages/rules/src/expedition/trick.test.ts
  - packages/rules/src/expedition/trick.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-09-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 60
**Status:** issues_found

## Summary

I reviewed all non-test source under `run/`, `gear/` and `boss/`, plus the modified `rules.ts`, `trick.ts`, `actions.ts` and `state.ts`. For the called Phase 9 modules (`camp.ts`, `objectives.ts`) I read only the parts needed to check semantics. I read the test harness (`run-test-support.ts`, `gear.contract.test.ts`) to see what the property and contract suites actually cover. I checked each gear item and boss twist against D-01..D-15 and spec §3–§6.

Most of the layer holds up. The derive-don't-cache rule is followed. The replay reset is structural: everything camp-scoped lives in `AttemptState`, and `startAttempt` rebuilds it. Every draw goes through a named, seed-derived stream. The Flare (D-08), Machete (D-09), Trail Map (D-10), Camouflage (D-11), Poncho (D-04), boss persistence (D-02/D-03) and the pre-deal wait (D-12) all match the locked decisions.

One confirmed crash:
- **Compass on a win-card objective:** `checkUseGear` accepts it, but the toolkit op throws. A runtime probe confirmed this.

Two hidden-information concerns:
- Under Thick Fog, Trail Map's refusal reason leaks whether a teammate holds a pending objective.
- A reveal records only where the card was when it was revealed. The model does not say what happens when the card later changes hands.

The whole-run property tests and the gear contract suite never reach the crash, because the harness never enumerates objective-pick-window gear.

## Critical Issues

### CR-01: Compass (reroll) on a face-up win-card objective throws inside the toolkit

**File:** `packages/rules/src/expedition/run/toolkit.ts:287-289` (with `packages/rules/src/expedition/gear/reroll.ts:36`)
**Issue:** `reroll.canTarget` accepts both `win-card` and `ordered` objectives, which matches spec §5.1: "replace one face-up, not-yet-taken objective". The toolkit's `replace-objective` op then rejects anything that is not `ordered`:

```ts
if (objective.kind !== "ordered") {
  throw new Error("toolkit: replace-objective: objective has no card to replace");
}
```

So `applyRunAction(run, seat, { type: "use-gear", gearId: "reroll", targets: [<unowned win-card id>] })` passes every legality check and then throws. A probe against the production `CATALOG` at camp 2 (all win-card slots) reproduces it: `probe1 THREW: toolkit: replace-objective: objective has no card to replace`.

Impact:
- At camps 1, 2, 3 and 5, every face-up target is a win-card objective, so Compass always crashes there.
- At camps 4 and 6 it crashes whenever a player picks a win-card target.

Under A3 this should be a content defect that throws, but here the gear is valid and the toolkit is wrong. In Phase 11 it becomes a server-side exception on an ordinary, legal player action.

**Fix:** Accept any card-bearing kind in the op, matching `camp.ts`'s `isCardBearingSlot`:
```ts
if (objective.kind !== "ordered" && objective.kind !== "win-card") {
  throw new Error("toolkit: replace-objective: objective has no card to replace");
}
```
Then add an objective-gear test that rerolls an unowned win-card objective and checks that its id and kind are kept and its target becomes the top of the deck.

## Warnings

### WR-01: The test harness never exercises objective-pick-window gear, which is why CR-01 was not caught

**File:** `packages/rules/src/expedition/run/run-test-support.ts:228-283`; `packages/rules/src/expedition/gear/gear.contract.test.ts:127-141`
**Issue:**
- `enumerateLegalRunActions` generates `use-gear` candidates only in the pre-deal window and the between-tricks window. It never does so in the objective-pick window, so `run.property.test.ts`'s whole-run safety and determinism properties never apply Compass at all.
- `gear.contract.test.ts`'s `findUsableFixture` applies only the first target combination that `checkUseGear` accepts. Its camp-6 fixture puts the ordered ① objective first, so it always picks an ordered target and never a win-card one.

Neither suite asserts the contract that matters: "`checkUseGear(...).ok` implies `applyUseGear` does not throw". Any future gear that suffers the same legality/toolkit mismatch will pass CI the same way.
**Fix:**
- Enumerate use-gear candidates in the objective-pick window too, in `enumerateLegalRunActions`: add `if (currentWindow(run, rules) === "objective-pick") { ...same per-seat gear loop... }`.
- In the gear contract suite, iterate over every candidate target combination that `checkUseGear` accepts, and assert that `applyRunAction` does not throw for each one, not just the first.

### WR-02: Under Thick Fog, Trail Map's refusal reason leaks a teammate's hidden objective ownership

**File:** `packages/rules/src/expedition/gear/reassign.ts:24-31`
**Issue:** Under Thick Fog, spec §5.3 and §6.4 say "each player sees only their own" objectives. Trail Map's `canTarget` returns "Neither of you has an unresolved objective" when neither the user nor the target holds a pending objective.

A player with no pending objectives of their own can probe it. This is common: at 5 players with 3 objectives, two seats get none. A refused use is not recorded, and `gear_unavailable` does not spend the gear, so they can probe `use-gear reassign [X]` against each teammate in turn:
- A refusal proves that X holds no pending objective.
- The first acceptance identifies a seat that does.

That is hidden-objective information that the view rules forbid. The error code alone (`gear_unavailable`) carries the signal, even if Phase 11 hides the reason string.
**Fix:** Do not condition legality on the target's hidden objectives. Either:
- check only `hasPendingObjective(camp, ctx.self)`, and let a swap with an empty-handed teammate be a legal no-op; or
- when `rules.objectiveAssignment(ctx.run) === "face-down"`, drop the target-side check entirely.

### WR-03: A reveal's `fromSeatId` goes stale once the card changes hands, and the reveal model does not say whether the reveal follows the card

**File:** `packages/rules/src/expedition/run/types.ts:69-74`; `packages/rules/src/expedition/run/toolkit.ts:245-276` and `321-342`; `packages/rules/src/expedition/run/whisper.ts:449-454`
**Issue:** A `Reveal` stores `cardId` plus `fromSeatId`, the holder at reveal time, and persists for the whole attempt (COMM-02). Trained Monkey's `swap-cards` op moves cards between hands mid-camp and never touches `attempt.reveals`. Example:
1. A whispers card X to B.
2. A later uses the Monkey, giving X to C in exchange for a random card.
3. The reveal still says X is in A's hand, which is now false.

If Phase 11 instead finds revealed cards by `cardId` in the current hands, which is the natural way to render "your teammate's card", B learns that X moved to C. B also learns which card A chose to give away, which the public log (`subjectSeatIds: [C]`, no card) deliberately withholds.

Either way, the Phase 10 contract Phase 11 builds on is under-specified on exactly the COMM-02 privacy boundary this review was asked to check.
**Fix:** Pick and document one rule, in `types.ts` next to the privacy notes, and enforce it in the toolkit. One option is to invalidate a reveal when its card leaves `fromSeatId`'s hand: in `swap-cards` and `move-card`, filter out `attempt.reveals` entries whose `cardId` moved. The alternative is to state explicitly that a reveal pins the card's identity only, never its location, and that Phase 11 must not use it to find the card. Add a test for whichever rule is chosen.

### WR-04: The `move-card` op can create uneven hands, and the conservation check does not guard hand sizes

**File:** `packages/rules/src/expedition/run/toolkit.ts:219-243`, `400-425`
**Issue:** `move-card` is part of the public `ToolkitOp` vocabulary that ENG-01 advertises to content authors ("one file plus one registry line"). It changes two hands' sizes by ±1. The `applyToolkitOps` post-check only compares the sorted multiset of card ids, which a move preserves.

After any `move-card`, one seat runs out of cards before `totalTricks` tricks are done:
- On that seat's turn, `canPlayCard` rejects every action.
- `currentActorSeatId` still names that seat.
- `campPhase` stays `playing` because not every objective is resolved.

The camp is permanently stuck, and no player action can unstick it. No v1 gear emits `move-card` today, so this is latent, but it is an invariant hole in the component that is supposed to preserve invariants "by construction".
**Fix:** Either remove `move-card` from `ToolkitOp` until a gear needs it, or extend the post-fold assertion so that hand sizes are unchanged too:
```ts
for (const h of attempt.camp.hands) {
  const before = beforeCamp!.hands.find((b) => b.seatId === h.seatId)!;
  if (h.cards.length !== before.cards.length) throw new Error("toolkit: hand-size invariant violated");
}
```
Note that this makes an unpaired `move-card` always throw, so pair it with a return move or drop the op.

## Info

### IN-01: `whispersUsedBy` counts any log entry with `event === "whisper"`, including toolkit `log` ops

**File:** `packages/rules/src/expedition/run/whisper.ts:388-391`; `packages/rules/src/expedition/run/toolkit.ts:370-386`
**Issue:** The toolkit `log` op accepts an arbitrary `event` string. A gear that logs `event: "whisper"` would silently use up the actor's Whisper allowance and switch off Signal Flare's widening (`broadcast.ts:161`). The op also does not check that `subjectSeatIds` are seats.
**Fix:** Also filter on `entry.gearId === null` in `whispersUsedBy`, or reject reserved event names (`"whisper"`, `"use-gear"`) in the `log` op, and check `subjectSeatIds` against `run.seatIds`.

### IN-02: The boss-camp numbers are hardcoded outside the balance table

**File:** `packages/rules/src/expedition/run/compose.ts:84`; `packages/rules/src/expedition/run/types.ts:60,111`
**Issue:** `balance.ts` claims every tunable ramp number lives in that file, and it exports `BOSS_CAMPS`. But `activeBossId` hardcodes `run.campNumber !== 3 && run.campNumber !== 6`, and `RunState.bossTwists` is keyed only by the literals 3 and 6. If BAL-01 changes `BOSS_CAMPS`, `startAttempt` would draw a twist that `activeBossId` never applies.
**Fix:** Use `BOSS_CAMPS.includes(...)` in `activeBossId`, and key `bossTwists` as `Partial<Record<CampNumber, string | null>>`, or document that `BOSS_CAMPS` is not tunable.

### IN-03: `commandeer.canUse`, `reroll.canTarget` and `reassign.canTarget` rely on a non-null `ctx.camp!` assertion

**File:** `packages/rules/src/expedition/gear/commandeer.ts:260`; `gear/reroll.ts:31`; `gear/reassign.ts:25`
**Issue:** These are safe only because `gearAvailability` checks the window before calling `canUse`. Phase 11 UI dimming ("what can I do now") will probably call `def.canUse` on a context built in the pre-deal window, and that throws a TypeError.
**Fix:** Return a reason string when `ctx.camp === null`, instead of asserting.

### IN-04: Stream names are `:`-delimited with no escaping of seat or gear ids

**File:** `packages/rules/src/expedition/run/rng.ts:316-340`
**Issue:** `STREAMS.gear(...)` joins `gearId`, `seatId` and `purpose` with `:`. A seat id or gear id that contains `:` could collide with another tuple, which breaks A1's "two draws never share a stream name" guarantee. nanoid seat ids cannot contain `:`, so this cannot happen today.
**Fix:** Assert in `createRun` that ids contain no `:`, or encode each component, for example with `JSON.stringify` of the tuple.

### IN-05: Mutiny's "leader" is left ambiguous when Machete takes trick 1's lead

**File:** `packages/rules/src/expedition/boss/mutiny.ts:23-26`
**Issue:** D-09 lets Machete take the first lead before trick 1. Mutiny still fails the camp if the expedition leader wins trick 1, even though someone else led it. That is defensible, since spec §5.3 says "the leader" and the expedition leader is the camp-level role. But the Mutiny + Machete interaction is neither documented nor tested, and the twist is provisional.
**Fix:** State the ruling in `mutiny.ts`'s header, then either add a test for it or put it to the owner.

---

_Reviewed: 2026-09-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
