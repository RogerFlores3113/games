import type { ComponentType } from "react";
import type { GameId, RoomView } from "@games/schema";
import { HanabiBoard, type HanabiActionRequest } from "./hanabi/HanabiBoard";
import { HanabiLobbySettings } from "./hanabi/HanabiLobbySettings";
import { HanabiCreateSettings } from "./hanabi/HanabiCreateSettings";
import { ExpeditionBoard } from "./expedition/ExpeditionBoard";

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

// D-12: the landing page's game picker options. Expedition is registered as
// of Phase 11 (GameIdSchema/GAME_REGISTRY both hold it); Phase 12 enables the
// option here now that the camp board is playable (SCENE-01). Client-side
// only — this list (unlike BOARD_COMPONENTS/LOBBY_SETTINGS) is not keyed by
// GameId and is not required to be exhaustive over it.
export const LANDING_GAME_OPTIONS: readonly { value: string; label: string; disabled: boolean }[] = [
  { value: "hanabi", label: "Hanabi", disabled: false },
  { value: "expedition", label: "Expedition", disabled: false },
];

/** `name` is the form-field name the game's config controls must use
 * (`configFieldName(gameId)`, namespaced per game). Every panel is submitted
 * even while hidden, so a shared name would let one game's controls leak
 * into another game's request (WR-02). */
export interface CreateSettingsProps {
  name: string;
}

// Partial: a game with no create-time settings (the test-only toy game,
// Expedition today) renders no fieldset at all, not an empty one.
export const LANDING_SETTINGS: Readonly<Partial<Record<GameId, ComponentType<CreateSettingsProps>>>> = {
  hanabi: HanabiCreateSettings,
};

export type { HanabiActionRequest };
