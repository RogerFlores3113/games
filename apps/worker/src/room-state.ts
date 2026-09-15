// The pure room state machine (ROOM-03, ROOM-05, ROOM-06, ROOM-07). Every
// export here is a pure function over a `RoomState` value — no Durable
// Object, no `ctx.storage`, no `WebSocket`, no `Date.now()` reads. Every
// function that needs a timestamp takes `now: number` as a parameter, so
// Plan 06's alarm/grace-period tests can drive time deterministically and
// this file's own tests never touch the wall clock.
//
// FDN-01: the room layer holds no game logic. Its only contact with the
// game is through the adapter's four methods (`createInitialState`,
// `applyAction`, `toPlayerView`, `checkGameEnd`) — it never reaches into
// `state.game`'s fields directly.

import { counterGame } from "@games/rules";
import type { CounterAction, CounterState } from "@games/rules";
import { MAX_PLAYERS, MIN_PLAYERS } from "@games/schema";
import type {
  PublicSeat,
  RefusalReason,
  RoomState,
  RoomView,
  Seat,
  SeatToken,
  Variant,
} from "@games/schema";
import { deriveDisplayLabel } from "./seat-naming";

// ---------------------------------------------------------------------------
// D-15 placeholder adapter wiring
//
// Module-level constant, not threaded as a parameter through every function
// below — Phase 2 swaps this one line for the secret-holding toy adapter,
// and that is the whole diff (D-15's "small, legible diff" property).
// ---------------------------------------------------------------------------

const adapter = counterGame;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RoomResult =
  | { ok: true; state: RoomState }
  | { ok: false; reason: RefusalReason };

export type JoinResult =
  | {
      ok: true;
      state: RoomState;
      seatId: string;
      seatToken: SeatToken;
      wasReclaim: boolean;
    }
  | { ok: false; reason: RefusalReason };

export type JoinInput = {
  displayName: string;
  seatToken?: SeatToken;
  now: number;
  mintSeatId: () => string;
  mintSeatToken: () => SeatToken;
};

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

export function createEmptyRoom(
  code: RoomState["code"],
  variant: Variant,
  now: number,
): RoomState {
  return {
    code,
    variant,
    status: "lobby",
    hostSeatId: null,
    seats: [],
    adapterId: adapter.id,
    game: null,
    createdAt: now,
    lastActivityAt: now,
  };
}

/**
 * Joins or reclaims a seat. Check order is load-bearing:
 *
 * 1. A `seatToken` that matches a persisted seat is ALWAYS a reclaim,
 *    regardless of room status — mid-game reclaim (RT-03/RT-04) depends on
 *    this working while `status === "in_progress"`.
 * 2. A `seatToken` that matches nothing falls through to a new join — a
 *    stale token from a GC'd room must not hard-fail.
 * 3. A new join into a non-lobby room is refused `in_progress` (D-14).
 * 4. A new join at `MAX_PLAYERS` is refused `full` (D-06).
 * 5. Otherwise the seat is appended in join order (D-12); the first seat
 *    ever appended becomes host (D-03).
 */
export function joinRoom(state: RoomState, input: JoinInput): JoinResult {
  if (input.seatToken !== undefined) {
    const existing = state.seats.find((seat) => seat.seatToken === input.seatToken);
    if (existing !== undefined) {
      const reclaimedSeats = state.seats.map((seat) =>
        seat.seatId === existing.seatId
          ? { ...seat, connected: true, disconnectedAt: null }
          : seat,
      );
      const nextState: RoomState = {
        ...state,
        seats: reclaimedSeats,
        lastActivityAt: input.now,
      };
      return {
        ok: true,
        state: nextState,
        seatId: existing.seatId,
        seatToken: existing.seatToken,
        wasReclaim: true,
      };
    }
  }

  if (state.status !== "lobby") {
    return { ok: false, reason: "in_progress" };
  }

  if (state.seats.length >= MAX_PLAYERS) {
    return { ok: false, reason: "full" };
  }

  const seatId = input.mintSeatId();
  const seatToken = input.mintSeatToken();
  const displayLabel = deriveDisplayLabel(
    input.displayName,
    state.seats.map((seat) => seat.displayLabel),
  );

  const newSeat: Seat = {
    seatId,
    seatToken,
    displayName: input.displayName,
    displayLabel,
    connected: true,
    joinedAt: input.now,
    disconnectedAt: null,
  };

  const nextState: RoomState = {
    ...state,
    seats: [...state.seats, newSeat],
    hostSeatId: state.hostSeatId ?? seatId,
    lastActivityAt: input.now,
  };

  return { ok: true, state: nextState, seatId, seatToken, wasReclaim: false };
}

/** D-12: leaving the lobby frees the seat entirely. If the departing seat
 * was host and other seats remain, host reassigns to the earliest-joined
 * CONNECTED remaining seat (D-07, WR-09), falling back to the earliest
 * remaining seat when nobody is connected (seats are stored in join order).
 * Plan 06 owns the grace period that decides when this fires.
 *
 * CR-03: refused outside the lobby. Once a game starts its turn order holds
 * every seat id, so removing a seat would stall the game permanently when
 * its turn came up. */
export function releaseSeat(state: RoomState, seatId: string, now: number): RoomResult {
  if (state.status !== "lobby") {
    return { ok: false, reason: "bad_request" };
  }

  const remaining = state.seats.filter((seat) => seat.seatId !== seatId);

  let hostSeatId = state.hostSeatId;
  if (state.hostSeatId === seatId) {
    const nextHost = remaining.find((seat) => seat.connected) ?? remaining[0];
    hostSeatId = nextHost !== undefined ? nextHost.seatId : null;
  }

  return {
    ok: true,
    state: {
      ...state,
      seats: remaining,
      hostSeatId,
      lastActivityAt: now,
    },
  };
}

/** Flips a seat's live-connection status, the source of ROOM-04's per-seat
 * connection indicator. `disconnectedAt` is persisted (not memory-only) so
 * Plan 06's grace-period deadlines survive a hibernation eviction. */
export function markConnected(
  state: RoomState,
  seatId: string,
  connected: boolean,
  now: number,
): RoomState {
  const seats = state.seats.map((seat) =>
    seat.seatId === seatId
      ? { ...seat, connected, disconnectedAt: connected ? null : now }
      : seat,
  );

  return { ...state, seats, lastActivityAt: now };
}

/** D-07: reassigns host to the earliest-joined CONNECTED seat. No-op when
 * the current host is connected, or when no connected seat exists at all.
 * The scheduling policy (when this is due) lives in Plan 06; this function
 * is only the state transition. */
export function transferHost(state: RoomState, now: number): RoomState {
  const currentHost = state.seats.find((seat) => seat.seatId === state.hostSeatId);
  if (currentHost !== undefined && currentHost.connected) {
    return state;
  }

  const nextHost = state.seats.find((seat) => seat.connected);
  if (nextHost === undefined) {
    return state;
  }

  return { ...state, hostSeatId: nextHost.seatId, lastActivityAt: now };
}

/** ROOM-05, D-13: the host may change the variant at any point in the
 * lobby; it is refused (not merely hidden) once the game has started. */
export function setVariant(
  state: RoomState,
  actorSeatId: string,
  variant: Variant,
  now: number,
): RoomResult {
  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }
  if (state.status !== "lobby") {
    return { ok: false, reason: "bad_request" };
  }
  return { ok: true, state: { ...state, variant, lastActivityAt: now } };
}

/** WR-02 / D-02: idle GC measures idleness, and a room with live connected
 * players is not idle — even if nobody has changed anything for an hour
 * (a lobby waiting for a late friend). When `idle_gc` comes due while
 * connections are live, the DO calls this instead of deleting the room,
 * restarting the idle clock at `now`. The decision is made from the DO's
 * actual open sockets, not the persisted `connected` flags, so a flag left
 * stale by a missed close can never keep a room alive forever. */
export function deferIdleGc(state: RoomState, now: number): RoomState {
  return { ...state, lastActivityAt: now };
}

/** ROOM-06, D-10/D-11: gated ONLY on host + a 2-5 seat count. There is
 * deliberately no ready-state check anywhere in this function — if you
 * find yourself adding one, it was cut from scope. */
export function startGame(
  state: RoomState,
  actorSeatId: string,
  now: number,
  seed: string,
): RoomResult {
  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }
  if (
    state.status !== "lobby" ||
    state.seats.length < MIN_PLAYERS ||
    state.seats.length > MAX_PLAYERS
  ) {
    return { ok: false, reason: "bad_request" };
  }

  const game = adapter.createInitialState({
    seatIds: state.seats.map((seat) => seat.seatId),
    variant: state.variant,
    seed,
  });

  // WR-07: the seed is kept server-side for the life of the game. `seed`
  // must be secret (`mintGameSeed`), never the public room code.
  return {
    ok: true,
    state: { ...state, status: "in_progress", game, seed, lastActivityAt: now },
  };
}

/** Every `AdapterError` collapses onto `bad_request` — the room layer does
 * not attempt to distinguish game-rule refusal reasons at the wire-protocol
 * level; Plan 09 can enrich the message shown to the player using the
 * adapter's own view, without widening this shared enum. */
function mapAdapterError(): RefusalReason {
  return "bad_request";
}

/** Delegates to the adapter and never inspects the contents of `request` or
 * `state.game` itself — that delegation, and nothing else, is the FDN-01
 * line for in-game actions. */
export function applyGameAction(
  state: RoomState,
  actorSeatId: string,
  request: unknown,
  now: number,
): RoomResult {
  if (state.status !== "in_progress") {
    return { ok: false, reason: "bad_request" };
  }

  const gameState = state.game as CounterState;
  const result = adapter.applyAction(gameState, actorSeatId, request as CounterAction);
  if (!result.ok) {
    return { ok: false, reason: mapAdapterError() };
  }

  const ended = adapter.checkGameEnd(result.state);

  return {
    ok: true,
    state: {
      ...state,
      status: ended !== null ? "ended" : state.status,
      game: result.state,
      lastActivityAt: now,
    },
  };
}

// ---------------------------------------------------------------------------
// The sole outbound serializer
//
// `toSeatView` is the ONLY function in the worker permitted to convert a
// `RoomState` into anything sent over a socket. Phase 2's redaction contract
// (HIDE-02) hardens exactly this chokepoint — no second serializer may be
// introduced anywhere else in this codebase.
// ---------------------------------------------------------------------------

export function toSeatView(state: RoomState, seatId: string): RoomView {
  const seats: PublicSeat[] = state.seats.map((seat) => ({
    seatId: seat.seatId,
    displayLabel: seat.displayLabel,
    connected: seat.connected,
    isHost: seat.seatId === state.hostSeatId,
  }));

  return {
    code: state.code,
    variant: state.variant,
    status: state.status,
    hostSeatId: state.hostSeatId,
    youSeatId: seatId,
    seats,
    game: state.game === null ? null : adapter.toPlayerView(state.game as CounterState, seatId),
  };
}
