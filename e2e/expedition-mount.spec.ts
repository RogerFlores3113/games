import { expect, test } from "@playwright/test";
import { draftOffer, type TrailView } from "./expedition-driver";
import { getScene, startExpeditionGame, waitForBridge } from "./expedition-helpers";

test.describe("Expedition Phaser mount (SCENE-01, SCENE-10, criterion 3)", () => {
  test("3 players get one canvas each at the muster", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);

    try {
      for (const p of pages) {
        await expect(p.locator('[data-testid="expedition-canvas-mount"] canvas')).toHaveCount(1);
        const liveGames = await p.evaluate(() => window.__expeditionTest?.liveGames ?? 0);
        expect(liveGames).toBe(1);
        expect(await getScene(p)).toBe("trail");
        const model = await p.evaluate(() => window.__expeditionTest?.model as TrailView | null);
        expect(draftOffer(model ?? {})).toHaveLength(9);
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("navigating away and back never double-mounts", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const { code, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);

    try {
      const consoleMessages: string[] = [];
      page.on("console", (msg) => consoleMessages.push(msg.text()));

      for (let i = 0; i < 5; i++) {
        await page.goto("/");
        await page.goto(`/room/${code}`);
        await waitForBridge(page);
      }

      await expect(page.locator('[data-testid="expedition-canvas-mount"] canvas')).toHaveCount(1);
      const liveGames = await page.evaluate(() => window.__expeditionTest?.liveGames ?? 0);
      expect(liveGames).toBe(1);

      const leaked = consoleMessages.some((text) => /too many active webgl contexts/i.test(text));
      expect(leaked).toBe(false);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("whole-number scaling", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const { contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);

    try {
      const canvas = page.locator('[data-testid="expedition-canvas-mount"] canvas');
      const hint = page.getByTestId("expedition-enlarge-hint");

      await page.setViewportSize({ width: 1280, height: 720 });
      await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(1280);
      await expect(hint).toBeHidden();

      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(1920);

      await page.setViewportSize({ width: 1000, height: 600 });
      await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(640);
      await expect(hint).toBeVisible();
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});
