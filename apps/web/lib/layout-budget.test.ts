// Phase 06.2 Task 3 (RESEARCH.md Pitfall 1) — proves the 1280x720 height
// ledger's own invariants before any layout code imports it.
import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_PX,
  DECK_COUNTER_PX,
  DISCARD_AREA_PX,
  FAN_PEEK_PX,
  LEFT_COLUMN_PX,
  MAX_TOKEN_COUNT,
  OWN_BAND_PX,
  PLAY_AREA_PX,
  PLAYED_CARD_WIDTH_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
  TOKEN_GAP_PX,
  VIEWPORT_TEST_HEIGHT_PX,
  fannedStackWidth,
  tokenPitchPx,
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

  it("the token column's per-token pitch derived from LEFT_COLUMN_PX and MAX_TOKEN_COUNT is at least 16px", () => {
    const pitch = tokenPitchPx(LEFT_COLUMN_PX, MAX_TOKEN_COUNT);
    expect(pitch).toBeGreaterThanOrEqual(16);
  });

  it("tokenPitchPx shrinks the pitch as the left column's height grows, never the other way round", () => {
    const smaller = tokenPitchPx(LEFT_COLUMN_PX, MAX_TOKEN_COUNT);
    const larger = tokenPitchPx(LEFT_COLUMN_PX + 40, MAX_TOKEN_COUNT);
    expect(larger).toBeGreaterThan(smaller);
  });

  it("tokenPitchPx accounts for TOKEN_GAP_PX between tokens", () => {
    const pitch = tokenPitchPx(100, 5);
    expect(pitch).toBe((100 - 4 * TOKEN_GAP_PX) / 5);
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
