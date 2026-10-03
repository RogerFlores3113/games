import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { auditLayout, type LayoutEntry, type Violation } from "../apps/web/lib/expedition/layout-audit";
import {
  DRAFT_PREFERENCE,
  clickHandCard,
  clickUntilChanged,
  draftOffer,
  isReady,
  pickDraftOffer,
  waitForScene,
  type FiresideView,
  type SceneName,
} from "./expedition-driver";
import { clickObject, getModel, getScene, hoverObject, startExpeditionGame } from "./expedition-helpers";
import { PICKER_SCENARIOS, rescue, rewriteViews, type Game } from "./expedition-scenarios";

/**
 * UI tour. Plays 3-player runs and screenshots each phase from player 1's
 * view (and the run end from a guest's), then audits every capture's text
 * and controls for overlaps. Runs repeat through "New expedition" until
 * every phase in WANTED is captured, or the run or time budget is spent.
 * The phases in RARE are also captured from a rewritten room view when play
 * doesn't reach them.
 *
 *   npm run tour:expedition
 *   TOUR_SIZES=1280x720 TOUR_STRICT=1 npm run tour:expedition
 *
 * Output: .audit/tour/<size>/<NN>-<phase>.png and .audit/tour/<size>/audit.json,
 * wiped at the start of each run. Fails on violations only when TOUR_STRICT=1.
 */

const SIZES: { name: string; width: number; height: number }[] = [{ name: "1920x1080", width: 1920, height: 1080 }];
if ((process.env.TOUR_SIZES ?? "").includes("1280x720")) SIZES.push({ name: "1280x720", width: 1280, height: 720 });

const OUT_ROOT = path.resolve(process.cwd(), ".audit", "tour");
const MAX_RUNS = 8;
const TOUR_BUDGET_MS = 12 * 60_000;
const WHISPER_ID = "whisper";
const CANCEL_ID = "cancel";
const CONFIRM_ID = "confirm";
const READY_ID = "ready";
const LAST_TRICK_ID = "last-trick";
const PREDEAL_SKIP_ID = "predeal-skip";
const NEW_EXPEDITION_ID = "run-end:new-expedition";

/** Rain Poncho, the only pre-deal item, opens the pre-deal window at the
 * boss camps 3 and 6. */
const TOUR_DRAFT_PREFERENCE = ["rain-poncho", ...DRAFT_PREFERENCE];

/** Phases scripted play reaches often enough to keep starting new runs for. */
const WANTED = [
  "muster", "muster-picked", "objective-pick", "trick-led", "mid-trick", "ability-targeting", "whisper-targeting", "whisper-sent", "whisper-received",
  "last-trick-glance", "objective-hover", "fireside-after-fail", "between-camps-draft", "between-camps-kit", "next-camp",
  "run-end-lost", "run-end-guest",
];
/** Phases play rarely reaches; each is also captured from a rewritten view. */
const RARE = ["predeal-ability", "run-end-won", "between-camps-draft"];

interface Identity { kind: "standard" | "joker"; suit?: string; rank?: number; joker?: "sun" | "moon" }
interface Card { id: string; objectId: string; label: string; identity: Identity; playable: boolean }
interface Chip { objectId: string; label?: string; status?: string; pickable?: boolean; objectiveId?: string; usable?: boolean; sourceId?: string }
interface CampModel {
  sceneKey: SceneName;
  campNumber: number;
  seats: { seatId: string; objectId: string; isYou: boolean; mayAct: boolean; targetable?: boolean; sources: Chip[]; objectives: Chip[] }[];
  hand: (Card & { targetable?: boolean })[];
  receivedWhispers: unknown[];
  trick: { plays: { seatId: string; card: { label: string; identity: Identity } }[] } | null;
  lastTrick: { open: boolean; plays: unknown[] } | null;
  faceUpObjectives: Chip[];
  whisper: { visible: boolean; active: boolean };
  banner: { window: string; youPending: boolean } | null;
  targeting: { canConfirm: boolean } | null;
}
interface PhaseRecord { file: string; entries: number; violations: Violation[] }

class Tour {
  private n = 0;
  readonly phases: Record<string, PhaseRecord> = {};
  glanceFailed = false;
  readonly unclickable = new Set<string>();
  constructor(private readonly page: Page, private readonly dir: string) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  has(name: string): boolean {
    return name in this.phases;
  }

  /** Captures `name` once from `page` (player 1 by default); later calls
   * with the same name are no-ops. */
  async shot(name: string, page: Page = this.page): Promise<void> {
    if (this.has(name)) return;
    await page.waitForTimeout(600);
    const entries = await page.evaluate(() => (window.__expeditionTest as unknown as { layout(): LayoutEntry[] }).layout());
    this.n++;
    const file = `${String(this.n).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: path.join(this.dir, file) });
    this.phases[name] = { file, entries: entries.length, violations: auditLayout(entries) };
  }

  write(extra: Record<string, unknown>): number {
    const total = Object.values(this.phases).reduce((sum, p) => sum + p.violations.length, 0);
    writeFileSync(path.join(this.dir, "audit.json"), JSON.stringify({ ...extra, totalViolations: total, phases: this.phases }, null, 2));
    return total;
  }
}

// ---------------------------------------------------------------------------
// Fireside
// ---------------------------------------------------------------------------

function firesideNames(m: FiresideView): { draft: string; kit: string; ready: string } {
  if (m.lastResult == null) return { draft: "muster", kit: "muster-picked", ready: "muster-ready" };
  if (m.lastResult.status === "succeeded") {
    return { draft: "between-camps-draft", kit: "between-camps-kit", ready: "between-camps-ready" };
  }
  return { draft: "fireside-after-fail-draft", kit: "fireside-after-fail", ready: "fireside-after-fail-ready" };
}

async function fireside(page: Page, tour: Tour | null): Promise<void> {
  await waitForScene(page, "fireside", 60_000);
  let model = await getModel<FiresideView>(page);
  const names = firesideNames(model);
  const offer = draftOffer(model);
  if (offer !== null) {
    await hoverObject(page, offer[0]!.objectId);
    await tour?.shot(names.draft);
    await page.mouse.move(5, 5);
    const pick = pickDraftOffer(offer, TOUR_DRAFT_PREFERENCE);
    model = await clickUntilChanged<FiresideView>(page, pick.objectId, (m) => draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });
  }
  if ((await getScene(page)) !== "fireside" || isReady(model)) return;
  await tour?.shot(names.kit);
  await clickUntilChanged<FiresideView>(page, READY_ID, (m) => isReady(m) || m.sceneKey === "camp", { perAttemptTimeoutMs: 15_000 });
  await tour?.shot(names.ready);
}

// ---------------------------------------------------------------------------
// Camp: play to clear objectives, not at random
// ---------------------------------------------------------------------------

function strength(card: { identity: Identity }): number {
  if (card.identity.kind === "joker") return card.identity.joker === "sun" ? 100 : 99;
  return card.identity.rank ?? 0;
}

/** Whether `card` beats `best` in a trick led in `led`: the Sun beats
 * everything, the Moon everything else, otherwise the higher card of the
 * led suit. */
function beats(card: { identity: Identity }, best: { identity: Identity }, led: string | undefined): boolean {
  if (card.identity.kind === "joker" || best.identity.kind === "joker") return strength(card) > strength(best);
  return card.identity.suit === led && (best.identity.suit !== led || strength(card) > strength(best));
}

function trickWinner(plays: NonNullable<CampModel["trick"]>["plays"]): { seatId: string; card: { identity: Identity } } | null {
  const led = plays[0]?.card.identity.suit;
  return plays.reduce<(typeof plays)[number] | null>((best, p) => (best === null || beats(p.card, best.card, led) ? p : best), null);
}

/** Plays to clear objectives: lead or chase your own objective's card, feed
 * a teammate's card into a trick they are winning, and otherwise stay low
 * and keep teammates' cards back. */
function cardToPlay(model: CampModel): Card[] {
  const you = model.seats.find((s) => s.isYou)!;
  const pending = (chips: Chip[]) => chips.filter((c) => c.status === "pending").map((c) => c.label);
  const mine = new Set(pending(you.objectives));
  const ownerOf = new Map(model.seats.filter((s) => !s.isYou).flatMap((s) => pending(s.objectives).map((l) => [l, s.seatId] as const)));
  const playable = model.hand.filter((c) => c.playable).sort((a, b) => strength(a) - strength(b));
  const safe = playable.filter((c) => !ownerOf.has(c.label));
  const plays = model.trick?.plays ?? [];
  const winner = trickWinner(plays);
  const led = plays[0]?.card.identity.suit;
  const ordered = (() => {
    if (winner === null) return [...playable.filter((c) => mine.has(c.label) && strength(c) >= 12), ...safe];
    if (plays.some((p) => mine.has(p.card.label))) return [...playable].reverse();
    const ownTarget = playable.filter((c) => mine.has(c.label) && beats(c, winner.card, led));
    const feed = playable.filter((c) => ownerOf.get(c.label) === winner.seatId);
    return [...ownTarget, ...feed, ...safe];
  })();
  return [...new Set([...ordered, ...playable])];
}

function objectiveToPick(model: CampModel): Chip | undefined {
  const pickable = model.faceUpObjectives.filter((o) => o.pickable);
  const held = new Map(model.hand.map((c) => [c.label, strength(c)]));
  return [...pickable].sort((a, b) => (held.get(b.label ?? "") ?? -1) - (held.get(a.label ?? "") ?? -1))[0];
}

/** Sends a real Whisper: first card, first teammate, confirm. */
async function sendWhisper(page: Page): Promise<void> {
  let model = await clickUntilChanged<CampModel>(page, WHISPER_ID, (m) => m.whisper.active);
  const card = model.hand.find((c) => c.targetable);
  if (card === undefined) throw new Error("sendWhisper: no targetable card");
  model = await clickHandCard<CampModel>(page, card.objectId, (m) => m.seats.some((s) => s.targetable));
  const mate = model.seats.find((s) => s.targetable)!;
  await clickUntilChanged<CampModel>(page, mate.objectId, (m) => m.targeting?.canConfirm === true);
  await clickUntilChanged<CampModel>(page, CONFIRM_ID, (m) => m.targeting === null);
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
  if (m.banner?.youPending) await tour.shot(m.banner.window === "rescue" ? "rescue-played" : "predeal-ability");
  if (m.faceUpObjectives.some((o) => o.pickable)) await tour.shot("objective-pick");
  const plays = m.trick?.plays.length ?? 0;
  if (plays >= 1) await tour.shot("trick-led");
  if (plays >= 2) await tour.shot("mid-trick");
  if (!tour.has("objective-hover")) {
    const chip = m.faceUpObjectives[0] ?? m.seats.flatMap((s) => s.objectives)[0];
    if (chip !== undefined) {
      await hoverObject(host, chip.objectId);
      await tour.shot("objective-hover");
      await host.mouse.move(5, 5);
    }
  }
  const mate = m.seats.find((s) => !s.isYou && s.sources.length > 0);
  if (mate !== undefined && !tour.has("teammate-source-hover")) {
    await hoverObject(host, `seat-source:${mate.seatId}:${mate.sources[0]!.sourceId}`);
    await tour.shot("teammate-source-hover");
    await host.mouse.move(5, 5);
  }
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

  if (model.banner?.youPending) {
    if (isHost) await tour.shot(model.banner.window === "rescue" ? "rescue-played" : "predeal-ability");
    await clickUntilChanged<CampModel>(page, PREDEAL_SKIP_ID, (m) => !(m.banner?.youPending ?? false));
    return;
  }
  if (you.mayAct) {
    const objective = objectiveToPick(model);
    if (objective) {
      const id = objective.objectiveId;
      await clickUntilChanged<CampModel>(page, objective.objectId, (m) => !(m.faceUpObjectives.find((o) => o.objectiveId === id)?.pickable ?? false));
      return;
    }
  }
  if (!model.hand.some((c) => c.playable)) return;

  if (isHost && !tour.has("whisper-targeting") && model.whisper.visible) {
    await peekTargeting(page, tour, WHISPER_ID, "whisper-targeting", (m) => m.whisper.active);
    await sendWhisper(page);
    await tour.shot("whisper-sent");
    return;
  }
  const ability = you.sources.find((g) => g.usable);
  if (isHost && !tour.has("ability-targeting") && ability) {
    await peekTargeting(page, tour, `source:${ability.sourceId}`, "ability-targeting", (m) => m.targeting !== null);
    return;
  }
  // A hand card can sit under a seat chip or label and swallow the click, so
  // fall back to the other legal cards before giving up.
  for (const card of cardToPlay(model)) {
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

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** Plays one run to its end. Returns the outcome, or null if the budget ran
 * out first. */
async function playRun(pages: Page[], tour: Tour, deadline: number, rewrite: Rewriter): Promise<"won" | "lost" | null> {
  const host = pages[0]!;
  for (;;) {
    await fireside(host, tour);
    for (const guest of pages.slice(1)) await fireside(guest, null);
    for (const p of pages) await waitForScene(p, "camp", 60_000);
    if ((await getModel<CampModel>(host)).campNumber >= 2) await tour.shot("next-camp");
    if (!tour.has("picker-self")) await capturePickers(host, tour, rewrite);

    for (let pass = 0; pass < 400; pass++) {
      const scenes = await Promise.all(pages.map((p) => getScene(p)));
      if (scenes.every((s) => s !== "camp")) break;
      if (Date.now() > deadline) return null;
      for (const [i, p] of pages.entries()) {
        await stepPage(p, i === 0, tour);
        await captureHostState(host, tour);
        if (!tour.has("whisper-received") && ((await getModel<CampModel>(p)).receivedWhispers ?? []).length > 0) {
          await tour.shot("whisper-received", p);
        }
      }
    }

    await host.waitForFunction(() => window.__expeditionTest?.scene !== "camp", undefined, { timeout: 30_000 });
    if ((await getScene(host)) !== "run-end") continue;
    const outcome = (await getModel<{ outcome: "won" | "lost" }>(host)).outcome;
    await tour.shot(`run-end-${outcome}`);
    const guest = pages[1]!;
    await waitForScene(guest, "run-end", 30_000);
    await tour.shot("run-end-guest", guest);
    const offered = await Promise.all(pages.map((p) => p.evaluate((id) => id in (window.__expeditionTest?.objects() ?? {}), NEW_EXPEDITION_ID)));
    expect(offered, "only the host is offered New expedition").toEqual(pages.map((_, i) => i === 0));
    return outcome;
  }
}

/** The host's "New expedition" goes back to the lobby with seats kept. */
async function newExpedition(pages: Page[]): Promise<void> {
  const host = pages[0]!;
  await clickObject(host, NEW_EXPEDITION_ID);
  await expect(host.getByTestId("start-game")).toBeVisible({ timeout: 15_000 });
  await host.getByTestId("start-game").click();
  for (const p of pages) await waitForScene(p, "fireside", 60_000);
}

const h = (campNumber: number, attemptNumber: number, status: "succeeded" | "failed") => ({
  campNumber,
  attemptNumber,
  status,
  suppliesSpent: status === "failed" ? 1 : 0,
});

/** Pre-deal at boss camp 3 with your Rain Poncho waiting on you. */
function preDealView(game: Game): Game {
  const poncho = { sourceId: "rain-poncho", remaining: { kind: "uses", left: 1, of: 1 } };
  return {
    ...game,
    runPhase: "pre-deal",
    campNumber: 3,
    supplies: 2,
    activeBossTwistId: "radio-silence",
    bossTwists: { camp3: "radio-silence", camp6: null },
    seats: game.seats.map((s) => ({ ...s, kit: s.seatId === game.yourSeatId ? ["rain-poncho"] : [], usage: s.seatId === game.yourSeatId ? [poncho] : [], ready: false, draftPending: false })),
    yourDraftOffer: null,
    yourAbilities: [{ sourceId: "rain-poncho", usableNow: true, reason: null, steps: [] }],
    history: [h(1, 1, "succeeded"), h(2, 1, "succeeded")],
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      window: "pre-deal",
      pendingSeatIds: [game.yourSeatId],
      rescue: null,
      effects: [],
      reveals: [],
      log: [],
      yourWhisper: { allowed: false, left: 1 },
      camp: null,
    },
  };
}

function wonView(game: Game): Game {
  return {
    ...game,
    runPhase: "ended",
    runStatus: "won",
    campNumber: 6,
    supplies: 2,
    yourDraftOffer: null,
    attempt: null,
    history: [h(1, 1, "succeeded"), h(2, 1, "failed"), h(2, 2, "succeeded"), h(3, 1, "succeeded"), h(4, 1, "succeeded"), h(5, 1, "succeeded"), h(6, 1, "succeeded")],
  };
}

/** Opens each target kind's picker from a rewritten camp, and the rescue
 * window from both sides, and captures them. */
type Rewriter = { current: (g: Game) => Game };

async function capturePickers(host: Page, tour: Tour, rewrite: Rewriter): Promise<void> {
  const reloadTo = async (fn: (g: Game) => Game): Promise<void> => {
    rewrite.current = fn;
    await host.reload();
    await waitForScene(host, "camp", 30_000);
  };
  for (const [kind, scenario] of Object.entries(PICKER_SCENARIOS)) {
    await reloadTo(scenario.rewrite);
    if (kind === "card") await tour.shot("in-trick-affordance");
    if (kind === "failed-objective") {
      await tour.shot("rescue-you");
      await clickUntilChanged<CampModel>(host, `predeal-use:${scenario.sourceId}`, (m) => m.targeting !== null);
    } else {
      await clickUntilChanged<CampModel>(host, `source:${scenario.sourceId}`, (m) => m.targeting !== null);
    }
    if (kind === "card-value") {
      const card = (await getModel<CampModel>(host)).hand.find((c) => c.targetable);
      if (card !== undefined) await clickHandCard<CampModel & { tray: unknown }>(host, card.objectId, (m) => m.tray !== null);
    }
    await host.mouse.move(5, 5);
    await tour.shot(`picker-${kind}`);
  }
  await reloadTo((g) => rescue(g, { youPending: false }));
  await tour.shot("rescue-waiting");
  await reloadTo((g) => g);
}

async function captureRare(host: Page, tour: Tour, rewrite: Rewriter): Promise<void> {
  if (!tour.has("between-camps-draft")) {
    rewrite.current = (g) => ({
      ...g,
      runPhase: "fireside",
      attempt: null,
      yourDraftOffer: [g.seats.find((s) => s.seatId === g.yourSeatId)?.characterId === "guide" ? "guide.pathfinder" : "scout.keen-eye", "bait", "smoke-signal"],
      seats: g.seats.map((s) => (s.seatId === g.yourSeatId ? { ...s, characterId: s.characterId ?? "scout", draftPending: true, ready: false } : s)),
      history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 0 }],
    });
    await host.reload();
    await waitForScene(host, "fireside", 30_000);
    await tour.shot("between-camps-draft-rewritten");
  }
  if (!tour.has("predeal-ability")) {
    rewrite.current = preDealView as (g: Game) => Game;
    await host.reload();
    await host.waitForFunction(() => (window.__expeditionTest?.model as { banner?: { youPending: boolean } } | null)?.banner?.youPending === true);
    await tour.shot("predeal-ability-rewritten");
  }
  if (!tour.has("run-end-won")) {
    rewrite.current = wonView as (g: Game) => Game;
    await host.reload();
    await waitForScene(host, "run-end", 30_000);
    await tour.shot("run-end-won-rewritten");
  }
}

test.describe("@tour Expedition UI tour", () => {
  test.skip(process.env.EXPEDITION_TOUR !== "1", "set EXPEDITION_TOUR=1 (npm run tour:expedition)");

  for (const size of SIZES) {
    test(`tour at ${size.name}`, async ({ page, browser }) => {
      test.setTimeout(TOUR_BUDGET_MS + 180_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      const tour = new Tour(page, path.join(OUT_ROOT, size.name));
      const rewrite = await rewriteViews(page);
      const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
      await pages[1]!.setViewportSize({ width: size.width, height: size.height });
      const deadline = Date.now() + TOUR_BUDGET_MS;
      const outcomes: string[] = [];
      const missing = () => WANTED.filter((w) => !tour.has(w));

      try {
        for (let run = 1; run <= MAX_RUNS; run++) {
          if (run > 1) await newExpedition(pages);
          const outcome = await playRun(pages, tour, deadline, rewrite);
          outcomes.push(outcome ?? "budget spent");
          if (outcome === null || missing().length === 0 || Date.now() > deadline) break;
        }
        await captureRare(page, tour, rewrite);
      } finally {
        const notes: string[] = [];
        if (!tour.has("between-camps-draft")) notes.push(`no camp was cleared in ${outcomes.length} run(s), so the fireside after a cleared camp was not reached`);
        if (!tour.has("predeal-ability")) notes.push("no run reached boss camp 3 with Rain Poncho in a kit; predeal-ability-rewritten shows that window from a rewritten view");
        if (!tour.has("run-end-won")) notes.push("no run was won; run-end-won-rewritten shows the won screen from a rewritten view");
        const total = tour.write({
          size: size.name,
          runs: outcomes,
          notes,
          notReached: [...WANTED, ...RARE].filter((w) => !tour.has(w)),
          glanceHoverFailed: tour.glanceFailed,
          unclickableHandCards: [...tour.unclickable],
        });
        for (const context of contexts) await context.close();
        if (process.env.TOUR_STRICT === "1") expect(total, "layout violations (see audit.json)").toBe(0);
      }
    });
  }
});
