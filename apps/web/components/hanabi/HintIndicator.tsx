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
 * D-01..D-07 (HINT-01..04): replaces MarksZone/CandidateStrip's pip rows.
 * A colour clue tints the whole tile face and shows a faint, non-colour
 * suit-glyph marker (D-04 grayscale survival); a number clue stamps a
 * numeral chip on the tile back. The two channels are independent and never
 * overlap (D-06): the suit marker sits in the top-left corner, the numeral
 * chip in the bottom-right. No ruled-out/negative clue information is
 * rendered here or anywhere else (D-07, owner-confirmed 2026-09-17,
 * "Let it go") — `hintDisplayFor` reads only `facts.positiveClues`.
 *
 * D-15 own-hand identity boundary: this file's props type is `facts: CardFacts`
 * only — never a card object, never a bare `suit`/`rank` prop — so both
 * exported components can safely render into the viewer's own hidden hand.
 * Passing the CLUED suit into `SuitGlyph` is safe even on the own-hand path
 * (the clue itself already revealed that suit to the viewer), but
 * `exposeSuit` must never be set to true anywhere in this file — a `true`
 * value would put a suit-identity `data-glyph` marker into the DOM, which is
 * a stronger signal than the clue actually grants. `OwnHintIndicator` and
 * `TeammateHintIndicator` are two thin named exports over the same overlay so
 * a source-scan-style guard can still address the own-hand path directly
 * (own-hand-source.test.ts's HINT_INDICATOR_PATH scan).
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
          <span
            className="absolute inset-0 rounded-md"
            style={{
              background: `color-mix(in srgb, ${SUIT_VISUALS[suit].hueVar} 22%, var(--color-surface))`,
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
