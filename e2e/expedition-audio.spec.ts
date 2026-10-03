import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  clickHandCard,
  clickUntilChanged,
  draftOffer,
  isReady,
  pickDraftOffer,
  waitForScene,
  type FiresideView,
} from "./expedition-driver";
import { getModel, getScene, startExpeditionGame, waitForBridge } from "./expedition-helpers";

interface CampView {
  sceneKey: string;
  seats: { isYou: boolean; mayAct: boolean }[];
  hand?: { id: string; objectId: string; playable: boolean }[];
  faceUpObjectives: { objectId: string; objectiveId: string; pickable: boolean }[];
}

async function cues(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__expeditionTest as unknown as { cues(): string[] }).cues());
}

async function pickAndReady(page: Page): Promise<void> {
  await waitForScene(page, "fireside");
  const model = await getModel<FiresideView>(page);
  const offer = draftOffer(model);
  if (offer !== null) {
    await clickUntilChanged<FiresideView>(page, pickDraftOffer(offer).objectId, (m) => draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });
  }
  if ((await getScene(page)) === "fireside") {
    await clickUntilChanged<FiresideView>(page, "ready", (m) => isReady(m) || m.sceneKey === "camp", { perAttemptTimeoutMs: 15_000 });
  }
}

test("state changes ask for sounds, and a refresh mid-game asks for none", async ({ browser, page }) => {
  test.setTimeout(180_000);
  const { pages, contexts } = await startExpeditionGame(browser, page, ["Ada", "Bo", "Cy"]);
  try {
    const host = pages[0]!;
    expect(await cues(host)).toEqual([]);

    for (const p of pages) await pickAndReady(p);
    expect(await cues(host)).toContain("sfx-equip");
    for (const p of pages) await waitForScene(p, "camp");
    await expect.poll(() => cues(host)).toContain("sfx-card-deal");

    for (let pass = 0; pass < 200 && !(await cues(host)).includes("sfx-card-play"); pass++) {
      for (const p of pages) {
        const m = await getModel<CampView>(p);
        if (m.sceneKey !== "camp") continue;
        const objective = m.seats.find((s) => s.isYou)?.mayAct ? m.faceUpObjectives.find((o) => o.pickable) : undefined;
        if (objective) {
          await clickUntilChanged<CampView>(p, objective.objectId, (v) => !(v.faceUpObjectives.find((o) => o.objectiveId === objective.objectiveId)?.pickable ?? false));
          continue;
        }
        const card = m.hand?.find((c) => c.playable);
        if (card) {
          await clickHandCard<CampView>(p, card.objectId, (v) => v.sceneKey !== "camp" || !(v.hand ?? []).some((c) => c.id === card.id));
        }
      }
    }
    expect(await cues(host)).toContain("sfx-card-play");

    await host.reload();
    await waitForBridge(host);
    expect(await cues(host)).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("rules modal shows the audio credits and M mutes", async ({ browser, page }) => {
  const { contexts } = await startExpeditionGame(browser, page, ["Ada", "Bo", "Cy"]);
  try {
    await page.getByTestId("expedition-rules-button").click();
    const credits = page.getByTestId("expedition-audio-credits");
    await expect(credits).toContainText("Nature Ambient Pack Vol 1");
    await expect(credits).toContainText("JC Sounds");
    await expect(credits).toContainText("CC BY 4.0");
    await page.keyboard.press("Escape");

    await page.getByTestId("expedition-settings-button").click();
    const mute = page.getByTestId("expedition-mute-toggle");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("m");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("expedition-audio") ?? "{}").muted)).toBe(true);
    await page.keyboard.press("m");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
