import type { CardFacts } from "../../lib/hanabi-visual-logic";
import { hintDisplayFor } from "../../lib/hanabi-hint-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { SuitGlyph } from "./SuitGlyph";

export interface HintIndicatorProps {
  facts: CardFacts;
  visible: boolean;
  width: number;
  height: number;
  testId: string;
}

/**
 * D-01..D-07 (HINT-01..04): replaces the deleted automatic clue-mark pip
 * rows.
 *
 * UAT sixth owner review (gaps 32/33/35, 2026-09-18) rebuilt this
 * component's colour channel:
 * - Gap 32: a colour clue's highlight is a thin inset RING drawn in that
 *   suit's own `--color-suit-*` hue — never the shared yellow
 *   `--color-card-glow` luminosity colour, which this file never
 *   references. The colourblind-safe non-colour marker (a faint suit
 *   glyph, D-04) is kept alongside the ring so colour is never the sole
 *   carrier.
 * - Gap 33: there is no translucent colour wash across the tile face
 *   anymore — the ring is the entire highlight; it paints no fill.
 * - Gap 35: the Phase 6 luminosity frame (`data-luminosity`,
 *   `LUMINOSITY_FRAME`, `--color-card-glow` border) that used to sit
 *   underneath this overlay and never cleared is deleted entirely (see
 *   `hanabi-visual-logic.ts`'s header comment). This overlay — gated by
 *   `visible`, which the caller derives from `hintsVisibleForCard` — is now
 *   the ONLY clue-driven visual on a card, so its lifetime already is
 *   exactly the keep-hints-visible toggle's lifetime; there is nothing
 *   else left to clear.
 *
 * A number clue stamps a numeral chip on the tile back, unchanged (the
 * owner explicitly kept this one as-is). D-06 is overturned (gap 34):
 * `hintDisplayFor` now returns at most ONE of {colour, number} — the most
 * recent clue's own channel — never both at once from accumulated clues,
 * so the two are no longer simultaneously renderable from unrelated
 * clues; a single clue is one type, so composing both here would only
 * ever happen if a future change re-introduces accumulation, which it must
 * not. No ruled-out/negative clue information is rendered here or anywhere
 * else (D-07, owner-confirmed 2026-09-17, "Let it go") — `hintDisplayFor`
 * reads only `facts.positiveClues`.
 *
 * D-15 own-hand identity boundary: this file's props type is `facts: CardFacts`
 * only — never a card object, never a bare `suit`/`rank` prop — so both
 * exported components can safely render into the viewer's own hidden hand.
 * Passing the CLUED suit into `SuitGlyph` is safe even on the own-hand path
 * (the clue itself already revealed that suit to the viewer), but the
 * glyph-identity opt-in flag `SuitGlyph` accepts must never be turned on
 * anywhere in this file — turning it on would put a suit-identity DOM
 * marker into the markup, which is a stronger signal than the clue actually
 * grants. `OwnHintIndicator` and `TeammateHintIndicator` are two thin named
 * exports over the same overlay so a source-scan-style guard can still
 * address the own-hand path directly (own-hand-source.test.ts's
 * HINT_INDICATOR_PATH scan).
 */
function HintOverlay({ facts, visible, width, height, testId }: HintIndicatorProps) {
  if (!visible) return null;

  const { colorHints, numberHints } = hintDisplayFor(facts);
  const suit = colorHints[0] ?? null;
  const rank = numberHints[0] ?? null;
  if (suit === null && rank === null) return null;

  return (
    <span
      data-testid={testId}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
      style={{ width, height }}
    >
      {suit !== null && (
        <>
          {/* UAT gap 32/33: a ring in the clue's own suit colour, painted
              with an inset box-shadow so it never fills the tile face —
              highlight only, no wash. Never `--color-card-glow`. */}
          <span
            data-testid="hint-color-ring"
            className="absolute inset-0 rounded-md"
            style={{
              boxShadow: `inset 0 0 0 3px ${SUIT_VISUALS[suit].hueVar}`,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{ top: "var(--space-xs)", left: "var(--space-xs)", opacity: 0.35 }}
          >
            <SuitGlyph suit={suit} size={12} />
          </span>
        </>
      )}
      {rank !== null && (
        <span
          data-testid="hint-numeral"
          className="absolute rounded px-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold"
          style={{
            bottom: "var(--space-xs)",
            right: "var(--space-xs)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            lineHeight: "var(--text-label--line-height)",
          }}
        >
          {rank}
        </span>
      )}
    </span>
  );
}

/** Own-hand variant — facts only, D-15 boundary, see file header. */
export function OwnHintIndicator(props: HintIndicatorProps) {
  return <HintOverlay {...props} />;
}

/** Teammate variant — same facts-only inputs and composition (teammates
 * already see their own facts too, per Phase 6's existing precedent). */
export function TeammateHintIndicator(props: HintIndicatorProps) {
  return <HintOverlay {...props} />;
}
