import { Dela_Gothic_One, Tiny5 } from "next/font/google";

/** The home page's game names and each game's own screens. Loaded only by
 * the pages that import this module, so the Hanabi table never fetches them. */
export const festiveFont = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-festive",
});

/** Expedition's HTML screens, matching the canvas's 5x7 pixel lettering
 * (and, unlike rounder pixel faces, keeping S and 5 apart). */
export const pixelFont = Tiny5({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});
