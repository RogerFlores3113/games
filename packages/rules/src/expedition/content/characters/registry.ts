// One line per character. Each character file holds its base power, any
// further powers and its upgrades; sources.contract.test.ts iterates this
// registry, powers and upgrades included, with no edits.

import { businessman } from "./businessman";
import { cartographer } from "./cartographer";
import { explorer } from "./explorer";
import { hermit } from "./hermit";
import { jd } from "./jd";
import { leader } from "./leader";
import { magician } from "./magician";
import { packRat } from "./pack-rat";
import { perfumist } from "./perfumist";
import type { CharacterDef } from "../source-def";

export const CHARACTERS = {
  jd,
  businessman,
  magician,
  perfumist,
  cartographer,
  explorer,
  leader,
  hermit,
  "pack-rat": packRat,
} satisfies Readonly<Record<string, CharacterDef>>;
