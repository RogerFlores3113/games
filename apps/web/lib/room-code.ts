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
