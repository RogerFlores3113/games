import type { LuminosityStep } from "../../lib/hanabi-visual-logic";

/**
 * D-08/D-10: luminosity lives on the card FRAME only (border, box-shadow, and
 * — for "known" — a background-layer brightness filter applied to a
 * dedicated background span, never the identity glyph or its hue). Consumers
 * must never lighten/darken a suit's hue or a glyph's fill to express a
 * luminosity step; that channel is reserved for suit identity and stays
 * fully solid at every step (D-10).
 */
export interface LuminosityFrame {
  border: string;
  boxShadow: string;
  backgroundFilter: string | undefined;
}

export const LUMINOSITY_FRAME: Readonly<Record<LuminosityStep, LuminosityFrame>> = {
  unclued: {
    border: "1px solid var(--color-border)",
    boxShadow: "none",
    backgroundFilter: undefined,
  },
  touched: {
    border: "2px solid var(--color-card-glow)",
    boxShadow: "0 0 8px 0 rgba(255, 217, 138, 0.35)",
    backgroundFilter: undefined,
  },
  known: {
    border: "2px solid var(--color-card-glow)",
    boxShadow: "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)",
    backgroundFilter: "brightness(1.08)",
  },
};
