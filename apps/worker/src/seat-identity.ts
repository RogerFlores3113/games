import { customAlphabet, nanoid } from "nanoid";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SEAT_TOKEN_LENGTH,
  RoomCodeSchema,
  SeatTokenSchema,
  type RoomCode,
  type SeatToken,
} from "@games/schema";

// ---------------------------------------------------------------------------
// Three identifier kinds this phase must never confuse:
//
//   RoomCode  — public, shared over voice, spoken aloud. Short (6 chars) and
//               low-entropy BY DESIGN (D-01) — that tradeoff is the whole
//               point, it must be readable off a screen and repeated aloud.
//   SeatId    — public WITHIN the room, broadcast to every seat. An internal,
//               non-secret handle that display labels hang off (ROOM-03). It
//               identifies a seat, not a credential to claim one.
//   SeatToken — private, a bearer credential, sent to exactly ONE connection
//               exactly once (at join/joined). Long (24 chars) and minted
//               over nanoid's default 64-char alphabet for ~143 bits (D-05).
//               Never broadcast, never derived from anything the client
//               sent, never displayed.
//
// Phase 4 and Phase 5 are the most likely places this distinction erodes —
// keep RoomCode and SeatToken as branded, mutually-non-assignable types
// (packages/schema/src/room.ts) and never widen SeatId beyond `string`.
// ---------------------------------------------------------------------------

const mintRoomCodeRaw = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/** D-01: 6-char speakable room code. Validated through `RoomCodeSchema` at
 * mint time so a future change to the alphabet/length constants that breaks
 * the invariant fails immediately here, not later at join time. */
export function mintRoomCode(): RoomCode {
  return RoomCodeSchema.parse(mintRoomCodeRaw());
}

/** D-05 / RT-07: long, unguessable bearer credential for a seat. Built from
 * plain `nanoid`'s DEFAULT 64-character alphabet — deliberately NOT
 * `ROOM_CODE_ALPHABET`. The room code is optimised to be spoken aloud and is
 * therefore short and low-entropy by design; the seat token is a bearer
 * credential and gets ~143 bits instead. Validated through `SeatTokenSchema`
 * at mint time. */
export function mintSeatToken(): SeatToken {
  return SeatTokenSchema.parse(nanoid(SEAT_TOKEN_LENGTH));
}

/** Internal, non-secret seat identity that display labels hang off
 * (ROOM-03) and that appears in `PublicSeat`. Distinct from the seat
 * token: seat ids are broadcast to every seat in the room, seat tokens are
 * not. */
export function mintSeatId(): string {
  return nanoid(10);
}

// ---------------------------------------------------------------------------
// Token -> seat resolution (RT-07)
// ---------------------------------------------------------------------------

/** A minimal seat shape this module needs to resolve a token — deliberately
 * NOT importing the full persisted `Seat`/`RoomState` types, so this file
 * stays provably free of room-state concerns (see `rebindSeatConnection`
 * below for why that separation matters). */
export interface TokenBearingSeat {
  readonly seatId: string;
  readonly seatToken: SeatToken;
}

/** Constant-time-style equality: XORs char codes across the full length of
 * the shorter/longer strings instead of relying on `===` short-circuiting,
 * so comparison cost does not vary with how much of a guess matches. This is
 * defense-in-depth (T-1-15), not a hard requirement at this threat model. */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** RT-07: the presented token is fully attacker-controlled; this is the
 * sole boundary everything downstream trusts. Returns `null` immediately for
 * `undefined`, for a string whose length is not `SEAT_TOKEN_LENGTH`, or for
 * a value failing `SeatTokenSchema.safeParse` (this also rejects a ROOM
 * CODE presented as a seat token — the exact confusion RT-07 guards
 * against, since a room code is a different length and alphabet).
 *
 * Iterates ALL seats and accumulates the match rather than early-returning
 * on the first hit, so comparison cost does not vary with seat position. */
export function resolveSeatByToken<TSeat extends TokenBearingSeat>(
  seats: readonly TSeat[],
  presented: string | undefined,
): TSeat | null {
  if (presented === undefined) return null;
  if (presented.length !== SEAT_TOKEN_LENGTH) return null;
  const parsed = SeatTokenSchema.safeParse(presented);
  if (!parsed.success) return null;

  let match: TSeat | null = null;
  for (const seat of seats) {
    if (timingSafeEqual(seat.seatToken, parsed.data)) {
      match = seat;
    }
  }
  return match;
}

// ---------------------------------------------------------------------------
// Second-tab rebinding (D-08) — a CONNECTION-layer concern, never room state
// ---------------------------------------------------------------------------

/** In-memory map of seatId -> the connection id currently bound to that
 * seat. NOT persisted — a connection id is meaningless after a hibernation
 * eviction (the socket itself is gone), so this is reconstructable from
 * scratch on wake, never written to `ctx.storage`. */
export type SeatBindings = Record<string, string>;

export interface RebindResult {
  readonly bindings: SeatBindings;
  readonly supersededConnectionId: string | null;
}

/** D-08: a second tab presenting a valid seat token rebinds the seat to the
 * NEWEST connection. If the seat already had a different connection id
 * bound, that connection id is returned as `supersededConnectionId` so the
 * caller can send it `{type:"superseded"}` and close it with
 * `SUPERSEDED_CLOSE_CODE` — the stale tab is told explicitly, rather than
 * the seat silently reassigning underneath it.
 *
 * This function's signature has no `RoomState` parameter and its body never
 * reads or writes persisted room state: rebinding is a connection-layer
 * concern only, which is how "Phase 1 only needs this to not corrupt seat
 * state" is guaranteed structurally rather than by convention. */
export function rebindSeatConnection(
  bindings: SeatBindings,
  seatId: string,
  newConnectionId: string,
): RebindResult {
  const previous = bindings[seatId];

  if (previous === newConnectionId) {
    // Reconnect that reuses the same connection id is not a takeover.
    return { bindings, supersededConnectionId: null };
  }

  const nextBindings: SeatBindings = { ...bindings, [seatId]: newConnectionId };
  const supersededConnectionId = previous === undefined ? null : previous;
  return { bindings: nextBindings, supersededConnectionId };
}
