// Phase 06.2 Task 3 (RESEARCH.md Pitfall 1) — proves the 1280x720 height
// ledger's own invariants before any layout code imports it.
import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_PX,
  BOARD_INNER_PX,
  CLUE_TOKEN_COLUMNS,
  DECK_COUNTER_PX,
  DISCARD_AREA_PX,
  MAX_CLUE_TOKENS,
  MAX_FUSE_TOKENS,
  MAX_SUITS,
  MIDDLE_GAP_PX,
  OWN_BAND_PX,
  PLAY_AREA_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
  TOKEN_AREA_HEIGHT_PX,
  VIEWPORT_TEST_HEIGHT_PX,
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
    expect(TEAMMATE_BAND_PX).toBe(140);
  });

  it("OWN_BAND_PX has no marks-band constant (HINT-04 removes the pip band)", () => {
    expect((layoutBudget as Record<string, unknown>).MARKS_BAND_PX).toBeUndefined();
    // fix(06.2): corrected from the fictional 180 to the measured ~285px
    // real footprint (+ margin) of the whole bottom controls row — see
    // OWN_BAND_PX's own doc comment in layout-budget.ts.
    expect(OWN_BAND_PX).toBe(300);
  });

  it("BOARD_INNER_PX is TABLE_BAND_MIN_PX minus the board panel's own padding on both sides", () => {
    expect(BOARD_INNER_PX).toBe(244);
  });

  it("playGridHeightPx is MAX_RANK slots at RANK_SLOT_HEIGHT_PX with RANK_SLOT_GAP_PX between them", () => {
    expect(playGridHeightPx()).toBe(208);
  });

  it("playAreaContentHeightPx (label + gap + grid + padding) fits within BOARD_INNER_PX", () => {
    expect(playAreaContentHeightPx()).toBeLessThanOrEqual(BOARD_INNER_PX);
  });

  it("playColumnWidthPx(MAX_SUITS) is the Rainbow/Black worst-case Play area width", () => {
    expect(playColumnWidthPx(MAX_SUITS)).toBe(208);
  });

  it("DECK_COUNTER_PX + MIDDLE_GAP_PX + DISCARD_AREA_PX equals BOARD_INNER_PX exactly", () => {
    expect(DECK_COUNTER_PX + MIDDLE_GAP_PX + DISCARD_AREA_PX).toBe(BOARD_INNER_PX);
  });

  it("PLAY_AREA_PX fills the whole reserved BOARD_INNER_PX column height", () => {
    expect(PLAY_AREA_PX).toBe(BOARD_INNER_PX);
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
