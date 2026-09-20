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
  /** Set from the keep-hints-visible preference (D-05/HINT-03). While the
   * toggle is on, the tile shows EVERY clue it has received instead of only
   * the latest — see `hintDisplayFor`'s comment for why the two modes
   * differ. Defaults to false, i.e. gap 34's latest-only display. */
  accumulate?: boolean;
}

/** Ring thickness, shared by the single-colour box-shadow ring and the
 * multi-colour gradient ring so both read as the same object. */
const RING_PX = 3;

/** Multi-colour rings start at 9 o'clock so a two-colour card splits into a
 * top half and a bottom half (the owner's chosen layout) rather than left/
 * right, which reads as two separate marks rather than one ring. */
const RING_START_DEG = 270;

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
 * owner explicitly kept this one as-is).
 *
 * Two display modes, switched by the `accumulate` prop, which the board
 * sets from the keep-hints-visible preference alone:
 * - `accumulate: false` (default) — gap 34's behaviour: at most ONE of
 *   {colour, number}, the most recent clue's own channel. With the default
 *   lifetime a hint clears as soon as the next player acts, so the newest
 *   clue is the whole story.
 * - `accumulate: true` — every clue the card has received: an arc per
 *   clued colour plus the numeral, together. The owner reported that a
 *   retained hint being overwritten by the next one "isn't well-retained"
 *   (2026-09-19), which is the whole point of the toggle. This is NOT a
 *   re-reversal of gap 34 — that decision still governs the default mode,
 *   and the two branches must stay distinct.
 * No ruled-out/negative clue information is rendered here or anywhere
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
function HintOverlay({ facts, visible, width, height, testId, accumulate = false }: HintIndicatorProps) {
  if (!visible) return null;

  const { colorHints, numberHints } = hintDisplayFor(facts, { accumulate });
  const suit = colorHints[0] ?? null;
  const rank = numberHints[0] ?? null;
  if (suit === null && rank === null) return null;

  /* One arc per clued colour, oldest first, clockwise from the top. Built
     with hard stops (each colour's start and end angle are identical
     between neighbouring stops) so the ring reads as N solid arcs, never a
     blend — a blended blue/red would invent a purple that means nothing. */
  const arcSize = colorHints.length > 0 ? 360 / colorHints.length : 0;
  const conicStops = colorHints
    .map((hinted, i) => `${SUIT_VISUALS[hinted].hueVar} ${i * arcSize}deg ${(i + 1) * arcSize}deg`)
    .join(", ");
  /* Gap 33 (no wash across the tile face) applies to the gradient ring too:
     a conic gradient paints the whole box, so the centre is masked out and
     only the RING_PX padding band survives. Two mask layers — the full box
     and the content box — composited with `exclude` leaves the border band
     alone. `WebkitMaskComposite: "xor"` is the older Safari spelling of the
     same operation and is harmless where the standard property applies.
     The mask layers are spelled `black`, not a hex literal: this file is
     source-scanned for hex colours (hint-render.test.ts). A mask reads only
     alpha, so the keyword is equivalent. */
  const gradientRingStyle = {
    padding: RING_PX,
    background: `conic-gradient(from ${RING_START_DEG}deg, ${conicStops})`,
    mask: "linear-gradient(black 0 0) content-box, linear-gradient(black 0 0)",
    maskComposite: "exclude",
    WebkitMask: "linear-gradient(black 0 0) content-box, linear-gradient(black 0 0)",
    WebkitMaskComposite: "xor",
  } as const;

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
              highlight only, no wash. Never `--color-card-glow`.
              One clued colour keeps exactly this ring; several (only
              reachable while keep-hints is on, and in practice a rainbow
              tile touched by two colour clues) split it into one arc each,
              which is what makes a rainbow readable as rainbow. */}
          {colorHints.length === 1 ? (
            <span
              data-testid="hint-color-ring"
              className="absolute inset-0 rounded-md"
              style={{
                boxShadow: `inset 0 0 0 ${RING_PX}px ${SUIT_VISUALS[suit].hueVar}`,
              }}
            />
          ) : (
            <span
              data-testid="hint-color-ring"
              data-ring-colors={colorHints.length}
              className="absolute inset-0 rounded-md"
              style={gradientRingStyle}
            />
          )}
          {/* One faint glyph per clued colour, in the same oldest-first
              order as the arcs, so colour is never the sole carrier of a
              retained clue (D-04). */}
          <span
            className="absolute flex items-center gap-[2px] rounded-full"
            style={{ top: "var(--space-xs)", left: "var(--space-xs)", opacity: 0.35 }}
          >
            {colorHints.map((hinted) => (
              <SuitGlyph key={hinted} suit={hinted} size={12} />
            ))}
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
