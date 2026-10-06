import type { ReactNode } from "react";
import type { GameId } from "@games/schema";

/** What a game's start page (`/<gameId>/start`) is handed by the route. */
export interface StartScreenProps {
  gameId: GameId;
  name: string;
  /** A native form post bounced back here with `?error=create`. */
  initialError: boolean;
  /** The game's create-time settings fieldset, if it has one. Rendered by
   * the server page so it is in the HTML before any JS runs (D-17). */
  children?: ReactNode;
}

/** `name` is the form-field name the game's config controls must use
 * (`configFieldName(gameId)`), which `/api/room` reads for that game. */
export interface CreateSettingsProps {
  name: string;
}
