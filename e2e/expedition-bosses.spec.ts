import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickHandCard, clickUntilChanged } from "./expedition-driver";
import { createExpeditionRoom, getModel, getScene, waitForBridge } from "./expedition-helpers";

// Needs the dev servers in dev mode (see dev-mode.spec.ts). Each animal boss
// is set on camp 3 with the dev panel, played into the state that shows its
// marks, and captured at 1280x720 and 1920x1080 when BOSS_SCREENSHOT_DIR is set.

const SCREENSHOT_DIR = process.env.BOSS_SCREENSHOT_DIR;
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

interface BossModel { id: string; caption: string; rule: string; facingSeatId: string | null }
interface Seat { seatId: string; objectId: string; isYou: boolean; targetable?: boolean; bossMark: { label: string; alert: boolean } | null }
interface CampModel {
  sceneKey: string;
  boss: BossModel | null;
  seats: Seat[];
  hand: { objectId: string; playable: boolean; targetable?: boolean; blockedReason: string | null; label: string }[];
  faceUpObjectives: unknown[];
  whisper: { visible: boolean; active: boolean };
  targeting: { canConfirm: boolean } | null;
}

async function soloTable(page: Page): Promise<Locator> {
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  for (const n of [1, 2]) {
    await panel.getByTestId("dev-add-bot").click();
    await expect(panel.getByTestId("dev-result")).toHaveText(new RegExp(`^Bot ${n} joined\\.`));
  }
  await page.getByTestId("start-game").click();
  await waitForBridge(page);
  return panel;
}

const LABELS: Readonly<Record<string, string>> = {
  "jump-to-camp": "Jump to camp",
  "set-plan-boss": "Set a boss camp's boss",
  "force-camp": "Force the camp's outcome",
  "set-supplies": "Set supplies",
};

/** Runs a dev shortcut and waits for its own answer and for the panel to
 * take input again. */
async function shortcut(panel: Locator, id: string, fields: Record<string, string> = {}): Promise<void> {
  await idle(panel);
  for (const [name, value] of Object.entries(fields)) {
    const field = panel.getByTestId(`dev-field-${id}-${name}`);
    if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
    else await field.fill(value);
  }
  await panel.getByTestId(`dev-shortcut-${id}`).click();
  await expect(panel.getByTestId("dev-result")).toHaveText(new RegExp(`^${LABELS[id]}: done\\.`));
  await idle(panel);
}

async function idle(panel: Locator): Promise<void> {
  await expect(panel.getByTestId("dev-autoplay-run")).toBeEnabled();
}

async function autoplay(panel: Locator, scope: "everyone" | "others", steps: number): Promise<void> {
  await panel.getByTestId("dev-autoplay-scope").selectOption(scope);
  // "My decision" would stop an everyone-scope run before its first step.
  await panel.getByTestId("dev-autoplay-stop").selectOption(scope === "everyone" ? "milestone" : "decision");
  await panel.getByTestId("dev-autoplay-steps").fill(String(steps));
  await panel.getByTestId("dev-autoplay-run").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Autoplay: /);
  await idle(panel);
}

/** Camp 3 dealt under `boss`. */
async function bossCamp(panel: Locator, boss: string): Promise<void> {
  await shortcut(panel, "jump-to-camp", { camp: "3", stage: "camp" });
  await shortcut(panel, "set-plan-boss", { camp: "3", boss });
}

/** Every objective picked, by whoever's turn it is. */
async function pickAll(page: Page, panel: Locator): Promise<void> {
  const objectives = (await getModel<CampModel>(page)).faceUpObjectives.length;
  await autoplay(panel, "everyone", objectives);
  await expect.poll(async () => (await camp(page)).faceUpObjectives.length).toBe(0);
}

async function capture(page: Page, name: string): Promise<void> {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.getByTestId("dev-toggle").click();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.mouse.move(2, 2);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${size.name}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId("dev-toggle").click();
}

const camp = (page: Page) => getModel<CampModel>(page);

test.describe("animal bosses on the table", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("the crocodile watches one seat, marks it, and the camp plays to its settle", async ({ page }) => {
    const panel = await soloTable(page);
    await bossCamp(panel, "crocodile");
    await pickAll(page, panel);
    const model = await camp(page);
    expect(model.boss?.id).toBe("crocodile");
    const facing = model.boss!.facingSeatId!;
    const watched = model.seats.find((s) => s.seatId === facing)!;
    expect(watched.bossMark).toEqual({ label: "watched", alert: true });
    expect(model.boss!.rule).toMatch(/^Crocodile: if .+ wins? this trick, the camp is lost$/);
    expect(model.seats.filter((s) => s.bossMark !== null)).toHaveLength(1);
    await capture(page, "crocodile");

    await panel.getByTestId("dev-autoplay-scope").selectOption("everyone");
    await panel.getByTestId("dev-autoplay-stop").selectOption("milestone");
    await panel.getByTestId("dev-autoplay-steps").fill("400");
    await panel.getByTestId("dev-autoplay-run").click();
    await expect(panel.getByTestId("dev-result")).toHaveText(/^Autoplay: \d+ steps, stopped because/, { timeout: 60_000 });
    await expect.poll(() => getScene(page), { timeout: 20_000 }).toBe("trail");
  });

  test("the tiger marks a streak and pounces on two in a row", async ({ page }) => {
    test.setTimeout(240_000);
    const panel = await soloTable(page);
    let pounce: CampModel | null = null;
    await bossCamp(panel, "tiger");
    // Each failed camp is replayed with a fresh deal; supplies are topped up so the run goes on.
    for (let tries = 0; tries < 25 && pounce === null; tries++) {
      if ((await getScene(page)) !== "camp") {
        await shortcut(panel, "set-supplies", { supplies: "4" });
        await autoplay(panel, "everyone", 3);
        await expect.poll(() => getScene(page)).toBe("camp");
      }
      await pickAll(page, panel);
      for (let trick = 0; trick < 20 && pounce === null; trick++) {
        const model = await camp(page);
        if (model.sceneKey !== "camp" || model.boss === null) break;
        if (model.boss.caption.startsWith("Pounce")) pounce = model;
        // A trick at a time: a streak holds for the whole trick after the win that made it.
        else {
          await autoplay(panel, "everyone", 3);
          await page.waitForTimeout(250);
        }
      }
    }
    expect(pounce, "a seat won two tricks in a row").not.toBeNull();
    const marked = pounce!.seats.find((s) => s.bossMark !== null)!;
    expect(marked.bossMark!.alert).toBe(true);
    expect(marked.bossMark!.label).toMatch(/^streak [2-9]$/);
    await capture(page, "tiger");
  });

  test("the snake bites the seat that whispers", async ({ page }) => {
    const panel = await soloTable(page);
    await bossCamp(panel, "snake");
    await pickAll(page, panel);
    await page.waitForFunction(() => window.__expeditionTest?.positionOf("whisper") != null);
    await page.getByTestId("dev-toggle").click();
    let model = await clickUntilChanged<CampModel>(page, "whisper", (m) => m.whisper.active);
    const card = model.hand.find((c) => c.targetable)!;
    model = await clickHandCard<CampModel>(page, card.objectId, (m) => m.seats.some((s) => s.targetable));
    await clickUntilChanged<CampModel>(page, model.seats.find((s) => s.targetable)!.objectId, (m) => m.targeting?.canConfirm === true);
    model = await clickUntilChanged<CampModel>(page, "confirm", (m) => m.seats.find((s) => s.isYou)?.bossMark !== null);
    expect(model.seats.find((s) => s.isYou)!.bossMark).toEqual({ label: "bitten 2", alert: true });
    expect(model.boss!.rule).toBe("Snake: objectives you win this trick or next fail");
    await page.getByTestId("dev-toggle").click();
    await capture(page, "snake");
  });

  test("the beaver dams a suit out of your hand on your turn", async ({ page }) => {
    const panel = await soloTable(page);
    await bossCamp(panel, "beaver");
    await pickAll(page, panel);
    await autoplay(panel, "others", 20);
    await expect.poll(async () => (await camp(page)).hand.some((c) => c.playable)).toBe(true);
    const model = await camp(page);
    expect(model.boss!.caption).toMatch(/^Dam: . (spades|hearts|diamonds|clubs)$/);
    expect(model.boss!.rule).toMatch(/^Beaver dams .: play another suit if you can$/);
    await capture(page, "beaver");
  });

  test("the rats leave one item slot in the loadout", async ({ page }) => {
    const panel = await soloTable(page);
    await shortcut(panel, "jump-to-camp", { camp: "3", stage: "loadout" });
    await shortcut(panel, "set-plan-boss", { camp: "3", boss: "rats" });
    await capture(page, "rats-loadout");
    await panel.getByTestId("dev-autoplay-scope").selectOption("everyone");
    await autoplay(panel, "everyone", 3);
    await expect.poll(() => getScene(page)).toBe("camp");
    expect((await camp(page)).boss?.caption).toBe("-1 item slot");
    await capture(page, "rats");
  });

  test("the capybara brings two extra objectives", async ({ page }) => {
    const panel = await soloTable(page);
    await bossCamp(panel, "capybara");
    const model = await camp(page);
    expect(model.boss?.caption).toBe("+2 objectives");
    expect(model.faceUpObjectives).toHaveLength(5);
    await capture(page, "capybara");
  });

  test("the route vote into camp 3 shows the boss's portrait", async ({ page }) => {
    const panel = await soloTable(page);
    await shortcut(panel, "jump-to-camp", { camp: "2", stage: "camp" });
    await shortcut(panel, "set-plan-boss", { camp: "3", boss: "tiger" });
    await shortcut(panel, "force-camp", { outcome: "cleared" });
    await autoplay(panel, "everyone", 3);
    await expect.poll(async () => (await getModel<{ panel?: { kind: string } }>(page)).panel?.kind).toBe("route");
    const options = (await getModel<{ panel: { options: { next: { bossId: string | null; bossName: string | null } }[] } }>(page)).panel.options;
    expect(options.map((o) => [o.next.bossId, o.next.bossName])).toEqual(options.map(() => ["tiger", "Tiger"]));
    await capture(page, "route-tiger");
  });
});
