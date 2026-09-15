import { customAlphabet } from "nanoid";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, RoomCodeSchema, type RoomCode } from "@games/schema";

// This intentionally DUPLICATES apps/worker/src/seat-identity.ts's
// mintRoomCode — the two runtimes (Vercel/Node-ish for apps/web, Cloudflare
// Workers for apps/worker) deploy separately and neither may import the
// other's source. Both derive from the SAME constants in @games/schema
// (ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, RoomCodeSchema), which is what
// keeps the two minters consistent despite living in different packages.
const mintRoomCodeRaw = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/** D-01: 6-char speakable room code, validated through `RoomCodeSchema` at
 * mint time. */
export function mintRoomCode(): RoomCode {
  return RoomCodeSchema.parse(mintRoomCodeRaw());
}

export type RoomCodeParamResult =
  | { kind: "ok"; code: RoomCode }
  | { kind: "redirect"; code: RoomCode }
  | { kind: "invalid" };

/** CR-02: classifies the raw `/room/[code]` path segment. Room codes are read
 * aloud, so a friend typing `/room/abcdef` is expected — that redirects to
 * the canonical uppercase code. Anything else outside the speakable alphabet
 * is invalid and must never reach the Worker, where a non-canonical Durable
 * Object name can never persist a room and the page would hang on
 * "Connecting…" forever. */
export function parseRoomCodeParam(raw: string): RoomCodeParamResult {
  const upper = raw.toUpperCase();
  const parsed = RoomCodeSchema.safeParse(upper);
  if (!parsed.success) {
    return { kind: "invalid" };
  }
  return upper === raw ? { kind: "ok", code: parsed.data } : { kind: "redirect", code: parsed.data };
}
