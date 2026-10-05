import { create } from "zustand";
import { computeZoom } from "../expedition/compute-zoom";

/** The dev toolbar's height along the bottom edge. */
export const DEV_TOOLBAR_H = 28;

/** The strip a fixed stage leaves the dev toolbar under it: the toolbar's
 * height when reserving it keeps the stage's zoom, else 0 (the stage fills
 * the window, as at exactly 1280x720 or 1920x1080). */
export function toolbarReserve(viewportWidth: number, viewportHeight: number): number {
  return computeZoom(viewportWidth, viewportHeight - DEV_TOOLBAR_H) === computeZoom(viewportWidth, viewportHeight) ? DEV_TOOLBAR_H : 0;
}

/** Whether the dev toolbar has a strip of its own under the game's stage.
 * A stage that fills the window clears it, and the toolbar then starts
 * folded to its DEV button so it covers nothing. */
export const useToolbarRoom = create<{ fits: boolean; setFits: (fits: boolean) => void }>((set) => ({
  fits: true,
  setFits: (fits) => set({ fits }),
}));
