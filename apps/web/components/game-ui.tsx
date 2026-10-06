import type { ComponentType } from "react";
import type { GameId, RoomView } from "@games/schema";
import { HanabiBoard, type HanabiActionRequest } from "./hanabi/HanabiBoard";
import { HanabiLobbySettings } from "./hanabi/HanabiLobbySettings";
import { ExpeditionBoard } from "./expedition/ExpeditionBoard";
import { ExpeditionLobby } from "./expedition/ExpeditionLobby";
import type { LobbyProps } from "./Lobby";

/**
 * D-11: the ONLY web module permitted to name a specific game's UI
 * components. `RoomClient.tsx` picks a board from `BOARD_COMPONENTS` and
 * `Lobby.tsx` picks a settings fieldset from `LOBBY_SETTINGS`, both keyed by
 * `gameId` — neither file branches on a game name itself. Phase 11/12 add
 * Expedition's board/settings entries here, and nowhere else. The home page
 * and the start pages pick theirs from `game-catalog.ts`.
 */

export interface BoardProps {
  view: RoomView;
  onAction: (request: unknown) => void;
  reconnecting: boolean;
  onDeleteRoom?: () => void;
  onRestartLobby?: () => void;
  /** Votes to kick a disconnected seat out of play (`kick: false` takes it back). */
  onKickVote?: (targetSeatId: string, kick: boolean) => void;
}

// `Record<GameId, …>` (not `Partial`) makes a future GameId with no
// registered board a compile error — every production game must bring a
// board.
export const BOARD_COMPONENTS: Readonly<Record<GameId, ComponentType<BoardProps>>> = {
  hanabi: HanabiBoard as unknown as ComponentType<BoardProps>,
  expedition: ExpeditionBoard,
};

export interface LobbySettingsProps {
  config: unknown;
  onSetConfig: (config: unknown) => void;
  /** D-05: true while the socket is reconnecting — every host settings
   * control must render disabled, since `send()` drops messages then. */
  disabled: boolean;
}

// `Partial` here (unlike `BOARD_COMPONENTS`): a game with no in-lobby
// settings is legal (D-12's test-only toy game, Expedition today) and
// renders no settings section at all rather than an empty one.
export const LOBBY_SETTINGS: Readonly<Partial<Record<GameId, ComponentType<LobbySettingsProps>>>> = {
  hanabi: HanabiLobbySettings,
};

// A game with its own lobby look; any other game gets the shared `Lobby`.
export const LOBBY_COMPONENTS: Readonly<Partial<Record<GameId, ComponentType<LobbyProps>>>> = {
  expedition: ExpeditionLobby,
};

export type { HanabiActionRequest };
