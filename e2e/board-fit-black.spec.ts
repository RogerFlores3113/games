import { expect, test } from "@playwright/test";
import {
  RANK_SLOT_HEIGHT_PX,
  RANK_SLOT_WIDTH_PX,
} from "../apps/web/lib/layout-budget";
import { startGameWithPlayers } from "./helpers";

/**
 * Gap closure 07-06 (owner gap 1, 07-HUMAN-UAT.md "## Gaps"): a permanent
 * real-browser measurement of the Black board's suit-column fit at
 * 1280x720, 5 seats. Task 1 records the BEFORE (6-column, MAX_SUITS=6)
 * baseline; Task 2 of this plan (07-06) widens the Play region to
 * MAX_SUITS=7 and this spec is re-run to prove the AFTER geometry, with
 * EXPECTED_BLACK_COLUMNS bumped to 7 in 07-07 once the engine itself deals
 * a 7th suit (Rainbow) in the Black variant.
 *
 * The Play region clips (overflow-hidden, see Table.tsx), it does not
 * scroll — a column that does not fit is silently cut off rather than
 * reachable by scrolling. Every column's box must therefore lie fully
 * inside the Play region's box, not merely "be present in the DOM".
 */
const EXPECTED_BLACK_COLUMNS = 6;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ColumnMeasurement {
  suit: string;
  x: number;
  width: number;
}

interface BoardFitMeasurements {
  viewport: { width: number; height: number };
  tableau: Box;
  playRegion: { x: number; width: number };
  columns: ColumnMeasurement[];
  slot: { width: number; height: number };
  tokens: { clueWidth: number; fuseWidth: number; deckWidth: number; discardWidth: number; turnSignWidth: number };
  scrollWidth: number;
  scrollHeight: number;
  innerWidth: number;
  innerHeight: number;
  freeHorizontalSpacePx: number;
}

test.describe("Black board fit (gap closure 07-06)", () => {
  test("Black board fit: 5 seats at 1280x720 — every suit column fits the Play region at full tile size", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(180_000);
    await hostPage.setViewportSize({ width: 1280, height: 720 });

    const { contexts } = await startGameWithPlayers(
      hostPage,
      browser,
      ["Roger", "Bianca", "Chen", "Dara", "Eli"],
      { variant: "black" },
    );

    const tableauBox = await hostPage.getByTestId("tableau").boundingBox();
    const playRegionBox = await hostPage
      .locator('[data-testid="play-zone"]')
      .locator("..")
      .boundingBox();
    if (!tableauBox || !playRegionBox) {
      throw new Error("board-fit-black: missing tableau or play-region bounding box");
    }

    const columnLocator = hostPage.locator(
      '[data-testid^="played-stack-"]:not([data-testid*="-card-"])',
    );
    const columnCount = await columnLocator.count();
    const columns: ColumnMeasurement[] = [];
    for (let i = 0; i < columnCount; i += 1) {
      const el = columnLocator.nth(i);
      const box = await el.boundingBox();
      const testId = await el.getAttribute("data-testid");
      if (!box || !testId) throw new Error(`board-fit-black: missing box/testid for column ${i}`);
      columns.push({ suit: testId.replace(/^played-stack-/, ""), x: box.x, width: box.width });

      // Every column's box lies fully inside the Play region's box
      // horizontally — the Play region clips with overflow-hidden rather
      // than scrolling, so a clipped column would otherwise go unnoticed.
      expect(box.x).toBeGreaterThanOrEqual(playRegionBox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(playRegionBox.x + playRegionBox.width + 0.5);
    }
    expect(columnCount).toBe(EXPECTED_BLACK_COLUMNS);

    const firstEmptySlot = hostPage.locator('[data-testid^="played-slot-"]').first();
    const slotBox = await firstEmptySlot.boundingBox();
    if (!slotBox) throw new Error("board-fit-black: missing empty played-slot bounding box");
    expect(Math.abs(slotBox.width - RANK_SLOT_WIDTH_PX)).toBeLessThanOrEqual(1);
    expect(Math.abs(slotBox.height - RANK_SLOT_HEIGHT_PX)).toBeLessThanOrEqual(1);

    const clueBox = await hostPage.getByTestId("clue-tokens").boundingBox();
    const fuseBox = await hostPage.getByTestId("fuse-tokens").boundingBox();
    const deckBox = await hostPage.getByTestId("deck-count").boundingBox();
    const discardBox = await hostPage.getByTestId("discard-pile").boundingBox();
    const turnSignBox = await hostPage.getByTestId("turn-sign").boundingBox();
    if (!clueBox || !fuseBox || !deckBox || !discardBox || !turnSignBox) {
      throw new Error("board-fit-black: missing token/deck/discard/turn-sign bounding box");
    }

    const scrollSizes = await hostPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }));

    expect(tableauBox.x + tableauBox.width).toBeLessThanOrEqual(1280 + 0.5);
    expect(scrollSizes.scrollWidth).toBeLessThanOrEqual(scrollSizes.innerWidth + 1);
    expect(scrollSizes.scrollHeight).toBeLessThanOrEqual(scrollSizes.innerHeight + 1);

    const measurements: BoardFitMeasurements = {
      viewport: { width: 1280, height: 720 },
      tableau: tableauBox,
      playRegion: { x: playRegionBox.x, width: playRegionBox.width },
      columns,
      slot: { width: slotBox.width, height: slotBox.height },
      tokens: {
        clueWidth: clueBox.width,
        fuseWidth: fuseBox.width,
        deckWidth: deckBox.width,
        discardWidth: discardBox.width,
        turnSignWidth: turnSignBox.width,
      },
      scrollWidth: scrollSizes.scrollWidth,
      scrollHeight: scrollSizes.scrollHeight,
      innerWidth: scrollSizes.innerWidth,
      innerHeight: scrollSizes.innerHeight,
      freeHorizontalSpacePx: 1280 - tableauBox.width,
    };

    await test.info().attach("board-fit-black", {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    });
    // eslint-disable-next-line no-console -- BOARD-FIT-BLACK is the stable
    // prefix the executor copies from the list-reporter output into the
    // plan's SUMMARY.
    console.log("BOARD-FIT-BLACK " + JSON.stringify(measurements));

    // Narrower desktop floor: no horizontal overflow, and every column still
    // sits fully inside the Play region.
    await hostPage.setViewportSize({ width: 1024, height: 720 });
    const noHorizontalOverflowAt1024 = await hostPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalOverflowAt1024).toBe(true);

    const playRegionBoxAt1024 = await hostPage
      .locator('[data-testid="play-zone"]')
      .locator("..")
      .boundingBox();
    if (!playRegionBoxAt1024) throw new Error("board-fit-black: missing play-region bounding box at 1024");
    const columnCountAt1024 = await columnLocator.count();
    for (let i = 0; i < columnCountAt1024; i += 1) {
      const box = await columnLocator.nth(i).boundingBox();
      if (!box) throw new Error(`board-fit-black: missing box for column ${i} at 1024`);
      expect(box.x).toBeGreaterThanOrEqual(playRegionBoxAt1024.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(playRegionBoxAt1024.x + playRegionBoxAt1024.width + 0.5);
    }

    for (const context of contexts) {
      await context.close();
    }
  });
});
