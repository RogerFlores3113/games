import { expect, test, type Page } from "@playwright/test";
import { clickUntilChanged, gearOf, type TrailView } from "./expedition-driver";
import { createExpeditionRoom, getModel, waitForBridge } from "./expedition-helpers";

// Needs the worker in dev mode (see dev-mode.spec.ts) to jump to a loadout.

async function readyAtLoadout(page: Page): Promise<{ x: number; y: number }> {
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  await panel.getByTestId("dev-add-bot").dispatchEvent("click");
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
  await panel.getByTestId("dev-add-bot").dispatchEvent("click");
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
  await page.getByTestId("start-game").click();
  await waitForBridge(page);
  await panel.getByTestId("dev-field-jump-to-camp-length").selectOption("standard");
  await panel.getByTestId("dev-field-jump-to-camp-camp").fill("3");
  await panel.getByTestId("dev-field-jump-to-camp-stage").selectOption("loadout");
  await panel.getByTestId("dev-shortcut-jump-to-camp").dispatchEvent("click");
  await expect.poll(async () => gearOf(await getModel<TrailView>(page)) !== null).toBe(true);
  await page.getByTestId("dev-toggle").click();
  await expect(panel).toBeHidden();
  const position = await page.evaluate(() => window.__expeditionTest?.positionOf("ready") ?? null);
  expect(position, "Set out button is on screen").not.toBeNull();
  return position!;
}

/** Real presses, spread over frames like a hand does. Phaser registers a
 * press intermittently (it is the same reason clickUntilChanged retries), so
 * a press that wrongly reaches it shows up within a few attempts. */
async function press(page: Page, at: { x: number; y: number }, beforeEach?: () => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await beforeEach?.();
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
}

async function locked(page: Page): Promise<boolean> {
  return gearOf(await getModel<TrailView>(page))?.locked === true;
}

for (const overlay of ["rules", "settings"] as const) {
  test(`a real click on the ${overlay} modal's backdrop does not press the canvas button under it`, async ({ page }) => {
    test.setTimeout(90_000);
    const ready = await readyAtLoadout(page);
    const modal = page.getByTestId(`expedition-${overlay}-modal`);
    // A backdrop click closes the modal, so reopen it before every press.
    const reopen = async () => {
      if (!(await modal.isVisible())) await page.getByTestId(`expedition-${overlay}-button`).click();
      await expect(modal).toBeVisible();
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [ready.x, ready.y])).not.toBe("CANVAS");
    };
    await press(page, ready, reopen);
    expect(await locked(page), "Set out was not pressed").toBe(false);
  });
}

test("a real click on the dev panel does not press the canvas button under it", async ({ page }) => {
  test.setTimeout(90_000);
  const ready = await readyAtLoadout(page);
  await page.getByTestId("dev-toggle").click();
  await page.setViewportSize({ width: Math.ceil(ready.x + 60), height: 720 });
  const after = (await page.evaluate(() => window.__expeditionTest?.positionOf("ready") ?? null))!;
  const panelBox = (await page.getByTestId("dev-panel").boundingBox())!;
  expect(after.x, "Set out lies under the panel").toBeGreaterThan(panelBox.x);
  await press(page, after);
  expect(await locked(page), "Set out was not pressed").toBe(false);
});

test("a click on the canvas itself still presses the button", async ({ page }) => {
  test.setTimeout(90_000);
  const ready = await readyAtLoadout(page);
  await clickUntilChanged<TrailView>(page, "ready", (m) => gearOf(m)?.locked === true);
});
