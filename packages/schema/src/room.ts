import { z } from "zod";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SEAT_TOKEN_LENGTH,
} from "./constants";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** ROOM-05, D-13. */
export const VariantSchema = z.enum(["base", "rainbow", "black"]);
export type Variant = z.infer<typeof VariantSchema>;

export const RoomStatusSchema = z.enum(["lobby", "in_progress", "ended"]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

/** `full` backs D-06's "This room is full"; `in_progress` backs D-14's
 * "This game is already in progress". The UI-SPEC's RefusalCard takes
 * exactly these first two as its `reason` prop. */
export const RefusalReasonSchema = z.enum([
  "full",
  "in_progress",
  "invalid_name",
  "not_host",
  "not_seated",
  "bad_request",
]);
export type RefusalReason = z.infer<typeof RefusalReasonSchema>;

// ---------------------------------------------------------------------------
// Primitive / branded types
// ---------------------------------------------------------------------------

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** D-01: short, speakable room code. Branded so a `SeatToken` can never be
 * passed where a `RoomCode` is expected, or vice versa (RT-07 boundary). */
export const RoomCodeSchema = z
  .string()
  .regex(ROOM_CODE_PATTERN)
  .brand<"RoomCode">();
export type RoomCode = z.infer<typeof RoomCodeSchema>;

/** D-05: long, unguessable seat credential. Deliberately a DIFFERENT brand,
 * length, and alphabet from `RoomCodeSchema` — see constants.ts. */
export const SeatTokenSchema = z
  .string()
  .length(SEAT_TOKEN_LENGTH)
  .brand<"SeatToken">();
export type SeatToken = z.infer<typeof SeatTokenSchema>;

/** Trimmed, bounded, control-character-free display name a player typed. */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(MIN_DISPLAY_NAME_LENGTH)
  .max(MAX_DISPLAY_NAME_LENGTH)
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1F\x7F]*$/, { message: "Display name must not contain control characters" });
export type DisplayName = z.infer<typeof DisplayNameSchema>;

// ---------------------------------------------------------------------------
// Persisted state (server-only; NEVER sent to the client as-is)
// ---------------------------------------------------------------------------

/** The PERSISTED seat record. `seatToken` is the seat's private credential
 * and has NO representation in any client-facing view type (see
 * `PublicSeatSchema` below, which is declared independently rather than by
 * `.omit()`, so a future field added here cannot leak by default). */
export const SeatSchema = z.object({
  seatId: z.string(),
  seatToken: SeatTokenSchema,
  displayName: DisplayNameSchema,
  /** D-09 auto-suffixed rendering, e.g. "Roger (2)". */
  displayLabel: z.string(),
  connected: z.boolean(),
  joinedAt: z.number(),
  /** Timestamp of the most recent disconnect; null while connected. Plan
   * 06's grace-period timers (D-07 host transfer, D-12 seat release) are
   * derived from this and it must be persisted (not held only in memory)
   * so those deadlines survive a hibernation eviction. */
  disconnectedAt: z.number().nullable(),
});
export type Seat = z.infer<typeof SeatSchema>;

/** The PERSISTED room record. */
export const RoomStateSchema = z.object({
  code: RoomCodeSchema,
  variant: VariantSchema,
  status: RoomStatusSchema,
  /** Null only in the instant between `createEmptyRoom` and the first seat
   * joining (D-03: in practice the creator joins in the same request, so a
   * caller observes this as null for one in-process step, never persisted
   * or serialized to a client). */
  hostSeatId: z.string().nullable(),
  seats: z.array(SeatSchema),
  adapterId: z.string(),
  /** Opaque to this package — the game adapter's state shape (FDN-01). */
  game: z.unknown(),
  /** WR-07: the secret, server-minted seed the game was created from
   * (RULES-19 deterministic shuffle). Set at game start. SERVER-ONLY — it
   * has no field in `RoomViewSchema`, and must never gain one: anyone
   * holding it could recompute the deck. Optional so rooms persisted before
   * this field existed still parse. */
  seed: z.string().optional(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
});
export type RoomState = z.infer<typeof RoomStateSchema>;

// ---------------------------------------------------------------------------
// Client-facing view types
//
// Declared independently of SeatSchema/RoomStateSchema (never via `.omit()`)
// so a future field added to the persisted shapes — including `seatToken` —
// cannot leak into what crosses to the browser by default. Phase 2 hardens
// this same whitelist-serialize discipline for game state; seat records
// already follow it here.
// ---------------------------------------------------------------------------

export const PublicSeatSchema = z.object({
  seatId: z.string(),
  displayLabel: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
});
export type PublicSeat = z.infer<typeof PublicSeatSchema>;

export const RoomViewSchema = z.object({
  code: RoomCodeSchema,
  variant: VariantSchema,
  status: RoomStatusSchema,
  hostSeatId: z.string().nullable(),
  youSeatId: z.string(),
  seats: z.array(PublicSeatSchema),
  /** Opaque to this package — the per-seat game view (FDN-01). */
  game: z.unknown(),
});
export type RoomView = z.infer<typeof RoomViewSchema>;
