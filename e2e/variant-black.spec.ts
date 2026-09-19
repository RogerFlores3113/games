import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { OTHER_HAND_SELECTOR, ownHandCardIds, startGameWithPlayers } from "./helpers";

/**
 * Phase 7 Plan 09 (gap closure round 2, UAT gap 2, RULES-03/RULES-14/UI-07):
 * live proof that in the Black variant (a) a rainbow tile's popover offers
 * exactly the five nameable colours (never Black, never Rainbow) and still
 * fits on screen at a hand's edge, (b) a Black tile's popover offers only
 * the number button — no colour control at all, and (c) giving a nameable
 * colour clue from a rainbow tile's row rings the rainbow tile and the
 * named suit's tiles on the receiver, but never a Black tile. This
 * supersedes plan 07-07's "Black is nameable / a Black clue touches
 * Rainbow" e2e proof, which the owner has said is wrong.
 *
 * No seed or deck override anywhere in this file (WR-07/T-07-02) — a local
 * retry-based helper only, modelled on variant-rainbow.spec.ts's
 * startRainbowGameWithVisibleRainbowTile. This file is NOT a refactor of
 * that one and imports nothing from it.
 */

const NAMEABLE_ROW_COLORS = ["red", "yellow", "green", "blue", "white"] as const;
type NameableRowColor = (typeof NAMEABLE_ROW_COLORS)[number];

interface BlackGameHandle {
  pages: Page[];
  contexts: BrowserContext[];
  activePage: Page;
  rainbowCardId: string;
  targetSeatId: string;
  receiverPage: Page;
  blackTile: Locator;
}

/**
 * Starts a 5-seat Black game and retries room creation (up to 8 attempts)
 * until the current active player can see BOTH a rainbow tile and a black
 * tile in teammates' hands — both are required by this file's assertions,
 * so the retry condition covers both rather than skipping either check.
 * 4 teammate hands of 4 tiles each give roughly a 93% hit rate per attempt
 * against 10 rainbow tiles and 10 black tiles in a 65-card Black deck.
 */
async function startBlackGameWithVisibleRainbowAndBlackTile(
  hostPage: Page,
  browser: Browser,
): Promise<BlackGameHandle> {
  const MAX_ATTEMPTS = 8;

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
    let blackTileFound = false;
    for (let i = 0; i < containerCount; i += 1) {
      const container = containers.nth(i);
      if (!blackTileFound) {
        const blackCandidate = container
          .locator('button[data-testid^="other-hand-card-"]:has([data-glyph="black"])')
          .first();
        if ((await blackCandidate.count()) > 0) blackTileFound = true;
      }
      if (targetSeatId !== null) continue;
      const rainbowTile = container
        .locator('button[data-testid^="other-hand-card-"]:has([data-glyph="rainbow"])')
        .first();
      if ((await rainbowTile.count()) === 0) continue;
      const containerTestId = (await container.getAttribute("data-testid")) ?? "";
      targetSeatId = containerTestId.replace(/^other-hand-/, "");
      const tileTestId = (await rainbowTile.getAttribute("data-testid")) ?? "";
      rainbowCardId = tileTestId.replace(/^other-hand-card-/, "");
    }

    if (targetSeatId === null || rainbowCardId === null || !blackTileFound) {
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

    const blackTile = active
      .locator('button[data-testid^="other-hand-card-"]:has([data-glyph="black"])')
      .first();

    return { pages, contexts, activePage: active, rainbowCardId, targetSeatId, receiverPage, blackTile };
  }

  throw new Error(
    `startBlackGameWithVisibleRainbowAndBlackTile: no visible rainbow+black tile pair found after ${MAX_ATTEMPTS} attempts`,
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

test.describe("Black variant e2e (07-09 gap closure round 2: Black is never colour-cluable)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Black: a rainbow tile offers five nameable colours (never Black), fits on screen at the hand edges, and a nameable colour clue never rings a Black tile", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(90_000);

    const { pages, contexts, activePage, rainbowCardId, targetSeatId, receiverPage, blackTile } =
      await startBlackGameWithVisibleRainbowAndBlackTile(hostPage, browser);

    try {
      const tableauBefore = await activePage.getByTestId("tableau").boundingBox();
      if (!tableauBefore) throw new Error("missing tableau bounding box");

      // (1) Every visible teammate rainbow tile's popover shows exactly the
      // five-colour row, in order, each hued correctly, no Rainbow entry, no
      // Black entry, and fully on screen.
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
        ]);
        await expect(popover.locator('[data-testid="tile-clue-color-rainbow"]')).toHaveCount(0);
        await expect(popover.locator('[data-testid="tile-clue-color-black"]')).toHaveCount(0);
        await expect(popover.getByRole("menuitem", { name: /^give a rainbow clue$/i })).toHaveCount(0);
        await expect(popover.getByRole("menuitem", { name: /^give a black clue$/i })).toHaveCount(0);

        for (const suit of NAMEABLE_ROW_COLORS) {
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

      // (4) A Black tile's popover offers only the number button: no colour
      // control at all (owner gap closure, 2026-09-18: "you cannot hint at
      // the color black").
      await blackTile.click();
      const blackPopover = activePage.getByTestId("tile-clue-popover");
      await expect(blackPopover).toBeVisible();
      await expect(blackPopover.locator('[data-testid="tile-clue-color"]')).toHaveCount(0);
      await expect(blackPopover.locator('[data-testid="clue-color-row"]')).toHaveCount(0);
      await expect(blackPopover.locator('[data-testid^="tile-clue-color-"]')).toHaveCount(0);
      await expect(blackPopover.locator('[data-testid="tile-clue-rank"]')).toHaveCount(1);
      await activePage.keyboard.press("Escape");
      await expect(blackPopover).toHaveCount(0);

      // (5) Give a nameable colour clue from the rainbow tile's row and
      // prove it rings the receiver's own rainbow tile AND the named
      // suit's tiles, but NEVER a Black tile.
      const targetTiles = activePage.locator(
        `[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`,
      );
      const targetTileData = await targetTiles.evaluateAll((els) =>
        els.map((el) => ({
          id: (el.getAttribute("data-testid") ?? "").replace(/^other-hand-card-/, ""),
          suit: el.querySelector("[data-glyph]")?.getAttribute("data-glyph") ?? null,
        })),
      );
      const namedColour: NameableRowColor = "red";
      const expectedTouched = targetTileData
        .filter((t) => t.suit === "rainbow" || t.suit === namedColour)
        .map((t) => t.id);
      const expectedUntouched = targetTileData
        .filter((t) => t.suit !== "rainbow" && t.suit !== namedColour)
        .map((t) => t.id);
      // Sanity: black tiles (if any on the target) are never expected to
      // ring — verify none leaked into the touched set.
      const blackTileIds = targetTileData.filter((t) => t.suit === "black").map((t) => t.id);
      for (const id of blackTileIds) {
        expect(expectedTouched).not.toContain(id);
      }

      await firstRainbowTile.click();
      await expect(popover).toBeVisible();
      await popover.locator(`[data-testid="tile-clue-color-${namedColour}"]`).click();
      await expect(popover).toHaveCount(0);

      const expectedRgbOnReceiver = await resolveSuitRgb(receiverPage, namedColour);
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
