// One line per character. Each character file holds its base power, any
// further powers and its upgrades; sources.contract.test.ts iterates this
// registry, powers and upgrades included, with no edits.

import { cartographer } from "./cartographer";
import { explorer } from "./explorer";
import { jd } from "./jd";
import { leader } from "./leader";
import { medic } from "./medic";
import { signaller } from "./signaller";
import type { CharacterDef } from "../source-def";

export const CHARACTERS = {
  jd,
  leader,
  explorer,
  medic,
  signaller,
  cartographer,
} satisfies Readonly<Record<string, CharacterDef>>;
