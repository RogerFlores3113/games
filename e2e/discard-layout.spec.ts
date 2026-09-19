import { expect, test } from "@playwright/test";
import { startTwoPlayerGame, giveAnyLegalClueToAnyTeammate, dragLocatorTo } from "./helpers";

/**
 * Gap closure 07-12 (owner gap 4, 07-HUMAN-UAT.md "## Gaps (round 2)" item
 * 4, verbatim: "can we take the discard area and swap that into the space
 * that says 'X's turn'? should give the discard pile more real estate to
 * breathe and thus a larger tile size."). This spec is the live,
 * real-browser measurement of the discard tile, the discard box, and the
 * turn sign at the 1280x720 UI-11 floor — Task 1 records the BEFORE numbers
 * against today's (pre-swap) layout; Task 2 re-runs it against the swapped
 * layout and tightens the assertions to the new arrangement.
 *
 * A single console.log line with the stable `DISCARD_TILE_MEASURE` prefix
 * is the number the executor copies verbatim into the plan's commit message
 * and SUMMARY.md — never hand-transcribed from a screenshot.
 */
test.describe("Discard/turn-sign layout measurement (gap closure 07-12)", () => {
  test("DISCARD-LAYOUT: measure discard tile, discard area and turn sign at 1280x720", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);
    await hostPage.setViewportSize({ width: 1280, height: 720 });

    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // Spend a clue token (so the clue-tokens count is not at its untouched
    // max — a real mid-game state, not merely the start-of-game frame).
    const gaveClue = await giveAnyLegalClueToAnyTeammate(activePage);
    expect(gaveClue).toBe(true);

    // The clue passed the turn to the other player — that player discards a
    // tile by dragging an own-hand slot onto discard-pile, the same
    // DISC-01-safe pattern hanabi-table-polish.spec.ts uses.
    const discarder = passivePage;
    const slot = discarder.getByTestId("own-hand-slot-1");
    const discardZone = discarder.getByTestId("discard-pile");
    await dragLocatorTo(discarder, slot, discardZone);

    await expect
      .poll(async () => hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"))
      .toBe("1");

    const tile = hostPage.locator('[data-testid="discard-pile"] [data-testid^="discard-tile-"]').first();
    const tileBox = await tile.boundingBox();
    const discardPileBox = await hostPage.getByTestId("discard-pile").boundingBox();
    // The bordered discard box is the closest ancestor of discard-pile that
    // carries a visible border — found via evaluate rather than a fixed DOM
    // depth, since the swap in Task 2 changes how many wrapper divs sit
    // between them.
    const discardBoxHandle = await hostPage.evaluateHandle(() => {
      let el = document.querySelector('[data-testid="discard-pile"]') as HTMLElement | null;
      while (el) {
        const style = getComputedStyle(el);
        if (style.borderStyle !== "none" && parseFloat(style.borderWidth) > 0) return el;
        el = el.parentElement;
      }
      return document.querySelector('[data-testid="discard-pile"]') as HTMLElement | null;
    });
    const discardBoxRect = await discardBoxHandle.evaluate((el) => {
      if (!el) return null;
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const turnSignBox = await hostPage.getByTestId("turn-sign").boundingBox();
    const clueTokensBox = await hostPage.getByTestId("clue-tokens").boundingBox();
    const deckCountBox = await hostPage.getByTestId("deck-count").boundingBox();

    if (!tileBox || !discardPileBox || !discardBoxRect || !turnSignBox || !clueTokensBox || !deckCountBox) {
      throw new Error("discard-layout: missing a required bounding box");
    }

    const round = (n: number) => Math.round(n * 10) / 10;
    const measureLine =
      `DISCARD_TILE_MEASURE tile=${round(tileBox.width)}x${round(tileBox.height)} ` +
      `area=${round(discardPileBox.width)}x${round(discardPileBox.height)} ` +
      `box=${round(discardBoxRect.width)}x${round(discardBoxRect.height)} ` +
      `turnSign=${round(turnSignBox.width)}x${round(turnSignBox.height)}`;
    // eslint-disable-next-line no-console -- DISCARD_TILE_MEASURE is the
    // stable prefix the executor copies verbatim into the commit/SUMMARY.
    console.log(measureLine);
    await test.info().attach("discard-tile-measure", { body: measureLine, contentType: "text/plain" });

    // Layout-independent facts, true both before and after the swap.
    expect(tileBox.width).toBeGreaterThan(0);
    expect(tileBox.height).toBeGreaterThan(0);
    const fitsNoScroll = await hostPage.evaluate(() => {
      const el = document.scrollingElement;
      return el !== null && el.scrollHeight <= el.clientHeight + 1;
    });
    expect(fitsNoScroll).toBe(true);

    await contextB.close();
  });
});
