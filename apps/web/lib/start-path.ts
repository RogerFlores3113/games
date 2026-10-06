import type { GameId } from "@games/schema";

/** A game's start page: its create-room form. */
export function startPath(gameId: GameId): string {
  return `/${gameId}/start`;
}
