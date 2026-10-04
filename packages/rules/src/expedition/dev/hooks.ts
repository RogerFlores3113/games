import type { DevShortcut, GameDevHooks } from "../../adapter";
import { CATALOG } from "../run/catalog";
import { runStatus } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { botMove } from "./autoplay";
import { checkRunState } from "./check";
import { inspectRun } from "./inspect";
import { DEV_SHORTCUTS, type ShortcutDef } from "./shortcuts";

export const expeditionDevHooks: GameDevHooks<RunState> = {
  seatIds: (run) => run.seatIds,

  check: (run) => checkRunState(run, CATALOG),

  shortcuts: (run): DevShortcut[] =>
    Object.entries<ShortcutDef>(DEV_SHORTCUTS).map(([id, def]) => ({ id, label: def.label, group: def.group, fields: def.fields(run, CATALOG) })),

  runShortcut(run, id, params) {
    if (!Object.hasOwn(DEV_SHORTCUTS, id)) return { ok: false, error: `unknown shortcut ${id}` };
    const def: ShortcutDef = DEV_SHORTCUTS[id as keyof typeof DEV_SHORTCUTS];
    let state: RunState;
    try {
      state = def.apply(run, params, CATALOG);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const problems = checkRunState(state, CATALOG);
    if (problems.length > 0) return { ok: false, error: `shortcut ${id} produced an invalid state: ${problems.join("; ")}` };
    return { ok: true, state };
  },

  botMove: (run, seatIds) => botMove(run, seatIds, CATALOG),

  milestone: (run) => `${run.campNumber}:${run.history.length}:${runStatus(run)}`,

  inspect: (run) => inspectRun(run, CATALOG),
};
