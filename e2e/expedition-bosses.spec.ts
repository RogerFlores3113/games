import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickHandCard, clickUntilChanged } from "./expedition-driver";
import { getModel, getScene } from "./expedition-helpers";
import { autoplay, shortcut, soloTable } from "./expedition-dev-panel";

// Needs the dev servers in dev mode (see dev-mode.spec.ts). Each animal boss
// is set on camp 3, and each disaster on camp 6 of a Long run, with the dev
// panel, played into the state that shows it, and captured at 1280x720 and
// 1920x1080 when BOSS_SCREENSHOT_DIR is set (a disaster also mid-animation).

const SCREENSHOT_DIR = process.env.BOSS_SCREENSHOT_DIR;
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

interface BossModel { id: string; caption: string; rule: string; facingSeatId: string | null }
interface Seat { seatId: string; objectId: string; isYou: boolean; targetable?: boolean; bossMark: { label: string; alert: boolean } | null }
interface Happening { key: string; kind: string; text: string; cards: string[] }
interface CampModel {
  sceneKey: string;
  boss: BossModel | null;
  mods: { id: string; badge: string | null; gauge: { left: number; of: number } | null }[];
  sky: { bloodMoon: boolean; flood: number | null };
  happenings: Happening[];
  gust: { cards: { label: string }[]; toSeatId: string } | null;
  gustSent: { card: string; toName: string }[];
  lastTrick: { burn: string; plays: { burned: boolean; card: { label: string } }[] } | null;
  trick: { plays: { countsAs?: unknown }[] } | null;
  seats: Seat[];
  hand: { objectId: string; playable: boolean; targetable?: boolean; blockedReason: string | null; label: string; countsAs: { suit?: string } | null }[];
  faceUpObjectives: unknown[];
  whisper: { visible: boolean; active: boolean };
  targeting: { canConfirm: boolean } | null;
}

/** Camp 6 of a Long run, the disaster camp, dealt under `boss`. */
async function disasterCamp(panel: Locator, boss: string): Promise<void> {
  await shortcut(panel, "jump-to-camp", { length: "long", camp: "6", stage: "camp" });
  await shortcut(panel, "set-plan-boss", { camp: "6", boss });
}

/** Plays one autoplay step at a time until `done` holds, then shows the
 * table without the dev panel for a moment, so the animation it set off is
 * captured mid-flight. A camp that fails first is played again with a
 * fresh deal, its supplies topped up so the run goes on. */
async function stepUntil(page: Page, panel: Locator, name: string, done: (m: CampModel) => boolean, maxSteps = 80): Promise<CampModel> {
  for (let step = 0; step < maxSteps; step++) {
    const model = await camp(page);
    if (model.sceneKey !== "camp") {
      await shortcut(panel, "set-supplies", { supplies: "4" });
      await autoplay(panel, "everyone", 3);
      continue;
    }
    if (model.faceUpObjectives.length > 0) {
      await pickAll(page, panel);
      continue;
    }
    if (done(model)) {
      if (SCREENSHOT_DIR) {
        await page.getByTestId("dev-toggle").click();
        await page.mouse.move(2, 2);
        await page.waitForTimeout(120);
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-fx-1280x720.png` });
        await page.getByTestId("dev-toggle").click();
      }
      return model;
    }
    await autoplay(panel, "everyone", 1);
  }
  throw new Error(`stepUntil: ${name} never got there`);
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

test.describe("disaster bosses on the table", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("a tornado gust sends three of your cards to the teammate on your right", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "tornado");
    await pickAll(page, panel);
    expect((await camp(page)).boss?.caption).toBe("Gust in 3");
    const model = await stepUntil(page, panel, "tornado", (m) => m.gust !== null);
    expect(model.gust!.cards).toHaveLength(3);
    expect(model.gustSent.map((c) => c.card)).toEqual(model.gust!.cards.map((c) => c.label));
    expect(model.happenings.at(-1)!.text).toMatch(/^A gust sent your \S+ \S+ \S+ to Bot 2$/);
    await capture(page, "tornado");
  });

  test("the earthquake shakes the open objectives to new owners halfway through", async ({ page }) => {
    // Random play often fails a camp before its halfway trick, and each failure replays it.
    test.setTimeout(600_000);
    const panel = await soloTable(page);
    await disasterCamp(panel, "earthquake");
    await pickAll(page, panel);
    expect((await camp(page)).boss?.caption).toMatch(/^Quake in \d+$/);
    const model = await stepUntil(page, panel, "earthquake", (m) => m.happenings.some((h) => h.kind === "quake"), 800);
    expect(model.boss?.caption).toBe("Settled");
    await capture(page, "earthquake");
  });

  test("the wildfire burns the lowest card of a trick", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "wildfire");
    await pickAll(page, panel);
    const model = await stepUntil(page, panel, "wildfire", (m) => m.lastTrick !== null);
    expect(model.lastTrick!.burn).toBe("burn");
    expect(model.lastTrick!.plays.filter((p) => p.burned)).toHaveLength(1);
    await capture(page, "wildfire");
  });

  test("the meteor vaporizes the card that would have won", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "meteor");
    await pickAll(page, panel);
    const model = await stepUntil(page, panel, "meteor", (m) => m.lastTrick !== null);
    expect(model.lastTrick!.burn).toBe("vaporize");
    expect(model.lastTrick!.plays.filter((p) => p.burned)).toHaveLength(1);
    await capture(page, "meteor");
  });

  test("the blood moon turns spades and clubs on its tricks, and the sky red", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "blood-moon");
    await pickAll(page, panel);
    expect((await camp(page)).boss?.caption).toBe("Moon sets");
    const model = await stepUntil(page, panel, "blood-moon", (m) => m.sky.bloodMoon && m.hand.some((c) => c.countsAs !== null) && (m.trick?.plays.length ?? 0) > 0);
    expect(model.boss?.caption).toBe("Moon rises");
    for (const card of model.hand.filter((c) => c.countsAs !== null)) {
      expect([card.label.at(-1), card.countsAs!.suit]).toEqual(card.label.endsWith("♠") ? ["♠", "diamonds"] : ["♣", "hearts"]);
    }
    await capture(page, "blood-moon");
  });

  test("the locusts eat an item, and say so", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "locusts");
    await shortcut(panel, "give-item", { item: "rope-ladder" });
    await pickAll(page, panel);
    expect((await camp(page)).boss?.caption).toBe("Eats yours");
    const model = await stepUntil(page, panel, "locusts", (m) => m.happenings.length > 0);
    expect(model.happenings[0]!.text).toBe("Locusts ate your Rope Ladder");
    await capture(page, "locusts");
    const meal = await stepUntil(page, panel, "locusts-cards", (m) => m.happenings.some((h) => h.kind === "ate-cards"));
    expect(meal.happenings.find((h) => h.kind === "ate-cards")!.cards).toHaveLength(3);
    await capture(page, "locusts-cards");
  });

  test("the monsoon's river rises toward the flood", async ({ page }) => {
    const panel = await soloTable(page);
    await disasterCamp(panel, "monsoon");
    await pickAll(page, panel);
    const start = await camp(page);
    const river = start.mods.find((m) => m.id === "monsoon")!;
    expect(river.badge).toBe(`${river.gauge!.of} left`);
    const model = await stepUntil(page, panel, "monsoon", (m) => (m.sky.flood ?? 0) >= 0.25, 60);
    expect(model.boss?.caption).toMatch(/^River: \d+ left$/);
    await capture(page, "monsoon");
  });
});
