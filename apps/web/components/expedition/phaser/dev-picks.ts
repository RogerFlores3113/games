import type Phaser from "phaser";
import type { ExpeditionSceneStore } from "../../../lib/expedition/expedition-scene-store";
import { STAGE_WIDTH } from "../../../lib/expedition/compute-zoom";
import { devEntityAt } from "../../../lib/expedition/dev-entity";
import { useDevStore } from "../../../lib/dev/dev-store";
import type { ObjectIndex } from "./object-index";

/**
 * Dev builds only (ExpeditionPhaserMount loads this behind the dev gate):
 * a right-click on the table names the objective, boss or modifier chip
 * under the pointer to the dev tools, which offer what they can do to it.
 * While the player is targeting, a right-click is the game's own cancel and
 * passes through; otherwise it never reaches Phaser, so it can't also pick.
 */
export function installDevPicks(game: Phaser.Game, index: ObjectIndex, store: ExpeditionSceneStore): () => void {
  const canvas = game.canvas;
  const parent = canvas.parentElement;
  if (parent === null) return () => {};

  // Decided once per press, at its pointerdown: the game's cancel clears the
  // targeting before the press's later events arrive.
  let gameCancels = false;
  const onRightPress = (event: MouseEvent) => {
    if (event.button !== 2) return;
    if (event.type === "pointerdown") gameCancels = store.getState().localUi.targeting !== null;
    if (!gameCancels) event.stopPropagation();
  };
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (gameCancels) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / STAGE_WIDTH;
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    const area = (b: { width: number; height: number }) => b.width * b.height;
    const under = index
      .entries()
      .filter(({ bounds: b }) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)
      .sort((a, b) => area(a.bounds) - area(b.bounds))
      .map((entry) => entry.id);
    const view = store.getState().server?.game;
    const entity = view === undefined ? null : devEntityAt(under, view);
    useDevStore.getState().pick({ kind: entity?.kind ?? null, id: entity?.id ?? "", x: event.clientX, y: event.clientY });
  };

  const types = ["pointerdown", "pointerup", "mousedown", "mouseup"] as const;
  for (const type of types) parent.addEventListener(type, onRightPress, true);
  canvas.addEventListener("contextmenu", onContextMenu);
  return () => {
    for (const type of types) parent.removeEventListener(type, onRightPress, true);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };
}
