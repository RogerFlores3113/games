import { safeGetItem } from "../safe-storage";
import { devJumpedWithin } from "../dev/dev-store";
import type { TransitionSpeed } from "./scene-transitions";

/** This browser's say over the signboard: "fast" compresses every sign
 * (the e2e suite sets it), "always" shows the sign after a dev jump too,
 * to preview one. */
export const TRANSITION_PREF_KEY = "expedition-transitions";

/** A view a dev command caused arrives within this long of its answer. */
const DEV_JUMP_WINDOW_MS = 1500;

export function pickTransitionSpeed(env: { pref: string | null; devJumped: boolean; reducedMotion: boolean }): TransitionSpeed {
  if (env.devJumped && env.pref !== "always") return "skip";
  if (env.pref === "fast") return "fast";
  return env.reducedMotion ? "reduced" : "full";
}

/** The speed for a sign starting now, in this browser. */
export function transitionSpeed(): TransitionSpeed {
  return pickTransitionSpeed({
    pref: safeGetItem(TRANSITION_PREF_KEY),
    devJumped: devJumpedWithin(DEV_JUMP_WINDOW_MS),
    reducedMotion: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  });
}
