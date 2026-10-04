import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickUntilChanged } from "./expedition-driver";
import { getModel, getScene } from "./expedition-helpers";
import { autoplay, idle, shortcut, soloTable } from "./expedition-dev-panel";

// Needs the dev servers in dev mode (see dev-mode.spec.ts). Each run length
// jumps to its final camp, the temple, and plays until a plate is pressed;
// one Short temple plays on until the Sun is won on the last plate and
// spends the crew's Skip. With TEMPLE_SCREENSHOT_DIR set, each is captured
// at 1280x720 and 1920x1080.

const SCREENSHOT_DIR = process.env.TEMPLE_SCREENSHOT_DIR;
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

interface Chip { objectiveId: string; objectId: string; kind: string; label: string; status: string; targetable: boolean }
interface Source { sourceKey: string; name: string; charge: string; usable: boolean; reason: string | null; objectId: string }
interface CampModel {
  sceneKey: string;
  topBar: { camp: string };
  boss: unknown;
  helpers: { id: string; name: string; caption: string }[];
  temple: { plates: { plate: string; state: string }[]; pressed: number; count: string; hint: string; status: string } | null;
  seats: { seatId: string; isYou: boolean; objectives: Chip[]; sources: Source[] }[];
  hand: { label: string }[];
  trick: { leaderSeatId: string; plays: unknown[] } | null;
  faceUpObjectives: Chip[];
  sky: { location: string };
  targeting: { canConfirm: boolean } | null;
}

const camp = (page: Page) => getModel<CampModel>(page);
const you = (m: CampModel) => m.seats.find((s) => s.isYou)!;
const skipOf = (m: CampModel) => you(m).sources.find((s) => s.sourceKey === "temple");
const objectives = (m: CampModel) => [...m.faceUpObjectives, ...m.seats.flatMap((s) => s.objectives)];

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

/** Every objective picked, by whoever's turn it is. */
async function pickAll(page: Page, panel: Locator): Promise<void> {
  await autoplay(panel, "everyone", (await camp(page)).faceUpObjectives.length);
  await expect.poll(async () => (await camp(page)).faceUpObjectives.length).toBe(0);
}

/** Plays one autoplay step at a time until `done` holds. A camp that fails
 * first is played again with a fresh deal, its supplies topped up. */
async function stepUntil(page: Page, panel: Locator, done: (m: CampModel) => boolean, maxSteps: number): Promise<CampModel> {
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
    if (done(model)) return model;
    await autoplay(panel, "everyone", 1);
  }
  throw new Error("stepUntil: never got there");
}

/** Puts the Sun in `seatId`'s hand, unless it is there already. */
async function moveSunTo(panel: Locator, seatId: string): Promise<void> {
  await idle(panel);
  const card = panel.getByTestId("dev-field-move-card-card");
  const sun = await card.evaluate((el) => [...(el as HTMLSelectElement).options].find((o) => o.label.startsWith("Sun ("))?.value ?? null);
  if (sun === null) throw new Error("moveSunTo: the Sun is in no hand");
  await card.selectOption(sun);
  await panel.getByTestId("dev-field-move-card-to").selectOption(seatId);
  await panel.getByTestId("dev-shortcut-move-card").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^(Move a card to another hand: done\.|the card is already in)/);
  await idle(panel);
}

const TEMPLES = [
  { length: "short", at: 4, helpers: 0 },
  { length: "standard", at: 6, helpers: 1 },
  { length: "long", at: 8, helpers: 2 },
] as const;

test.describe("the temple", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  for (const temple of TEMPLES) {
    test(`a ${temple.length} run ends at the temple: its path, the Sun, the Skip and ${temple.helpers} returning bosses`, async ({ page }) => {
      test.setTimeout(240_000);
      const panel = await soloTable(page);
      await shortcut(panel, "jump-to-camp", { length: temple.length, camp: String(temple.at), stage: "camp" });
      await expect.poll(async () => (await camp(page)).temple !== null).toBe(true);
      // The desert's mirage may hide the Sun objective itself.
      if ((await camp(page)).sky.location === "desert") await shortcut(panel, "set-spec", { location: "jungle", weather: "fair" });
      const start = await camp(page);
      const plates = start.temple!.plates;
      expect(plates.at(-1)!.plate).toBe("sun");
      expect(plates.length).toBeGreaterThanOrEqual(2);
      expect(start.temple).toMatchObject({ pressed: 0, count: `Plates 0/${plates.length}`, status: "pending" });
      expect(start.temple!.hint).toMatch(/^Next: lead [♠♥♦♣]$/);
      expect(start.boss).toBeNull();
      expect(start.helpers.map((h) => h.name)).toHaveLength(temple.helpers);
      for (const helper of start.helpers) expect(helper.name).toMatch(/ \(half\)$/);
      expect(start.topBar.camp).toBe(`Camp ${temple.at} of ${temple.at}`);
      expect(start.faceUpObjectives.filter((o) => o.kind === "sun")).toMatchObject([{ label: "Sun", status: "pending" }]);
      expect(skipOf(start)).toMatchObject({ name: "Skip", charge: "not earned", usable: false });
      for (const seat of start.seats) expect(seat.sources.map((s) => s.sourceKey)).toContain("temple");

      await pickAll(page, panel);
      const pressed = await stepUntil(page, panel, (m) => (m.temple?.pressed ?? 0) >= 1 && (m.trick?.plays.length ?? 0) === 0, 120);
      expect(pressed.temple!.plates[0]!.state).toBe("pressed");
      expect(objectives(pressed).filter((o) => o.kind === "sun")).toHaveLength(1);
      await capture(page, `temple-${temple.length}`);
    });
  }

  test("winning the Sun on the last plate earns the crew a Skip, which drops an open objective", async ({ page }) => {
    // Random play often fails a camp before its last plate; each failure replays it.
    test.setTimeout(600_000);
    const panel = await soloTable(page, 4);
    await shortcut(panel, "jump-to-camp", { length: "short", camp: "4", stage: "camp" });
    await expect.poll(async () => (await camp(page)).temple !== null).toBe(true);
    await pickAll(page, panel);
    let won: CampModel | null = null;
    for (let tries = 0; tries < 30 && won === null; tries++) {
      const before = await stepUntil(page, panel, (m) => m.temple!.status === "pending" && m.temple!.pressed === m.temple!.plates.length - 1 && (m.trick?.plays.length ?? 0) === 0, 400);
      const leader = before.trick!.leaderSeatId;
      const sun = objectives(before).find((o) => o.kind === "sun")!;
      await moveSunTo(panel, leader);
      await shortcut(panel, "set-objective-owner", { objective: sun.objectiveId, seat: leader });
      await autoplay(panel, "everyone", 1);
      let after = await camp(page);
      for (let play = 0; play < 8 && after.sceneKey === "camp" && (after.trick?.plays.length ?? 0) > 0; play++) {
        await autoplay(panel, "everyone", 1);
        after = await camp(page);
      }
      if (after.sceneKey === "camp" && after.temple?.status === "done" && skipOf(after)?.charge === "1 left") won = after;
    }
    expect(won, "the Sun was won on the last plate with the camp still open").not.toBeNull();
    expect(won!.temple).toMatchObject({ hint: "Every plate pressed", status: "done" });
    expect(skipOf(won!)).toMatchObject({ name: "Skip", charge: "1 left", usable: true });
    await capture(page, "temple-skip-earned");

    await idle(panel);
    await page.getByTestId("dev-toggle").click();
    const open = objectives(won!).filter((o) => o.status !== "done" && o.kind !== "sun");
    let model = await clickUntilChanged<CampModel>(page, skipOf(won!)!.objectId, (m) => m.targeting !== null);
    const target = objectives(model).find((o) => o.targetable)!;
    expect(open.map((o) => o.objectiveId)).toContain(target.objectiveId);
    model = await clickUntilChanged<CampModel>(page, target.objectId, (m) => m.targeting?.canConfirm === true);
    await capture(page, "temple-skip-targeting");
    model = await clickUntilChanged<CampModel>(page, "confirm", (m) => m.sceneKey !== "camp" || !objectives(m).some((o) => o.objectiveId === target.objectiveId));
    // Dropping the last open objective clears the camp; otherwise the token shows spent on every seat.
    if (model.sceneKey === "camp") {
      expect(skipOf(model)).toMatchObject({ charge: "used", usable: false });
      for (const seat of model.seats) expect(seat.sources.find((s) => s.sourceKey === "temple")?.charge).toBe("used");
    } else {
      expect(await getScene(page)).toBe("trail");
    }
  });
});
