import { expect, test, type Page } from "@playwright/test";
import { buyStock, clickUntilChanged, dragGear, gearOf, shopEntry, tapGear, type TrailView } from "./expedition-driver";
import { createExpeditionRoom, getModel, waitForBridge } from "./expedition-helpers";

// Needs the worker in dev mode (see dev-mode.spec.ts): the dev shortcuts set
// up a boss camp's loadout with coins and items, and the UI does the rest.

/** Runs a dev shortcut and waits until the model shows its effect. */
async function shortcut(page: Page, id: string, fields: Record<string, string>, applied: (m: TrailView) => boolean): Promise<void> {
  const panel = page.getByTestId("dev-panel");
  for (const [name, value] of Object.entries(fields)) {
    const field = panel.getByTestId(`dev-field-${id}-${name}`);
    if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
    else await field.fill(value);
  }
  await panel.getByTestId(`dev-shortcut-${id}`).click();
  await expect.poll(async () => applied(await getModel<TrailView>(page)), { message: `${id} applied` }).toBe(true);
}

test("a seat equips by tap and drag, and buys supplies and an item at a boss camp's shop", async ({ page }) => {
  test.setTimeout(90_000);
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
  await page.getByTestId("start-game").click();
  await waitForBridge(page);

  await shortcut(page, "jump-to-camp", { length: "standard", camp: "3", stage: "loadout" }, (m) => shopEntry(m, "supplies") !== null);
  // A Rats boss would take a slot; this camp plays plain.
  await shortcut(page, "set-plan-boss", { camp: "3", boss: "none" }, (m) => shopEntry(m, "supplies") !== null && (gearOf(m)?.slots.length ?? 0) === 2);
  const you = await page.evaluate(() => (window.__expeditionTest?.model as { crew: { seatId: string; isYou: boolean }[] }).crew.find((c) => c.isYou)!.seatId);
  await shortcut(page, "set-purse", { purse: "20" }, (m) => m.topBar?.purse === 20);
  await shortcut(page, "set-supplies", { supplies: "2" }, (m) => m.topBar?.supplies === 2);
  for (const [n, item] of ["bait", "parrot", "whetstone"].entries()) {
    await shortcut(page, "give-item", { seat: you, item }, (m) => (gearOf(m)?.equipped.length ?? 0) + (gearOf(m)?.backpack.length ?? 0) === n + 1);
  }
  await page.getByTestId("dev-toggle").click();

  let model = await getModel<TrailView>(page);
  const gear = gearOf(model)!;
  expect(gear.slots.map((s) => s.item?.itemId)).toEqual(["bait", "parrot"]);
  expect(gear.backpack.map((t) => t.itemId)).toEqual(["whetstone"]);
  const [bait, parrot] = gear.equipped as [string, string];
  const whetstone = gear.backpack[0]!.uid;

  model = await tapGear(page, bait);
  expect(gearOf(model)!.equipped).toEqual([parrot]);
  model = await tapGear(page, whetstone);
  expect(gearOf(model)!.equipped).toEqual([parrot, whetstone]);
  model = await dragGear(page, bait, "slot:0");
  expect(gearOf(model)!.equipped, "dropping on a full slot swaps the item in").toEqual([bait, whetstone]);
  expect(gearOf(model)!.backpack.map((t) => t.uid)).toEqual([parrot]);

  model = await buyStock(page, "supplies");
  expect(model.topBar).toMatchObject({ supplies: 3, purse: 14 });
  const item = shopEntry(model, "item0")!;
  model = await buyStock(page, "item0");
  expect(shopEntry(model, "item0")!.buy).toEqual({ kind: "status", label: "Sold to you" });
  expect(gearOf(model)!.backpack, "a bought item waits in the backpack when the slots are full").toHaveLength(2);
  expect(model.topBar!.purse).toBe(14 - item.price!);

  model = await clickUntilChanged<TrailView>(page, "ready", (m) => gearOf(m)?.locked === true);
  expect(shopEntry(model, "supplies")!.buy).toEqual({ kind: "disabled", reason: "Locked" });
});
