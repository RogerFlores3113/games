// One line per camp modifier. mods.contract.test.ts iterates this registry
// with no edits.

import { beaver } from "./beaver";
import { bloodMoon } from "./blood-moon";
import { capybara } from "./capybara";
import { cave } from "./cave";
import { clearing } from "./clearing";
import { clifftop } from "./clifftop";
import { crocodile } from "./crocodile";
import { desert } from "./desert";
import { earthquake } from "./earthquake";
import { fair } from "./fair";
import { flooding } from "./flooding";
import { fog } from "./fog";
import { jungle } from "./jungle";
import { locusts } from "./locusts";
import { magma } from "./magma";
import { meteor } from "./meteor";
import type { ModDef } from "./mod-def";
import { monsoon } from "./monsoon";
import { night } from "./night";
import { rain } from "./rain";
import { rats } from "./rats";
import { snake } from "./snake";
import { steam } from "./steam";
import { thunderstorm } from "./thunderstorm";
import { temple } from "./temple";
import { tiger } from "./tiger";
import { tornado } from "./tornado";
import { wildfire } from "./wildfire";

export const MODS = {
  clearing,
  jungle,
  clifftop,
  desert,
  cave,
  magma,
  fair,
  rain,
  fog,
  thunderstorm,
  night,
  steam,
  flooding,
  tiger,
  rats,
  snake,
  crocodile,
  capybara,
  beaver,
  tornado,
  earthquake,
  wildfire,
  meteor,
  "blood-moon": bloodMoon,
  locusts,
  monsoon,
  temple,
} satisfies Readonly<Record<string, ModDef>>;
