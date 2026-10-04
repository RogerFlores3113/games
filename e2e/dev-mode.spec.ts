import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createExpeditionRoom, getScene, waitForBridge } from "./expedition-helpers";

// Needs the dev servers in dev mode: `next dev` (NODE_ENV development) and a
// worker started with `--var DEV_MODE:1`, which playwright.config.ts's worker
// command passes. A reused worker started without it fails the first step.

const SCREENSHOT_DIR = process.env.DEV_MODE_SCREENSHOT_DIR;

test("one player fills an Expedition table with bots, jumps to the final camp and autoplays to the run's end", async ({ page }) => {
  test.setTimeout(120_000);
  await createExpeditionRoom(page, "Solo");

  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  await expect(panel).toBeVisible();

  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
  await expect(page.getByTestId("seat-row")).toHaveCount(3);

  await page.getByTestId("start-game").click();
  await waitForBridge(page);

  await panel.getByTestId("dev-shortcut-jump-to-final-camp").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Jump to the final camp: done\. \(0:in_progress\)$/);

  await panel.getByTestId("dev-reveal").check();
  await expect(panel.getByTestId("dev-inspect")).toContainText("stage camp, status in_progress, standard run of 6 camps");
  await expect(panel.getByTestId("dev-inspect")).toContainText("attempt 1");
  await expect(panel.getByTestId("dev-inspect")).toContainText("Bot 1:");

  await panel.getByTestId("dev-autoplay-scope").selectOption("everyone");
  await panel.getByTestId("dev-autoplay-steps").fill("5000");
  await panel.getByTestId("dev-autoplay-run").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Autoplay: \d+ steps, stopped because the game is over\./, { timeout: 60_000 });

  await expect.poll(() => getScene(page), { timeout: 20_000 }).toBe("run-end");

  if (SCREENSHOT_DIR) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/run-end-with-panel.png` });
    await page.getByTestId("dev-toggle").click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/run-end.png` });
  }
});

test("a saved snapshot loads into a fresh room, and a broken state edit is refused readably", async ({ page }) => {
  test.setTimeout(90_000);

  async function soloTableWithBots(): Promise<void> {
    await createExpeditionRoom(page, "Solo");
    await page.getByTestId("dev-toggle").click();
    const panel = page.getByTestId("dev-panel");
    await panel.getByTestId("dev-add-bot").click();
    await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
    await panel.getByTestId("dev-add-bot").click();
    await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
    await page.getByTestId("start-game").click();
    await waitForBridge(page);
  }

  await soloTableWithBots();
  const panel = page.getByTestId("dev-panel");
  await panel.getByTestId("dev-field-jump-to-camp-camp").fill("4");
  await panel.getByTestId("dev-shortcut-jump-to-camp").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Jump to camp: done\. \(0:in_progress\)$/);
  await panel.getByTestId("dev-reveal").check();
  await expect(panel.getByTestId("dev-inspect")).toContainText("camp 4: ");
  await panel.getByTestId("dev-snapshot-name").fill("camp four");
  await panel.getByTestId("dev-snapshot-save").click();
  await expect(panel.getByTestId("dev-snapshot-list")).toContainText("camp four");

  await soloTableWithBots();
  await expect(panel.getByTestId("dev-result")).toHaveText(/\(0:in_progress\)$/);
  await panel.getByTestId("dev-snapshot-list").getByRole("button", { name: "Load" }).click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^State loaded \(seats renamed to this room's\)\. \(0:in_progress\)$/);
  await panel.getByTestId("dev-reveal").check();
  await expect(panel.getByTestId("dev-inspect")).toContainText("camp 4: ");

  const json = await panel.getByTestId("dev-state-json").inputValue();
  await panel.getByTestId("dev-state-json").fill(json.replace(/"supplies": \d+/, '"supplies": -2'));
  await panel.getByTestId("dev-apply-state").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^State does not match the Expedition schema:\s+supplies: /);
});
