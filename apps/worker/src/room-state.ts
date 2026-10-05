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

import { DEFAULT_GAME_ID, GAME_REGISTRY, resolveGame } from "./game-registration";
import type { GameRegistry, GameRegistryEntry } from "./game-registration";
import type { GameSeatHooks } from "@games/rules";
import type {
  GameErrorDetail,
  GameId,
  KickVoteView,
  PublicSeat,
  RefusalReason,
  RoomState,
  RoomView,
  Seat,
  SeatToken,
} from "@games/schema";
import { ABSENT_SEAT_PASS_GRACE_MS } from "@games/schema";
import { deriveDisplayLabel } from "./seat-naming";

// ---------------------------------------------------------------------------
// D-08: every function below that needs a game resolves it through this one
// helper, reached solely through the single registration point
// (./game-registration). `games` is an injectable, defaulted parameter (the
// dependency-injection seam plan 08-07's test-only game uses) — production
// callers never pass it explicitly and always get `GAME_REGISTRY`.
//
// D-04/D-08: keyed by the room's own `state.gameId` (no longer the interim
// `DEFAULT_GAME_ID` constant plan 08-03/08-04 used before `RoomState` had
// this field).
// ---------------------------------------------------------------------------

function roomGame(state: RoomState, games: GameRegistry): GameRegistryEntry {
  const entry = resolveGame(state.gameId, games);
  if (entry === undefined) {
    throw new Error(`Unknown game id: ${state.gameId}`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RoomResult =
  | { ok: true; state: RoomState }
  | { ok: false; reason: RefusalReason; gameError?: GameErrorDetail };

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
  /** The client's per-page join idempotency key (`JoinMessage.joinId`). */
  joinId?: string;
  /** D-01: the host's chosen game, carried on the room's very first join
   * only. Read solely by the new-join branch of `joinRoom` below — never by
   * the seatToken/joinId reclaim branches, which must not let a joiner
   * change an already-locked room's game. */
  gameId?: GameId;
  now: number;
  mintSeatId: () => string;
  mintSeatToken: () => SeatToken;
};

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

export function createEmptyRoom(
  code: RoomState["code"],
  now: number,
  games: GameRegistry = GAME_REGISTRY,
): RoomState {
  const entry = resolveGame(DEFAULT_GAME_ID, games);
  if (entry === undefined) {
    throw new Error(`Unknown game id: ${DEFAULT_GAME_ID}`);
  }
  return {
    code,
    // D-03: an empty room nobody has joined yet defaults to Hanabi and its
    // default config; D-01: gameLocked flips true on the room's first join.
    gameId: DEFAULT_GAME_ID,
    config: entry.defaultConfig,
    gameLocked: false,
    status: "lobby",
    hostSeatId: null,
    seats: [],
    adapterId: entry.adapter.id,
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
 * 2b. A `joinId` that matches the seat an earlier `join` created is a
 *    replay of that join (the socket dropped before the `joined` reply
 *    delivered the token) and reclaims that seat, returning its token.
 * 3. A new join into a non-lobby room is refused `in_progress` (D-14).
 * 4. A new join at the room's game seat limit is refused `full` (D-06).
 * 5. Otherwise the seat is appended in join order (D-12); the first seat
 *    ever appended becomes host (D-03).
 */
export function joinRoom(state: RoomState, input: JoinInput, games: GameRegistry = GAME_REGISTRY): JoinResult {
  const byToken =
    input.seatToken !== undefined ? state.seats.find((seat) => seat.seatToken === input.seatToken) : undefined;
  const byJoinId =
    byToken === undefined && input.joinId !== undefined
      ? state.seats.find((seat) => seat.joinId === input.joinId)
      : undefined;
  const existing = byToken ?? byJoinId;
  if (existing !== undefined) {
    return {
      ok: true,
      state: markConnected(state, existing.seatId, true, input.now, games),
      seatId: existing.seatId,
      seatToken: existing.seatToken,
      wasReclaim: true,
    };
  }

  if (state.status !== "lobby") {
    return { ok: false, reason: "in_progress" };
  }

  // D-01: the room's game is fixed by its first join. Only an unlocked room
  // (nobody has joined yet) may resolve a different game via input.gameId —
  // once gameLocked, this join's gameId is ignored entirely, matching the
  // reclaim branches above (which never read it at all).
  let targetGameId: GameId = state.gameId;
  let targetConfig: unknown = state.config;
  let targetAdapterId = state.adapterId;
  let entry = roomGame(state, games);
  if (!state.gameLocked && input.gameId !== undefined && input.gameId !== state.gameId) {
    const resolved = resolveGame(input.gameId, games);
    if (resolved === undefined) {
      return { ok: false, reason: "bad_request" };
    }
    targetGameId = input.gameId;
    targetConfig = resolved.defaultConfig;
    targetAdapterId = resolved.adapter.id;
    entry = resolved;
  }

  if (state.seats.length >= entry.limits.max) {
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
    joinId: input.joinId ?? null,
  };

  const nextState: RoomState = {
    ...state,
    gameId: targetGameId,
    config: targetConfig,
    adapterId: targetAdapterId,
    seats: [...state.seats, newSeat],
    hostSeatId: state.hostSeatId ?? seatId,
    // D-01: first-write-wins, mirroring hostSeatId above — once locked, a
    // later join's requested game can never change the room's game.
    gameLocked: true,
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
 * Plan 06's grace-period deadlines survive a hibernation eviction. In a game
 * with seat hooks the game hears of it (a kicked seat may come back), and the
 * kick votes settle: a reconnect withdraws the votes against that seat, and a
 * disconnect shrinks the majority the others need. */
export function markConnected(
  state: RoomState,
  seatId: string,
  connected: boolean,
  now: number,
  games: GameRegistry = GAME_REGISTRY,
): RoomState {
  const seats = state.seats.map((seat) =>
    seat.seatId === seatId
      ? { ...seat, connected, disconnectedAt: connected ? null : now }
      : seat,
  );
  const flipped: RoomState = { ...state, seats, lastActivityAt: now };
  const hooks = seatHooksOf(flipped, games);
  if (hooks === undefined) return flipped;
  return settleKickVotes({ ...flipped, game: hooks.presence(flipped.game, seatId, connected) }, games);
}

// ---------------------------------------------------------------------------
// Kick votes. The room owns who is connected and the ballots; the game's
// `seats` hooks own who is in play and what a kick changes (FDN-01).
// ---------------------------------------------------------------------------

function seatHooksOf(state: RoomState, games: GameRegistry): GameSeatHooks<unknown> | undefined {
  return state.status === "in_progress" ? resolveGame(state.gameId, games)?.adapter.seats : undefined;
}

/** Connected players in play; a dev bot never votes. */
function kickVoterIds(state: RoomState, hooks: GameSeatHooks<unknown>): string[] {
  const inPlay = hooks.inPlay(state.game);
  return state.seats.filter((seat) => seat.connected && seat.bot !== true && inPlay.includes(seat.seatId)).map((seat) => seat.seatId);
}

/** Disconnected seats the game would let the crew kick now. A dev bot is
 * never disconnected, only playerless, so it is never kickable. */
function kickableSeatIds(state: RoomState, hooks: GameSeatHooks<unknown>): string[] {
  return state.seats
    .filter((seat) => !seat.connected && seat.disconnectedAt !== null && seat.bot !== true && hooks.canKick(state.game, seat.seatId))
    .map((seat) => seat.seatId);
}

type KickTally = { targetSeatId: string; voterSeatIds: string[]; needed: number };

/** Each kickable seat's valid votes against the majority of the voters. */
function kickTallies(state: RoomState, hooks: GameSeatHooks<unknown>): KickTally[] {
  const voters = kickVoterIds(state, hooks);
  return kickableSeatIds(state, hooks).map((targetSeatId) => {
    const ballot = state.kickVotes?.find((vote) => vote.targetSeatId === targetSeatId)?.voterSeatIds ?? [];
    return { targetSeatId, voterSeatIds: voters.filter((id) => ballot.includes(id)), needed: Math.floor(voters.length / 2) + 1 };
  });
}

/** Kicks every seat whose votes reach the majority, one at a time since a
 * kick can change who else may be kicked, then keeps ballots only against
 * seats still kickable. Idempotent: a settled room settles to itself. */
function settleKickVotes(state: RoomState, games: GameRegistry): RoomState {
  const hooks = seatHooksOf(state, games);
  if (hooks === undefined) return state;
  let current = state;
  for (;;) {
    const carried = kickTallies(current, hooks).find((tally) => tally.voterSeatIds.length >= tally.needed);
    if (carried === undefined) break;
    const game = hooks.kick(current.game, carried.targetSeatId);
    const ended = roomGame(current, games).adapter.checkGameEnd(game) !== null;
    current = {
      ...current,
      game,
      status: ended ? "ended" : current.status,
      kickVotes: (current.kickVotes ?? []).filter((vote) => vote.targetSeatId !== carried.targetSeatId),
    };
    if (ended) return current;
  }
  const kickable = kickableSeatIds(current, hooks);
  const kept = (current.kickVotes ?? []).filter((vote) => kickable.includes(vote.targetSeatId));
  if (kept.length === (current.kickVotes ?? []).length) return current;
  return { ...current, kickVotes: kept };
}

/** A connected player in play votes to kick a disconnected seat (`kick:
 * false` takes the vote back), and a vote that reaches the majority kicks
 * at once. Refused `bad_request` outside a game with seat hooks, for a voter
 * not in play, or for a seat that cannot be kicked now. */
export function castKickVote(
  state: RoomState,
  voterSeatId: string,
  targetSeatId: string,
  kick: boolean,
  now: number,
  games: GameRegistry = GAME_REGISTRY,
): RoomResult {
  const hooks = seatHooksOf(state, games);
  if (hooks === undefined || !kickVoterIds(state, hooks).includes(voterSeatId) || !kickableSeatIds(state, hooks).includes(targetSeatId)) {
    return { ok: false, reason: "bad_request" };
  }
  const others = (state.kickVotes ?? []).filter((vote) => vote.targetSeatId !== targetSeatId);
  const before = state.kickVotes?.find((vote) => vote.targetSeatId === targetSeatId)?.voterSeatIds ?? [];
  const voterSeatIds = kick ? [...before.filter((id) => id !== voterSeatId), voterSeatId] : before.filter((id) => id !== voterSeatId);
  const kickVotes = voterSeatIds.length === 0 ? others : [...others, { targetSeatId, voterSeatIds }];
  return { ok: true, state: settleKickVotes({ ...state, kickVotes, lastActivityAt: now }, games) };
}

/** The viewer's picture of the open kick votes, or undefined for a game
 * with no kicks. */
function kickVoteViews(state: RoomState, viewerSeatId: string, games: GameRegistry): KickVoteView[] | undefined {
  const hooks = seatHooksOf(state, games);
  if (hooks === undefined) return undefined;
  const youCanVote = kickVoterIds(state, hooks).includes(viewerSeatId);
  return kickTallies(state, hooks).map((tally) => ({ ...tally, youCanVote }));
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

/** ROOM-05, D-13, D-04/MGR-03: the host may change the room's game config at
 * any point in the lobby; it is refused (not merely hidden) once the game
 * has started. Validated fail-closed against the room's OWN game's
 * `configSchema` before any mutation — a malformed or wrongly-shaped config
 * never reaches `RoomState` (T-8-02). */
export function setConfig(
  state: RoomState,
  actorSeatId: string,
  config: unknown,
  now: number,
  games: GameRegistry = GAME_REGISTRY,
): RoomResult {
  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }
  if (state.status !== "lobby") {
    return { ok: false, reason: "bad_request" };
  }
  const entry = roomGame(state, games);
  const parsed = entry.configSchema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, reason: "bad_request" };
  }
  return { ok: true, state: { ...state, config: parsed.data, lastActivityAt: now } };
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

/** Owner request (2026-09-18), host-only: irreversible room teardown. This
 * pure function is ONLY the permission/idempotency gate — the actual
 * storage wipe and socket teardown is DO-level I/O (room-do.ts's
 * `#abandonRoom`, the SAME helper `onAlarm`'s idle-GC branch calls), never
 * expressed here. No status restriction: a host may delete a lobby, an
 * in-progress game, or an ended one. Dedup mirrors `applyGameAction`'s
 * placement (WR-01): checked unconditionally, before any other gate, against
 * `Seat.lastAppliedRoomActionId` — a field distinct from game-action dedup
 * (room.ts) so the two idempotency keyspaces never collide. */
export function deleteRoom(
  state: RoomState,
  actorSeatId: string,
  actionId: string,
  now: number,
): RoomResult {
  const actorSeat = state.seats.find((seat) => seat.seatId === actorSeatId);
  if (actorSeat !== undefined && actorSeat.lastAppliedRoomActionId === actionId) {
    return { ok: true, state };
  }

  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }

  const seats = state.seats.map((seat) =>
    seat.seatId === actorSeatId ? { ...seat, lastAppliedRoomActionId: actionId } : seat,
  );

  return { ok: true, state: { ...state, seats, lastActivityAt: now } };
}

/** Owner request (2026-09-18), host-only: returns an ENDED room to the
 * lobby with the same seats, room code, and seat tokens, clearing the
 * finished game. Legal ONLY when `status === "ended"` (refused mid-game,
 * D-4 style `bad_request`) — checked AFTER the dedup short-circuit, same
 * placement rule `applyGameAction` documents: the action that ends the game
 * flips status away from what this function requires, so a retry of the
 * SAME actionId after a dropped response must still see idempotent success,
 * not a spurious `bad_request` against the now-different status.
 *
 * FDN-01: clearing the game is done by setting the room's own `game` field
 * to `null` — the exact pattern `createEmptyRoom` already uses for a brand
 * new room — never by reaching into `state.game`'s Hanabi-specific shape.
 * `seed` is cleared too (WR-07: a stale secret seed must not survive into a
 * lobby that has not started a new game yet). */
export function restartLobby(
  state: RoomState,
  actorSeatId: string,
  actionId: string,
  now: number,
): RoomResult {
  const actorSeat = state.seats.find((seat) => seat.seatId === actorSeatId);
  if (actorSeat !== undefined && actorSeat.lastAppliedRoomActionId === actionId) {
    return { ok: true, state };
  }

  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }

  if (state.status !== "ended") {
    return { ok: false, reason: "bad_request" };
  }

  const seats = state.seats.map((seat) => ({
    ...seat,
    // A fresh game starts with a clean idempotency ledger, mirroring
    // `createEmptyRoom`'s never-applied-anything starting point.
    lastAppliedActionId: null,
    lastAppliedRoomActionId: seat.seatId === actorSeatId ? actionId : seat.lastAppliedRoomActionId ?? null,
  }));

  return {
    ok: true,
    state: {
      ...state,
      status: "lobby",
      game: null,
      seed: undefined,
      seats,
      lastActivityAt: now,
    },
  };
}

/** ROOM-06, D-10/D-11: gated ONLY on host + a 2-5 seat count. There is
 * deliberately no ready-state check anywhere in this function — if you
 * find yourself adding one, it was cut from scope. */
export function startGame(
  state: RoomState,
  actorSeatId: string,
  now: number,
  seed: string,
  games: GameRegistry = GAME_REGISTRY,
): RoomResult {
  if (actorSeatId !== state.hostSeatId) {
    return { ok: false, reason: "not_host" };
  }
  const entry = roomGame(state, games);
  if (
    state.status !== "lobby" ||
    state.seats.length < entry.limits.min ||
    state.seats.length > entry.limits.max
  ) {
    return { ok: false, reason: "bad_request" };
  }

  // Defence in depth (T-8-02): re-validate the persisted config against the
  // room's OWN game's configSchema before handing it to the adapter.
  const parsedConfig = entry.configSchema.safeParse(state.config);
  if (!parsedConfig.success) {
    return { ok: false, reason: "bad_request" };
  }

  const game = entry.adapter.createInitialState({
    seatIds: state.seats.map((seat) => seat.seatId),
    config: parsedConfig.data,
    seed,
  });

  // WR-07: the seed is kept server-side for the life of the game. `seed`
  // must be secret (`mintGameSeed`), never the public room code.
  return {
    ok: true,
    state: { ...state, status: "in_progress", game, seed, lastActivityAt: now },
  };
}

/** Delegates to the adapter and never inspects the contents of `request` or
 * `state.game` itself — that delegation, and nothing else, is the FDN-01
 * line for in-game actions.
 *
 * D-08/D-09/RT-09: `actionId` is checked against the actor's PERSISTED
 * `lastAppliedActionId` unconditionally, for every action type, BEFORE
 * `adapter.applyAction` is ever called. This placement is load-bearing: a
 * repeated play or discard would be naturally rejected once the card has
 * already left the hand, but a repeated CLUE is perfectly legal and would
 * spend a second clue token — relying on the engine's accidental idempotence
 * would silently miss exactly the action type that matters. A dedup hit is
 * NOT an error: the caller commits and pushes this (unchanged) state, so a
 * retry after a dropped response looks like success to the retrying client. */
export function applyGameAction(
  state: RoomState,
  actorSeatId: string,
  actionId: string,
  request: unknown,
  now: number,
  games: GameRegistry = GAME_REGISTRY,
): RoomResult {
  // WR-01: the dedup check runs BEFORE the status gate. The action that ENDS
  // the game flips `status` to "ended"; a retry of that same `actionId` after
  // a dropped response must still see idempotent success, not `bad_request`.
  const actorSeat = state.seats.find((seat) => seat.seatId === actorSeatId);
  if (actorSeat !== undefined && actorSeat.lastAppliedActionId === actionId) {
    return { ok: true, state };
  }

  if (state.status !== "in_progress") {
    return { ok: false, reason: "bad_request" };
  }

  const entry = roomGame(state, games);
  const result = entry.adapter.applyAction(state.game, actorSeatId, request);
  if (!result.ok) {
    return { ok: false, reason: "bad_request", gameError: entry.mapError(result.error) };
  }

  const ended = entry.adapter.checkGameEnd(result.state);

  const seats = state.seats.map((seat) =>
    seat.seatId === actorSeatId ? { ...seat, lastAppliedActionId: actionId } : seat,
  );

  return {
    ok: true,
    state: {
      ...state,
      status: ended !== null ? "ended" : state.status,
      game: result.state,
      seats,
      lastActivityAt: now,
    },
  };
}

/** Seats the in-progress game is waiting on for a decision the room may
 * decline for them (the adapter's optional `autoPassRequest`). */
export function awaitedSeatIds(state: RoomState, games: GameRegistry = GAME_REGISTRY): string[] {
  if (state.status !== "in_progress") return [];
  const { adapter } = roomGame(state, games);
  return state.seats.filter((seat) => (adapter.autoPassRequest?.(state.game, seat.seatId) ?? null) !== null).map((seat) => seat.seatId);
}

/** Awaited seats that have been disconnected for `ABSENT_SEAT_PASS_GRACE_MS`. */
export function seatsToAutoPass(state: RoomState, now: number, games: GameRegistry = GAME_REGISTRY): string[] {
  const awaited = awaitedSeatIds(state, games);
  return state.seats
    .filter((seat) => !seat.connected && seat.disconnectedAt !== null && now - seat.disconnectedAt >= ABSENT_SEAT_PASS_GRACE_MS)
    .filter((seat) => awaited.includes(seat.seatId))
    .map((seat) => seat.seatId);
}

/** Submits the game's pass for every seat `seatsToAutoPass` names, through
 * the same `applyGameAction` a client's request takes. Returns `state`
 * itself when nobody is due. Throws when the game refuses its own pass,
 * which breaks the `autoPassRequest` contract. */
export function autoPassAbsentSeats(state: RoomState, now: number, games: GameRegistry = GAME_REGISTRY): RoomState {
  return seatsToAutoPass(state, now, games).reduce((current, seatId) => {
    const request = roomGame(current, games).adapter.autoPassRequest?.(current.game, seatId) ?? null;
    if (current.status !== "in_progress" || request === null) return current;
    const result = applyGameAction(current, seatId, `auto-pass:${now}`, request, now, games);
    if (!result.ok) throw new Error(`autoPassAbsentSeats: ${current.gameId} refused its own pass for ${seatId}`);
    return result.state;
  }, state);
}

// ---------------------------------------------------------------------------
// The sole outbound serializer
//
// `toSeatView` is the ONLY function in the worker permitted to convert a
// `RoomState` into anything sent over a socket. Phase 2's redaction contract
// (HIDE-02) hardens exactly this chokepoint — no second serializer may be
// introduced anywhere else in this codebase.
// ---------------------------------------------------------------------------

export function toSeatView(state: RoomState, seatId: string, games: GameRegistry = GAME_REGISTRY): RoomView {
  const seats: PublicSeat[] = state.seats.map((seat) => ({
    seatId: seat.seatId,
    displayLabel: seat.displayLabel,
    connected: seat.connected,
    isHost: seat.seatId === state.hostSeatId,
  }));

  const entry = roomGame(state, games);
  const kickVotes = kickVoteViews(state, seatId, games);

  return {
    code: state.code,
    gameId: state.gameId,
    gameDisplayName: entry.displayName,
    config: state.config,
    limits: { min: entry.limits.min, max: entry.limits.max },
    status: state.status,
    hostSeatId: state.hostSeatId,
    youSeatId: seatId,
    seats,
    game: state.game === null ? null : entry.adapter.toPlayerView(state.game, seatId),
    ...(kickVotes !== undefined ? { kickVotes } : {}),
  };
}
