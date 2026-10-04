/**
 * The 9x9 pixel icons of the camp modifiers, as data: the canvas draws them
 * (`draw-weather.ts`'s `modIcon`) and the rules modal renders them as SVG.
 * No `phaser` import.
 */
import { PALETTE } from "../palette";

type ModKind = "location" | "weather" | "pairing" | "animal" | "disaster" | "temple";

/** 9x9 pixel icons; each letter is a palette colour, "." is clear. */
export const MOD_ICON_INK: Readonly<Record<string, string>> = {
  o: PALETTE.sun,
  y: PALETTE.coin,
  w: PALETTE.moon,
  g: PALETTE.textDim,
  d: PALETTE.plateEdge,
  b: PALETTE.rain,
  t: PALETTE.done,
  k: PALETTE.bark,
  m: PALETTE.moss,
  r: PALETTE.destructive,
  c: PALETTE.cardFace,
};

const ICONS: Readonly<Record<string, readonly string[]>> = {
  fair: ["....o....", ".o.....o.", "...ooo...", "..ooooo..", "o.ooooo.o", "..ooooo..", "...ooo...", ".o.....o.", "....o...."],
  rain: ["...www...", ".wwwwwww.", "wwwwwwwww", ".wwwwwww.", ".........", ".b..b..b.", "b..b..b..", ".........", ".b..b..b."],
  thunderstorm: ["...ggg...", ".ggggggg.", "ggggggggg", ".gggyggg.", "....yy...", "...yy....", "..yyyyy..", "....yy...", "...y....."],
  jungle: ["...ttt...", "..ttttt..", ".ttttttt.", "ttttttttt", ".ttttttt.", "...kkk...", "....k....", "....k....", "mmmmmmmmm"],
  clearing: [".........", ".........", "....o....", "...ooo...", ".........", "t..t...t.", "tt.tt.ttt", "mmmmmmmmm", "mmmmmmmmm"],
  clifftop: ["....w....", "...www...", "...gwg...", "..ggggg..", "..gdggg..", ".ggggdgg.", ".gdggggg.", "ggggggdgg", "ddddddddd"],
  desert: ["......o..", ".....ooo.", "......o..", "..t......", ".ttt.....", "..t...cc.", "..t..cccc", "ccccccccc", "ccccccccc"],
  cave: ["...ggg...", ".ggggggg.", "ggg...ggg", "gg.....gg", "gg..b..gg", "g...b...g", "g..bbb..g", "g.......g", "ggggggggg"],
  magma: ["...r.r...", "....r....", "...kkk...", "..kkokk..", "..kkokk..", ".kkkokkk.", ".kkoookk.", "kkoooookk", "ooooooooo"],
  fog: [".........", "wwwww....", "...wwwwww", ".........", ".wwwwww..", "....wwwww", ".........", "wwwww....", "..wwwwww."],
  night: ["..www....", ".ww......", "ww.....y.", "ww.......", "ww....y..", "ww.......", ".ww.....y", "..www....", "........."],
  steam: [".w...w...", "..w...w..", ".w...w...", "..w...w..", ".........", "..rrrrr..", ".rrooorr.", "rrooooorr", "rrrrrrrrr"],
  flooding: [".b..b..b.", "b..b..b..", ".........", "bb...bb..", "..bbb..bb", ".........", "bb...bb..", "..bbb..bb", "bbbbbbbbb"],
};

/** A shape for each kind when its def has no icon of its own. */
const KIND_ICON: Readonly<Record<ModKind, readonly string[]>> = {
  location: ICONS.clearing!,
  weather: ICONS.fair!,
  pairing: ["....y....", "...yyy...", "..yy.yy..", ".yy...yy.", "yy.....yy", ".yy...yy.", "..yy.yy..", "...yyy...", "....y...."],
  animal: ["..k...k..", ".kkk.kkk.", ".kkkkkkk.", "kk.kkk.kk", "kkkkkkkkk", ".kkkkkkk.", "..kkkkk..", "...kkk...", "........."],
  disaster: ["....o....", "...ooo...", "...ooo...", "..ooooo..", "..oo.oo..", ".ooo.ooo.", ".ooooooo.", "ooooooooo", "........."],
  temple: ["....w....", "...www...", "wwwwwwwww", ".w.w.w.w.", ".w.w.w.w.", ".w.w.w.w.", ".w.w.w.w.", "wwwwwwwww", "ddddddddd"],
};

export const MOD_ICON_SIZE = 9;

/** A modifier's own icon, else its kind's. */
export function modIconRows(id: string, kind: ModKind): readonly string[] {
  return ICONS[id] ?? KIND_ICON[kind];
}
