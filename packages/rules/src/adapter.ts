// The game-adapter seam. This is the ONLY interface through which the room
// layer (Phase 1) talks to a game's rules engine (Phase 3/4's real Hanabi
// engine, or Phase 2's forehead-card toy).
//
// A conforming adapter MUST uphold these three invariants:
//   1. `applyAction` never mutates its `state` argument — it returns a new
//      state object (or the original unchanged reference) on rejection.
//   2. `applyAction` treats `request` as hostile input from the network and
//      validates it internally; it must never throw.
//   3. `toPlayerView` is pure and is the ONLY way state leaves the adapter —
//      there is deliberately no whole-state serializer on this interface.

/** Wire-level Hanabi variant. Duplicated (not imported) from `@games/schema`
 * because `packages/rules` must have ZERO runtime dependencies (FDN-02). A
 * compile-time test in Plan 04 asserts this union stays mutually assignable
 * with `@games/schema`'s canonical `Variant`. */
export type Variant = "base" | "rainbow" | "black";

/** Closed set of reasons `applyAction` can reject a request. Phase 3 widened
 * this union for Hanabi's typed refusals per D-03; the interface's five
 * members below are unchanged. */
export type AdapterError =
  | "not_your_turn"
  | "invalid_action"
  | "game_over"
  | "card_not_in_hand"
  | "no_clue_tokens"
  | "clue_touches_nothing"
  | "clue_target_invalid"
  | "discard_at_max_clues"
  | "clue_color_not_nameable";

/** Result of attempting to apply an action request to game state. */
export type AdapterResult<TState> =
  | { ok: true; state: TState }
  | { ok: false; error: AdapterError };

/** Result of a completed game. `checkGameEnd` returns `null` while the game
 * continues. `band` is an additive, optional widening for Phase 3's Hanabi
 * engine (D-17): the engine computes a descriptive band for the score, not
 * the UI, so this is a new optional member, not a change to any existing
 * caller's expected shape. */
export type GameEndResult = { score: number; reason: string; band?: string };

/**
 * The contract a game plugs into the room layer through. Exactly five
 * members, no others — see the file-level invariants above.
 */
export interface GameAdapter<TState, TAction> {
  /** Stable adapter identifier persisted alongside room state, so a deploy
   * that swaps adapters is detectable. `"forehead-card"` for Phase 2's toy. */
  readonly id: string;

  /** Deterministic given its inputs — the same seatIds/variant/seed always
   * produces a deep-equal initial state. `seed` is a string so Phase 3's
   * RULES-19 deterministic shuffle needs no signature change. */
  createInitialState(input: {
    seatIds: readonly string[];
    variant: Variant;
    seed: string;
  }): TState;

  /** `request` is `unknown` on purpose: the adapter, not the caller, parses
   * and validates the payload. This is the boundary that makes "asserting a
   * resulting state" structurally impossible at the seam — a client can only
   * ever request an action, never assert a patch. */
  applyAction(
    state: TState,
    actorSeatId: string,
    request: unknown,
  ): AdapterResult<TState>;

  /** Returns the projection for exactly ONE seat. There is deliberately no
   * spectator-view variant and no zero-argument serializer — every outbound
   * send goes through this function, per seat, even for the trivial toy
   * game. */
  toPlayerView(state: TState, seatId: string): unknown;

  /** `null` means the game continues. */
  checkGameEnd(state: TState): GameEndResult | null;
}
