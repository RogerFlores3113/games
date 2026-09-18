"use client";

import type { Rank, Suit } from "@games/rules";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface CluePopoverProps {
  suit: Suit;
  rank: Rank;
  colorDisabled: boolean;
  rankDisabled: boolean;
  onGiveColor: () => void;
  onGiveRank: () => void;
}

/**
 * UAT gap 16 (second owner review): replaces the deleted `CluePicker`'s
 * target+value+give-clue-button flow. Anchored to the opponent tile that was
 * clicked to open it (rendered by the caller as an absolutely-positioned
 * sibling of that tile's own button, inside a shared `position: relative`
 * wrapper — see TeammateCard.tsx), this popover offers exactly the two
 * clues this specific card's own identity supports: its COLOUR (label text
 * rendered in that suit's own `--color-suit-*` token, per the owner's
 * verbatim instruction) on top, and its NUMBER (bold) below. Clicking either
 * sends that clue to the card's owner immediately — no separate "give clue"
 * step.
 *
 * `onClick` here does not stop propagation — the caller's outside-click
 * listener specifically allows clicks inside this popover (matched via the
 * shared wrapper's `data-clue-tile` attribute) rather than needing this
 * component to intercept bubbling itself.
 */
export function CluePopover({ suit, rank, colorDisabled, rankDisabled, onGiveColor, onGiveRank }: CluePopoverProps) {
  const suitVisual = SUIT_VISUALS[suit];

  return (
    <div
      data-testid="tile-clue-popover"
      role="menu"
      aria-label="Give a clue"
      className="absolute z-20 flex flex-col items-stretch gap-[length:var(--space-xs)] rounded-md border-2 p-[length:var(--space-xs)]"
      style={{
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        minWidth: 64,
      }}
    >
      <button
        type="button"
        role="menuitem"
        data-testid="tile-clue-color"
        aria-label={`Give a ${suitVisual.label} clue`}
        disabled={colorDisabled}
        onClick={onGiveColor}
        className="cursor-pointer rounded px-[length:var(--space-xs)] py-[length:var(--space-xs)] text-[length:var(--text-label)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        style={{ color: suitVisual.hueVar, lineHeight: "var(--text-label--line-height)" }}
      >
        {suitVisual.label}
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="tile-clue-rank"
        aria-label={`Give a ${rank} clue`}
        disabled={rankDisabled}
        onClick={onGiveRank}
        className="cursor-pointer rounded px-[length:var(--space-xs)] py-[length:var(--space-xs)] text-[length:var(--text-label)] font-bold transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
      >
        {rank}
      </button>
    </div>
  );
}
