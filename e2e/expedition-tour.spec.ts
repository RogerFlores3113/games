import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { auditLayout, type LayoutEntry, type Violation } from "../apps/web/lib/expedition/layout-audit";
import { clickHandCard, clickUntilChanged, pickDraftOffer, waitForScene } from "./expedition-driver";
import { getModel, getScene, hoverObject, startExpeditionGame } from "./expedition-helpers";

/**
 * UI tour. Plays a 3-player game and screenshots each phase from player 1's
 * view, then audits the scene's text and controls for overlaps.
 *
 *   npm run tour:expedition
 *   TOUR_SIZES=1280x720 TOUR_STRICT=1 npm run tour:expedition
 *
 * Output: .audit/tour/<size>/<NN>-<phase>.png and .audit/tour/<size>/audit.json.
 * Fails on violations only when TOUR_STRICT=1.
 */

const SIZES: { name: string; width: number; height: number }[] = [{ name: "1920x1080", width: 1920, height: 1080 }];
if ((process.env.TOUR_SIZES ?? "").includes("1280x720")) SIZES.push({ name: "1280x720", width: 1280, height: 720 });

const OUT_ROOT = path.resolve(process.cwd(), ".audit", "tour");
const MAX_CAMPS = 6;
const RUN_DEADLINE_MS = 20 * 60_000;
const WHISPER_ID = "whisper";
const CANCEL_ID = "cancel";
const READY_ID = "ready";
const LAST_TRICK_ID = "last-trick";
const PREDEAL_SKIP_ID = "predeal-skip";

interface Card { id: string; objectId: string; playable: boolean }
interface Chip { objectId: string; pickable?: boolean; objectiveId?: string; usable?: boolean; gearId?: string }
interface CampModel {
  sceneKey: "camp" | "between-camps";
  campNumber: number;
  sign: { label: string };
  seats: { isYou: boolean; mayAct: boolean; gear: Chip[] }[];
  hand: Card[];
  trick: { plays: unknown[] } | null;
  lastTrick: { open: boolean; plays: unknown[] } | null;
  faceUpObjectives: Chip[];
  whisper: { visible: boolean; active: boolean };
  preDeal: { youPending: boolean } | null;
  targeting: { canConfirm: boolean } | null;
}
interface FiresideModel {
  sceneKey?: string;
  runStatus: string;
  draftOffer: { gearId: string; objectId: string; size: number }[] | null;
  owned: { gearId: string; objectId: string; equipped: boolean; fits: boolean }[];
  youReady: boolean;
  lastResult: { status: string } | null;
}

interface PhaseRecord { file: string; entries: number; violations: Violation[] }

class Tour {
  private n = 0;
  readonly phases: Record<string, PhaseRecord> = {};
  glanceFailed = false;
  readonly unclickable = new Set<string>();
  constructor(private readonly page: Page, private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  has(name: string): boolean {
    return name in this.phases;
  }

  /** Captures `name` once; later calls with the same name are no-ops. */
  async shot(name: string): Promise<void> {
    if (this.has(name)) return;
    await this.page.waitForTimeout(600);
    const entries = await this.page.evaluate(
      () => (window.__expeditionTest as unknown as { layout(): LayoutEntry[] }).layout(),
    );
    this.n++;
    const file = `${String(this.n).padStart(2, "0")}-${name}.png`;
    await this.page.screenshot({ path: path.join(this.dir, file) });
    this.phases[name] = { file, entries: entries.length, violations: auditLayout(entries) };
  }

  write(extra: Record<string, unknown>): number {
    const total = Object.values(this.phases).reduce((sum, p) => sum + p.violations.length, 0);
    writeFileSync(path.join(this.dir, "audit.json"), JSON.stringify({ ...extra, totalViolations: total, phases: this.phases }, null, 2));
    return total;
  }
}

async function fireside(page: Page, tour: Tour | null, names: { draft: string; loadout: string; ready: string }): Promise<void> {
  await waitForScene(page, "between-camps", 60_000);
  let model = await getModel<FiresideModel>(page);
  if (model.draftOffer !== null) {
    await tour?.shot(names.draft);
    const pick = pickDraftOffer(model.draftOffer);
    model = await clickUntilChanged<FiresideModel>(page, pick.objectId, (m) => m.draftOffer === null, { perAttemptTimeoutMs: 15_000 });
  }
  if ((await getScene(page)) === "camp" || model.youReady) return;
  await tour?.shot(names.loadout);
  const fitting = model.owned.find((o) => o.fits && !o.equipped);
  if (fitting) {
    await clickUntilChanged<FiresideModel>(
      page,
      fitting.objectId,
      (m) => m.owned.find((o) => o.gearId === fitting.gearId)?.equipped === true,
      { perAttemptTimeoutMs: 15_000 },
    );
  }
  await clickUntilChanged<FiresideModel>(page, READY_ID, (m) => m.youReady === true || m.sceneKey === "camp", { perAttemptTimeoutMs: 15_000 });
  await tour?.shot(names.ready);
}

/** Opens a targeting flow, captures it, then cancels so the run continues. */
async function peekTargeting(page: Page, tour: Tour, openId: string, name: string, opened: (m: CampModel) => boolean): Promise<void> {
  await clickUntilChanged<CampModel>(page, openId, opened);
  await tour.shot(name);
  await clickUntilChanged<CampModel>(page, CANCEL_ID, (m) => m.targeting === null && !m.whisper.active);
}

async function captureHostState(host: Page, tour: Tour): Promise<void> {
  const m = await getModel<CampModel>(host);
  if (m.sceneKey !== "camp") return;
  if (m.preDeal?.youPending) await tour.shot("predeal-gear");
  if (m.sign.label === "Pick objectives" && m.faceUpObjectives.some((o) => o.pickable)) await tour.shot("objective-pick");
  const plays = m.trick?.plays.length ?? 0;
  if (plays >= 1) await tour.shot("trick-led");
  if (plays >= 2) await tour.shot("mid-trick");
  if (m.lastTrick !== null && !tour.has("last-trick-glance") && !tour.glanceFailed) {
    let open = false;
    for (let attempt = 0; attempt < 4 && !open; attempt++) {
      await host.mouse.move(5, 5);
      await host.waitForTimeout(300);
      await hoverObject(host, LAST_TRICK_ID);
      open = await expect
        .poll(async () => (await getModel<CampModel>(host)).lastTrick?.open ?? false, { timeout: 3_000 })
        .toBe(true)
        .then(() => true, () => false);
    }
    if (!open) {
      tour.glanceFailed = true;
      return;
    }
    await tour.shot("last-trick-glance");
    await host.mouse.move(5, 5);
    await expect.poll(async () => (await getModel<CampModel>(host)).lastTrick?.open ?? true, { timeout: 10_000 }).toBe(false);
  }
}

async function stepPage(page: Page, isHost: boolean, tour: Tour): Promise<void> {
  const model = await getModel<CampModel>(page);
  if (model.sceneKey !== "camp") return;
  const you = model.seats.find((s) => s.isYou);
  if (!you) return;

  if (model.preDeal?.youPending) {
    if (isHost) await tour.shot("predeal-gear");
    await clickUntilChanged<CampModel>(page, PREDEAL_SKIP_ID, (m) => !(m.preDeal?.youPending ?? false));
    return;
  }
  if (you.mayAct) {
    const objective = model.faceUpObjectives.find((o) => o.pickable);
    if (objective) {
      const id = objective.objectiveId;
      await clickUntilChanged<CampModel>(page, objective.objectId, (m) => !(m.faceUpObjectives.find((o) => o.objectiveId === id)?.pickable ?? false));
      return;
    }
  }
  const playable = model.hand.find((c) => c.playable);
  if (!playable) return;

  if (isHost && !tour.has("whisper-targeting") && model.whisper.visible) {
    await peekTargeting(page, tour, WHISPER_ID, "whisper-targeting", (m) => m.whisper.active);
    return;
  }
  const gear = you.gear.find((g) => g.usable);
  if (isHost && !tour.has("gear-targeting") && gear) {
    await peekTargeting(page, tour, `gear:${gear.gearId}`, "gear-targeting", (m) => m.targeting !== null);
    return;
  }
  // A hand card can sit under a seat chip or label and swallow the click, so
  // fall back to the other legal cards before giving up.
  for (const card of model.hand.filter((c) => c.playable)) {
    try {
      await clickHandCard<CampModel & { hand?: Card[] }>(
        page,
        card.objectId,
        (m) => m.sceneKey !== "camp" || !(m.hand ?? []).some((c) => c.id === card.id),
        { attempts: 2 },
      );
      return;
    } catch {
      tour.unclickable.add(card.objectId);
    }
  }
  throw new Error("stepPage: no playable hand card could be clicked: " + [...tour.unclickable].join(", "));
}

test.describe("@tour Expedition UI tour", () => {
  test.skip(process.env.EXPEDITION_TOUR !== "1", "set EXPEDITION_TOUR=1 (npm run tour:expedition)");

  for (const size of SIZES) {
    test(`tour at ${size.name}`, async ({ page, browser }) => {
      test.setTimeout(RUN_DEADLINE_MS + 120_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      const tour = new Tour(page, path.join(OUT_ROOT, size.name));
      const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
      const startedAt = Date.now();
      let runEnded = false;
      let note = "";

      try {
        for (let camp = 1; camp <= MAX_CAMPS && !runEnded; camp++) {
          const names =
            camp === 1
              ? { draft: "draft", loadout: "loadout", ready: "ready" }
              : { draft: "between-camps-draft", loadout: "between-camps-loadout", ready: "between-camps-ready" };
          await fireside(pages[0]!, tour, names);
          for (const guest of pages.slice(1)) await fireside(guest, null, names);
          for (const p of pages) await waitForScene(p, "camp", 60_000);
          if (camp === 2) await tour.shot("next-camp");

          for (let pass = 0; pass < 400; pass++) {
            const scenes = await Promise.all(pages.map((p) => getScene(p)));
            if (scenes.every((s) => s === "between-camps")) break;
            if (Date.now() - startedAt > RUN_DEADLINE_MS) {
              note = `deadline hit during camp ${camp}`;
              break;
            }
            for (const [i, p] of pages.entries()) {
              await stepPage(p, i === 0, tour);
              await captureHostState(pages[0]!, tour);
            }
          }
          if (note) break;

          await waitForScene(pages[0]!, "between-camps", 30_000);
          const after = await getModel<FiresideModel>(pages[0]!);
          if (after.runStatus !== "in_progress") {
            await tour.shot("run-end");
            runEnded = true;
          }
        }
        if (!runEnded && !note) note = `run did not end within ${MAX_CAMPS} camps`;
      } finally {
        const wanted = [
          "draft", "loadout", "ready", "objective-pick", "predeal-gear", "trick-led", "mid-trick", "gear-targeting",
          "whisper-targeting", "last-trick-glance", "between-camps-draft", "next-camp", "run-end",
        ];
        const total = tour.write({ size: size.name, runEnded, note, notReached: wanted.filter((w) => !tour.has(w)), glanceHoverFailed: tour.glanceFailed, unclickableHandCards: [...tour.unclickable] });
        for (const context of contexts) await context.close();
        if (process.env.TOUR_STRICT === "1") expect(total, "layout violations (see audit.json)").toBe(0);
      }
    });
  }
});
