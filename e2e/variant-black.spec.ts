import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { OTHER_HAND_SELECTOR, ownHandCardIds, startGameWithPlayers } from "./helpers";

/**
 * Phase 7 Plan 07 (gap closure, RULES-02/RULES-03/RULES-14/UI-07): live
 * proof that the 7-suit Black variant's rainbow tile offers a six-colour
 * row ending in Black, that the row fits on screen at a hand's edge, and
 * that a Black colour clue touches both Rainbow and Black tiles on the
 * receiver — the "Rainbow keeps its Rainbow rule inside Black" gap.
 *
 * No seed or deck override anywhere in this file (WR-07/T-07-02) — a local
 * retry-based helper only, modelled on variant-rainbow.spec.ts's
 * startRainbowGameWithVisibleRainbowTile. This file is NOT a refactor of
 * that one and imports nothing from it.
 */

const BLACK_ROW_COLORS = ["red", "yellow", "green", "blue", "white", "black"] as const;
type BlackRowColor = (typeof BLACK_ROW_COLORS)[number];

interface BlackGameHandle {
  pages: Page[];
  contexts: BrowserContext[];
  activePage: Page;
  rainbowCardId: string;
  targetSeatId: string;
  receiverPage: Page;
}

/**
 * Starts a 5-seat Black game and retries room creation (up to 6 attempts)
 * until the current active player can see a rainbow tile in a teammate's
 * hand. 4 teammate hands of 4 tiles each give roughly a 93% hit rate per
 * attempt against 10 rainbow tiles in a 65-card deck.
 */
async function startBlackGameWithVisibleRainbowTile(
  hostPage: Page,
  browser: Browser,
): Promise<BlackGameHandle> {
  const MAX_ATTEMPTS = 6;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { pages, contexts } = await startGameWithPlayers(
      hostPage,
      browser,
      ["Roger", "Bianca", "Chen", "Dara", "Eli"],
      { variant: "black" },
    );

    let activePage: Page | null = null;
    await expect
      .poll(async () => {
        const texts = await Promise.all(
          pages.map(async (page) => ((await page.getByTestId("turn-indicator").textContent()) ?? "").trim()),
        );
        const activeIdxs = texts.flatMap((text, idx) => (text === "Your turn" ? [idx] : []));
        if (activeIdxs.length !== 1) return false;
        activePage = pages[activeIdxs[0]!] ?? null;
        return activePage !== null;
      })
      .toBe(true);
    const active = activePage as unknown as Page;

    const containers = active.locator(OTHER_HAND_SELECTOR);
    const containerCount = await containers.count();
    let targetSeatId: string | null = null;
    let rainbowCardId: string | null = null;
    for (let i = 0; i < containerCount; i += 1) {
      const container = containers.nth(i);
      const rainbowTile = container
        .locator('button[data-testid^="other-hand-card-"]:has([data-glyph="rainbow"])')
        .first();
      if ((await rainbowTile.count()) === 0) continue;
      const containerTestId = (await container.getAttribute("data-testid")) ?? "";
      targetSeatId = containerTestId.replace(/^other-hand-/, "");
      const tileTestId = (await rainbowTile.getAttribute("data-testid")) ?? "";
      rainbowCardId = tileTestId.replace(/^other-hand-card-/, "");
      break;
    }

    if (targetSeatId === null || rainbowCardId === null) {
      for (const context of contexts) await context.close();
      continue;
    }

    let receiverPage: Page | null = null;
    for (const page of pages) {
      const ids = await ownHandCardIds(page);
      if (ids.includes(rainbowCardId)) {
        receiverPage = page;
        break;
      }
    }
    if (receiverPage === null) {
      for (const context of contexts) await context.close();
      continue;
    }

    return { pages, contexts, activePage: active, rainbowCardId, targetSeatId, receiverPage };
  }

  throw new Error(
    `startBlackGameWithVisibleRainbowTile: no visible rainbow tile found after ${MAX_ATTEMPTS} attempts`,
  );
}

/** Resolves `--color-suit-{suit}` to its computed rgb() string on `page`, via
 * a throwaway probe element (never a hand-copied hex literal). */
async function resolveSuitRgb(page: Page, suit: string): Promise<string> {
  return page.evaluate((s) => {
    const probe = document.createElement("div");
    probe.style.color = `var(--color-suit-${s})`;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, suit);
}

test.describe("Black variant e2e (07-07 gap closure: 7 suits, Black touches Rainbow)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Black: a rainbow tile offers six nameable colours ending in Black, fits on screen at the hand edges, and a Black clue rings rainbow and black tiles", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(90_000);

    const { pages, contexts, activePage, rainbowCardId, targetSeatId, receiverPage } =
      await startBlackGameWithVisibleRainbowTile(hostPage, browser);

    try {
      const tableauBefore = await activePage.getByTestId("tableau").boundingBox();
      if (!tableauBefore) throw new Error("missing tableau bounding box");

      // (1) Every visible teammate rainbow tile's popover shows exactly the
      // six-colour row, in order, each hued correctly, no Rainbow entry, and
      // fully on screen.
      const rainbowTiles = activePage.locator(
        'button[data-testid^="other-hand-card-"]:has([data-glyph="rainbow"])',
      );
      const rainbowTileCount = await rainbowTiles.count();
      expect(rainbowTileCount).toBeGreaterThan(0);

      for (let i = 0; i < rainbowTileCount; i += 1) {
        const tile = rainbowTiles.nth(i);
        await tile.click();
        const popover = activePage.getByTestId("tile-clue-popover");
        await expect(popover).toBeVisible();

        const rowEntries = popover.locator('[data-testid^="tile-clue-color-"]');
        const rowTestIds = await rowEntries.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
        expect(rowTestIds).toEqual([
          "tile-clue-color-red",
          "tile-clue-color-yellow",
          "tile-clue-color-green",
          "tile-clue-color-blue",
          "tile-clue-color-white",
          "tile-clue-color-black",
        ]);
        await expect(popover.locator('[data-testid="tile-clue-color-rainbow"]')).toHaveCount(0);
        await expect(popover.getByRole("menuitem", { name: /^give a rainbow clue$/i })).toHaveCount(0);

        for (const suit of BLACK_ROW_COLORS) {
          const entry = popover.locator(`[data-testid="tile-clue-color-${suit}"]`);
          const entryColor = await entry.evaluate((el) => getComputedStyle(el).color);
          const expectedRgb = await resolveSuitRgb(activePage, suit);
          expect(entryColor).toBe(expectedRgb);
        }

        const popoverBox = await popover.boundingBox();
        if (!popoverBox) throw new Error("missing popover bounding box");
        expect(popoverBox.x).toBeGreaterThanOrEqual(0);
        expect(popoverBox.y).toBeGreaterThanOrEqual(0);
        expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(1280);
        expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(720);

        await activePage.keyboard.press("Escape");
        await expect(popover).toHaveCount(0);
      }

      // (2) Arithmetic edge-fit proof: measure the row popover's width and
      // the leftmost/rightmost teammate tile positions, and prove the
      // anchor-flip logic can always place it fully on screen.
      const firstRainbowTile = rainbowTiles.first();
      await firstRainbowTile.click();
      const popover = activePage.getByTestId("tile-clue-popover");
      const rowBox = await popover.getByTestId("clue-color-row").boundingBox();
      if (!rowBox) throw new Error("missing row bounding box");
      const W = rowBox.width;

      const allTeammateTiles = activePage.locator('button[data-testid^="other-hand-card-"]');
      const tileBoxes = await allTeammateTiles.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width };
        }),
      );
      expect(tileBoxes.length).toBeGreaterThan(0);
      const leftmostTile = tileBoxes.reduce((a, b) => (b.x < a.x ? b : a));
      const rightmostTile = tileBoxes.reduce((a, b) => (b.x + b.width > a.x + a.width ? b : a));

      console.log(
        `BLACK-POPOVER-FIT width=${W} leftmostTile.x=${leftmostTile.x} rightmostTile.x=${rightmostTile.x} rightmostTile.width=${rightmostTile.width} leftFit=${W <= 1280 - leftmostTile.x} rightFit=${W <= rightmostTile.x + rightmostTile.width}`,
      );
      expect(W).toBeLessThanOrEqual(1280 - leftmostTile.x);
      expect(W).toBeLessThanOrEqual(rightmostTile.x + rightmostTile.width);

      await activePage.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);

      // (3) Fixed geometry: the tableau box is unchanged after opening and
      // closing popovers.
      const tableauAfter = await activePage.getByTestId("tableau").boundingBox();
      if (!tableauAfter) throw new Error("missing tableau bounding box");
      expect(Math.abs(tableauAfter.x - tableauBefore.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(tableauAfter.y - tableauBefore.y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(tableauAfter.width - tableauBefore.width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(tableauAfter.height - tableauBefore.height)).toBeLessThanOrEqual(0.5);

      // (4) A black tile (if visible) keeps its single Black button, no row.
      const blackTile = activePage.locator('button[data-testid^="other-hand-card-"]:has([data-glyph="black"])').first();
      if ((await blackTile.count()) > 0) {
        await blackTile.click();
        const blackPopover = activePage.getByTestId("tile-clue-popover");
        await expect(blackPopover).toBeVisible();
        await expect(blackPopover.locator('[data-testid="tile-clue-color"]')).toHaveCount(1);
        await expect(blackPopover.locator('[data-testid="tile-clue-color"]')).toHaveText("Black");
        await expect(blackPopover.locator('[data-testid="clue-color-row"]')).toHaveCount(0);
        await activePage.keyboard.press("Escape");
        await expect(blackPopover).toHaveCount(0);
      } else {
        // eslint-disable-next-line no-console
        console.log("BLACK-POPOVER-FIT: no black tile visible this run — covered by clue-popover-render.test.ts");
      }

      // (5) Give a Black clue from the rainbow tile and prove it rings the
      // receiver's own rainbow AND black tiles, and nothing else, with
      // Black's own hue.
      const targetTiles = activePage.locator(
        `[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`,
      );
      const targetTileData = await targetTiles.evaluateAll((els) =>
        els.map((el) => ({
          id: (el.getAttribute("data-testid") ?? "").replace(/^other-hand-card-/, ""),
          suit: el.querySelector("[data-glyph]")?.getAttribute("data-glyph") ?? null,
        })),
      );
      const expectedTouched = targetTileData
        .filter((t) => t.suit === "rainbow" || t.suit === "black")
        .map((t) => t.id);
      const expectedUntouched = targetTileData
        .filter((t) => t.suit !== "rainbow" && t.suit !== "black")
        .map((t) => t.id);

      await firstRainbowTile.click();
      await expect(popover).toBeVisible();
      const blackColorEntry: BlackRowColor = "black";
      await popover.locator(`[data-testid="tile-clue-color-${blackColorEntry}"]`).click();
      await expect(popover).toHaveCount(0);

      const expectedRgbOnReceiver = await resolveSuitRgb(receiverPage, "black");
      for (const id of expectedTouched) {
        const cardWrapper = receiverPage.locator(`[data-testid="own-hand"] [data-card-id="${id}"]`);
        const slot = cardWrapper.locator('[data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])');
        await expect(slot).toHaveAttribute("data-hints", "true");
        const ring = cardWrapper.locator('[data-testid$="-hints"]').getByTestId("hint-color-ring");
        await expect(ring).toHaveCount(1);
        const boxShadow = await ring.evaluate((el) => getComputedStyle(el).boxShadow);
        expect(boxShadow).toContain(expectedRgbOnReceiver);
      }
      for (const id of expectedUntouched) {
        const cardWrapper = receiverPage.locator(`[data-testid="own-hand"] [data-card-id="${id}"]`);
        const hintsSpan = cardWrapper.locator('[data-testid$="-hints"]');
        await expect(hintsSpan.getByTestId("hint-color-ring")).toHaveCount(0);
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("Black: 7 columns and the discard overlay fit", async ({ page: hostPage, browser }) => {
    test.setTimeout(60_000);

    const { contexts, pages } = await startGameWithPlayers(
      hostPage,
      browser,
      ["Roger", "Bianca", "Chen", "Dara", "Eli"],
      { variant: "black" },
    );

    try {
      const stacks: Locator = hostPage.locator('[data-testid^="played-stack-"]');
      const stackTestIds = await stacks.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      expect(stackTestIds).toEqual([
        "played-stack-red",
        "played-stack-yellow",
        "played-stack-green",
        "played-stack-blue",
        "played-stack-white",
        "played-stack-rainbow",
        "played-stack-black",
      ]);

      await hostPage.getByTestId("discard-toggle").click();
      const overlay = hostPage.getByTestId("discard-overlay");
      await expect(overlay).toBeVisible();
      const overlayBox = await overlay.boundingBox();
      if (!overlayBox) throw new Error("missing discard overlay bounding box");
      const viewportSize = hostPage.viewportSize();
      expect(viewportSize).not.toBeNull();
      const { width, height } = viewportSize!;
      expect(overlayBox.x).toBeGreaterThanOrEqual(0);
      expect(overlayBox.y).toBeGreaterThanOrEqual(0);
      expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(width + 0.5);
      expect(overlayBox.y + overlayBox.height).toBeLessThanOrEqual(height + 0.5);

      const scroll = await hostPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.innerHeight);

      await hostPage.keyboard.press("Escape");
      await expect(overlay).toHaveCount(0);

      void pages;
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});
