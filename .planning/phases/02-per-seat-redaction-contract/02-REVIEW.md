---
phase: 02-per-seat-redaction-contract
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/components/ForeheadCardGame.tsx
  - apps/worker/src/game-registration.ts
  - apps/worker/src/persistence.test.ts
  - apps/worker/src/redaction-wire.test.ts
  - apps/worker/src/room-do.test.ts
  - apps/worker/src/room-do.ts
  - apps/worker/src/room-state.test.ts
  - apps/worker/src/room-state.ts
  - apps/worker/src/seat-projection.test.ts
  - apps/worker/src/seat-projection.ts
  - apps/worker/src/source-structure.test.ts
  - e2e/in-progress-arrival.spec.ts
  - e2e/start-game.spec.ts
  - packages/rules/src/adapter.test.ts
  - packages/rules/src/adapter.ts
  - packages/rules/src/forehead-card-leak-check.test.ts
  - packages/rules/src/forehead-card-leak-check.ts
  - packages/rules/src/forehead-card.property.test.ts
  - packages/rules/src/forehead-card.test.ts
  - packages/rules/src/forehead-card.ts
  - packages/rules/src/index.ts
  - packages/rules/src/shuffle.test.ts
  - packages/rules/src/shuffle.ts
  - packages/schema/package.json
  - packages/schema/src/constants.ts
  - packages/schema/src/games/forehead-card.test.ts
  - packages/schema/src/games/forehead-card.ts
  - packages/schema/src/games/subpath.test.ts
  - packages/schema/src/messages.test.ts
  - packages/schema/src/messages.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-15
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

This phase's job is hidden-information correctness: a seat must never receive its own secret card value over the wire, a hidden card must structurally lack the `value` key, and both must be enforced through a single chokepoint (`toSeatView` → `projectSeatView` → socket). I read every listed file with that adversarial framing and traced the actual data flow, not just the tests that claim to prove it.

**Overall assessment: this is unusually rigorous work for the stated contract.** The whitelist-construction discipline in `forehead-card.ts` (no spread/no `delete`/no `Object.assign` in `toPlayerView`), the strict `z.strictObject` schema nested at every level, the fail-closed `validateGameView` (returns `null`, never the raw view, on any schema mismatch), and the structural chokepoint audit (`source-structure.test.ts`, which mechanically counts `.send(`/`toSeatView(`/`toPlayerView(`/`projectSeatView(` call sites via a real comment-stripping scanner rather than a naive regex) together give strong, testable evidence for the "one send path, no bypass" claim. The three-layer D-11 leak suite (adapter property test → wire-string property test → live `wrangler dev` socket capture, including a real reconnect and a real process-kill persistence test) is genuinely load-bearing evidence, not decorative coverage — I traced each layer's assertions and did not find one that can pass vacuously under the fixtures actually used.

I did not find a Critical-tier defect: no path where a seat's own secret value reaches the wire, no second `connection.send`/`toPlayerView` call site, and no test whose assertion is unreachable/tautological under the parameters it's actually exercised with today. The findings below are about residual risk and test-robustness gaps that should be addressed before this pattern (fixed 128-bit-state PRNG, string-substring leak scanning, single toy adapter) is reused as the template for the real Hanabi engine in Phase 4, where the stakes and the attack surface both grow.

## Warnings

### WR-01: sfc32 output-recovery risk is not addressed, only seed-brute-force risk

**File:** `packages/rules/src/shuffle.ts:1-95`
**Issue:** The file's own header comment justifies the 128-bit `cyrb128`-seeded `sfc32` design specifically against *seed brute-force* ("a 32-bit PRNG seed space... is small enough that a player... could... brute-force the seed"). It does not address the separate and more realistic risk class for this game: **internal-state recovery from observed raw outputs**, which is a known weakness of small-state non-cryptographic PRNGs like sfc32 (unlike a CSPRNG, sfc32's `sfc32Step` is a short, purely arithmetic/bitwise recurrence with only 128 bits of state — in principle, a handful of raw 32-bit outputs are enough unknowns/equations to attempt reconstructing `(a,b,c,d)` and then predict every subsequent draw, including future card values/ids, without ever knowing the original seed string). Today the raw draw values are reasonably insulated (deck permutation values are never emitted raw; `mintCardId` heavily quantizes each draw down to `value % 26`), but the "deck" stream's *effects* (the visible order of other players' dealt cards) are exactly a set of raw-permutation observations tied to consecutive PRNG outputs from the same 128-bit state family. This is a real residual gap in the stated threat model, not a proven break today.
**Fix:** Either (a) explicitly scope and document this residual risk as accepted for the toy game (which is deleted in Phase 4 per the file's own comments), or (b) if this shuffle/id-minting pattern is intended to carry forward into the real Hanabi engine, swap to a CSPRNG-derived keystream (e.g. periodically re-seeding sub-streams from `crypto.getRandomValues`, or using a PRNG with a published state-recovery resistance proof) before that reuse happens, and add a canary test analogous to the D-13 suite that specifically checks state-recovery resistance is out of scope in the intended usage (bounded number of draws per game).

### WR-02: Canary F leak-check test can silently degrade to zero assertions under different fixture parameters

**File:** `packages/rules/src/forehead-card-leak-check.test.ts:72-80`
**Issue:**
```ts
it("Canary F: deck leaked under an arbitrary key", () => {
  const leaky = { yourCard: { id: ownId, hidden: true }, debugDeck: [...state.deck] };
  const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
  for (const token of secrets.forbiddenTokens) {
    if (state.deck.includes(token as (typeof state.deck)[number])) {
      expect(reasons).toContain(`string:forbidden-token:${token}`);
    }
  }
});
```
The `expect` only runs inside the `if (state.deck.includes(token))` guard. With the current fixture (3 seats dealt out of 16 star values, leaving 13 in `state.deck`), this loop does execute real assertions. But the test provides no guarantee of that — if the fixture were ever changed (e.g. more seats, or a smaller/larger card pool where the deck is empty or the seed token happens to collide), this "canary" would pass with **zero** executed assertions, defeating its entire purpose as a leak-detection regression guard. This is exactly the "assertion that cannot fail under some reachable parameterization" pattern the redaction contract's own design philosophy (D-13) exists to rule out elsewhere (see the explicit non-vacuousness check in `room-do.test.ts`'s D-11 layer-3 test: `expect(forbiddenTokens.length, ...).toBeGreaterThanOrEqual(10)`).
**Fix:** Assert non-vacuousness explicitly, e.g.:
```ts
const deckTokens = secrets.forbiddenTokens.filter((t) => state.deck.includes(t as (typeof state.deck)[number]));
expect(deckTokens.length).toBeGreaterThan(0); // guard against a silently vacuous loop
for (const token of deckTokens) {
  expect(reasons).toContain(`string:forbidden-token:${token}`);
}
```

### WR-03: checkSeatViewForLeaks only detects string-literal and key-presence leaks, not alternate encodings

**File:** `packages/rules/src/forehead-card-leak-check.ts:38-96`
**Issue:** `checkSeatViewForLeaks` (the single checker reused across all three D-11 layers, per the file's own header) detects leaks two ways: (1) structurally, by checking for the literal key `"value"` on a hidden/own card, and (2) via raw substring search for the literal secret string (the star name, the deck values, the seed) in the serialized frame. It cannot detect a leak of the *same secret information* encoded differently — e.g. a numeric index into `FOREHEAD_CARD_VALUES`, a hash of the value, a rotated/obfuscated string, or the value split across two concatenated fields. This is not exploitable in the current `forehead-card.ts` adapter (which only ever emits the literal string under the literal `value` key, by the whitelist-construction discipline documented in that file), so this is not a live bug — but it is a real gap in the *test methodology* this phase set out to build as reusable evidence (`forehead-card-leak-check.ts`'s header explicitly frames itself as "the SINGLE leak checker used by all three D-11 layers" and implicitly as the template Phase 4's real Hanabi engine will reuse). Hanabi's real card representation is much more likely to use `{suit, rank}`-style numeric/enum encoding than free-text names, which this checker's string-substring approach would not catch if a suit/rank pair leaked under an unexpected key.
**Fix:** Before Phase 4 reuses this checker for the Hanabi adapter, extend it (or add a sibling checker) to also flag any *numeric* encoding of a secret value (e.g. an own-card's rank/suit index appearing under a key not in an allow-list for that card), not just string leaks — otherwise the "D-11 layer 1/2/3 all reuse the same checker" reuse story (the phase's main evidence strategy) inherits this blind spot silently.

## Info

### IN-01: ForeheadCardGame's runtime type guard checks fewer fields than the schema requires

**File:** `apps/web/components/ForeheadCardGame.tsx:13-23`
**Issue:** `isForeheadCardView` only checks for `yourCard`, `otherCards` (array), and `revealed` (array); it does not check `deckCount`, `activeSeatId`, `isYourTurn`, or `score`. A partially-shaped `game` object that happens to have those three keys but is missing the others would pass the guard, and later expressions like `game.score` / `game.deckCount` would silently render `undefined` rather than surfacing a shape mismatch. This is client-only rendering robustness, not a security/leak issue (the server-side `ForeheadCardViewSchema` is what actually gates the wire payload), but it weakens the client's own defense-in-depth against a future schema drift.
**Fix:** Either check all seven top-level keys, or accept this is acceptable given the server-side strict schema is the real gate (in which case a short comment noting that decision would help future readers).

### IN-02: mapAdapterError() discards the real AdapterError reason by construction

**File:** `apps/worker/src/room-state.ts:287-293`
**Issue:** `mapAdapterError()` takes zero parameters and unconditionally returns `"bad_request"`, even though `adapter.applyAction` can return three distinct reasons (`not_your_turn`, `invalid_action`, `game_over`). This is explicitly called out as deliberate scope-narrowing in the adjacent comment ("Plan 09 can enrich the message... without widening this shared enum"), so it is not a defect today, but note that the function's *signature* (no parameter at all) makes it impossible for a future call site to opt into passing the real reason without a signature change — worth flagging now so Plan 09 isn't surprised that the information was thrown away one layer up, not just mapped down.
**Fix:** No action required for this phase; consider having `mapAdapterError` at least accept the `AdapterError` value (even if it still returns a constant for now), so the call site retains the option to widen later without re-plumbing the signature.

---

_Reviewed: 2026-09-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
