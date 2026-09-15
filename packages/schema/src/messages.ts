import { z } from "zod";
import { RefusalReasonSchema, RoomViewSchema, DisplayNameSchema, SeatTokenSchema, VariantSchema } from "./room";

// ---------------------------------------------------------------------------
// Client -> Server
//
// There is intentionally NO client message that carries room state, seat
// assignment, host identity, or a display label. A client can request
// actions; it can never assert results. This is the T-1-04/HIDE-05 boundary
// later phases must not erode.
// ---------------------------------------------------------------------------

const JoinMessageSchema = z.strictObject({
  type: z.literal("join"),
  displayName: DisplayNameSchema,
  /** Presence means "reclaim an existing seat"; absence means "new join"
   * (D-05, ROOM-02). */
  seatToken: SeatTokenSchema.optional(),
});

const SetVariantMessageSchema = z.strictObject({
  type: z.literal("set_variant"),
  variant: VariantSchema,
});

const StartGameMessageSchema = z.strictObject({
  type: z.literal("start_game"),
});

const GameActionMessageSchema = z.strictObject({
  type: z.literal("game_action"),
  /** Deliberately `unknown` here — validated by the game adapter, not by
   * this schema. The schema package must not know what a game action is
   * (FDN-01), and the adapter already treats `request` as hostile input. */
  request: z.unknown(),
});

const LeaveMessageSchema = z.strictObject({
  type: z.literal("leave"),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  SetVariantMessageSchema,
  StartGameMessageSchema,
  GameActionMessageSchema,
  LeaveMessageSchema,
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

/** D-08: error frames must never carry state. `detail` is a CLOSED enum, not
 * a free string — the only current member, "view_unavailable", is sent when
 * a projected view fails its strict game schema (D-07 fail-closed). There is
 * deliberately no way to widen this into a free-text/state-bearing channel
 * without an explicit code change to this schema. */
export const ErrorDetailSchema = z.enum(["view_unavailable"]);
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

const ErrorMessageSchema = z.strictObject({
  type: z.literal("error"),
  code: RefusalReasonSchema,
  detail: ErrorDetailSchema.optional(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  JoinedMessageSchema,
  StateMessageSchema,
  RefusedMessageSchema,
  SupersededMessageSchema,
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
