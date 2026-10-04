// One line per item. sources.contract.test.ts iterates this registry with no
// edits.

import { bait } from "./bait";
import { camouflage } from "./camouflage";
import { heavyPack } from "./heavy-pack";
import { mosquitoNet } from "./mosquito-net";
import { packMule } from "./pack-mule";
import { parrot } from "./parrot";
import { puffball } from "./puffball";
import { rainPoncho } from "./rain-poncho";
import { ropeLadder } from "./rope-ladder";
import { smokeSignal } from "./smoke-signal";
import { trailMap } from "./trail-map";
import { trainedMonkey } from "./trained-monkey";
import { whetstone } from "./whetstone";
import { firstAidKit } from "./first-aid-kit";
import { messageBottle } from "./message-bottle";
import { pocketGlass } from "./pocket-glass";
import { signalFlare } from "./signal-flare";
import type { ItemDef } from "../source-def";

export const ITEMS = {
  "trained-monkey": trainedMonkey,
  "pack-mule": packMule,
  parrot,
  "trail-map": trailMap,
  "rain-poncho": rainPoncho,
  "smoke-signal": smokeSignal,
  whetstone,
  puffball,
  bait,
  camouflage,
  "rope-ladder": ropeLadder,
  "heavy-pack": heavyPack,
  "mosquito-net": mosquitoNet,
  "pocket-glass": pocketGlass,
  "message-bottle": messageBottle,
  "first-aid-kit": firstAidKit,
  "signal-flare": signalFlare,
} satisfies Readonly<Record<string, ItemDef>>;
