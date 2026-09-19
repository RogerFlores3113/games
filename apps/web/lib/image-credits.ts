/**
 * Single source of truth for the CC BY attribution shown on any page that
 * displays a Wikimedia Commons background photo. `apps/web/public/backgrounds
 * /CREDITS.md` carries the full verification record (verified-via-API notes,
 * retrieval date, modifications); this module carries only what the CC BY
 * licences actually require the *visitor* to be able to see — Title,
 * Author, Source, License (TASL) — so the on-page credit and CREDITS.md
 * cannot silently drift apart (both are transcribed from the same Commons
 * `File:` page metadata).
 *
 * `wood-tile.webp` (the board's dark walnut texture) is intentionally
 * absent — it is owner-supplied with unverified provenance, not a
 * Commons CC BY image, so there is nothing to attribute (see CREDITS.md).
 */
export interface ImageCredit {
  /** Which background photo this credits — matches the CREDITS.md heading. */
  id: "board-game-night" | "city-fireworks";
  /** Commons file title, used as the visible "Photo: <title>" link text. */
  title: string;
  /** Commons `File:` page — the title links here. */
  sourceUrl: string;
  /** Attributed author name, per Commons' `Artist` field. */
  author: string;
  /** Short licence name, used as the visible licence link text. */
  license: string;
  /** Creative Commons licence deed — the licence name links here. */
  licenseUrl: string;
}

/** Landing page background — `.landing-backdrop` in `app/globals.css`. */
export const LANDING_IMAGE_CREDIT: ImageCredit = {
  id: "board-game-night",
  title: "Settlers of Catan completed",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Settlers_of_Catan_completed.jpg",
  author: "Fritzmann2002",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};

/** In-game table background — `.table-backdrop` in `app/globals.css`. */
export const TABLE_IMAGE_CREDIT: ImageCredit = {
  id: "city-fireworks",
  title: "Hong Kong firework show",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Hong_Kong_firework_show.jpg",
  author: "Dennis Wong",
  license: "CC BY 2.0",
  licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
};
