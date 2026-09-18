import type { HanabiView } from "@games/rules";
import {
  MAX_RANK,
  RANK_SLOT_GAP_PX,
  RANK_SLOT_HEIGHT_PX,
  RANK_SLOT_WIDTH_PX,
  STACK_HEADER_HEIGHT_PX,
  playGridHeightPx,
} from "../../lib/layout-budget";
import { FireworkCardFace } from "./FireworkCard";
import { SuitGlyph } from "./SuitGlyph";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface PlayedStackProps {
  stack: HanabiView["stacks"][number];
  flashing?: boolean;
}

/** The column header row's fixed height — same at every topRank. Sourced
 * from layout-budget.ts's STACK_HEADER_HEIGHT_PX so Table.tsx's Play-area
 * reservation (playAreaContentHeightPx) always matches what this component
 * actually renders. */
const HEADER_HEIGHT_PX = STACK_HEADER_HEIGHT_PX;

/**
 * Owner review (06.2-15, UAT gap 3, superseding D-22/BOARD-05's horizontal
 * fan): each suit renders as a fixed vertical column, one reserved slot per
 * rank 1..MAX_RANK, filling top to bottom as cards are played — "the next
 * entries in the series go directly below… creating a grid." Every rank
 * slot is reserved whether or not it is filled (UAT gap 1), so the column's
 * rendered height is identical at topRank 0 and topRank 5.
 *
 * The column header carries a single SuitGlyph, wrapped in the column's
 * only `data-glyph` emitter — which is what keeps the one-glyph-per-stack
 * e2e invariant true at every rank: filled rank cards render as plain
 * (non-identity-exposing) card faces, each with an `sr-only` "{Suit}
 * {rank}" label instead (same pattern `Table.tsx` already uses for
 * discard tiles).
 *
 * Preserves every testid/data-attribute `Table.tsx` and the e2e suite rely
 * on: `data-testid="played-stack-{suit}"`, `data-top-rank`, `data-complete`,
 * the `anim-stack-flash` class on `flashing`, and
 * `played-stack-{suit}-card-{rank}` for filled ranks.
 *
 * The completed-stack static glow border/box-shadow now lives in
 * globals.css, keyed off `[data-complete="true"]` — not inlined on this
 * element — so the root's inline `style` (width/height only) is byte-
 * identical at topRank 0 and topRank 5, which is what proves an empty slot
 * costs exactly what a filled one does (UAT gap 1).
 */
export function PlayedStack({ stack, flashing = false }: PlayedStackProps) {
  const { suit, topRank } = stack;
  const complete = topRank === 5;
  const suitLabel = SUIT_VISUALS[suit].label;

  return (
    <div
      data-testid={"played-stack-" + suit}
      data-top-rank={topRank}
      data-complete={String(complete)}
      className={"flex flex-col items-center rounded-md" + (flashing ? " anim-stack-flash" : "")}
      style={{
        width: RANK_SLOT_WIDTH_PX,
        height: playGridHeightPx() + HEADER_HEIGHT_PX,
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ height: HEADER_HEIGHT_PX }}
        data-glyph={suit}
      >
        <SuitGlyph suit={suit} size={16} />
        <span className="sr-only">{suitLabel}</span>
      </div>
      <div className="flex flex-col" style={{ gap: RANK_SLOT_GAP_PX }}>
        {Array.from({ length: MAX_RANK }, (_, index) => {
          const rank = (index + 1) as 1 | 2 | 3 | 4 | 5;
          const filled = rank <= topRank;
          return filled ? (
            <span key={rank} data-testid={`played-stack-${suit}-card-${rank}`} data-filled="true">
              <FireworkCardFace suit={suit} rank={rank} width={RANK_SLOT_WIDTH_PX} height={RANK_SLOT_HEIGHT_PX} />
              <span className="sr-only">
                {suitLabel} {rank}
              </span>
            </span>
          ) : (
            <span
              key={rank}
              data-testid={`played-slot-${suit}-${rank}`}
              data-filled="false"
              className="block rounded-md"
              style={{
                width: RANK_SLOT_WIDTH_PX,
                height: RANK_SLOT_HEIGHT_PX,
                border: "1px solid var(--color-border)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
