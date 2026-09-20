import { MAX_PLAYERS, type RoomView } from "@games/schema";

/**
 * One rendered row of the lobby's seat list: either a real server-assigned
 * seat or an "open seat" placeholder padding the list out to MAX_PLAYERS.
 *
 * The placeholders exist so the table's capacity (2-5) is legible as shape
 * rather than as a sentence — a single seated player used to sit alone in a
 * large empty panel with no indication of how many more the room holds.
 * They are presentational only: `Lobby` must never give a placeholder the
 * `seat-row` testid, because `expectSeatCount` in the e2e helpers counts
 * those to assert how many players are actually seated.
 */
export type LobbySlot =
  | { kind: "seat"; seat: RoomView["seats"][number] }
  | { kind: "open"; index: number };

/**
 * Pure, view-only padding of the server's seat list to `max` rows. Takes the
 * seats array (not the whole view) so it stays trivially testable and can
 * never read — let alone leak — any other field of a `RoomView`.
 *
 * Never truncates: if the server ever seats more players than `max`, every
 * real seat still renders (a hidden player is a correctness bug, an extra
 * row is only a layout one).
 */
export function lobbySlots(seats: RoomView["seats"], max: number = MAX_PLAYERS): LobbySlot[] {
  const filled: LobbySlot[] = seats.map((seat) => ({ kind: "seat", seat }));
  const openCount = Math.max(0, max - filled.length);
  const open: LobbySlot[] = Array.from({ length: openCount }, (_, index) => ({
    kind: "open",
    index,
  }));
  return [...filled, ...open];
}
