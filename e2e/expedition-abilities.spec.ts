import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickHandCard, clickUntilChanged, draftOffer, isReady, pickDraftOffer, waitForScene, type FiresideView, type MusterCard } from "./expedition-driver";
import { getModel, getScene, startExpeditionGame } from "./expedition-helpers";
import { PICKER_SCENARIOS, rewriteViews, type Game } from "./expedition-scenarios";

/**
 * Characters, drafts and abilities through the real canvas: the muster, a
 * draft pick, one use of every target kind's picker, and a real rescue
 * after which play goes on. Pickers and the draft run on rewritten views
 * (see expedition-scenarios.ts) and assert the request the click sent; the
 * muster and the rescue are played for real.
 */

interface Chip { objectId: string; objectiveId: string; status: string; targetable: boolean }
interface Seat { seatId: string; objectId: string; isYou: boolean; handObjectId: string; targetable: boolean; objectives: Chip[]; mayAct: boolean }
interface CampModel {
  sceneKey: string;
  youSeatId: string;
  seats: Seat[];
  hand: { id: string; objectId: string; label: string; playable: boolean; targetable: boolean }[];
  trick: { plays: { seatId: string; card: { id: string; objectId: string; targetable: boolean } }[] } | null;
  faceUpObjectives: Chip[];
  banner: { window: string; youPending: boolean; title: string; detail: string } | null;
  tray: { options: { choiceId: string; objectId: string }[] } | null;
  targeting: { canConfirm: boolean } | null;
  prompt: { text: string };
}

async function musterPick(page: Page, characterId: string): Promise<void> {
  await waitForScene(page, "fireside");
  await clickUntilChanged<FiresideView>(page, `draft:${characterId}`, (m) => draftOffer(m) === null);
}

async function readyAll(pages: Page[]): Promise<void> {
  for (const p of pages) {
    if ((await getScene(p)) === "camp") continue;
    await clickUntilChanged<FiresideView>(p, "ready", (m) => isReady(m) || m.sceneKey === "camp", { perAttemptTimeoutMs: 15_000 });
  }
  for (const p of pages) await waitForScene(p, "camp");
}

async function sentRequests(sent: { request?: unknown }[]): Promise<unknown[]> {
  return sent.map((m) => m.request);
}

/** Plays camps from every page until the host is asked to rescue. A cleared
 * camp drafts and plays on; a failed camp that never asked fails the test.
 * False only when the run ends first. */
async function playUntilRescue(host: Page, pages: Page[]): Promise<boolean> {
  for (let step = 0; step < 600; step++) {
    const model = await getModel<CampModel>(host);
    if (model.sceneKey !== "camp") {
      if (model.sceneKey !== "fireside") return false;
      const fm = await getModel<FiresideView>(host);
      expect(fm.lastResult?.status, "a failed camp always asks the Medic first").toBe("succeeded");
      for (const p of pages) {
        const offer = draftOffer(await getModel<FiresideView>(p));
        if (offer) await clickUntilChanged<FiresideView>(p, pickDraftOffer(offer).objectId, (m) => draftOffer(m) === null);
      }
      await readyAll(pages);
      continue;
    }
    if (model.banner?.window === "rescue") {
      if (model.banner.youPending) return true;
      for (const p of pages.slice(1)) expect((await getModel<CampModel>(p)).banner?.detail).toMatch(/Waiting on Roger/);
    }
    for (const p of pages) {
      const m = await getModel<CampModel>(p);
      if (m.sceneKey !== "camp" || m.banner !== null) continue;
      const pickable = m.faceUpObjectives.find((o) => (o as unknown as { pickable: boolean }).pickable);
      if (pickable) {
        await clickUntilChanged<CampModel>(p, pickable.objectId, (mm) => !mm.faceUpObjectives.some((o) => o.objectiveId === pickable.objectiveId && (o as unknown as { pickable: boolean }).pickable));
        continue;
      }
      const card = m.hand.find((c) => c.playable);
      if (card === undefined) continue;
      await clickHandCard<CampModel>(p, card.objectId, (mm) => mm.sceneKey !== "camp" || !mm.hand.some((c) => c.id === card.id)).catch(() => undefined);
    }
  }
  return false;
}

test.describe("Expedition characters and abilities", () => {
  test("muster: each picks an explorer, taken ones show who took them", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
    try {
      await musterPick(pages[0]!, "medic");
      await expect
        .poll(async () => ((await getModel<FiresideView>(pages[1]!)).muster ?? []).find((c) => c.characterId === "medic")?.takenBy)
        .toBe("Roger");
      const own = (await getModel<FiresideView>(pages[0]!)).muster!.find((c: MusterCard) => c.characterId === "medic")!;
      expect(own).toMatchObject({ yours: true, takenBy: "You", pickable: false });
      await musterPick(pages[1]!, "scout");
      await musterPick(pages[2]!, "botanist");
      await readyAll(pages);
      expect(await getScene(pages[0]!)).toBe("camp");
    } finally {
      for (const c of contexts) await c.close();
    }
  });

  test("a draft pick and one use of every picker send the request they name", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
    try {
      for (const [i, id] of ["guide", "scout", "botanist"].entries()) await musterPick(pages[i]!, id);
      await readyAll(pages);
      const rw = await rewriteViews(page);

      rw.current = (g: Game) => ({ ...g, runPhase: "fireside", attempt: null, yourDraftOffer: ["guide.pathfinder", "bait", "parrot"], history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }] });
      await page.reload();
      await waitForScene(page, "fireside");
      const offer = draftOffer(await getModel<FiresideView>(page))!;
      expect(offer.map((o) => o.sourceId)).toEqual(["guide.pathfinder", "bait", "parrot"]);
      rw.sent.length = 0;
      await clickUntilChanged(page, "draft:bait", () => rw.sent.length > 0);
      expect(await sentRequests(rw.sent)).toEqual([{ type: "pick-draft", sourceId: "bait" }]);

      const use = async (kind: string, pick: (m: CampModel) => Promise<string[]>): Promise<void> => {
        const scenario = PICKER_SCENARIOS[kind]!;
        rw.current = scenario.rewrite;
        await page.reload();
        await waitForScene(page, "camp");
        let model = await getModel<CampModel>(page);
        if (kind === "failed-objective") {
          expect(model.banner).toMatchObject({ window: "rescue", youPending: true });
          model = await clickUntilChanged<CampModel>(page, `predeal-use:${scenario.sourceId}`, (m) => m.targeting !== null);
        } else {
          model = await clickUntilChanged<CampModel>(page, `source:${scenario.sourceId}`, (m) => m.targeting !== null);
        }
        const targets = await pick(model);
        await expect.poll(async () => (await getModel<CampModel>(page)).targeting?.canConfirm, { message: kind }).toBe(true);
        const ask = (await getModel<CampModel>(page)).prompt.text;
        expect(ask, `${kind} confirm line`).toMatch(/^Use /);
        rw.sent.length = 0;
        await clickUntilChanged(page, "confirm", () => rw.sent.length > 0);
        expect(await sentRequests(rw.sent), kind).toEqual([{ type: "use-ability", sourceId: scenario.sourceId, targets }]);
      };
      const click = async (objectId: string): Promise<CampModel> => {
        const before = JSON.stringify((await getModel<CampModel>(page)).targeting);
        return clickUntilChanged<CampModel>(page, objectId, (m) => JSON.stringify(m.targeting) !== before);
      };
      const you = (m: CampModel) => m.seats.find((s) => s.isYou)!;
      const mate = (m: CampModel) => m.seats.find((s) => !s.isYou)!;

      rw.current = PICKER_SCENARIOS.hand!.rewrite;
      await page.reload();
      await waitForScene(page, "camp");
      await clickUntilChanged<CampModel>(page, "source:scout", (m) => m.targeting !== null);
      await page.keyboard.press("Escape");
      await expect.poll(async () => (await getModel<CampModel>(page)).targeting, { message: "Esc cancels" }).toBeNull();
      await clickUntilChanged<CampModel>(page, "source:scout", (m) => m.targeting !== null);
      const stumpPoint = (await page.evaluate(() => window.__expeditionTest?.pagePoint({ x: 320, y: 120 }) ?? null))!;
      await page.mouse.click(stumpPoint.x, stumpPoint.y, { button: "right" });
      await expect.poll(async () => (await getModel<CampModel>(page)).targeting, { message: "right-click cancels" }).toBeNull();

      await use("self", async (m) => [`seat:${m.youSeatId}`]);
      await use("player", async (m) => {
        await click(mate(m).objectId);
        return [`seat:${mate(m).seatId}`];
      });
      await use("hand", async (m) => {
        await click(mate(m).handObjectId);
        return [`hand:${mate(m).seatId}`];
      });
      await use("card", async (m) => {
        const play = m.trick!.plays.find((p) => p.card.targetable)!;
        await click(play.card.objectId);
        return [`card:${play.card.id}`];
      });
      await use("objective", async (m) => {
        const o = m.faceUpObjectives.find((x) => x.targetable)!;
        await click(o.objectId);
        return [`objective:${o.objectiveId}`];
      });
      await use("completed-objective", async (m) => {
        const o = you(m).objectives.find((x) => x.targetable)!;
        await click(o.objectId);
        return [`objective:${o.objectiveId}`];
      });
      await use("failed-objective", async (m) => {
        const o = you(m).objectives.find((x) => x.targetable)!;
        await click(o.objectId);
        return [`objective:${o.objectiveId}`];
      });
      await use("whisper", async () => {
        await click("pick:whisper:0");
        return ["whisper:0"];
      });
      await use("won-trick", async (m) => {
        await click("pick:trick:1");
        await click(mate(m).objectId);
        return ["trick:1", `seat:${mate(m).seatId}`];
      });
      await use("card-value", async (m) => {
        const card = m.hand.find((c) => c.targetable)!;
        const before = JSON.stringify((await getModel<CampModel>(page)).tray);
        const held = await clickHandCard<CampModel>(page, card.objectId, (mm) => JSON.stringify(mm.tray) !== before);
        const rank = held.tray!.options[0]!;
        await click(rank.objectId);
        return [rank.choiceId];
      });
      await use("board", async () => {
        await click("board");
        return ["board"];
      });
      await use("supplies", async () => {
        await click("supplies");
        return ["supplies"];
      });
    } finally {
      for (const c of contexts) await c.close();
    }
  });

  test("a real rescue: the Medic drops a failed objective and play goes on", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
    try {
      for (const [i, id] of ["medic", "scout", "guide"].entries()) await musterPick(pages[i]!, id);
      await readyAll(pages);

      expect(await playUntilRescue(page, pages), "an objective failed and the Medic was asked to rescue it").toBe(true);
      expect((await getModel<CampModel>(page)).banner!.title).toMatch(/^Objectives? failed: /);
      await page.screenshot({ path: ".audit/abilities/rescue-banner.png" });
      await clickUntilChanged<CampModel>(page, "predeal-use:medic", (m) => m.targeting !== null);
      const failed = (await getModel<CampModel>(page)).seats.flatMap((s) => s.objectives).find((o) => o.targetable)!;
      await clickUntilChanged<CampModel>(page, failed.objectId, (m) => m.targeting?.canConfirm === true);
      await clickUntilChanged<CampModel>(page, "confirm", (m) => m.sceneKey !== "camp" || m.targeting === null);
      await expect
        .poll(async () => {
          const m = await getModel<CampModel>(page);
          return m.sceneKey !== "camp" || m.banner === null;
        }, { timeout: 15_000, message: "the rescue banner clears, or the camp settles into another scene" })
        .toBe(true);
      await page.screenshot({ path: ".audit/abilities/after-rescue.png" });
      const after = await getModel<CampModel>(page);
      if (after.sceneKey === "camp") {
        expect(after.prompt.text).not.toMatch(/^Camp failed/);
        expect(after.hand.length).toBeGreaterThan(0);
      }
    } finally {
      for (const c of contexts) await c.close();
    }
  });

  test("an absent Medic is passed for after the grace period, so the table moves on", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
    try {
      for (const [i, id] of ["medic", "scout", "guide"].entries()) await musterPick(pages[i]!, id);
      await readyAll(pages);
      expect(await playUntilRescue(page, pages), "an objective failed and the Medic was asked to rescue it").toBe(true);
      const bianca = pages[1]!;
      await expect.poll(async () => (await getModel<CampModel>(bianca)).banner?.detail).toMatch(/Waiting on Roger/);

      const left = Date.now();
      await page.close();
      await expect.poll(async () => (await getModel<CampModel>(bianca)).banner?.window ?? null, { timeout: 90_000, intervals: [1_000] }).not.toBe("rescue");
      const waited = Date.now() - left;
      expect(waited, "the pass waited out the grace period").toBeGreaterThanOrEqual(29_000);
      await bianca.screenshot({ path: ".audit/abilities/after-auto-pass.png" });
    } finally {
      for (const c of contexts) await c.close();
    }
  });
});
