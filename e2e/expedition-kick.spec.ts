import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { getModel, startExpeditionGame, waitForBridge } from "./expedition-helpers";
import { shortcut } from "./expedition-dev-panel";
import { trailToCamp, waitForScene, walkTrail } from "./expedition-driver";

// A real fourth browser drops out of a camp (its context closes), the other
// three vote it out, the camp restarts without it, and the same browser
// profile comes back with its seat token and rejoins at the next loadout.
// Needs the worker in dev mode (the host jumps and forces camps).

const SHOTS = process.env.KICK_SCREENSHOT_DIR;

type Seat = { displayLabel: string; characterId?: string | null; character?: string | null; isYou?: boolean };

async function shoot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png` });
  }
  if (size !== null) await page.setViewportSize(size);
}

async function seatsOf(page: Page): Promise<Seat[]> {
  const model = await getModel<{ seats?: Seat[]; crew?: Seat[] }>(page);
  return model.seats ?? model.crew ?? [];
}

test("a dropped player is voted out, the camp restarts without them, and they rejoin at the next loadout", async ({ browser, page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const { code, pages, contexts } = await startExpeditionGame(browser, page, ["Ana", "Ben", "Cy", "Dee"]);
  const [ana, ben, cy] = pages as [Page, Page, Page, Page];
  const deeContext = contexts[2]!;

  await ana.getByTestId("dev-toggle").click();
  const panel = ana.getByTestId("dev-panel");
  await shortcut(panel, "jump-to-camp", { camp: "2", stage: "camp" });
  await ana.getByTestId("dev-toggle").click();
  await waitForScene(ana, "camp");
  const deeCharacter = (await seatsOf(ana)).find((s) => s.displayLabel === "Dee")?.characterId;
  expect(deeCharacter).toBeTruthy();

  const deeProfile = await deeContext.storageState();
  await deeContext.close();

  const kick = ana.getByTestId("kick-panel");
  const anaVote = kick.locator('[data-testid^="kick-vote-"]');
  await expect(anaVote).toContainText("Kick Dee?", { timeout: 15_000 });
  await expect(kick.locator('[data-testid^="kick-tally-"]')).toHaveText("0/2");
  await shoot(ana, "kick-offered");
  await kick.locator('[data-testid^="kick-info-"]').click();
  await expect(kick.locator('[data-testid^="kick-details-"]')).toHaveText(
    "Dee is disconnected0 of 2 votes to kick. Kicking restarts camp 2 without them, at no cost. If they come back, they rejoin at the next loadout.",
  );
  await shoot(ana, "kick-details");
  await kick.locator('[data-testid^="kick-info-"]').click();

  await anaVote.click();
  await expect(anaVote).toContainText("Undo kick Dee");
  const benKick = ben.getByTestId("kick-panel");
  await expect(benKick.locator('[data-testid^="kick-tally-"]')).toHaveText("1/2");
  await expect(benKick.locator('[data-testid^="kick-vote-"]')).toContainText("Kick Dee?");
  await shoot(ben, "kick-one-vote");

  await benKick.locator('[data-testid^="kick-vote-"]').click();
  await expect(kick).toHaveCount(0);
  for (const p of [ana, ben, cy]) await waitForScene(p, "trail");
  await expect.poll(async () => (await getModel<{ prompt?: { text: string } }>(ana)).prompt?.text).toBe("Camp 2 restarts without Dee. Set out");
  expect((await seatsOf(ana)).map((s) => s.displayLabel)).toEqual(["Ana", "Ben", "Cy"]);
  await shoot(ana, "kick-restarted");

  await trailToCamp([ana, ben, cy]);
  await waitForScene(ana, "camp");
  expect((await seatsOf(ana)).map((s) => s.displayLabel).sort()).toEqual(["Ana", "Ben", "Cy"]);

  const deeAgain = await browser.newContext({ storageState: deeProfile });
  const dee = await deeAgain.newPage();
  await dee.setViewportSize({ width: 1280, height: 720 });
  await dee.goto(`/room/${code}`);
  await waitForBridge(dee);
  await expect(dee.getByTestId("kick-yours-title")).toHaveText("You're out of the crew for now");
  await expect(dee.getByTestId("kick-yours")).toContainText("with your items and upgrade, at the next loadout, once camp 2 ends.");
  await expect(ana.getByTestId("kick-returning")).toHaveText("Dee is back and rejoins at the next loadout.");
  await shoot(dee, "kick-waiting");
  await shoot(ana, "kick-crew-sees-return");

  await ana.getByTestId("dev-toggle").click();
  await shortcut(panel, "force-camp", { outcome: "cleared" });
  await ana.getByTestId("dev-toggle").click();
  await waitForScene(dee, "trail");
  await expect(dee.getByTestId("kick-yours")).toContainText("with your items and upgrade, at the loadout before camp 3.");
  await shoot(dee, "kick-waiting-draft");

  for (let round = 0; round < 4; round++) for (const p of [ana, ben, cy]) await walkTrail(p);
  await expect(dee.getByTestId("kick-yours-panel")).toHaveCount(0);
  await expect.poll(async () => (await seatsOf(dee)).find((s) => s.isYou)?.displayLabel).toBe("Dee");
  await expect.poll(async () => (await seatsOf(ana)).map((s) => s.displayLabel)).toEqual(["Ana", "Ben", "Cy", "Dee"]);
  const rejoined = (await seatsOf(ana)).find((s) => s.displayLabel === "Dee")?.character;
  expect(rejoined?.toLowerCase().replace(/^the /, "").replace(/[^a-z]/g, "")).toBe(String(deeCharacter).replace(/[^a-z]/g, ""));
  await expect.poll(async () => (await getModel<{ prompt?: { text: string } }>(ana)).prompt?.text).toBe("Waiting for Dee");
  await shoot(dee, "kick-rejoined");

  await walkTrail(dee);
  await waitForScene(dee, "camp");
  expect((await seatsOf(dee)).map((s) => s.displayLabel).sort()).toEqual(["Ana", "Ben", "Cy", "Dee"]);

  await deeAgain.close();
});
