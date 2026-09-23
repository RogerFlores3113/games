import { z } from "zod";
import {
  RefusalReasonSchema,
  RoomViewSchema,
  DisplayNameSchema,
  SeatTokenSchema,
  GameIdSchema,
} from "./room";
import { HanabiErrorCodeSchema } from "./games/hanabi-errors";

// ---------------------------------------------------------------------------
// Client -> Server
//
// There is intentionally NO client message that carries room state, seat
// assignment, host identity, or a display label. A client can request
// actions; it can never assert results. This is the T-1-04/HIDE-05 boundary
// later phases must not erode.
// ---------------------------------------------------------------------------

/** Bounds for the client-minted `joinId` on `join`. The lower bound keeps it
 * unguessable: until the `joined` reply lands it is the only thing tying a
 * replayed join to the seat the first one created. */
const JOIN_ID_MIN_LENGTH = 16;
const JOIN_ID_MAX_LENGTH = 64;

const JoinMessageSchema = z.strictObject({
  type: z.literal("join"),
  displayName: DisplayNameSchema,
  /** Presence means "reclaim an existing seat"; absence means "new join"
   * (D-05, ROOM-02). */
  seatToken: SeatTokenSchema.optional(),
  /** Same idea as `game_action`'s `actionId` (D-07), for `join`: an opaque
   * key the client mints once per page and replays verbatim on every
   * automatic reconnect. A socket that drops after its first join reached
   * the server but before the `joined` reply (and so the seat token)
   * arrived replays a TOKENLESS join; without this key the server cannot
   * tell that replay from a new player and seats the same person twice. */
  joinId: z.string().min(JOIN_ID_MIN_LENGTH).max(JOIN_ID_MAX_LENGTH).optional(),
  /** D-01: the host's chosen game, carried on their first `join`. Honoured
   * ONLY on the room's very first join — the write that also sets
   * `gameLocked: true` server-side. Every later join, and every reclaim
   * (seatToken or joinId match), ignores this field entirely: a joiner can
   * never assert or change a room's already-locked game. */
  gameId: GameIdSchema.optional(),
});

const SetConfigMessageSchema = z.strictObject({
  type: z.literal("set_config"),
  /** Deliberately `unknown` here — validated downstream by the room's own
   * game `configSchema` (registry-resolved), like `game_action`'s `request`
   * field above. This schema package must not know what a game's config
   * looks like (FDN-01). */
  config: z.unknown(),
});

const StartGameMessageSchema = z.strictObject({
  type: z.literal("start_game"),
});

/** D-07: bounds for the client-minted idempotency key on `game_action`. */
const ACTION_ID_MIN_LENGTH = 1;
const ACTION_ID_MAX_LENGTH = 64;

const GameActionMessageSchema = z.strictObject({
  type: z.literal("game_action"),
  /** D-07: an opaque idempotency key minted by the client once per user
   * intent (one click), reused verbatim on any retry. It deliberately lives
   * at the ENVELOPE level and never inside `request`: the adapter's
   * exact-own-key guards (`isPlayRequest`/`isDiscardRequest`/`isClueRequest`
   * in `packages/rules/src/hanabi/actions.ts`) reject any request object
   * carrying an extra key, so keeping `actionId` out of `request` is what
   * lets both mechanisms hold at once. It is an idempotency key ONLY — it
   * never reaches the adapter and never influences game logic (D-07,
   * HIDE-05). */
  actionId: z.string().min(ACTION_ID_MIN_LENGTH).max(ACTION_ID_MAX_LENGTH),
  /** Deliberately `unknown` here — validated by the game adapter, not by
   * this schema. The schema package must not know what a game action is
   * (FDN-01), and the adapter already treats `request` as hostile input. */
  request: z.unknown(),
});

const LeaveMessageSchema = z.strictObject({
  type: z.literal("leave"),
});

/** Owner request (2026-09-18): host-only, irreversible room teardown. Follows
 * the same `actionId` idempotency shape as `game_action` (D-07) — an opaque
 * key minted once per click and replayed verbatim on any retry — but is
 * tracked against `Seat.lastAppliedRoomActionId`, a SEPARATE field from
 * game-action dedup (room.ts), never the adapter's own bookkeeping. */
const DeleteRoomMessageSchema = z.strictObject({
  type: z.literal("delete_room"),
  actionId: z.string().min(ACTION_ID_MIN_LENGTH).max(ACTION_ID_MAX_LENGTH),
});

/** Owner request (2026-09-18): host-only, legal only once the game has
 * ended. Returns the room to `"lobby"` with the same seats/code/tokens and
 * clears the finished game (room-state.ts's `restartLobby`, via the same
 * "set `game` to null" pattern `createEmptyRoom` already uses — FDN-01: the
 * room layer never reaches into Hanabi's own state to clear it). Same
 * `actionId` idempotency shape as `delete_room` above. */
const RestartLobbyMessageSchema = z.strictObject({
  type: z.literal("restart_lobby"),
  actionId: z.string().min(ACTION_ID_MIN_LENGTH).max(ACTION_ID_MAX_LENGTH),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  SetConfigMessageSchema,
  StartGameMessageSchema,
  GameActionMessageSchema,
  LeaveMessageSchema,
  DeleteRoomMessageSchema,
  RestartLobbyMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

const JoinedMessageSchema = z.strictObject({
  type: z.literal("joined"),
  seatId: z.string(),
  /** The ONLY message that ever carries a seat token, sent to exactly the
   * one connection that just claimed the seat. */
  seatToken: SeatTokenSchema,
  view: RoomViewSchema,
});

const StateMessageSchema = z.strictObject({
  type: z.literal("state"),
  view: RoomViewSchema,
});

const RefusedMessageSchema = z.strictObject({
  type: z.literal("refused"),
  reason: RefusalReasonSchema,
});

const SupersededMessageSchema = z.strictObject({
  type: z.literal("superseded"),
});

/** Sent to every connection right before the host's `delete_room` closes
 * them all with `ROOM_ABANDONED_CLOSE_CODE` (the SAME terminal code and
 * teardown idle GC uses, per the owner's "reuse that path" instruction) —
 * this frame is the only thing that distinguishes "closed by the host" from
 * "closed for sitting idle" for the client's copy; the underlying
 * disconnect/cleanup behavior is identical either way. */
const RoomClosedMessageSchema = z.strictObject({
  type: z.literal("room_closed"),
  reason: z.literal("host_deleted"),
});

/** D-07/D-08: error frames must never carry state, and a game-rule refusal's
 * specific code must never live in a single flat, ever-widening enum shared
 * by every game. `detail` is the ROOM-level closed vocabulary (currently
 * just `"view_unavailable"`, sent when a projected view fails its strict
 * game schema). `gameError` is a CLOSED discriminated union keyed on
 * `gameId`: each game contributes exactly one member, `{ gameId, code }`,
 * whose `code` is that game's OWN closed error enum (never a shared/widened
 * one, and never an unconstrained string schema — Pitfall 3). Adding a second game means
 * adding one more discriminated-union member here, each with its own closed
 * code enum supplied by that game's registry entry — never widening an
 * existing member's `code` type. Widening either field to a free-form string
 * would reintroduce the state-bearing channel Phase 2's D-08 closed. */
export const RoomErrorDetailSchema = z.enum(["view_unavailable"]);
export type RoomErrorDetail = z.infer<typeof RoomErrorDetailSchema>;

export const GameErrorDetailSchema = z.discriminatedUnion("gameId", [
  z.strictObject({ gameId: z.literal(GameIdSchema.enum.hanabi), code: HanabiErrorCodeSchema }),
]);
export type GameErrorDetail = z.infer<typeof GameErrorDetailSchema>;

const ErrorMessageSchema = z.strictObject({
  type: z.literal("error"),
  code: RefusalReasonSchema,
  detail: RoomErrorDetailSchema.optional(),
  gameError: GameErrorDetailSchema.optional(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  JoinedMessageSchema,
  StateMessageSchema,
  RefusedMessageSchema,
  SupersededMessageSchema,
  RoomClosedMessageSchema,
  ErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ---------------------------------------------------------------------------
// Parse / encode helpers
// ---------------------------------------------------------------------------

export type ParseClientMessageResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; reason: "bad_request" };

/** The Durable Object calls exactly this function on every inbound frame.
 * It must NEVER throw — an exception escaping a message handler tears down
 * connections for the whole room. */
export function parseClientMessage(raw: string): ParseClientMessageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad_request" };
  }

  const result = ClientMessageSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "bad_request" };
  }
  return { ok: true, message: result.data };
}

/** Validates with `ServerMessageSchema.parse` before stringifying, so a
 * server-side shape bug is caught at the send site rather than mis-rendered
 * in a browser. */
export function encodeServerMessage(msg: ServerMessage): string {
  const validated = ServerMessageSchema.parse(msg);
  return JSON.stringify(validated);
}
