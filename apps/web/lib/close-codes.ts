import { ROOM_ABANDONED_CLOSE_CODE, SUPERSEDED_CLOSE_CODE } from "@games/schema";

/**
 * Close codes after which `partysocket` must NOT reconnect. Everything else
 * (network drops, server restarts, deploys) reconnects and replays the seat
 * token, which is the whole point of RT-03.
 *
 * - `SUPERSEDED_CLOSE_CODE`: a newer tab owns the seat (D-08).
 * - `ROOM_ABANDONED_CLOSE_CODE`: idle GC deleted the room (WR-01). A
 *   reconnect would silently land in a brand-new empty lobby.
 */
export function isTerminalCloseCode(code: number): boolean {
  return code === SUPERSEDED_CLOSE_CODE || code === ROOM_ABANDONED_CLOSE_CODE;
}
