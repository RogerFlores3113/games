import type { DevShortcut, GameDevHooks } from "../../adapter";
import { CATALOG } from "../run/catalog";
import { runStatus } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { botMove } from "./autoplay";
import { checkRunState } from "./check";
import { inspectRun } from "./inspect";
import { DEV_SHORTCUTS, type ShortcutDef } from "./shortcuts";

export const expeditionDevHooks: GameDevHooks<RunState> = {
  // The room keeps a kicked player's seat, so a saved state's seats are the
  // crew with each kicked seat back at its place, as rejoining puts it.
  seatIds: (run) =>
    [...run.kicked]
      .sort((a, b) => a.position - b.position)
      .reduce<string[]>((ids, k) => [...ids.slice(0, k.position), k.seat.seatId, ...ids.slice(k.position)], [...run.seatIds]),

  check: (run) => checkRunState(run, CATALOG),

  shortcuts: (run): DevShortcut[] =>
    Object.entries<ShortcutDef>(DEV_SHORTCUTS).map(([id, def]) => ({
      id,
      label: def.label,
      group: def.group,
      fields: def.fields(run, CATALOG),
      ...(def.toolbar === undefined ? {} : { toolbar: def.toolbar }),
      ...(def.target === undefined ? {} : { target: def.target }),
    })),

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

  // Changes exactly when a camp settles or the run ends, so autoplay's "end
  // of camp" stop plays through votes, drafts and readies to the next settle.
  milestone: (run) => `${run.history.length}:${runStatus(run)}`,

  inspect: (run) => inspectRun(run, CATALOG),
};
