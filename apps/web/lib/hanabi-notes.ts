import { safeGetItem, safeKeysWithPrefix, safeRemoveItem, safeSetItem } from "./safe-storage";

/**
 * D-01: notes are private to the writing player and NEVER sent to the
 * server or another seat — this module must never import anything that can
 * reach the wire or the server-synced client state cache. It talks to
 * browser storage exclusively through `safe-storage.ts` (D-02).
 *
 * D-04: a note is keyed to the card id, so it survives a reorder (which
 * moves the card but never changes its id). `pruneNotesForSeat` deletes
 * notes for cards no longer in the caller-supplied live set (the card left
 * the hand — played/discarded — so its note should not silently reappear
 * on an unrelated future card at the same slot). `clearNotesForRoom` prunes
 * every note for a room, for an ended game.
 */

/** Notes are short — capped at ~20 characters (D-06). */
export const NOTE_MAX_LENGTH = 20;

const NOTE_PREFIX = "hanabi-note";

/** `hanabi-note:{roomCode}:{seatId}:{cardId}` — the storage key a single
 * card's note lives under. */
export function noteKey(roomCode: string, seatId: string, cardId: string): string {
  return `${NOTE_PREFIX}:${roomCode}:${seatId}:${cardId}`;
}

/** Returns the stored note text, or `""` if absent, storage is unavailable,
 * or access fails. Never throws. */
export function readNote(roomCode: string, seatId: string, cardId: string): string {
  return safeGetItem(noteKey(roomCode, seatId, cardId)) ?? "";
}

/** Writes a note, truncated to `NOTE_MAX_LENGTH`. Writing an empty string
 * removes the key rather than storing an empty value (D-06). Never throws. */
export function writeNote(roomCode: string, seatId: string, cardId: string, text: string): void {
  const key = noteKey(roomCode, seatId, cardId);
  const truncated = text.slice(0, NOTE_MAX_LENGTH);
  if (truncated === "") {
    safeRemoveItem(key);
    return;
  }
  safeSetItem(key, truncated);
}

/** Removes a single card's note. Never throws. */
export function deleteNote(roomCode: string, seatId: string, cardId: string): void {
  safeRemoveItem(noteKey(roomCode, seatId, cardId));
}

/** D-04: deletes every note for `seatId` in `roomCode` whose card id is not
 * in `liveCardIds` — called after a play/discard/draw so a stale note never
 * reappears on a different card that later lands in the same slot. Never
 * throws. */
export function pruneNotesForSeat(
  roomCode: string,
  seatId: string,
  liveCardIds: readonly string[],
): void {
  const prefix = `${NOTE_PREFIX}:${roomCode}:${seatId}:`;
  const live = new Set(liveCardIds);
  const keys = safeKeysWithPrefix(prefix);
  for (const key of keys) {
    const cardId = key.slice(prefix.length);
    if (!live.has(cardId)) {
      safeRemoveItem(key);
    }
  }
}

/** D-04: removes every note under `roomCode`, for an ended game's stale
 * entries. Never throws. */
export function clearNotesForRoom(roomCode: string): void {
  const prefix = `${NOTE_PREFIX}:${roomCode}:`;
  const keys = safeKeysWithPrefix(prefix);
  for (const key of keys) {
    safeRemoveItem(key);
  }
}
