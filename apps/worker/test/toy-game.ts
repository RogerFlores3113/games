// D-10: a minimal, test-only second game proving apps/worker's game registry
// is genuinely generic (RETROSPECTIVE lesson 2) — different seat limits, its
// own config/view schemas and its own error codes, dispatched through the
// injectable `games: GameRegistry` seam plans 08-03 to 08-06 built into
// room-state.ts/seat-projection.ts.
//
// Lives here, outside apps/worker/src/, rather than co-located with
// room-state.test.ts: source-structure.test.ts's `listSourceFiles()` scans
// every non-`.test.ts` file directly under `src` recursively, and A5 asserts
// `toPlayerView(` is called exactly once anywhere in src (inside
// room-state.ts's `toSeatView`). A fixture with its own `toPlayerView`
// implementation under `src/` would add a second occurrence and break that
// count. `apps/worker/test/` already holds another test-only module
// (cloudflare-workers-shim.ts) for the same "outside src, not scanned"
// reason. `tsc -b` still typechecks this file because
// `apps/worker/src/registry.test.ts` (inside `src`, covered by
// apps/worker/tsconfig.json's `include`) imports it — TypeScript follows
// imports regardless of `include`'s root-file list.
//
// D-09: `TOY_GAME_ID` is deliberately NOT a member of the production
// `GameIdSchema` enum (`packages/schema/src/room.ts`), so nothing here can
// ever flow through the wire parser (`parseClientMessage`) or the production
// `GAME_REGISTRY`. Every test that exercises this fixture calls room-state.ts
// /seat-projection.ts's pure functions directly with an injected registry,
// never through `ClientMessageSchema.safeParse`.

import { z } from "zod";
import type { AdapterResult, GameAdapter } from "@games/rules";
import type { GameErrorDetail, GameId } from "@games/schema";
import { defineGame, GAME_REGISTRY } from "../src/game-registration";
import type { GameRegistry, GameRegistryEntry } from "../src/game-registration";

/** Deliberately cast, not asserted as a real `GameId` — the toy id is
 * intentionally outside the production `GameIdSchema` union (D-09), so tests
 * that use it reach room-state.ts/seat-projection.ts's pure functions
 * directly, never the wire parser. */
export const TOY_GAME_ID = "__toy__" as unknown as GameId;

export type ToyConfig = { rounds: 1 | 2 | 3 };

export const ToyConfigSchema = z.strictObject({
  rounds: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type ToyAction = { type: "pass" };

export type ToyErrorCode = "toy_not_your_turn" | "toy_bad_request";

export type ToyState = {
  readonly seatIds: readonly string[];
  readonly config: ToyConfig;
  readonly turnIndex: number;
  readonly moves: number;
};

export type ToyEndResult = { passes: number };

/** Exact-key validation, mirroring `packages/rules/src/hanabi/actions.ts`'s
 * `isPlayRequest`-style guards: a request carrying any key other than `type`
 * (or a non-"pass" `type`) is rejected, never coerced. Never throws — adapter
 * invariant 2. */
function isToyPassRequest(request: unknown): request is ToyAction {
  if (typeof request !== "object" || request === null) {
    return false;
  }
  const keys = Object.keys(request);
  return keys.length === 1 && keys[0] === "type" && (request as { type: unknown }).type === "pass";
}

const toyAdapter: GameAdapter<ToyState, ToyAction, ToyConfig, ToyEndResult, ToyErrorCode> = {
  id: "toy",
  createInitialState({ seatIds, config }) {
    return {
      seatIds: [...seatIds],
      config,
      turnIndex: 0,
      moves: 0,
    };
  },
  applyAction(state, actorSeatId, request): AdapterResult<ToyState, ToyErrorCode> {
    // Invariant 1: never mutates `state` — every branch below returns a new
    // object (or, on rejection, no state at all).
    if (!isToyPassRequest(request)) {
      return { ok: false, error: "toy_bad_request" };
    }
    const activeSeatId = state.seatIds[state.turnIndex];
    if (actorSeatId !== activeSeatId) {
      return { ok: false, error: "toy_not_your_turn" };
    }
    return {
      ok: true,
      state: {
        ...state,
        turnIndex: (state.turnIndex + 1) % state.seatIds.length,
        moves: state.moves + 1,
      },
    };
  },
  toPlayerView(state, seatId) {
    return {
      you: seatId,
      turnSeatId: state.seatIds[state.turnIndex],
      rounds: state.config.rounds,
    };
  },
  checkGameEnd(state) {
    if (state.moves >= state.seatIds.length * state.config.rounds) {
      return { passes: state.moves };
    }
    return null;
  },
};

export const ToyViewSchema = z.strictObject({
  you: z.string(),
  turnSeatId: z.string(),
  rounds: z.number(),
});

/** D-07: an exhaustive switch with a `never`-typed default, mirroring
 * game-registration.ts's Hanabi `mapError` exactly. The toy's own codes are
 * deliberately outside `GameErrorDetail`'s real (Hanabi-only, D-09)
 * discriminated union — this cast is the toy's own escape hatch, exercised
 * only by registry.test.ts calling room-state.ts's pure functions with an
 * injected registry, never by anything that flows through
 * `ServerMessageSchema.parse`. */
function mapToyError(error: ToyErrorCode): GameErrorDetail {
  switch (error) {
    case "toy_not_your_turn":
    case "toy_bad_request":
      return { gameId: TOY_GAME_ID, code: error } as unknown as GameErrorDetail;
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized ToyErrorCode: ${String(exhaustiveCheck)}`);
    }
  }
}

export const toyGameEntry: GameRegistryEntry = defineGame<ToyState, ToyAction, ToyConfig, ToyEndResult, ToyErrorCode>({
  gameId: TOY_GAME_ID,
  displayName: "Toy Test Game",
  adapter: toyAdapter,
  viewSchema: ToyViewSchema,
  configSchema: ToyConfigSchema,
  defaultConfig: { rounds: 1 },
  limits: { min: 3, max: 4 },
  mapError: mapToyError,
});

/** D-10: Hanabi plus the toy, so a coexistence test can start one room of
 * each against the SAME registry object. */
export const TEST_GAME_REGISTRY: GameRegistry = Object.freeze({
  ...GAME_REGISTRY,
  [TOY_GAME_ID]: toyGameEntry,
});

/** A toy entry whose `toPlayerView` leaks an extra `secret` key, for proving
 * `validateGameView`/`projectSeatView` fail closed (T-8-09) rather than
 * merely "usually" stripping unexpected fields. */
const leakyToyAdapter: GameAdapter<ToyState, ToyAction, ToyConfig, ToyEndResult, ToyErrorCode> = {
  ...toyAdapter,
  toPlayerView(state, seatId) {
    return {
      ...(toyAdapter.toPlayerView(state, seatId) as Record<string, unknown>),
      secret: "leak",
    };
  },
};

const leakyToyGameEntry: GameRegistryEntry = defineGame<ToyState, ToyAction, ToyConfig, ToyEndResult, ToyErrorCode>({
  gameId: TOY_GAME_ID,
  displayName: "Toy Test Game",
  adapter: leakyToyAdapter,
  viewSchema: ToyViewSchema,
  configSchema: ToyConfigSchema,
  defaultConfig: { rounds: 1 },
  limits: { min: 3, max: 4 },
  mapError: mapToyError,
});

export const LEAKY_TOY_REGISTRY: GameRegistry = Object.freeze({
  ...GAME_REGISTRY,
  [TOY_GAME_ID]: leakyToyGameEntry,
});
