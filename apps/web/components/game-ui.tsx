import type { ComponentType } from "react";
import type { GameId, RoomView } from "@games/schema";
import { HanabiBoard, type HanabiActionRequest } from "./hanabi/HanabiBoard";
import { HanabiLobbySettings } from "./hanabi/HanabiLobbySettings";

/**
 * D-11: the ONLY web module permitted to name a specific game's UI
 * components. `RoomClient.tsx` picks a board from `BOARD_COMPONENTS` and
 * `Lobby.tsx` picks a settings fieldset from `LOBBY_SETTINGS`, both keyed by
 * `gameId` — neither file branches on a game name itself. Phase 11/12 add
 * Expedition's board/settings entries here, and nowhere else.
 */

export interface BoardProps {
  view: RoomView;
  onAction: (request: unknown) => void;
  reconnecting: boolean;
  onDeleteRoom?: () => void;
  onRestartLobby?: () => void;
}

// `Record<GameId, …>` (not `Partial`) makes a future GameId with no
// registered board a compile error — every production game must bring a
// board.
export const BOARD_COMPONENTS: Readonly<Record<GameId, ComponentType<BoardProps>>> = {
  hanabi: HanabiBoard as unknown as ComponentType<BoardProps>,
};

export interface LobbySettingsProps {
  config: unknown;
  onSetConfig: (config: unknown) => void;
}

// `Partial` here (unlike `BOARD_COMPONENTS`): a game with no in-lobby
// settings is legal (D-12's test-only toy game, Expedition today) and
// renders no settings section at all rather than an empty one.
export const LOBBY_SETTINGS: Readonly<Partial<Record<GameId, ComponentType<LobbySettingsProps>>>> = {
  hanabi: HanabiLobbySettings,
};

export type { HanabiActionRequest };
