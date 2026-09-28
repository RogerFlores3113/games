/**
 * Hand-authored pixel masks for the six pip shapes card packs draw: the four
 * standard suits plus the Sun and Moon jokers. Full size is 7x7 (drawn on
 * full-size cards); mini size is 5x5 (drawn on mini cards). Placeholder tier
 * (D-13): self-authored flat shapes, no licensed assets. Rows are "#"/"."
 * strings, top to bottom; every row within a mask is the same length. No
 * `phaser` import — plain pixel data, drawn by whichever pack imports it.
 */

export type PipKind = "spades" | "hearts" | "diamonds" | "clubs" | "sun" | "moon";

export const FULL_PIPS: Readonly<Record<PipKind, readonly string[]>> = {
  spades: ["...#...", "..###..", ".#####.", "#######", "...#...", "...#...", "..###.."],
  hearts: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#...", "......."],
  diamonds: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  clubs: ["..#.#..", ".#####.", ".#####.", "...#...", "..###..", ".#####.", "...#..."],
  sun: ["#.#.#.#", ".#####.", "#######", "#######", "#######", ".#####.", "#.#.#.#"],
  moon: ["..###..", ".##....", "##.....", "##.....", "##.....", ".##....", "..###.."],
};

export const MINI_PIPS: Readonly<Record<PipKind, readonly string[]>> = {
  spades: ["..#..", ".###.", "#####", "..#..", ".###."],
  hearts: [".#.#.", "#####", ".###.", "..#..", "....."],
  diamonds: ["..#..", ".###.", "#####", ".###.", "..#.."],
  clubs: [".#.#.", "#####", "..#..", ".###.", "..#.."],
  sun: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
  moon: [".###.", "##...", "#....", "##...", ".###."],
};
