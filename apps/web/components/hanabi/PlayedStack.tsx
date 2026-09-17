import type { HanabiView } from "@games/rules";
import { FAN_PEEK_PX, PLAYED_CARD_HEIGHT_PX, PLAYED_CARD_WIDTH_PX, fannedStackWidth } from "../../lib/layout-budget";
import { FireworkCardFace } from "./FireworkCard";
import { SuitGlyph } from "./SuitGlyph";

export interface PlayedStackProps {
  stack: HanabiView["stacks"][number];
  flashing?: boolean;
}

/**
 * D-22/BOARD-05: a played stack shows every card it contains, fanned
 * HORIZONTALLY (the cheap axis at 1280x720) rather than stacked vertically —
 * only the top card used to be visible; this renders ranks 1..topRank, each
 * peeking out by `FAN_PEEK_PX` and layered above the previous one so the
 * top rank sits frontmost. The row's HEIGHT never grows with card count —
 * it stays fixed at `PLAYED_CARD_HEIGHT_PX` — only its width grows, via
 * `fannedStackWidth`.
 *
 * Preserves every testid/data-attribute and the completed-stack glow
 * `Table.tsx` previously inlined, so 06.2-07's layout rework is a drop-in.
 */
export function PlayedStack({ stack, flashing = false }: PlayedStackProps) {
  const { suit, topRank } = stack;
  const complete = topRank === 5;
  // An empty stack still reserves a single card's worth of width for its
  // placeholder — fannedStackWidth(0) is 0 by design (no cards to fan), but
  // reserving 0px would collapse the empty-stack placeholder's box.
  const width = topRank > 0 ? fannedStackWidth(topRank) : PLAYED_CARD_WIDTH_PX;

  return (
    <div
      data-testid={"played-stack-" + suit}
      data-top-rank={topRank}
      data-complete={String(complete)}
      className={"relative flex items-center justify-center rounded-md" + (flashing ? " anim-stack-flash" : "")}
      style={{
        width,
        height: PLAYED_CARD_HEIGHT_PX,
        backgroundColor: "var(--color-surface)",
        // Completed-stack static glow: same LUMINOSITY_FRAME "known" values
        // as luminosity-frame.ts, inlined here per Table.tsx's original.
        border: complete ? "2px solid var(--color-card-glow)" : "1px solid var(--color-border)",
        boxShadow: complete
          ? "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)"
          : "none",
      }}
    >
      {topRank > 0 ? (
        Array.from({ length: topRank }, (_, index) => {
          const rank = (index + 1) as 1 | 2 | 3 | 4 | 5;
          return (
            <span
              key={rank}
              data-testid={`played-stack-${suit}-card-${rank}`}
              className="absolute"
              style={{ left: index * FAN_PEEK_PX, zIndex: index + 1 }}
            >
              <FireworkCardFace
                suit={suit}
                rank={rank}
                width={PLAYED_CARD_WIDTH_PX}
                height={PLAYED_CARD_HEIGHT_PX}
                exposeSuit
                showBurstCount
              />
            </span>
          );
        })
      ) : (
        <span style={{ opacity: 0.35 }}>
          <SuitGlyph suit={suit} size={18} exposeSuit />
        </span>
      )}
      <span className="sr-only">{suit}</span>
    </div>
  );
}
