import type { HanabiView, Rank } from "@games/rules";
import { isStackComplete } from "@games/rules";
import {
  MAX_RANK,
  RANK_SLOT_GAP_PX,
  RANK_SLOT_HEIGHT_PX,
  RANK_SLOT_WIDTH_PX,
  STACK_HEADER_HEIGHT_PX,
  playGridHeightPx,
} from "../../lib/layout-budget";
import { FireworkCardFace } from "./FireworkCard";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface PlayedStackProps {
  stack: HanabiView["stacks"][number];
  /** The rank that must be played next for this stack, or `null` once the
   * stack is complete. Computed by the caller (Table.tsx) via the shared
   * rules helper `nextPlayableRank` -- PlayedStack itself never inspects
   * direction or suit to render. */
  nextRank: Rank | null;
  flashing?: boolean;
}

/** The column header row's fixed height — same at every played count. Sourced
 * from layout-budget.ts's STACK_HEADER_HEIGHT_PX so Table.tsx's Play-area
 * reservation (playAreaContentHeightPx) always matches what this component
 * actually renders. */
const HEADER_HEIGHT_PX = STACK_HEADER_HEIGHT_PX;

/**
 * Owner review (06.2-15, UAT gap 3, superseding D-22/BOARD-05's horizontal
 * fan): each suit renders as a fixed vertical column, one reserved slot per
 * position 1..MAX_RANK, filling top to bottom as cards are played — "the
 * next entries in the series go directly below… creating a grid." Every
 * position slot is reserved whether or not it is filled (UAT gap 1), so the
 * column's rendered height is identical whether 0 or 5 tiles are played.
 *
 * 07-11 (UAT gap 3 round 2, direction-agnostic rendering): the wire carries
 * `playedRanks`, the ranks played on this stack IN PLAY ORDER, not a single
 * ascending rank-progress number. Slot i (0-based) always renders
 * `playedRanks[i]` when present — this component never inspects the suit or
 * a direction to decide what a slot shows. An ascending suit's playedRanks
 * is `[1, 2, 3, ...]` (slot 1 shows 1, slot 2 shows 2, ...); Black's
 * descending playedRanks is `[5, 4, 3, ...]` (slot 1 shows 5, slot 2 shows
 * 4, ...), so the column fills top-down in play order exactly the same way
 * for every suit. Completion is `playedRanks.length === MAX_RANK`
 * (`isStackComplete`), never a specific rank value.
 *
 * The column header carries the column's only `data-glyph` emitter — which
 * is what keeps the one-glyph-per-stack e2e invariant true at every count:
 * filled rank cards render as plain (non-identity-exposing) card faces,
 * each with an `sr-only` "{Suit} {rank}" label instead (same pattern
 * `Table.tsx` already uses for discard tiles).
 *
 * UAT gap 23 (fourth owner review, "the play pile… at rest just look like a
 * blank area… under the hood I want it to remain the same grid design, but
 * visually there should be no indication of that"): the header renders NO
 * visible glyph icon and the column renders NO background/border/panel —
 * `data-glyph` and the accessible "{Suit}" label survive as an `sr-only`
 * span with zero visible footprint, so the e2e "exactly one glyph per
 * stack" assertion (`stack.locator("[data-glyph]")`) and screen-reader
 * labelling both still hold even though nothing paints on screen. The
 * completed-stack glow border in globals.css (`[data-complete="true"]`) is
 * the one exception — that is real game-state feedback (a stack the
 * players actually finished), not empty-state decoration, so it stays.
 *
 * Preserves every testid/data-attribute `Table.tsx` and the e2e suite rely
 * on: `data-testid="played-stack-{suit}"`, `data-complete`, the
 * `anim-stack-flash` class on `flashing`, and
 * `played-stack-{suit}-card-{rank}` for filled ranks (the tile's own rank,
 * not its slot position). `data-top-rank` is replaced by `data-played-count`
 * (playedRanks.length) and a new `data-next-rank` (the rank that must be
 * played next, or empty string once complete).
 *
 * The completed-stack static glow border/box-shadow now lives in
 * globals.css, keyed off `[data-complete="true"]` — not inlined on this
 * element — so the root's inline `style` (width/height only) is byte-
 * identical at 0 and 5 played tiles, which is what proves an empty slot
 * costs exactly what a filled one does (UAT gap 1).
 *
 * UAT gap 19 (third owner review, "the slots for the play area should be
 * blank — just put the tiles down once they get there"): an unfilled rank
 * slot renders NOTHING visible — no border, no background, no ghost box.
 * It is a plain, zero-decoration `<span>` sized to `RANK_SLOT_WIDTH_PX` x
 * `RANK_SLOT_HEIGHT_PX` — the space is still reserved (fixed geometry,
 * unchanged from gap 1/3), it just paints nothing until a real tile lands
 * there. `data-testid`/`data-filled="false"` are kept so e2e/sr tooling can
 * still locate the reserved slot.
 */
export function PlayedStack({ stack, nextRank, flashing = false }: PlayedStackProps) {
  const { suit, playedRanks } = stack;
  const complete = isStackComplete(stack);
  const suitLabel = SUIT_VISUALS[suit].label;

  return (
    <div
      data-testid={"played-stack-" + suit}
      data-played-count={playedRanks.length}
      data-next-rank={nextRank ?? ""}
      data-complete={String(complete)}
      className={"flex flex-col items-center" + (flashing ? " anim-stack-flash" : "")}
      style={{
        width: RANK_SLOT_WIDTH_PX,
        height: playGridHeightPx() + HEADER_HEIGHT_PX,
      }}
    >
      {/* UAT gap 23: reserves the header's height (fixed geometry, unchanged)
          but paints nothing — the suit identity survives only as the sole
          `data-glyph` emitter + an `sr-only` label, both invisible. */}
      <div style={{ height: HEADER_HEIGHT_PX }} data-glyph={suit}>
        <span className="sr-only">{suitLabel}</span>
      </div>
      <div className="flex flex-col" style={{ gap: RANK_SLOT_GAP_PX }}>
        {Array.from({ length: MAX_RANK }, (_, index) => {
          const rank = playedRanks[index];
          return rank !== undefined ? (
            <span key={index} data-testid={`played-stack-${suit}-card-${rank}`} data-filled="true">
              <FireworkCardFace suit={suit} rank={rank} width={RANK_SLOT_WIDTH_PX} height={RANK_SLOT_HEIGHT_PX} />
              <span className="sr-only">
                {suitLabel} {rank}
              </span>
            </span>
          ) : (
            <span
              key={index}
              data-testid={`played-slot-${suit}-${index + 1}`}
              data-filled="false"
              className="block"
              style={{
                width: RANK_SLOT_WIDTH_PX,
                height: RANK_SLOT_HEIGHT_PX,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
