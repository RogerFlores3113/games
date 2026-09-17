import type { CandidateDisplay } from "../../lib/hanabi-visual-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { SuitGlyph } from "./SuitGlyph";

export interface CandidateStripProps {
  display: CandidateDisplay;
  scale: "own" | "teammate";
}

/**
 * D-12/D-13: renders a card's positive-clue marks and its full candidate
 * pips (suits + ranks 1-5) purely from a `CandidateDisplay` — every value
 * below comes from destructured `CandidateDisplay` fields, never from a
 * card's own identity fields (D-15 source scan, own-hand-source.test.ts).
 * A suit name only ever reaches the DOM as an aria-label via `SuitGlyph`'s
 * `title` prop — this file emits no suit-name text node.
 */
export function CandidateStrip({ display, scale }: CandidateStripProps) {
  const pipGlyphSize = scale === "own" ? 12 : 10;
  const gapClass = scale === "own" ? "gap-[length:var(--space-xs)]" : "gap-[2px]";
  const strikeOverlay = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: "linear-gradient(to top right, transparent 47%, var(--color-text-muted) 50%, transparent 53%)",
      }}
    />
  );

  return (
    <div className={`flex flex-col ${gapClass}`}>
      {display.positiveMarks.length > 0 && (
        <div className={`flex flex-wrap items-center ${gapClass}`} data-testid="positive-marks">
          {display.positiveMarks.map((mark, i) => {
            if (mark.type === "color") {
              const { suit } = mark;
              const label = SUIT_VISUALS[suit].label;
              return <SuitGlyph key={`pos-${i}`} suit={suit} size={pipGlyphSize} title={`Told ${label}`} />;
            }
            const { rank } = mark;
            return (
              <span
                key={`pos-${i}`}
                aria-label={`Told ${rank}`}
                className="text-[length:var(--text-label)] font-semibold"
                style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
              >
                {rank}
              </span>
            );
          })}
        </div>
      )}

      <div className={`flex flex-wrap ${gapClass}`} data-testid="suit-pips">
        {display.suits.map(({ suit, possible }) => {
          const label = SUIT_VISUALS[suit].label;
          return (
            <span
              key={suit}
              className="relative inline-flex items-center justify-center"
              style={{ opacity: possible ? 1 : 0.25 }}
            >
              <SuitGlyph suit={suit} size={pipGlyphSize} title={possible ? label : `${label} ruled out`} />
              {!possible && strikeOverlay}
            </span>
          );
        })}
      </div>

      <div className={`flex flex-wrap ${gapClass}`} data-testid="rank-pips">
        {display.ranks.map(({ rank, possible }) => (
          <span
            key={rank}
            className="relative inline-flex items-center justify-center text-[length:var(--text-label)] font-semibold"
            style={{
              opacity: possible ? 1 : 0.25,
              color: "var(--color-text)",
              lineHeight: "var(--text-label--line-height)",
            }}
          >
            {rank}
            {!possible && strikeOverlay}
          </span>
        ))}
      </div>
    </div>
  );
}
