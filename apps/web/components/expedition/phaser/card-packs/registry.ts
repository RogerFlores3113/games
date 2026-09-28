/**
 * SCENE-08 card-pack registry (ENG-01 discipline extended to `apps/web`).
 * Adding a pack is one file plus one line here; `satisfies` against
 * `CardPackId` makes a missing/misnamed pack a compile error. No `phaser`
 * import.
 */

import { bigIndex } from "./big-index";
import { classic } from "./classic";
import type { CardPackDef } from "./card-pack-def";
import type { CardPackId } from "../../../../lib/expedition/card-pack-ids";

export const CARD_PACK_REGISTRY = {
  "big-index": bigIndex,
  classic,
} satisfies Readonly<Record<CardPackId, CardPackDef>>;
