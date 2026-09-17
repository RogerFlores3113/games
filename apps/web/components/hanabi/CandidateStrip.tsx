import type { Rank, Suit } from "@games/rules";
import type { CandidateDisplay } from "../../lib/hanabi-visual-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { SuitGlyph } from "./SuitGlyph";

export interface CandidateStripProps {
  display: CandidateDisplay;
  scale: "own" | "teammate";
}

/**
 * D-07/D-12/D-13: renders a card's full candidate pips (suits + ranks 1-5),
 * with told (positive-clue) marks folded onto the matching pip rather than a
 * separate row — purely from a `CandidateDisplay`. Every value below comes
 * from destructured `CandidateDisplay` fields, never from a card's own
 * identity fields (D-15 source scan, own-hand-source.test.ts). A suit name
 * only ever reaches the DOM as an aria-label/title via `SuitGlyph`'s `title`
 * prop or a rank pip's own title — this file emits no free suit-name text
 * node. Compact two-row layout (suit pips, then rank pips) sized to fit
 * inside MarksZone's fixed 28px band (D-07).
 */
export function CandidateStrip({ display, scale }: CandidateStripProps) {
  const pipGlyphSize = scale === "own" ? 10 : 9;
  const gapClass = scale === "own" ? "gap-[2px]" : "gap-[1px]";
  const strikeOverlay = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: "linear-gradient(to top right, transparent 47%, var(--color-text-muted) 50%, transparent 53%)",
      }}
    />
  );

  // D-15: destructuring (not property access) suit/rank out of positiveMarks
  // — the same pattern the identity-boundary scan already allows here.
  const toldSuits = new Set<Suit>();
  const toldRanks = new Set<Rank>();
  for (const mark of display.positiveMarks) {
    if (mark.type === "color") {
      const { suit } = mark;
      toldSuits.add(suit);
    } else {
      const { rank } = mark;
      toldRanks.add(rank);
    }
  }

  return (
    <div className={`flex flex-col ${gapClass}`}>
      <div className={`flex flex-nowrap items-center ${gapClass}`} data-testid="suit-pips">
        {display.suits.map(({ suit, possible }) => {
          const label = SUIT_VISUALS[suit].label;
          const told = toldSuits.has(suit);
          const isConfirmed = display.confirmedSuit === suit;
          return (
            <span
              key={suit}
              data-testid={isConfirmed ? "confirmed-suit" : undefined}
              data-told={told ? "true" : undefined}
              className="relative inline-flex items-center justify-center"
              style={{
                opacity: possible ? 1 : 0.25,
                boxShadow: told ? "0 0 0 1px var(--color-card-glow)" : undefined,
              }}
            >
              <SuitGlyph
                suit={suit}
                size={pipGlyphSize}
                title={told ? `Told ${label}` : possible ? label : `${label} ruled out`}
              />
              {!possible && strikeOverlay}
            </span>
          );
        })}
      </div>

      <div className={`flex flex-nowrap items-center ${gapClass}`} data-testid="rank-pips">
        {display.ranks.map(({ rank, possible }) => {
          const told = toldRanks.has(rank);
          const isConfirmed = display.confirmedRank === rank;
          return (
            <span
              key={rank}
              data-testid={isConfirmed ? "confirmed-rank" : undefined}
              data-told={told ? "true" : undefined}
              aria-label={told ? `Told ${rank}` : undefined}
              title={told ? `Told ${rank}` : undefined}
              className="relative inline-flex items-center justify-center text-[length:var(--text-label)] font-semibold"
              style={{
                opacity: possible ? 1 : 0.25,
                color: "var(--color-text)",
                lineHeight: "1",
                boxShadow: told ? "0 0 0 1px var(--color-card-glow)" : undefined,
              }}
            >
              {rank}
              {!possible && strikeOverlay}
            </span>
          );
        })}
      </div>
    </div>
  );
}
