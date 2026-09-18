import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import {
  giveAnyLegalClueToAnyTeammate,
  OTHER_HAND_SELECTOR,
  ownHandCardIds,
  startGameWithPlayers,
} from "./helpers";

/**
 * Phase 7 Plan 04 (RULES-14, UI-07): proves Rainbow's colour-row popover and
 * its ring semantics (D-18), plus the live rainbow gradient (D-11), through
 * the real UI and server — no test-only server entry point.
 *
 * D-18 mechanism (07-04-PLAN.md objective, Claude's discretion within the
 * hard constraint "no deck or seed override reachable in production"): a
 * 3-seat Rainbow game is started and room creation retried (up to 6 times)
 * until the active player can see a rainbow tile in a teammate's hand. This
 * adds zero production and zero dev-only code — no env var, no worker
 * change, no wrangler/playwright config change — so no forced seed and no
 * deck override of any kind exists anywhere in this file or the app it
 * exercises; WR-07's secret seed stays untouched. The rejected alternative
 * (a dev-only wrangler `--var` hook, e.g. `DEV_FORCE_SEED`, gated like
 * `SOCKET_STALE_MS`) would have added an env-gated code path to the worker
 * for test convenience only.
 */

const CLUABLE_COLORS = ["red", "yellow", "green", "blue", "white"] as const;
type CluableColor = (typeof CLUABLE_COLORS)[number];

interface RainbowGameHandle {
  pages: Page[];
  contexts: BrowserContext[];
  activePage: Page;
  rainbowCardId: string;
  targetSeatId: string;
  receiverPage: Page;
}

/**
 * Starts a 3-seat Rainbow game and retries room creation (up to 6 attempts)
 * until the current active player can see a rainbow tile in a teammate's
 * hand. Returns the game's pages/contexts plus the active page, the rainbow
 * card's id, the seat it belongs to, and whichever page holds that card in
 * its own hand. Throws, naming the attempt count, if no attempt succeeds.
 */
async function startRainbowGameWithVisibleRainbowTile(
  hostPage: Page,
  browser: Browser,
): Promise<RainbowGameHandle> {
  const MAX_ATTEMPTS = 6;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { pages, contexts } = await startGameWithPlayers(hostPage, browser, ["Roger", "Bianca", "Chen"], {
      variant: "rainbow",
    });

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
    `startRainbowGameWithVisibleRainbowTile: no visible rainbow tile found after ${MAX_ATTEMPTS} attempts`,
  );
}

/** Resolves `--color-suit-{suit}` to its computed rgb() string on `page`, via
 * a throwaway probe element (never a hand-copied hex literal), matching the
 * colour-comparison pattern established in hanabi-table-polish.spec.ts. */
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

/** Reads the first `<svg><path>` under `locator` and reports whether its
 * fill is a `url(#...)` reference that resolves (via `document.getElementById`)
 * to a `<linearGradient>` — the live-render proof for D-11's gradient art. */
async function gradientFillInfo(locator: Locator): Promise<{ ok: boolean; reason: string }> {
  return locator.evaluate((el) => {
    const path = el.querySelector("svg path");
    if (!path) return { ok: false, reason: "no svg path found under this element" };
    const inlineFill = (path as SVGPathElement).style.fill;
    const fill = inlineFill || getComputedStyle(path).fill;
    const match = fill.match(/url\(["']?#([^"')]+)["']?\)/);
    if (!match) return { ok: false, reason: `fill is not a url() reference: ${fill}` };
    const target = document.getElementById(match[1]!);
    if (!target) return { ok: false, reason: `no element with id "${match[1]}"` };
    return { ok: target.tagName.toLowerCase() === "lineargradient", reason: `resolved tag was ${target.tagName}` };
  });
}

async function assertResolvableGradientFill(locator: Locator): Promise<void> {
  const info = await gradientFillInfo(locator);
  expect(info.ok, info.reason).toBe(true);
}

/** Returns whichever page among `pages` currently reports "Your turn". */
async function activePageAmong(pages: Page[]): Promise<Page> {
  for (const page of pages) {
    const text = ((await page.getByTestId("turn-indicator").textContent()) ?? "").trim();
    if (text === "Your turn") return page;
  }
  throw new Error("activePageAmong: no page currently has the active turn");
}

test.describe("Rainbow variant e2e (RULES-14, UI-07)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("RULES-14 / D-18: a teammate's rainbow tile offers the five nameable colours and a colour clue rings the rainbow tile and every tile of that suit", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);

    const { contexts, activePage, rainbowCardId, targetSeatId, receiverPage } =
      await startRainbowGameWithVisibleRainbowTile(hostPage, browser);

    try {
      // (1) No popover anywhere offers a "Rainbow" colour option.
      const allTiles = activePage.locator('button[data-testid^="other-hand-card-"]');
      const allTilesCount = await allTiles.count();
      for (let i = 0; i < allTilesCount; i += 1) {
        const tile = allTiles.nth(i);
        await tile.click();
        const popover = activePage.getByTestId("tile-clue-popover");
        if ((await popover.count()) === 0) continue;
        await expect(popover.locator('[data-testid="tile-clue-color-rainbow"]')).toHaveCount(0);
        await expect(popover.getByRole("menuitem", { name: /rainbow/i })).toHaveCount(0);
        await activePage.keyboard.press("Escape");
        await expect(popover).toHaveCount(0);
      }

      // (2) Open the rainbow tile's own popover and verify the row's shape.
      const rainbowTile = activePage.locator(
        `[data-testid="other-hand-${targetSeatId}"] [data-testid="other-hand-card-${rainbowCardId}"]`,
      );
      await rainbowTile.click();
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
      await expect(popover.locator('[data-testid="tile-clue-color"]')).toHaveCount(0);

      const rowBox = await popover.getByTestId("clue-color-row").boundingBox();
      const rankBox = await popover.getByTestId("tile-clue-rank").boundingBox();
      if (!rowBox || !rankBox) throw new Error("missing row/rank bounding box");
      expect(rankBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);

      for (const suit of CLUABLE_COLORS) {
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

      // (3) Choose a colour actually present (by data-glyph) among the
      // target's other tiles, falling back to red, and record which of the
      // target's tiles the clue is expected to touch.
      const targetTiles = activePage.locator(
        `[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`,
      );
      const tileData = await targetTiles.evaluateAll((els) =>
        els.map((el) => ({
          id: (el.getAttribute("data-testid") ?? "").replace(/^other-hand-card-/, ""),
          suit: el.querySelector("[data-glyph]")?.getAttribute("data-glyph") ?? null,
        })),
      );
      const chosen: CluableColor =
        CLUABLE_COLORS.find((color) => tileData.some((t) => t.suit === color)) ?? "red";
      const expectedTouched = tileData
        .filter((t) => t.suit === "rainbow" || t.suit === chosen)
        .map((t) => t.id);
      const expectedUntouched = tileData
        .filter((t) => t.suit !== "rainbow" && t.suit !== chosen)
        .map((t) => t.id);

      await popover.locator(`[data-testid="tile-clue-color-${chosen}"]`).click();
      await expect(popover).toHaveCount(0);

      // (4) On the receiver's own hand: every touched card rings in the
      // chosen colour, and every untouched card carries no ring at all.
      const expectedRgbOnReceiver = await resolveSuitRgb(receiverPage, chosen);
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

      // Also on the giver's own page: the rainbow tile's teammate hint ring
      // is present, in the chosen colour (D-09: the ring is the clue's own
      // colour, including on the rainbow tile itself).
      const giverRing = activePage
        .getByTestId(`other-hand-card-${rainbowCardId}-hints`)
        .getByTestId("hint-color-ring");
      await expect(giverRing).toHaveCount(1);
      const giverBoxShadow = await giverRing.evaluate((el) => getComputedStyle(el).boxShadow);
      const expectedRgbOnGiver = await resolveSuitRgb(activePage, chosen);
      expect(giverBoxShadow).toContain(expectedRgbOnGiver);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("UI-07 / D-11: a live rainbow face renders its gradient on the teammate tile, the compact discard and the discard overlay", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);

    const { pages, contexts, activePage, rainbowCardId, receiverPage } = await startRainbowGameWithVisibleRainbowTile(
      hostPage,
      browser,
    );

    try {
      const rainbowTile = activePage.getByTestId(`other-hand-card-${rainbowCardId}`);
      await assertResolvableGradientFill(rainbowTile);

      // Advance turns (giving any legal clue each time, which also spends a
      // clue token) until the receiver holds the turn.
      for (let i = 0; i < 5; i += 1) {
        const receiverIsActive =
          ((await receiverPage.getByTestId("turn-indicator").textContent()) ?? "").trim() === "Your turn";
        if (receiverIsActive) break;
        const current = await activePageAmong(pages);
        const gave = await giveAnyLegalClueToAnyTeammate(current);
        expect(gave).toBe(true);
        await expect
          .poll(async () => (await activePageAmong(pages)) !== current)
          .toBe(true);
      }
      await expect(receiverPage.getByTestId("turn-indicator")).toHaveText("Your turn");

      const cardSlot = receiverPage
        .locator(`[data-testid="own-hand"] [data-card-id="${rainbowCardId}"]`)
        .locator('[data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])');
      await cardSlot.click();
      await expect(receiverPage.getByTestId("discard-button")).toBeEnabled();
      await receiverPage.getByTestId("discard-button").click();

      const discardTile = receiverPage.getByTestId(`discard-tile-${rainbowCardId}`);
      await expect(discardTile).toBeVisible();
      await assertResolvableGradientFill(discardTile);

      await receiverPage.getByTestId("discard-toggle").click();
      await expect(receiverPage.getByTestId("discard-overlay")).toBeVisible();
      const overlayCards = receiverPage.getByTestId("discard-overlay-card");
      const overlayCount = await overlayCards.count();
      let foundGradient = false;
      for (let i = 0; i < overlayCount; i += 1) {
        const info = await gradientFillInfo(overlayCards.nth(i));
        if (info.ok) {
          foundGradient = true;
          break;
        }
      }
      expect(foundGradient).toBe(true);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});
