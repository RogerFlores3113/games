import type { ComponentType } from "react";
import { GameIdSchema, type GameId } from "@games/schema";
import { HanabiCreateSettings } from "./hanabi/HanabiCreateSettings";
import { ClassicStart } from "./start/ClassicStart";
import { ExpeditionStart } from "./start/ExpeditionStart";
import type { CreateSettingsProps, StartScreenProps } from "./start/start-screen";
import { festiveFont, pixelFont } from "./fonts";

/**
 * The home page's game picker and each game's start page (`/<gameId>/start`)
 * are driven by this one table: adding a game is adding its entry. The room
 * itself picks its components from `game-ui.tsx`.
 */
export interface GameCatalogEntry {
  name: string;
  tagline: string;
  players: string;
  /** The home tile's background, a 16:9 pixel-art scene. */
  art: string;
  /** Font class for the game's name on its tile. */
  titleClassName: string;
  /** Picks the tile's colourway in globals.css (`.game-tile[data-tone]`). */
  tone: "festival" | "trail";
  Start: ComponentType<StartScreenProps>;
  /** Create-time settings shown on the start page; none for a game without any. */
  CreateSettings?: ComponentType<CreateSettingsProps>;
}

// `Record<GameId, …>`: a registered game with no tile is a compile error.
// Key order is the order of the tiles.
export const GAME_CATALOG: Readonly<Record<GameId, GameCatalogEntry>> = {
  hanabi: {
    name: "Hanabi",
    tagline: "Put on a fireworks show together, holding a hand only your friends can see.",
    players: "2–5 players",
    art: "/backgrounds/hanabi-fireworks-pixel.png",
    titleClassName: festiveFont.className,
    tone: "festival",
    Start: ClassicStart,
    CreateSettings: HanabiCreateSettings,
  },
  expedition: {
    name: "Expedition",
    tagline: "A co-op trick-taking trek through the jungle, camp by camp, to the lost temple.",
    players: "3–5 players",
    art: "/expedition/title/bg-title-trail.png",
    titleClassName: pixelFont.className,
    tone: "trail",
    Start: ExpeditionStart,
  },
};

/** The catalog entry for a URL segment, or undefined for anything that is not a game. */
export function catalogEntry(segment: string): { gameId: GameId; entry: GameCatalogEntry } | undefined {
  const parsed = GameIdSchema.safeParse(segment);
  return parsed.success ? { gameId: parsed.data, entry: GAME_CATALOG[parsed.data] } : undefined;
}
