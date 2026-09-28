/**
 * Phaser-free bitmap-font constants (D-12: two canvas text sizes only).
 * Every scene/interactable names a font by these keys rather than a
 * hand-typed string, so Plan 12-06 (which registers the actual fonts under
 * these keys) and every consumer stay in lockstep. No `phaser` import.
 */

/** Seat names, gear box names, supply count, objective marker glyphs. */
export const WORLD_LABEL_FONT = "world-label";
/** The in-world wooden sign's window/state text (D-03) and the boss-twist
 * name (D-15) — the single largest, most important read-at-a-glance text. */
export const WORLD_SIGN_FONT = "world-sign";

export const LABEL_CELL = { w: 6, h: 8 } as const;
export const SIGN_CELL = { w: 8, h: 12 } as const;
