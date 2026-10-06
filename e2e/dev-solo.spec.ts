import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { getModel, getScene, waitForBridge } from "./expedition-helpers";
import { shortcut } from "./expedition-dev-panel";
import { clickUntilChanged } from "./expedition-driver";

type Chip = { objectiveId: string; objectId: string; pickable: boolean; status: string };
type CampModel = { faceUpObjectives: Chip[]; seats: { isYou: boolean; objectives: Chip[] }[] };
const mine = (model: CampModel) => model.seats.find((seat) => seat.isYou)?.objectives ?? [];

// One person, one tab: the home page's "Play solo (dev)" to a Long run's
// disaster camp, debug powers on the table, and on to the run's end. Needs
// the dev servers in dev mode (see dev-mode.spec.ts).

const SCREENSHOT_DIR = process.env.DEV_SOLO_SCREENSHOT_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (SCREENSHOT_DIR === undefined) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

async function rightClick(page: Page, id: string): Promise<void> {
  await page.waitForFunction((objectId) => window.__expeditionTest?.positionOf(objectId) != null, id);
  const at = await page.evaluate((objectId) => window.__expeditionTest!.positionOf(objectId)!, id);
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(page.getByTestId("dev-pick-menu")).toBeVisible();
}

/** The status an objective chip on the table shows, by its object id. */
async function chipStatus(page: Page, objectId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const seen: unknown[] = [window.__expeditionTest?.model];
    while (seen.length > 0) {
      const node = seen.pop();
      if (Array.isArray(node)) seen.push(...node);
      else if (node !== null && typeof node === "object") {
        const chip = node as { objectId?: unknown; status?: unknown };
        if (chip.objectId === id && typeof chip.status === "string") return chip.status;
        seen.push(...Object.values(node));
      }
    }
    return null;
  }, objectId);
}

/** The stage fills a 1280x720 window, so the toolbar starts folded to its
 * DEV button there, covering nothing; this unfolds it. */
async function unfoldToolbar(page: Page): Promise<void> {
  await expect(page.getByTestId("dev-toolbar-jump-to-camp")).toBeHidden();
  await page.getByTestId("dev-toolbar-collapse").click();
  await expect(page.getByTestId("dev-toolbar-jump-to-camp")).toBeVisible();
}

async function toolbar(page: Page, id: string, fields: Record<string, string> = {}, answer = /: done\.$/): Promise<void> {
  for (const [name, value] of Object.entries(fields)) {
    const field = page.getByTestId(`dev-toolbar-field-${id}-${name}`);
    if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
    else await field.fill(value);
  }
  await page.getByTestId(`dev-toolbar-${id}`).click();
  await expect(page.getByTestId("dev-toolbar-result")).toHaveText(answer);
}

test("one tab: play solo, skip to a Long run's disaster, mark an objective, set the boss off, and skip to the run's end", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expedition/start");
  await page.getByLabel("Your name").fill("Roger");
  await page.getByTestId("play-solo-dev").click();

  await waitForBridge(page);
  await expect.poll(() => getScene(page)).toBe("trail");
  await expect(page.getByTestId("dev-toolbar")).toBeVisible();
  await unfoldToolbar(page);
  await expect(page.getByTestId("dev-toolbar-bots")).toBeChecked();
  await shot(page, "1-muster-1280");

  await toolbar(page, "jump-to-camp", { length: "long", camp: "6", stage: "camp" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("camp");

  // The camp's disaster is drawn per room; set it to the Tornado so this run is the same every time.
  await page.getByTestId("dev-toggle").click();
  await shortcut(page.getByTestId("dev-panel"), "set-plan-boss", { camp: "6", boss: "tornado" });
  await page.getByTestId("dev-toggle").click();
  await expect(page.getByTestId("dev-panel")).toBeHidden();

  // Bots take their own picks; the human picks one objective on the table.
  const pickableChip = async () => (await getModel<CampModel>(page)).faceUpObjectives?.find((o) => o.pickable) ?? null;
  await expect.poll(pickableChip, { timeout: 20_000 }).not.toBeNull();
  const chip = (await pickableChip())!;
  await clickUntilChanged<CampModel>(page, chip.objectId, (m) => mine(m).some((o) => o.objectiveId === chip.objectiveId));
  const pickable = chip.objectId;
  await expect.poll(() => chipStatus(page, pickable)).toBe("pending");

  await rightClick(page, pickable);
  await shot(page, "2-objective-menu-1280");
  await page.getByTestId("dev-pick-field-set-objective-status-status").selectOption("done");
  await page.getByTestId("dev-pick-set-objective-status").click();
  await expect(page.getByTestId("dev-pick-menu")).toBeHidden();
  await expect(page.getByTestId("dev-toolbar-result")).toHaveText("Mark an objective: done.");
  await expect.poll(() => chipStatus(page, pickable)).toBe("done");

  await rightClick(page, "boss:tornado");
  await expect(page.getByTestId("dev-pick-title")).toHaveText("Tornado");
  await page.getByTestId("dev-pick-trigger-tornado").click();
  await expect(page.getByTestId("dev-toolbar-result")).toHaveText("Tornado: gust now: done.");
  await page.waitForTimeout(400);
  await shot(page, "3-gust-1280");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  await shot(page, "3-gust-1920");
  await page.setViewportSize({ width: 1280, height: 720 });

  await toolbar(page, "force-camp", { outcome: "cleared" }, /^Force the camp's outcome: done\.$/);
  await expect.poll(() => getScene(page)).toBe("trail");
  await toolbar(page, "next-stage", {}, /^Play on to the next stage: done\.$/);
  await shot(page, "4-after-draft-1280");

  await toolbar(page, "jump-to-camp", { length: "long", camp: "8", stage: "camp" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("camp");
  await toolbar(page, "force-camp", { outcome: "cleared" }, /^Force the camp's outcome: done\.$/);
  await expect.poll(() => getScene(page), { timeout: 20_000 }).toBe("run-end");
  await shot(page, "5-run-end-1280");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  await shot(page, "5-run-end-1920");
});

test("the toolbar starts folded where the stage fills the window and folds away to its DEV button, and a right-click on bare table offers nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expedition/start");
  await page.getByTestId("play-solo-dev").click();
  await waitForBridge(page);
  await unfoldToolbar(page);
  await toolbar(page, "jump-to-camp", { length: "standard", camp: "2", stage: "camp" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("camp");

  const corner = await page.evaluate(() => window.__expeditionTest!.pagePoint({ x: 320, y: 120 })!);
  await page.mouse.click(corner.x, corner.y, { button: "right" });
  await expect(page.getByTestId("dev-pick-title")).toHaveText("Nothing to debug here");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dev-pick-menu")).toBeHidden();

  await page.getByTestId("dev-toolbar-collapse").click();
  await expect(page.getByTestId("dev-toolbar-jump-to-camp")).toBeHidden();
  await expect(page.getByTestId("dev-toggle")).toBeVisible();
  await page.getByTestId("dev-toolbar-collapse").click();
  await expect(page.getByTestId("dev-toolbar-jump-to-camp")).toBeVisible();
});

test("the HUD names the supplies and the purse on hover, and the camp label shows and hides the trail map", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expedition/start");
  await page.getByTestId("play-solo-dev").click();
  await waitForBridge(page);
  await unfoldToolbar(page);
  await toolbar(page, "jump-to-camp", { length: "standard", camp: "2", stage: "camp" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("camp");
  await toolbar(page, "set-spec", { location: "cave", weather: "rain" }, /^Set the camp's location and weather: done\.$/);

  const texts = () => page.evaluate(() => window.__expeditionTest!.layout().filter((e) => e.kind === "text").map((e) => e.label));
  const stage = (x: number, y: number) => page.evaluate(([px, py]) => window.__expeditionTest!.pagePoint({ x: px!, y: py! })!, [x, y]);
  const crate = await stage(14, 11);
  await page.mouse.move(crate.x, crate.y);
  await expect.poll(texts).toContain("Supplies 3 of 4");
  const { topBar } = await page.evaluate(() => window.__expeditionTest!.model as { topBar: { purse: number } });
  const coin = await stage(88, 11);
  await page.mouse.move(coin.x, coin.y);
  await expect.poll(texts).toContain(`${topBar.purse} coins`);

  type Mapped = { trailMap: { index: number; state: string; caption: string }[] | null };
  const trailMap = async () => (await page.evaluate(() => window.__expeditionTest!.model as unknown as Mapped)).trailMap;
  await clickUntilChanged<Mapped>(page, "map", (m) => m.trailMap !== null);
  // The jump writes no history for camp 1, so it reads as not yet played.
  expect((await trailMap())!.map((stop) => [stop.index, stop.state, stop.caption])).toEqual([
    [1, "ahead", ""],
    [2, "here", "here"],
    [3, "ahead", ""],
    [4, "ahead", ""],
    [5, "ahead", ""],
    [6, "ahead", ""],
  ]);
  await expect.poll(texts).toContain("Camp 6");
  expect(await page.evaluate(() => "trail-map" in window.__expeditionTest!.objects())).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(trailMap).toBeNull();
  await clickUntilChanged<Mapped>(page, "map", (m) => m.trailMap !== null);
  await clickUntilChanged<Mapped>(page, "map", (m) => m.trailMap === null);
});

test("the kit bar on the left folds to its slots and pops out to name your items and powers, between camps and in camp", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expedition/start");
  await page.getByTestId("play-solo-dev").click();
  await waitForBridge(page);
  await unfoldToolbar(page);
  await toolbar(page, "jump-to-camp", { length: "standard", camp: "2", stage: "loadout" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("trail");

  type Kit = { kitBar: { open: boolean; powers: { objectId: string; name: string }[] } | null };
  const texts = () => page.evaluate(() => window.__expeditionTest!.layout().filter((e) => e.kind === "text").map((e) => e.label));
  const folded = await getModel<Kit>(page);
  const power = folded.kitBar!.powers[0]!;
  expect(power.objectId).toMatch(/^kit:/);
  expect(await texts()).not.toContain(power.name);
  await clickUntilChanged<Kit>(page, "kit-toggle", (m) => m.kitBar?.open === true);
  await expect.poll(texts).toContain("Your kit");
  await expect.poll(texts).toContain(power.name);
  await clickUntilChanged<Kit>(page, "kit-toggle", (m) => m.kitBar?.open === false);
  await expect.poll(texts).not.toContain(power.name);

  await toolbar(page, "jump-to-camp", { length: "standard", camp: "2", stage: "camp" }, /^Jump to camp: done\.$/);
  await expect.poll(() => getScene(page)).toBe("camp");
  const inCamp = await getModel<Kit>(page);
  expect(inCamp.kitBar!.powers[0]!.objectId).toMatch(/^source:/);
  expect(await page.evaluate((id) => id in window.__expeditionTest!.objects(), inCamp.kitBar!.powers[0]!.objectId)).toBe(true);
});
