// Phase 06.2 Task 3 (RESEARCH.md Pitfall 1) — proves the 1280x720 height
// ledger's own invariants before any layout code imports it.
import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_PX,
  CLUE_TOKEN_COLUMNS,
  DECK_COUNTER_PX,
  DISCARD_AREA_PX,
  FAN_PEEK_PX,
  LEFT_COLUMN_PX,
  MAX_CLUE_TOKENS,
  MAX_FUSE_TOKENS,
  OWN_BAND_PX,
  PLAY_AREA_PX,
  PLAYED_CARD_WIDTH_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
  TOKEN_AREA_HEIGHT_PX,
  VIEWPORT_TEST_HEIGHT_PX,
  fannedStackWidth,
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

  it("PLAY_AREA_PX + DECK_COUNTER_PX + DISCARD_AREA_PX equals LEFT_COLUMN_PX", () => {
    expect(PLAY_AREA_PX + DECK_COUNTER_PX + DISCARD_AREA_PX).toBe(LEFT_COLUMN_PX);
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

  it("fannedStackWidth returns PLAYED_CARD_WIDTH_PX for a single card", () => {
    expect(fannedStackWidth(1)).toBe(PLAYED_CARD_WIDTH_PX);
  });

  it("fannedStackWidth adds FAN_PEEK_PX per additional card", () => {
    expect(fannedStackWidth(5)).toBe(PLAYED_CARD_WIDTH_PX + 4 * FAN_PEEK_PX);
  });

  it("fannedStackWidth returns 0 for an empty stack", () => {
    expect(fannedStackWidth(0)).toBe(0);
  });
});
