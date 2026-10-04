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
 * with `@games/schema`'s canonical `Variant`. This is Hanabi's own concrete
 * `TConfig` type argument to `GameAdapter` — not every game's config. */
export type Variant = "base" | "rainbow" | "black";

/** Closed set of reasons `applyAction` can reject a request. Phase 3 widened
 * this union for Hanabi's typed refusals per D-03; the interface's five
 * members below are unchanged. This is Hanabi's own concrete `TError` type
 * argument to `GameAdapter` — not every game's error vocabulary (D-06). */
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
export type AdapterResult<TState, TError extends string> =
  | { ok: true; state: TState }
  | { ok: false; error: TError };

/** Result of a completed game. `checkGameEnd` returns `null` while the game
 * continues. `band` is an additive, optional widening for Phase 3's Hanabi
 * engine (D-17): the engine computes a descriptive band for the score, not
 * the UI, so this is a new optional member, not a change to any existing
 * caller's expected shape. This is Hanabi's own concrete `TEndResult` type
 * argument to `GameAdapter` — not every game's end-result shape (D-06). */
export type GameEndResult = { score: number; reason: string; band?: string };

/**
 * The contract a game plugs into the room layer through. Five required
 * members and two optional hooks, no others — see the file-level invariants
 * above. Generic over
 * each game's own config (`TConfig`), end-result (`TEndResult`) and error
 * (`TError`) types (D-06) — deliberately no default type arguments, so the
 * seam is never accidentally re-specialized back to Hanabi's shapes.
 */
export interface GameAdapter<TState, TAction, TConfig, TEndResult, TError extends string> {
  /** Stable adapter identifier persisted alongside room state, so a deploy
   * that swaps adapters is detectable. */
  readonly id: string;

  /** Deterministic given its inputs — the same seatIds/config/seed always
   * produces a deep-equal initial state. `seed` is a string so Phase 3's
   * RULES-19 deterministic shuffle needs no signature change. */
  createInitialState(input: {
    seatIds: readonly string[];
    config: TConfig;
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
  ): AdapterResult<TState, TError>;

  /** Returns the projection for exactly ONE seat. There is deliberately no
   * spectator-view variant and no zero-argument serializer — every outbound
   * send goes through this function, per seat, even for the trivial toy
   * game. */
  toPlayerView(state: TState, seatId: string): unknown;

  /** `null` means the game continues. */
  checkGameEnd(state: TState): TEndResult | null;

  /** Optional. The request the room submits for `seatId` once it has been
   * disconnected for a grace period, when the game is waiting on that seat
   * for a decision it may decline. `null` when the game is not waiting on
   * it. A non-null request must be one `applyAction` accepts. */
  autoPassRequest?(state: TState, seatId: string): unknown | null;

  /** Optional. Dev-mode tooling (a worker started with DEV_MODE only). The
   * room layer never calls it otherwise, so a game without it plays exactly
   * the same. */
  readonly dev?: GameDevHooks<TState>;
}

/** One input of a dev shortcut, rendered generically by the web dev panel. */
export type DevField =
  | { readonly name: string; readonly label: string; readonly kind: "number"; readonly min: number; readonly max: number; readonly initial: number }
  | { readonly name: string; readonly label: string; readonly kind: "choice"; readonly options: readonly DevOption[] }
  | { readonly name: string; readonly label: string; readonly kind: "text"; readonly initial: string };

export type DevOption = { readonly value: string; readonly label: string };

/** A named state edit the dev panel offers as a button plus its fields. */
export type DevShortcut = {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly fields: readonly DevField[];
};

/** A shortcut's submitted field values, keyed by `DevField.name`. Untrusted. */
export type DevParams = Readonly<Record<string, string | number>>;

export type DevResult<TState> = { readonly ok: true; readonly state: TState } | { readonly ok: false; readonly error: string };

/** A titled block of plain-text lines showing hidden information. */
export type DevInspectSection = { readonly title: string; readonly lines: readonly string[] };

/** A game's dev-mode surface. Everything here sees the WHOLE state, so its
 * output may only ever reach a dev-mode socket, never a player view. */
export interface GameDevHooks<TState> {
  /** Problems that make `state` unusable, e.g. a broken card count. `state`
   * has already passed the game's state schema; `[]` means it is legal. */
  check(state: TState): readonly string[];
  /** The seat ids `state` was built for, in seat order. Loading a state
   * saved in another room renames these to the room's own seats. */
  seatIds(state: TState): readonly string[];
  /** The shortcuts offered for `state` (field options may depend on it). */
  shortcuts(state: TState): readonly DevShortcut[];
  /** Applies shortcut `id`, or returns a readable error. Never throws. */
  runShortcut(state: TState, id: string, params: DevParams): DevResult<TState>;
  /** The next request one of `seatIds` can make that `applyAction` accepts,
   * or `null` when none of them has a decision to make. */
  botMove(state: TState, seatIds: readonly string[]): { readonly seatId: string; readonly request: unknown } | null;
  /** A key that changes whenever the game crosses a boundary autoplay can
   * stop at (Expedition: a camp settling). */
  milestone(state: TState): string;
  /** Full-information summary for a human: every hand, every hidden thing. */
  inspect(state: TState): readonly DevInspectSection[];
}
