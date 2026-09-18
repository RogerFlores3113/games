import type { CSSProperties } from "react";
import type { Clue, HanabiCardView, HanabiView } from "@games/rules";
import { cluableColorsForView } from "../../lib/hanabi-board-logic";
import { disabledReasonFor, type ActionContext } from "../../lib/hanabi-visual-logic";
import { cluePulseColorFor, hintDisplayFor } from "../../lib/hanabi-hint-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { DEFAULT_TILE_COLOR_CSS } from "../../lib/tile-color-pref";
import { CluePopover } from "./CluePopover";
import { FireworkCardBack, FireworkCardFace } from "./FireworkCard";
import { TeammateHintIndicator } from "./HintIndicator";

export interface TeammateCardProps {
  card: HanabiCardView;
  /** UAT gap 16: the seat this card belongs to — the implicit clue target
   * when the quick-clue popover sends a clue. */
  seatId: string;
  game: HanabiView;
  ctx: ActionContext;
  justClued: boolean;
  /** UAT gap 16: whether THIS card's own quick-clue popover is open. Only
   * one tile's popover is ever open at once — the caller owns that single
   * piece of state. */
  open: boolean;
  onToggle: () => void;
  onGiveClue: (clue: Clue) => void;
  /** HINT-03/D-05: whether this card's hint overlay should currently render. */
  hintsVisible: boolean;
  /** TILE-03/D-13: the viewer's personal tile-colour preference. Defaults to
   * the slate preset so callers not yet wired to the picker still compile. */
  tileColor?: string;
}

// UI-SPEC targets 56x78 for a 5-suit hand; widened to 64x84 here (06.1-03
// deviation, carried forward) so the marks zone above still fits Rainbow/
// Black's 6-suit candidate strip without wrapping.
// 06.1-09 deviation: further reduced 84 -> 78 (UI-11 fit regression once the
// 28px marks-zone band was added above every teammate card) — see that
// plan's SUMMARY.
const CARD_WIDTH = 64;
const CARD_HEIGHT = 78;

const DEFAULT_TILE_COLOR = DEFAULT_TILE_COLOR_CSS;

/**
 * D-08/D-09/D-12/D-13: a teammate's face-up card renders the owner-approved
 * firework burst face (burst count is the only rank signal — no corner
 * numeral, per 06.1-07's owner override) via `FireworkCardFace`, and the
 * burst art's hue stays fully solid regardless of clue state (D-10). UAT
 * gap 35 (sixth owner review, 2026-09-18): the Phase 6 luminosity frame
 * that used to sit on the tile's border/box-shadow is deleted entirely —
 * a card's border/box-shadow is now a fixed constant, and the only
 * clue-driven visual is `TeammateHintIndicator`'s hint overlay (same facts
 * the card's own holder would see about it, D-09). The automatic
 * clue-mark pip band is gone (HINT-04) — hints render on the tile itself,
 * and the tile gets its own raised, opaque surface (TILE-01) distinct
 * from the board beneath it. UAT gap 7 (06.2-17): the tile-colour
 * preference is a translucent overlay painted above the card art, not the
 * tile's own background — the tile container's background stays a
 * constant `var(--color-surface)`.
 */
export function TeammateCard({
  card,
  seatId,
  game,
  ctx,
  justClued,
  open,
  onToggle,
  onGiveClue,
  hintsVisible,
  tileColor = DEFAULT_TILE_COLOR,
}: TeammateCardProps) {
  const hints = hintDisplayFor(card.facts);
  const hasHints = hintsVisible && (hints.colorHints.length > 0 || hints.numberHints.length > 0);

  // TILE-01/D-12/UAT gap 35: a tile is a raised, opaque object distinct
  // from the board beneath it — a downward drop-shadow. The Phase 6
  // luminosity frame this shadow used to compose with is deleted entirely;
  // border/box-shadow are now fixed, non-clue-driven constants.
  const tileBorder = "1px solid var(--color-border)";
  const tileShadow = "0 2px 4px var(--color-tile-shadow)";

  // UAT gap 16: a visible (non-hidden) card's own suit/rank ARE the two
  // quick-clue options — no new legality rule invented here. Rank always
  // touches its own card (RULES-11's `disabledReasonFor` is called with the
  // real derived clue, never a placeholder), so `rankDisabled` reduces
  // exactly to the shared ended/reconnecting/not-your-turn/no-tokens gate.
  // `colorDisabled` adds one more real-world case on top: some suits (e.g.
  // Rainbow) are never a nameable colour clue at all (`cluableColorsForView`
  // excludes them) — that case has no accompanying written reason either,
  // per the owner's "no obtrusive text" instruction (UAT gap 15's sibling
  // rule); the button is simply disabled.
  const rankDisabled =
    card.hidden ||
    disabledReasonFor(game, { kind: "clue", targetSeatId: seatId, clue: { type: "rank", value: card.rank } }, ctx) !==
      null;
  const colorNameable = !card.hidden && cluableColorsForView(game).includes(card.suit);
  const colorDisabled =
    card.hidden ||
    !colorNameable ||
    disabledReasonFor(game, { kind: "clue", targetSeatId: seatId, clue: { type: "color", value: card.suit } }, ctx) !==
      null;
  // Prefer not opening the popover at all when nothing in it could ever be
  // clicked (RULES-11 constraint from the gap-closure task) — rank is the
  // more permissive of the two, so "openable" tracks it.
  const openable = !rankDisabled;

  function handleTileClick() {
    if (card.hidden) return;
    if (!open && !openable) return;
    onToggle();
  }

  return (
    <span data-clue-tile={card.id} className="relative inline-block">
      <button
        type="button"
        data-testid={`other-hand-card-${card.id}`}
        data-just-clued={String(justClued)}
        data-hints={String(hasHints)}
        aria-haspopup={card.hidden ? undefined : "menu"}
        aria-expanded={card.hidden ? undefined : open}
        onClick={handleTileClick}
        className="relative inline-flex flex-col items-center justify-center rounded-md border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          backgroundColor: "var(--color-surface)",
          border: tileBorder,
          boxShadow: tileShadow,
          cursor: card.hidden ? "default" : "pointer",
        }}
      >
        {!card.hidden ? (
          // UAT gap 29 (fifth owner review): this wrapper must be `inline-flex`,
          // not the default `block`. FireworkCardFace/FireworkCardBack render
          // as `inline-block` — inside a `block` parent that participates in
          // normal text-line layout, an inline-block child sits on the text
          // baseline and leaves a small "descender" gap beneath it (classic
          // inline-block whitespace-gap quirk), inflating this wrapper's own
          // measured height a few px beyond the card's real 78px. Since this
          // wrapper is the tile button's one flex item (button is
          // `inline-flex items-center justify-center`), that inflated height
          // shifted the visible card upward within the centered flex item,
          // leaving a sliver of the button's own background exposed below the
          // card — the "stray line" at the bottom of every face-up tile.
          // `inline-flex` (matching every other FireworkCardFace/Back call
          // site in Table.tsx/DiscardOverlay.tsx, which never had this bug)
          // makes the card the flex item directly, with no baseline gap.
          <span data-testid="card-identity" className="relative z-10 inline-flex">
            <FireworkCardFace suit={card.suit} rank={card.rank} width={CARD_WIDTH} height={CARD_HEIGHT} exposeSuit />
            {/* WR-03: the rank is part of the accessible name ("Red 3") —
                FireworkCardFace's exposeSuit-gated title/aria-label already
                covers this; this sr-only span is redundant-but-explicit
                accessible text preserved from the prior identity markup. */}
            <span className="sr-only">{`${SUIT_VISUALS[card.suit].label} ${card.rank}`}</span>
          </span>
        ) : (
          // An unseated viewer (spectator-shaped RoomView, no seat of their
          // own) gets the neutral card back here in place of the burst face.
          // Same `inline-flex` fix as the face-up branch above (UAT gap 29).
          <span className="relative z-10 inline-flex">
            <FireworkCardBack width={CARD_WIDTH} height={CARD_HEIGHT} />
          </span>
        )}

        {/* UAT gap 7 (06.2-17): the card-art/identity span above is
            `position: relative; z-index: 10` (not absolutely positioned, so
            its stacking level does not follow DOM order) — this overlay
            must carry a higher explicit z-index to actually paint above
            that opaque art and darken it, rather than being hidden beneath
            it despite coming later in the markup.
            The testid deliberately does NOT start with "other-hand-card-"
            — several existing selectors/helpers (e2e's teammateHandCardIds,
            production FlyToLayer.tsx's fly-to-source-rect lookup) prefix-
            match that exact string to find the card's own tile element; a
            testid starting with it would silently double-match and corrupt
            both. */}
        <span
          aria-hidden="true"
          data-testid={`tile-color-overlay-other-hand-card-${card.id}`}
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{ backgroundColor: tileColor, zIndex: 11 }}
        />

        <TeammateHintIndicator
          facts={card.facts}
          visible={hintsVisible}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          testId={`other-hand-card-${card.id}-hints`}
        />

        {justClued && (
          <span
            aria-hidden="true"
            data-testid={`clue-pulse-other-hand-card-${card.id}`}
            className="anim-clue-touch pointer-events-none absolute inset-0 rounded-md"
            style={{ "--clue-pulse-color": cluePulseColorFor(card.facts) } as CSSProperties}
          />
        )}
      </button>

      {open && !card.hidden && (
        <CluePopover
          suit={card.suit}
          rank={card.rank}
          colorDisabled={colorDisabled}
          rankDisabled={rankDisabled}
          onGiveColor={() => onGiveClue({ type: "color", value: card.suit })}
          onGiveRank={() => onGiveClue({ type: "rank", value: card.rank })}
        />
      )}
    </span>
  );
}
