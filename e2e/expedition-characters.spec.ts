import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickHandCard, clickUntilChanged, draftOffer, openVote, waitForScene, type TrailView } from "./expedition-driver";
import { getModel } from "./expedition-helpers";
import { autoplay, shortcut, soloTable } from "./expedition-dev-panel";

// Each character's main flow, through the real canvas on a solo table (it
// needs the dev servers in dev mode, see dev-mode.spec.ts). The dev panel
// sets the character and upgrade and jumps to the moment; the power is then
// used by clicking. With CHARACTER_SCREENSHOT_DIR set, each moment is
// captured at 1280x720 and 1920x1080.

const SCREENSHOT_DIR = process.env.CHARACTER_SCREENSHOT_DIR;
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

interface Chip { objectiveId: string; objectId: string; label: string; ownerSeatId: string | null; targetable: boolean }
interface Source { sourceKey: string; name: string; charge: { full: string; short: string }; usable: boolean; objectId: string }
interface Card { id: string; objectId: string; label: string; targetable: boolean; countsAs: { kind: string; suit?: string; rank?: number } | null }
interface CampModel {
  sceneKey: string;
  youSeatId: string;
  seats: { seatId: string; objectId: string; isYou: boolean; characterId: string | null; objectives: Chip[]; sources: Source[]; targetable: boolean }[];
  hand: Card[];
  faceUpObjectives: Chip[];
  whisper: { left: number };
  tray: { title: string; options: { choiceId: string; objectId: string; label: string }[] } | null;
  targeting: { canConfirm: boolean } | null;
  prompt: { text: string };
}

interface Trail {
  sceneKey: string;
  topBar: { purse: number; supplies: number };
  panel:
    | { kind: "draft"; draft: { kind: string; bundles?: { objectId: string; items: { itemId: string; exclusive: boolean }[] }[] } }
    | { kind: "route"; options: { id: string; objectId: string; swapsBoss: string | null; reroll: { objectId: string } | null; next: { survey: string[] | null } }[] }
    | { kind: "loadout"; gear: { equipped: string[]; slots: { item: { uid: string; objectId: string; targetable: boolean; tag: string | null } | null }[]; backpack: { uid: string }[] } | null }
    | { kind: string };
  powers: { sourceKey: string; objectId: string; label: string }[];
  crew: { seatId: string; objectId: string; isYou: boolean; targetable: boolean }[];
}

const camp = (page: Page) => getModel<CampModel>(page);
const trail = (page: Page) => getModel<Trail>(page);
const you = (m: CampModel) => m.seats.find((s) => s.isYou)!;
const sourceOf = (m: CampModel, key: string) => you(m).sources.find((s) => s.sourceKey === key);

async function capture(page: Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const open = await page.getByTestId("dev-panel").isVisible();
  if (open) await page.getByTestId("dev-toggle").click();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.mouse.move(2, 2);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${size.name}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  if (open) await page.getByTestId("dev-toggle").click();
}

/** The dev panel closed, so a click on the canvas lands on the canvas. */
async function closePanel(page: Page): Promise<void> {
  if (await page.getByTestId("dev-panel").isVisible()) await page.getByTestId("dev-toggle").click();
}

async function openPanel(page: Page): Promise<void> {
  if (!(await page.getByTestId("dev-panel").isVisible())) await page.getByTestId("dev-toggle").click();
}

/** Jumps to a dealt camp 2 of a Short run and seats you as `character`
 * (with `upgrade`), moving a teammate who held it to a free character. */
async function crewAs(page: Page, panel: Locator, character: string, upgrade: string | null): Promise<CampModel> {
  await shortcut(panel, "jump-to-camp", { length: "short", camp: "2", stage: "camp" });
  await waitForScene(page, "camp");
  const dealt = await camp(page);
  const holder = dealt.seats.find((s) => s.characterId === character && !s.isYou);
  if (holder !== undefined) {
    const all = await panel.getByTestId("dev-field-set-character-character").evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => o.value));
    const free = all.find((id) => id !== character && !dealt.seats.some((s) => s.characterId === id))!;
    await shortcut(panel, "set-character", { seat: holder.seatId, character: free });
  }
  await shortcut(panel, "set-character", { seat: dealt.youSeatId, character });
  if (upgrade !== null) await shortcut(panel, "set-upgrade", { seat: dealt.youSeatId, upgrade });
  return camp(page);
}

/** A dealt camp 2 of a Short run with every objective picked, you holding
 * `character` (and `upgrade`), between tricks. */
async function campAs(page: Page, panel: Locator, character: string, upgrade: string | null): Promise<CampModel> {
  await crewAs(page, panel, character, upgrade);
  await autoplay(panel, "everyone", (await camp(page)).faceUpObjectives.length);
  await expect.poll(async () => (await camp(page)).faceUpObjectives.length).toBe(0);
  return camp(page);
}

/** Clears the camp through the dev panel and takes the first bundle of
 * every bot's draft, leaving yours open. */
async function toDraft(page: Page, panel: Locator): Promise<Trail> {
  await shortcut(panel, "force-camp", { outcome: "cleared" });
  await waitForScene(page, "trail");
  await expect.poll(async () => (await trail(page)).panel.kind).toBe("draft");
  return trail(page);
}

/** Starts targeting with `key`'s chip. */
async function begin(page: Page, key: string): Promise<CampModel> {
  return clickUntilChanged<CampModel>(page, sourceOf(await camp(page), key)!.objectId, (m) => m.targeting !== null);
}

async function confirm(page: Page, done: (m: CampModel) => boolean): Promise<CampModel> {
  await expect.poll(async () => (await camp(page)).targeting?.canConfirm).toBe(true);
  return clickUntilChanged<CampModel>(page, "confirm", (m) => m.targeting === null && done(m));
}

test.describe("the nine characters", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("J.D. sets out from the muster with one extra random item", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await soloTable(page, 2);
    await closePanel(page);
    await waitForScene(page, "trail");
    await capture(page, "muster");
    const jd = draftOffer(await getModel<TrailView>(page))!.find((c) => c.sourceId === "jd")!;
    await clickUntilChanged<TrailView>(page, jd.objectId, (m) => draftOffer(m) === null);
    const short = openVote(await getModel<TrailView>(page))!.find((o) => o.id === "short")!;
    await clickUntilChanged<TrailView>(page, short.objectId, (m) => openVote(m) === null);
    await openPanel(page);
    await autoplay(panel, "others", 6);
    await expect.poll(async () => (await getModel<TrailView>(page)).panel?.kind).toBe("loadout");
    const loadout = await getModel<TrailView>(page);
    const gear = loadout.panel?.kind === "loadout" ? loadout.panel.gear : null;
    expect(gear?.equipped).toHaveLength(1);
    expect(loadout.kit?.map((k) => k.sourceId)[0]).toBe("jd");
    await capture(page, "jd-loadout");
  });

  test("the Leader whispers twice, and Delegate hands a whisper to a teammate", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    let model = await campAs(page, panel, "leader", "leader.delegate");
    expect(model.whisper.left).toBe(3);
    await closePanel(page);
    model = await begin(page, "leader.delegate");
    const mate = model.seats.find((s) => !s.isYou && s.targetable)!;
    await clickUntilChanged<CampModel>(page, mate.objectId, (m) => m.targeting?.canConfirm === true);
    await capture(page, "leader-delegate-targeting");
    model = await confirm(page, (m) => m.whisper.left === 2);
    expect(sourceOf(model, "leader.delegate")!.charge.full).toBe("2 whispers left");
    await capture(page, "leader-delegated");
  });

  test("the Explorer's Compass recounts a card, and True Form makes it count as that card", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await campAs(page, panel, "explorer", "explorer.true-form");
    await closePanel(page);
    let model = await begin(page, "explorer");
    const card = model.hand.find((c) => c.targetable)!;
    model = await clickHandCard<CampModel>(page, card.objectId, (m) => m.tray !== null);
    expect(model.tray!.title).toBe(`Count ${card.label} as`);
    await capture(page, "explorer-compass-ranks");
    const rank = model.tray!.options[0]!;
    await clickUntilChanged<CampModel>(page, rank.objectId, (m) => m.targeting?.canConfirm === true);
    model = await confirm(page, (m) => m.hand.find((c) => c.id === card.id)?.countsAs !== null);
    expect(model.hand.find((c) => c.id === card.id)!.countsAs).toMatchObject({ kind: "standard", rank: Number(rank.choiceId.split(":")[2]) });
    expect(sourceOf(model, "explorer")!.charge.full).toBe("Used this camp");
    await capture(page, "explorer-true-form");
  });

  test("Reshape shifts one of the Explorer's objectives a rank", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await campAs(page, panel, "explorer", "explorer.reshape");
    await closePanel(page);
    let model = await begin(page, "explorer.reshape");
    const objective = model.seats.flatMap((s) => s.objectives).find((o) => o.targetable)!;
    model = await clickUntilChanged<CampModel>(page, objective.objectId, (m) => m.tray !== null);
    await capture(page, "explorer-reshape-ranks");
    const rank = model.tray!.options[0]!;
    await clickUntilChanged<CampModel>(page, rank.objectId, (m) => m.targeting?.canConfirm === true);
    model = await confirm(page, (m) => m.seats.flatMap((s) => s.objectives).find((o) => o.objectiveId === objective.objectiveId)?.label !== objective.label);
    expect(sourceOf(model, "explorer")!.charge.full).toBe("Used this camp");
    await capture(page, "explorer-reshaped");
  });

  test("the Businessman sells an item at the shop for coins", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await crewAs(page, panel, "businessman", null);
    await shortcut(panel, "jump-to-camp", { length: "standard", camp: "3", stage: "loadout" });
    await waitForScene(page, "trail");
    await shortcut(panel, "give-item", { seat: (await trail(page)).crew.find((r) => r.isYou)!.seatId, item: "trail-map" });
    await closePanel(page);
    const before = await trail(page);
    const sell = before.powers.find((p) => p.sourceKey === "businessman")!;
    expect(sell.label).toBe("Sell an item");
    const aimed = await clickUntilChanged<Trail>(page, sell.objectId, (m) => m.panel.kind === "loadout" && (m.panel as { gear: { slots: { item: { targetable: boolean } | null }[] } }).gear.slots.some((slot) => slot.item?.targetable === true));
    const gear = (aimed.panel as Extract<Trail["panel"], { kind: "loadout" }>).gear!;
    const tile = gear.slots.find((slot) => slot.item?.targetable)!.item!;
    expect(tile.tag).toBe("+2");
    await capture(page, "businessman-sell");
    await clickUntilChanged<Trail>(page, tile.objectId, (m) => m.topBar.purse === before.topBar.purse + 2);
    await capture(page, "businessman-sold");
  });

  test("the Businessman skips a draft for 4 coins", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await crewAs(page, panel, "businessman", null);
    const draft = await toDraft(page, panel);
    await closePanel(page);
    const cashOut = draft.powers.find((p) => p.sourceKey === "businessman.cash-out")!;
    expect(cashOut.label).toBe("Cash Out");
    await capture(page, "businessman-draft");
    await clickUntilChanged<Trail>(page, cashOut.objectId, (m) => m.topBar.purse === draft.topBar.purse + 4);
  });

  test("the Pop-up Shop sells the Businessman an item mid-camp", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await campAs(page, panel, "businessman", "businessman.pop-up-shop");
    await shortcut(panel, "set-purse", { purse: "30" });
    await closePanel(page);
    await begin(page, "businessman.pop-up-shop");
    const shop = await getModel<{ popupShop: { rows: { name: string; price: number; buys: { objectId: string; label: string }[] }[]; refresh: { objectId: string } | null } | null }>(page);
    expect(shop.popupShop!.rows).toHaveLength(3);
    expect(shop.popupShop!.refresh).not.toBeNull();
    await capture(page, "businessman-popup-shop");
    const row = shop.popupShop!.rows[0]!;
    const forYou = row.buys.find((b) => b.label === "You")!;
    await clickUntilChanged<CampModel>(page, forYou.objectId, (m) => m.targeting?.canConfirm === true);
    const before = await getModel<{ topBar: { purse: number } }>(page);
    await confirm(page, () => true);
    await expect.poll(async () => (await getModel<{ topBar: { purse: number } }>(page)).topBar.purse).toBe(before.topBar.purse - row.price);
    expect(you(await camp(page)).sources.some((src) => src.name === row.name)).toBe(true);
    await capture(page, "businessman-popup-bought");
  });

  test("the Pack Rat carries three items and drafts Pack Rat items in every bundle", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await crewAs(page, panel, "pack-rat", null);
    await shortcut(panel, "jump-to-camp", { length: "short", camp: "2", stage: "loadout" });
    await waitForScene(page, "trail");
    const loadout = await trail(page);
    expect((loadout.panel as Extract<Trail["panel"], { kind: "loadout" }>).gear!.slots).toHaveLength(3);
    await capture(page, "pack-rat-slots");
    await shortcut(panel, "jump-to-camp", { length: "short", camp: "2", stage: "camp" });
    await waitForScene(page, "camp");
    const draft = await toDraft(page, panel);
    await closePanel(page);
    const bundles = (draft.panel as { draft: { bundles: { items: { exclusive: boolean }[] }[] } }).draft.bundles;
    for (const bundle of bundles) expect(bundle.items.map((i) => i.exclusive)).toEqual([false, false, true, true]);
    await capture(page, "pack-rat-draft");
  });

  test("Quartermaster hands one of the Pack Rat's items to a teammate", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await crewAs(page, panel, "pack-rat", "pack-rat.quartermaster");
    await shortcut(panel, "jump-to-camp", { length: "short", camp: "2", stage: "loadout" });
    await waitForScene(page, "trail");
    await shortcut(panel, "give-item", { seat: (await trail(page)).crew.find((r) => r.isYou)!.seatId, item: "bait" });
    await closePanel(page);
    const give = (await trail(page)).powers.find((p) => p.sourceKey === "pack-rat.quartermaster")!;
    const aimed = await clickUntilChanged<Trail>(page, give.objectId, (m) => (m.panel as { gear?: { slots: { item: { targetable: boolean } | null }[] } }).gear?.slots.some((slot) => slot.item?.targetable === true) === true);
    const tile = (aimed.panel as Extract<Trail["panel"], { kind: "loadout" }>).gear!.slots.find((slot) => slot.item?.targetable)!.item!;
    const picked = await clickUntilChanged<Trail>(page, tile.objectId, (m) => m.crew.some((r) => r.targetable));
    await capture(page, "pack-rat-quartermaster");
    const mate = picked.crew.find((r) => r.targetable)!;
    await clickUntilChanged<Trail>(page, mate.objectId, (m) => (m.panel as Extract<Trail["panel"], { kind: "loadout" }>).gear!.equipped.length === 0);
  });

  test("the Cartographer sees three routes, the third to another boss, and rerolls one for a supply", async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await soloTable(page, 2);
    await crewAs(page, panel, "cartographer", "cartographer.survey");
    await shortcut(panel, "jump-to-camp", { length: "standard", camp: "1", stage: "camp" });
    await waitForScene(page, "camp");
    const draft = await toDraft(page, panel);
    const take = (draft.panel as { draft: { bundles: { objectId: string }[] } }).draft.bundles[0]!;
    await closePanel(page);
    await clickUntilChanged<Trail>(page, take.objectId, (m) => (m.panel as { draft?: { kind: string } }).draft?.kind !== "offer");
    await openPanel(page);
    await autoplay(panel, "others", 4);
    await expect.poll(async () => (await trail(page)).panel.kind).toBe("route");
    await closePanel(page);
    const route = await trail(page);
    const options = (route.panel as Extract<Trail["panel"], { kind: "route" }>).options;
    expect(options.map((o) => o.swapsBoss)).toEqual([null, null, "Another boss at camp 3"]);
    expect(options.every((o) => o.reroll !== null && o.next.survey !== null)).toBe(true);
    await capture(page, "cartographer-routes");
    await clickUntilChanged<Trail>(page, options[1]!.reroll!.objectId, (m) => m.topBar.supplies === route.topBar.supplies - 1);
    await capture(page, "cartographer-rerolled");
  });
});
