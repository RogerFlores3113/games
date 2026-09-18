// Phase 06.2 Task 3 (RESEARCH.md Pitfall 1) — proves the 1280x720 height
// ledger's own invariants before any layout code imports it.
import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_PX,
  BOARD_INNER_PX,
  CLUE_TOKEN_COLUMNS,
  DECK_COUNTER_PX,
  DISCARD_COMPACT_PX,
  DISCARD_ROWS,
  MAX_CLUE_TOKENS,
  MAX_FUSE_TOKENS,
  MAX_SUITS,
  MIDDLE_GAP_PX,
  OWN_BAND_PX,
  PLAY_AREA_HEIGHT_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
  TOKEN_AREA_HEIGHT_PX,
  VIEWPORT_TEST_HEIGHT_PX,
  discardCompactHeightPx,
  playAreaContentHeightPx,
  playColumnWidthPx,
  playGridHeightPx,
  tokenRunHeightPx,
} from "./layout-budget";
import * as layoutBudget from "./layout-budget";

describe("layout-budget", () => {
  it("the three bands plus chrome fit within the 1280x720 viewport (UI-11)", () => {
    const total = TEAMMATE_BAND_PX + OWN_BAND_PX + TABLE_BAND_MIN_PX + BOARD_CHROME_PX;
    expect(total).toBeLessThanOrEqual(VIEWPORT_TEST_HEIGHT_PX);
  });

  it("TEAMMATE_BAND_PX has no marks-band constant (HINT-04 removes the pip band)", () => {
    expect((layoutBudget as Record<string, unknown>).MARKS_BAND_PX).toBeUndefined();
    // fix(06.2-21): corrected 140 -> 110 — the vertical Play/Deck/Discard
    // stack needs the height back; TeammateHand's slimmed chrome (no
    // border/box-shadow/padding wrapper) funds this reduction.
    // fix(06.2-19): corrected 110 -> 111 — a real-browser re-measurement of
    // `teammates-band` at the worst case came in at 110.5px, 0.5px over the
    // ledger; corrected up so the constant never understates the rendered
    // height (see TEAMMATE_BAND_PX's own doc comment).
    expect(TEAMMATE_BAND_PX).toBe(111);
  });

  it("OWN_BAND_PX has no marks-band constant (HINT-04 removes the pip band)", () => {
    expect((layoutBudget as Record<string, unknown>).MARKS_BAND_PX).toBeUndefined();
    // fix(06.2, UAT gap 16): corrected 310 -> 193 — deleting `CluePicker`
    // (the large clue-target/clue-value menu) removes the third stacked
    // line bottom-controls-row used to carry; clue-giving now happens via
    // each opponent tile's own quick-clue popover, an absolutely-positioned
    // overlay that adds zero flow height. Real-browser measurement at the
    // 1280x720 floor (5 seats, Black variant) confirmed 193px.
    expect(OWN_BAND_PX).toBe(193);
  });

  it("BOARD_INNER_PX is Play + gap + Deck + gap + compact Discard, stacked (06.2-21)", () => {
    expect(BOARD_INNER_PX).toBe(PLAY_AREA_HEIGHT_PX + MIDDLE_GAP_PX + DECK_COUNTER_PX + MIDDLE_GAP_PX + DISCARD_COMPACT_PX);
  });

  it("playGridHeightPx is MAX_RANK slots at RANK_SLOT_HEIGHT_PX with RANK_SLOT_GAP_PX between them", () => {
    // fix(post-06.2-21 follow-up): RANK_SLOT_HEIGHT_PX restored 24 -> 40
    // (128 -> 208) once deleting the clue-menu (gap 16) freed enough
    // OWN_BAND_PX height for the 1280x720 floor to afford the full-size
    // grid again.
    expect(playGridHeightPx()).toBe(208);
  });

  it("playAreaContentHeightPx (label + gap + stack header + grid + padding) IS PLAY_AREA_HEIGHT_PX", () => {
    expect(playAreaContentHeightPx()).toBe(PLAY_AREA_HEIGHT_PX);
  });

  it("playColumnWidthPx(MAX_SUITS) is the Rainbow/Black worst-case Play area width", () => {
    // fix(post-06.2-21 follow-up): RANK_SLOT_WIDTH_PX restored 20 -> 30
    // (148 -> 208).
    expect(playColumnWidthPx(MAX_SUITS)).toBe(208);
  });

  it("discardCompactHeightPx(DISCARD_ROWS) IS DISCARD_COMPACT_PX, and DISCARD_ROWS is 2 (post-06.2-21 follow-up)", () => {
    expect(discardCompactHeightPx(DISCARD_ROWS)).toBe(DISCARD_COMPACT_PX);
    expect(DISCARD_ROWS).toBe(2);
    expect(DISCARD_COMPACT_PX).toBe(78);
  });

  it("Play/Deck/compact-Discard heights plus their gaps equal BOARD_INNER_PX exactly", () => {
    expect(PLAY_AREA_HEIGHT_PX + MIDDLE_GAP_PX + DECK_COUNTER_PX + MIDDLE_GAP_PX + DISCARD_COMPACT_PX).toBe(
      BOARD_INNER_PX,
    );
  });

  it("TOKEN_AREA_HEIGHT_PX fits within BOARD_INNER_PX", () => {
    expect(TOKEN_AREA_HEIGHT_PX).toBeLessThanOrEqual(BOARD_INNER_PX);
  });

  it("tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS) is 172", () => {
    expect(tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS)).toBe(172);
  });

  it("tokenRunHeightPx(MAX_FUSE_TOKENS, 1) is 128", () => {
    expect(tokenRunHeightPx(MAX_FUSE_TOKENS, 1)).toBe(128);
  });

  it("tokenRunHeightPx returns 0 for an empty run", () => {
    expect(tokenRunHeightPx(0, CLUE_TOKEN_COLUMNS)).toBe(0);
  });

  it("TOKEN_AREA_HEIGHT_PX is the larger of the two runs and fits within TABLE_BAND_MIN_PX", () => {
    expect(TOKEN_AREA_HEIGHT_PX).toBe(
      Math.max(tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS), tokenRunHeightPx(MAX_FUSE_TOKENS, 1)),
    );
    expect(TOKEN_AREA_HEIGHT_PX).toBeLessThanOrEqual(TABLE_BAND_MIN_PX);
  });

  it("MAX_CLUE_TOKENS + MAX_FUSE_TOKENS equals the pre-existing worst-case token count of 11", () => {
    expect(MAX_CLUE_TOKENS + MAX_FUSE_TOKENS).toBe(11);
  });
});
