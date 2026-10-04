// One line per camp modifier. mods.contract.test.ts iterates this registry
// with no edits.

import { beaver } from "./beaver";
import { capybara } from "./capybara";
import { cave } from "./cave";
import { clearing } from "./clearing";
import { clifftop } from "./clifftop";
import { crocodile } from "./crocodile";
import { desert } from "./desert";
import { fair } from "./fair";
import { flooding } from "./flooding";
import { fog } from "./fog";
import { jungle } from "./jungle";
import { magma } from "./magma";
import type { ModDef } from "./mod-def";
import { night } from "./night";
import { rain } from "./rain";
import { rats } from "./rats";
import { snake } from "./snake";
import { steam } from "./steam";
import { thunderstorm } from "./thunderstorm";
import { tiger } from "./tiger";

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
} satisfies Readonly<Record<string, ModDef>>;
