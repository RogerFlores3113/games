// One line per camp modifier. mods.contract.test.ts iterates this registry
// with no edits.

import { clearing } from "./clearing";
import { clifftop } from "./clifftop";
import { fair } from "./fair";
import { jungle } from "./jungle";
import type { ModDef } from "./mod-def";
import { rain } from "./rain";
import { thunderstorm } from "./thunderstorm";

export const MODS = {
  clearing,
  jungle,
  clifftop,
  fair,
  rain,
  thunderstorm,
} satisfies Readonly<Record<string, ModDef>>;
