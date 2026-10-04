// One line per character. Each character file holds its base power, any
// further powers and its upgrades; sources.contract.test.ts iterates this
// registry, powers and upgrades included, with no edits.

import { businessman } from "./businessman";
import { cartographer } from "./cartographer";
import { explorer } from "./explorer";
import { jd } from "./jd";
import { leader } from "./leader";
import { packRat } from "./pack-rat";
import type { CharacterDef } from "../source-def";

export const CHARACTERS = {
  jd,
  businessman,
  cartographer,
  explorer,
  leader,
  "pack-rat": packRat,
} satisfies Readonly<Record<string, CharacterDef>>;
