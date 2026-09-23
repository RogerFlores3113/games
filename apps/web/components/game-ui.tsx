import type { ComponentType } from "react";
import type { GameId, RoomView } from "@games/schema";
import { HanabiBoard, type HanabiActionRequest } from "./hanabi/HanabiBoard";
import { HanabiLobbySettings } from "./hanabi/HanabiLobbySettings";
import { HanabiCreateSettings } from "./hanabi/HanabiCreateSettings";

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

// D-12: the landing page's game picker options. Client-side only —
// Expedition is NOT a registered GameId until Phase 11, so this list
// (unlike BOARD_COMPONENTS/LOBBY_SETTINGS) is not keyed by GameId and is not
// exhaustive over it; it is the one place allowed to name a not-yet-real
// game for the "coming soon" disabled option.
export const LANDING_GAME_OPTIONS: readonly { value: string; label: string; disabled: boolean }[] = [
  { value: "hanabi", label: "Hanabi", disabled: false },
  { value: "expedition", label: "Expedition - coming soon", disabled: true },
];

// Partial: a game with no create-time settings (the test-only toy game,
// Expedition today) renders no fieldset at all, not an empty one.
export const LANDING_SETTINGS: Readonly<Partial<Record<GameId, ComponentType>>> = {
  hanabi: HanabiCreateSettings,
};

export type { HanabiActionRequest };
