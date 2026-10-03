// One line per character. Each character file holds its base power and its
// two upgrades; sources.contract.test.ts iterates this registry, upgrades
// included, with no edits.

import { botanist } from "./botanist";
import { cartographer } from "./cartographer";
import { guide } from "./guide";
import { medic } from "./medic";
import { scout } from "./scout";
import { signaller } from "./signaller";
import type { CharacterDef } from "../source-def";

export const CHARACTERS = {
  scout,
  guide,
  botanist,
  medic,
  signaller,
  cartographer,
} satisfies Readonly<Record<string, CharacterDef>>;
