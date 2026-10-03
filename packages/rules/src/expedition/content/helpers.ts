// Pure helpers shared by catalogue effects.

import type { TrickPlay } from "../state";

/** The previous trickWinner, decided as if the excluded plays were never
 * made. A trick has 3 to 5 plays and an effect excludes one, so `prev`
 * always sees a non-empty trick and names a seat that played (WR-05). */
export function winnerExcluding(
  prev: (plays: readonly TrickPlay[]) => string,
  plays: readonly TrickPlay[],
  excluded: (play: TrickPlay) => boolean,
): string {
  return prev(plays.filter((play) => !excluded(play)));
}
