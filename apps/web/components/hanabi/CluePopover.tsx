"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Rank, Suit } from "@games/rules";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface CluePopoverProps {
  suit: Suit;
  rank: Rank;
  colorDisabled: boolean;
  rankDisabled: boolean;
  /**
   * D-05/D-07: `null` renders today's single colour button for `suit` (every
   * non-rainbow tile, D-06, and Black tiles, D-08, since "black" is itself a
   * nameable colour). A non-null array renders a compact row of that many
   * colour entries instead — used only for a tile whose own suit is not in
   * `cluableColorsForView(game)` (the rainbow tile case, in `cluableColors`
   * order). This is always the variant's `cluableColors`; it never contains
   * "rainbow" or "black"-as-non-nameable.
   */
  colorRow: readonly Suit[] | null;
  onGiveColor: (value: Suit) => void;
  onGiveRank: () => void;
}

type Align = "center" | "start" | "end";

/**
 * UAT gap 16 (second owner review): replaces the deleted `CluePicker`'s
 * target+value+give-clue-button flow. Anchored to the opponent tile that was
 * clicked to open it (rendered by the caller as an absolutely-positioned
 * sibling of that tile's own button, inside a shared `position: relative`
 * wrapper — see TeammateCard.tsx), this popover offers the clues this
 * specific card's own identity supports.
 *
 * Two rendering modes for the colour slot (D-05/D-06/D-07/D-08, owner-
 * confirmed 2026-09-18):
 * - **Single-button mode** (`colorRow === null`): the card's own suit is
 *   itself a nameable colour (every non-rainbow tile, in every variant,
 *   including Black — "Black" is nameable). Renders byte-identical to the
 *   pre-Phase-7 popover: one colour button labelled/coloured for `suit`.
 * - **Row mode** (`colorRow` is an array): the card's own suit is NOT
 *   itself nameable (the rainbow tile, in Rainbow only). Renders a compact
 *   row of one button per nameable colour, each in that colour's own
 *   `--color-suit-*` hue, so every legal Rainbow colour clue stays
 *   reachable from the UI. Every entry shares one disabled gate with the
 *   rank button (D-07) — never individually disabled, never any
 *   disabled-reason text. "Rainbow" itself is never a clickable option.
 *
 * The bold NUMBER button stays below, unchanged, in both modes.
 *
 * Row mode only: a `useLayoutEffect` measures the popover's own rendered
 * position against the viewport and flips its horizontal anchor (center ->
 * start/end) so the wider row never clips outside the viewport near a hand
 * edge (UI-SPEC Layout, mandatory anchor clamping). Single-button mode never
 * measures anything and keeps its original centered anchor — it never came
 * close to an edge at its old 64px minWidth.
 *
 * `onClick` here does not stop propagation — the caller's outside-click
 * listener specifically allows clicks inside this popover (matched via the
 * shared wrapper's `data-clue-tile` attribute) rather than needing this
 * component to intercept bubbling itself.
 */
export function CluePopover({ suit, rank, colorDisabled, rankDisabled, colorRow, onGiveColor, onGiveRank }: CluePopoverProps) {
  const suitVisual = SUIT_VISUALS[suit];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [align, setAlign] = useState<Align>("center");

  useLayoutEffect(() => {
    if (colorRow === null) return;
    const el = rootRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    if (rect.left < 0) {
      setAlign("start");
    } else if (rect.right > viewportWidth) {
      setAlign("end");
    } else {
      setAlign("center");
    }
  }, [colorRow]);

  const positionStyle: CSSProperties =
    colorRow === null || align === "center"
      ? { left: "50%", transform: "translateX(-50%)" }
      : align === "start"
        ? { left: 0 }
        : { right: 0, left: "auto" };

  return (
    <div
      ref={rootRef}
      data-testid="tile-clue-popover"
      role="menu"
      aria-label="Give a clue"
      className="absolute z-20 flex flex-col items-stretch gap-[length:var(--space-xs)] rounded-md border-2 p-[length:var(--space-xs)]"
      style={{
        top: "100%",
        ...positionStyle,
        marginTop: 4,
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        minWidth: 64,
        ...(colorRow !== null ? { width: "max-content" } : {}),
      }}
    >
      {colorRow === null ? (
        <button
          type="button"
          role="menuitem"
          data-testid="tile-clue-color"
          aria-label={`Give a ${suitVisual.label} clue`}
          disabled={colorDisabled}
          onClick={() => onGiveColor(suit)}
          className="cursor-pointer rounded px-[length:var(--space-xs)] py-[length:var(--space-xs)] text-[length:var(--text-label)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          style={{ color: suitVisual.hueVar, lineHeight: "var(--text-label--line-height)" }}
        >
          {suitVisual.label}
        </button>
      ) : (
        <div data-testid="clue-color-row" className="flex flex-row flex-nowrap gap-[length:var(--space-xs)]">
          {colorRow.map((value) => {
            const rowVisual = SUIT_VISUALS[value];
            return (
              <button
                key={value}
                type="button"
                role="menuitem"
                data-testid={`tile-clue-color-${value}`}
                aria-label={`Give a ${rowVisual.label} clue`}
                disabled={colorDisabled}
                onClick={() => onGiveColor(value)}
                className="cursor-pointer rounded px-[length:var(--space-xs)] py-[length:var(--space-xs)] text-[length:var(--text-label)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ color: rowVisual.hueVar, lineHeight: "var(--text-label--line-height)" }}
              >
                {rowVisual.label}
              </button>
            );
          })}
        </div>
      )}
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
