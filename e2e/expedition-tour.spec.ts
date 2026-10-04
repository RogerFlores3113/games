import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { auditLayout, type LayoutEntry, type Violation } from "../apps/web/lib/expedition/layout-audit";
import {
  DRAFT_PREFERENCE,
  clickHandCard,
  clickUntilChanged,
  draftOffer,
  openVote,
  trailStep,
  walkTrail,
  waitForScene,
  type SceneName,
  type TrailView,
} from "./expedition-driver";
import { clickObject, getModel, getScene, hoverObject, startExpeditionGame } from "./expedition-helpers";
import { PICKER_SCENARIOS, playing, rescue, rewriteViews, scenarioKey, type Game } from "./expedition-scenarios";
import { autoplay, shortcut, soloTable } from "./expedition-dev-panel";

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
const GATE_SKIP_ID = "gate-skip";
const NEW_EXPEDITION_ID = "run-end:new-expedition";

/** Phases scripted play reaches often enough to keep starting new runs for. */
const WANTED = [
  "muster", "muster-picked", "muster-voted", "loadout-first", "objective-pick", "trick-led", "mid-trick", "ability-targeting", "whisper-targeting",
  "whisper-sent", "whisper-received", "last-trick-glance", "objective-hover", "loadout-after-fail", "between-camps-draft", "route-vote",
  "route-voted", "event", "loadout", "next-camp", "run-end-lost", "run-end-guest",
];
/** Phases play rarely reaches; each is also captured from a rewritten view. */
const RARE = [
  "run-end-won", "between-camps-draft", "vote-tie-length", "vote-tie-route", "shop", "camp-storm-strike", "camp-rain", "route-weather",
  "camp-cave", "camp-night", "camp-desert", "camp-fog", "camp-magma", "camp-flood", "loadout-fog",
  "camp-tiger", "camp-rats", "camp-snake", "camp-crocodile", "camp-capybara", "camp-beaver", "route-boss",
  "camp-tornado", "camp-earthquake", "camp-wildfire", "camp-meteor", "camp-blood-moon", "camp-locusts", "camp-monsoon", "long-camp-6",
  "temple-short", "temple-standard", "temple-long", "temple-rescue",
  "five-route", "five-camp", "five-temple",
];

interface Identity { kind: "standard" | "joker"; suit?: string; rank?: number; joker?: "sun" | "moon" }
interface Card { id: string; objectId: string; label: string; identity: Identity; playable: boolean }
interface Chip { objectId: string; label?: string; status?: string; pickable?: boolean; objectiveId?: string; usable?: boolean; sourceId?: string; sourceKey?: string }
interface CampModel {
  sceneKey: SceneName;
  campIndex: number;
  seats: { seatId: string; objectId: string; isYou: boolean; mayAct: boolean; targetable?: boolean; sources: Chip[]; objectives: Chip[] }[];
  hand: (Card & { targetable?: boolean })[];
  receivedWhispers: unknown[];
  /** A face-down play has no card, only the suit it follows as. */
  trick: { plays: { seatId: string; card?: { label: string; identity: Identity }; suit?: string }[] } | null;
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
// Trail
// ---------------------------------------------------------------------------

interface TrailStopView { state: string; caption: string }

function trailPhase(m: TrailView & { trail?: TrailStopView[] | null }): string {
  switch (m.panel?.kind) {
    case "muster":
      return draftOffer(m) !== null ? "muster" : openVote(m) !== null ? "muster-picked" : "muster-voted";
    case "draft":
      return "between-camps-draft";
    case "route":
      return openVote(m) !== null ? "route-vote" : "route-voted";
    case "event":
      return "event";
    case "loadout":
      if ((m.trail ?? []).some((stop) => stop.state === "here" && stop.caption.startsWith("try"))) return "loadout-after-fail";
      return m.vote != null ? "loadout-first" : "loadout";
    default:
      return "trail";
  }
}

/** Walks one page through what it owes in the trail, capturing each new
 * phase first when `tour` is given. */
async function trail(page: Page, tour: Tour | null): Promise<void> {
  for (let step = 0; step < 12; step++) {
    const model = await getModel<TrailView>(page);
    if (model.sceneKey !== "trail") return;
    await waitForScene(page, "trail", 60_000);
    if (tour !== null) {
      const offer = draftOffer(model);
      if (offer !== null && model.panel?.kind === "draft") await hoverObject(page, offer[0]!.objectId);
      await tour.shot(trailPhase(await getModel<TrailView>(page)));
      await page.mouse.move(5, 5);
    }
    if (!(await trailStep(page, { length: "short", preference: DRAFT_PREFERENCE }))) return;
  }
}

/** Walks every page through the trail until every page is in a camp or the
 * run is over. */
async function trailRound(pages: Page[], tour: Tour): Promise<void> {
  for (let round = 0; round < 8; round++) {
    await trail(pages[0]!, tour);
    for (const guest of pages.slice(1)) await walkTrail(guest, { length: "short", preference: DRAFT_PREFERENCE });
    const scenes = await Promise.all(pages.map((p) => getModel<TrailView>(p).then((m) => m.sceneKey)));
    if (scenes.every((scene) => scene !== "trail")) return;
  }
  throw new Error("trailRound: the crew never left the trail");
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

type ShownPlay = { seatId: string; card: { label: string; identity: Identity } };

/** The best face-up play; face-down cards can't be judged. */
function trickWinner(plays: ShownPlay[], led: string | undefined): ShownPlay | null {
  return plays.reduce<ShownPlay | null>((best, p) => (best === null || beats(p.card, best.card, led) ? p : best), null);
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
  const all = model.trick?.plays ?? [];
  const plays = all.filter((p): p is ShownPlay => p.card !== undefined);
  const led = all[0]?.card?.identity.suit ?? all[0]?.suit;
  const winner = trickWinner(plays, led);
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
  if (m.banner?.youPending) await tour.shot("rescue-played");
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
    await hoverObject(host, `seat-source:${mate.seatId}:${mate.sources[0]!.sourceKey}`);
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
    if (isHost) await tour.shot("rescue-played");
    await clickUntilChanged<CampModel>(page, GATE_SKIP_ID, (m) => !(m.banner?.youPending ?? false));
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
    await peekTargeting(page, tour, ability.objectId, "ability-targeting", (m) => m.targeting !== null);
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
    await trailRound(pages, tour);
    for (const p of pages) await waitForScene(p, "camp", 60_000);
    if ((await getModel<CampModel>(host)).campIndex >= 2) await tour.shot("next-camp");
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
  for (const p of pages) await waitForScene(p, "trail", 60_000);
}

const h = (camp: number, attempt: number, status: "cleared" | "failed") => ({ camp, attempt, status, coins: status === "cleared" ? 7 : 0 });

const PREVIEW = { index: 2, location: "jungle", weather: "fair", pairing: null, event: "event", slotKinds: ["win-card", "win-card", "win-card"], bossId: null, shop: false, survey: null };

function wonView(game: Game): Game {
  return {
    ...game,
    runStatus: "won",
    supplies: { count: 2, max: 4 },
    purse: 42,
    stage: { tag: "ended", result: "won" },
    history: [h(1, 1, "cleared"), h(2, 1, "failed"), h(2, 2, "cleared"), h(3, 1, "cleared"), h(4, 1, "cleared")],
  };
}

/** The event after a three-way route tie, mid coin flip. */
function routeTieView(game: Game): Game {
  return {
    ...game,
    history: [h(1, 1, "cleared")],
    lastVote: { topic: "route", tally: [{ choice: "a", votes: 1 }, { choice: "b", votes: 1 }, { choice: "c", votes: 1 }], tied: ["a", "b", "c"], winner: "b" },
    stage: { tag: "event", event: "event", next: PREVIEW, readySeatIds: [] },
  };
}

/** Camp 1's loadout after a Short/Standard tie on the length. */
function lengthTieView(game: Game): Game {
  return {
    ...game,
    history: [],
    lastVote: { topic: "length", tally: [{ choice: "short", votes: 1 }, { choice: "standard", votes: 1 }, { choice: "long", votes: 0 }], tied: ["short", "standard"], winner: "standard" },
    stage: { tag: "loadout", camp: { ...PREVIEW, index: 1, event: null, slotKinds: ["win-card", "win-card"] }, mods: [], yourSlots: 2, shop: null, readySeatIds: [] },
  };
}

const uses = (left: number, of: number) => ({ kind: "uses", left, of });

/** The loadout before camp 3's animal boss: one item equipped and two in
 * the backpack, the shop with supplies, an item a teammate bought, and the
 * Scout's upgrades just out of reach. */
function shopView(game: Game): Game {
  const mate = game.seats.find((s) => s.seatId !== game.yourSeatId)!.seatId;
  return {
    ...game,
    purse: 7,
    supplies: { count: 3, max: 4 },
    history: [h(1, 1, "cleared"), h(2, 1, "cleared")],
    seats: game.seats.map((s) =>
      s.seatId !== game.yourSeatId
        ? s
        : {
            ...s,
            characterId: "scout",
            upgradeId: null,
            items: {
              equipped: [{ uid: "it91", itemId: "rain-poncho", remaining: uses(2, 2) }],
              backpack: [
                { uid: "it92", itemId: "trail-map", remaining: uses(1, 1) },
                { uid: "it93", itemId: "parrot", remaining: uses(1, 1) },
              ],
              concealed: false,
            },
          },
    ),
    stage: {
      tag: "loadout",
      camp: { ...PREVIEW, index: 3, event: null, bossId: null, shop: true },
      mods: [],
      yourSlots: 2,
      shop: {
        stock: [
          { stockId: "supplies", what: { kind: "supplies" }, price: 6, soldTo: null },
          { stockId: "item0", what: { kind: "item", itemId: "smoke-signal" }, price: 5, soldTo: mate },
          { stockId: "item1", what: { kind: "item", itemId: "whetstone" }, price: 2, soldTo: null },
          { stockId: "item2", what: { kind: "item", itemId: "camouflage" }, price: 4, soldTo: null },
        ],
        yourUpgrades: [
          { stockId: "upgrade:scout.keen-eye", upgradeId: "scout.keen-eye", price: 8 },
          { stockId: "upgrade:scout.eavesdrop", upgradeId: "scout.eavesdrop", price: 8 },
        ],
      },
      readySeatIds: [],
    },
  };
}

const mod = (id: string, kind: string, status: Record<string, unknown>[] = []) => ({ id, kind, strength: "full", status });

/** The camp in play on the clifftop in a thunderstorm, its sky still dark
 * from a strike on the trick in play. */
function stormView(game: Game): Game {
  const stage = game.stage as Game["stage"] & { camp: Record<string, unknown> };
  return {
    ...game,
    stage: {
      ...stage,
      camp: { ...stage.camp, location: "clifftop", weather: "thunderstorm" },
      mods: [mod("clifftop", "location"), mod("thunderstorm", "weather", [{ kind: "chance", percent: 40, strikesLeft: 1 }, { kind: "strike" }])],
    },
  };
}

/** The camp in play in the rain, with the Whisper button stopped. */
function rainView(game: Game): Game {
  const stage = game.stage as Game["stage"] & { camp: Record<string, unknown> };
  const attempt = { ...stage.attempt!, yourWhisper: { allowed: false, left: 1 } };
  return { ...game, stage: { ...stage, camp: { ...stage.camp, weather: "rain" }, mods: [mod("jungle", "location"), mod("rain", "weather")], attempt } };
}

type CampStage = Game["stage"] & { camp: Record<string, unknown>; attempt: NonNullable<Game["stage"]["attempt"]> };

/** The camp in play at `location` in `weather` with the given layers; `edit`
 * changes the attempt's camp in place. */
function campIn(game: Game, location: string, weather: string, mods: ReturnType<typeof mod>[], edit: (camp: Record<string, unknown>) => void = () => {}): Game {
  const next = JSON.parse(JSON.stringify(game)) as Game;
  const stage = next.stage as CampStage;
  stage.camp = { ...stage.camp, location, weather };
  (stage as Record<string, unknown>).mods = mods;
  edit(stage.attempt.camp as unknown as Record<string, unknown>);
  return next;
}

type Plays = { seatId: string; hidden?: boolean; card?: { identity: { suit?: string } }; suit?: string }[];
const faceDown = (play: Plays[number]) => ({ seatId: play.seatId, hidden: true, suit: play.card?.identity.suit ?? "joker" });

/** Mid-trick in a cave: both teammates' cards face down, showing their suit. */
function caveView(game: Game): Game {
  return campIn(playing(game, { plays: 2, window: "in-trick" }), "cave", "fair", [mod("cave", "location"), mod("fair", "weather")], (camp) => {
    const trick = camp.currentTrick as { plays: Plays };
    trick.plays = trick.plays.map(faceDown);
  });
}

/** Mid-trick at night: only the leader's card face down. */
function nightView(game: Game): Game {
  return campIn(playing(game, { plays: 2, window: "in-trick" }), "jungle", "night", [mod("jungle", "location"), mod("night", "weather")], (camp) => {
    const trick = camp.currentTrick as { plays: Plays };
    trick.plays = trick.plays.map((play, i) => (i === 0 ? faceDown(play) : play));
  });
}

/** The objective pick in the desert: one objective under the mirage. */
function desertView(game: Game): Game {
  return campIn(game, "desert", "fair", [mod("desert", "location"), mod("fair", "weather")], (camp) => {
    const objectives = camp.objectives as Record<string, unknown>[];
    camp.objectives = objectives.map((o, i) => (i === 1 ? { id: o.id, kind: "hidden", ownerSeatId: null, status: "pending" } : { ...o, ownerSeatId: null, status: "pending" }));
    camp.campPhase = "objective-pick";
    camp.currentActorSeatId = game.yourSeatId;
    camp.currentTrick = { index: 0, leaderSeatId: game.yourSeatId, plays: [] };
    camp.completedTricks = [];
  });
}

/** Heavy fog: every teammate's items hidden. */
function fogged(game: Game): Game {
  return { ...game, seats: game.seats.map((s) => (s.seatId === game.yourSeatId ? s : { ...s, items: { equipped: [], backpack: null, concealed: true } })) };
}

function fogView(game: Game): Game {
  return fogged(campIn(game, "jungle", "fog", [mod("jungle", "location"), mod("fog", "weather")]));
}

const HEAT_REMOVED = ["spades", "hearts", "diamonds", "clubs"].flatMap((suit) => [2, 3].map((rank) => ({ kind: "standard", suit, rank }))).concat([{ kind: "standard", suit: "clubs", rank: 4 }]);

/** The magma pool, its chip naming the cards the heat burned. */
function magmaView(game: Game): Game {
  return campIn(game, "magma", "fair", [mod("magma", "location"), mod("fair", "weather")], (camp) => {
    camp.removedCards = HEAT_REMOVED;
  });
}

/** A flooded cave two tricks from the flood: the meter on its chip and the
 * river high around the stump. */
function floodView(game: Game): Game {
  const next = campIn(game, "cave", "rain", [mod("cave", "location"), mod("rain", "weather"), mod("flooding", "pairing", [{ kind: "meter", left: 2, of: 14 }])]);
  const stage = next.stage as CampStage;
  (stage.attempt as Record<string, unknown>).yourWhisper = { allowed: false, left: 1 };
  return next;
}

/** The loadout under Heavy fog: the crew's items hidden. */
function fogLoadoutView(game: Game): Game {
  return fogged({ ...game, stage: { tag: "loadout", camp: { ...PREVIEW, weather: "fog" }, mods: [mod("jungle", "location"), mod("fog", "weather")], yourSlots: 2, shop: null, readySeatIds: [] } });
}

/** A route vote whose options show every weather, and a pairing. */
function routeWeatherView(game: Game): Game {
  const next = (location: string, weather: string, pairing: string | null) => ({ ...PREVIEW, index: 4, location, weather, pairing });
  return {
    ...game,
    history: [h(1, 1, "cleared"), h(2, 1, "cleared"), h(3, 1, "cleared")],
    stage: {
      tag: "route",
      options: [
        { id: "a", next: next("clearing", "thunderstorm", null), swapsBoss: false },
        { id: "b", next: next("magma", "rain", "steam"), swapsBoss: false },
        { id: "c", next: next("cave", "rain", "flooding"), swapsBoss: false },
      ],
      ballots: [],
    },
  };
}

/** Mid-trick under a boss with `status`, its marks on the crew; `edit`
 * changes the attempt in place. */
function bossView(
  boss: string,
  status: (you: string, mate: string) => Record<string, unknown>[],
  kind: "animal" | "disaster" = "animal",
  edit: (attempt: Record<string, unknown> & { camp: Record<string, unknown> }, game: Game) => void = () => {},
  weather = "fair",
): (game: Game) => Game {
  return (game) => {
    const mate = game.seats.find((s) => s.seatId !== game.yourSeatId)!.seatId;
    const next = campIn(playing(game, { plays: 1, window: "in-trick" }), "jungle", weather, [mod("jungle", "location"), mod(weather, "weather"), mod(boss, kind, status(game.yourSeatId, mate))]);
    edit((next.stage as CampStage).attempt as unknown as Record<string, unknown> & { camp: Record<string, unknown> }, next);
    return next;
  };
}

type HandCard = { id: string; identity: { kind: string; suit?: string; rank?: number } };
type CompletedTrick = { plays: { burned: boolean; card: HandCard }[] };

/** The last completed trick with its lowest card burned (the Wildfire), or
 * its highest (the Meteor's would-be winner). */
function burnLast(highest: boolean) {
  return (attempt: { camp: Record<string, unknown> }) => {
    const last = (attempt.camp.completedTricks as CompletedTrick[]).at(-1)!;
    const ranks = last.plays.map((p) => p.card.identity.rank ?? 0);
    const at = ranks.indexOf(highest ? Math.max(...ranks) : Math.min(...ranks));
    last.plays[at]!.burned = true;
  };
}

const BLOOD: Readonly<Record<string, string>> = { spades: "diamonds", clubs: "hearts" };

/** Spades count as diamonds and clubs as hearts, in hand and on the stump. */
function bloodMoonUp(attempt: { camp: Record<string, unknown> }): void {
  const turned = (card: HandCard) => (card.identity.suit !== undefined && BLOOD[card.identity.suit] ? { ...card.identity, suit: BLOOD[card.identity.suit] } : null);
  for (const card of attempt.camp.yourHand as (HandCard & { countsAs: unknown })[]) card.countsAs = turned(card);
  for (const play of (attempt.camp.currentTrick as { plays: { card?: HandCard; countsAs?: unknown }[] }).plays) if (play.card) play.countsAs = turned(play.card);
}

/** Just after a gust took your three highest cards to the seat on your right. */
function gustBlew(attempt: Record<string, unknown> & { camp: Record<string, unknown> }, game: Game): void {
  const hand = attempt.camp.yourHand as HandCard[];
  const sent = hand.slice(-3);
  attempt.camp.yourHand = hand.slice(0, -3);
  attempt.camp.yourLegalCardIds = (attempt.camp.yourHand as HandCard[]).map((c) => c.id);
  (attempt.log as Record<string, unknown>[]).push({ event: "gust", actorSeatId: null, subjectSeatIds: [], sourceId: "tornado", private: false });
  attempt.reveals = [...(attempt.reveals as unknown[]), ...sent.map((c) => ({ cardId: c.id, fromSeatId: game.yourSeatId, source: "tornado", identity: c.identity, toSeatId: null }))];
}

const BOSS_VIEWS = [
  ["camp-tiger", bossView("tiger", (_you, mate) => [{ kind: "streak", seatId: mate, count: 2 }])],
  ["camp-rats", bossView("rats", () => [])],
  ["camp-snake", bossView("snake", (you) => [{ kind: "bitten", seatId: you, tricksLeft: 2 }])],
  ["camp-crocodile", bossView("crocodile", (_you, mate) => [{ kind: "facing", seatId: mate }])],
  ["camp-capybara", bossView("capybara", () => [])],
  ["camp-beaver", bossView("beaver", () => [{ kind: "dam", suit: "hearts" }])],
  ["camp-tornado", bossView("tornado", () => [{ kind: "countdown", tricks: 3 }], "disaster", gustBlew)],
  ["camp-earthquake", bossView("earthquake", () => [{ kind: "countdown", tricks: 1 }], "disaster")],
  ["camp-wildfire", bossView("wildfire", () => [], "disaster", burnLast(false))],
  ["camp-meteor", bossView("meteor", () => [], "disaster", burnLast(true))],
  ["camp-blood-moon", bossView("blood-moon", () => [{ kind: "alternating", activeNow: true }], "disaster", bloodMoonUp)],
  ["camp-locusts", bossView("locusts", (_you, mate) => [{ kind: "swarm", seatId: mate }], "disaster")],
  ["camp-monsoon", bossView("monsoon", () => [{ kind: "meter", left: 2, of: 14 }], "disaster", () => {}, "rain")],
] as const;

/** A route vote into a revealed boss camp: three options, one with a
 * pairing, so the narrowest card falls back to a one-line boss. */
function routeBossView(game: Game): Game {
  const next = (location: string, weather: string, pairing: string | null) => ({ ...PREVIEW, index: 3, location, weather, pairing, bossId: "crocodile", shop: true });
  return {
    ...game,
    plan: [{ at: 3, tier: "animal", bossId: "crocodile" }, { at: 6, tier: "temple", bossId: null }],
    history: [h(1, 1, "cleared"), h(2, 1, "cleared")],
    stage: {
      tag: "route",
      options: [
        { id: "a", next: next("clearing", "fair", null), swapsBoss: false },
        { id: "b", next: next("magma", "rain", "steam"), swapsBoss: false },
        { id: "c", next: next("cave", "fog", null), swapsBoss: false },
      ],
      ballots: [],
    },
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
      await clickUntilChanged<CampModel>(host, `gate-use:${scenarioKey(scenario.sourceId)}`, (m) => m.targeting !== null);
    } else {
      await clickUntilChanged<CampModel>(host, `source:${scenarioKey(scenario.sourceId)}`, (m) => m.targeting !== null);
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
  await reloadTo(stormView);
  await host.waitForTimeout(1_000);
  await tour.shot("camp-storm-strike");
  await reloadTo(rainView);
  await tour.shot("camp-rain");
  for (const [name, view] of [["camp-cave", caveView], ["camp-night", nightView], ["camp-desert", desertView], ["camp-fog", fogView], ["camp-magma", magmaView], ["camp-flood", floodView], ...BOSS_VIEWS] as const) {
    await reloadTo(view);
    await tour.shot(name);
  }
  await reloadTo((g) => g);
}

async function captureRare(host: Page, tour: Tour, rewrite: Rewriter): Promise<void> {
  const capture = async (fn: (g: Game) => Game, scene: SceneName, name: string, settleMs = 0): Promise<void> => {
    rewrite.current = fn;
    await host.reload();
    await waitForScene(host, scene, 30_000);
    await host.waitForTimeout(settleMs);
    await tour.shot(name);
  };
  if (!tour.has("between-camps-draft")) {
    await capture(
      (g) => ({
        ...g,
        history: [h(1, 1, "cleared")],
        stage: { tag: "draft", cleared: 1, payout: 8, yourOffer: { kind: "standard", bundles: [["bait", "smoke-signal"], ["whetstone", "parrot"], ["trail-map"]] }, pendingSeatIds: [g.yourSeatId] },
      }),
      "trail",
      "between-camps-draft-rewritten",
    );
  }
  await capture(shopView, "trail", "shop");
  await capture(routeWeatherView, "trail", "route-weather");
  await capture(routeBossView as (g: Game) => Game, "trail", "route-boss");
  await capture(fogLoadoutView, "trail", "loadout-fog");
  await capture(lengthTieView as (g: Game) => Game, "trail", "vote-tie-length", 2_000);
  await capture(routeTieView as (g: Game) => Game, "trail", "vote-tie-route", 2_000);
  if (!tour.has("run-end-won")) await capture(wonView as (g: Game) => Game, "run-end", "run-end-won-rewritten");
  await longCamp6(host, tour, rewrite);
  await temples(host, tour, rewrite);
}

interface TempleCampModel extends CampModel {
  temple: { pressed: number } | null;
  trick: { leaderSeatId: string; plays: unknown[] } | null;
}

const TEMPLE_CAMPS = [["short", 4], ["standard", 6], ["long", 8]] as const;

/** Each length's final camp, the temple, reached with the dev panel's jump
 * and played on until a plate is pressed when play gets there; then the
 * Long temple's rescue offering the crew's Skip, from a rewritten view. */
async function temples(host: Page, tour: Tour, rewrite: Rewriter): Promise<void> {
  rewrite.current = (g) => g;
  await host.reload();
  await host.waitForFunction(() => window.__expeditionTest?.ready === true && window.__expeditionTest.scene !== null);
  await host.getByTestId("dev-toggle").click();
  const panel = host.getByTestId("dev-panel");
  const arrive = async (length: string, at: number): Promise<void> => {
    await shortcut(panel, "set-supplies", { supplies: "4" });
    await shortcut(panel, "jump-to-camp", { length, camp: String(at), stage: "camp" });
    await expect.poll(async () => {
      const m = await getModel<TempleCampModel>(host);
      return m.sceneKey === "camp" && m.campIndex === at && m.temple !== null;
    }).toBe(true);
  };
  for (const [length, at] of TEMPLE_CAMPS) {
    await arrive(length, at);
    for (let step = 0; step < 40; step++) {
      const m = await getModel<TempleCampModel>(host);
      if (m.sceneKey !== "camp" || ((m.temple?.pressed ?? 0) >= 1 && (m.trick?.plays.length ?? 0) === 0)) break;
      await autoplay(panel, "everyone", 1);
    }
    // A camp that failed on the way is dealt again and captured as it opens.
    if ((await getModel<TempleCampModel>(host)).sceneKey !== "camp") await arrive(length, at);
    await host.getByTestId("dev-toggle").click();
    await host.mouse.move(5, 5);
    await tour.shot(`temple-${length}`);
    await host.getByTestId("dev-toggle").click();
  }
  await arrive("long", 8);
  await host.getByTestId("dev-toggle").click();
  rewrite.current = templeRescueView;
  await host.reload();
  await waitForScene(host, "camp", 30_000);
  await host.mouse.move(5, 5);
  await tour.shot("temple-rescue");
  rewrite.current = (g) => g;
}

type TempleMod = { id: string; status: { kind: string; plates?: unknown[]; pressed?: number }[] };

/** The temple after the Sun was won on the last plate: every plate pressed,
 * your objective failed, and the crew's Skip offered to every seat. */
function templeRescueView(game: Game): Game {
  const dealt = JSON.parse(JSON.stringify(game)) as Game;
  const order = [game.yourSeatId, ...game.seats.map((s) => s.seatId).filter((id) => id !== game.yourSeatId)];
  dealt.stage.attempt!.camp.objectives.forEach((o, i) => (o.ownerSeatId ??= order[i % order.length]!));
  const next = playing(dealt, { plays: 0, window: "between-tricks" });
  const attempt = next.stage.attempt!;
  const camp = attempt.camp;
  const sun = camp.objectives.find((o) => o.target?.kind === "joker" && o.target.joker === "sun");
  const mate = game.seats.find((s) => s.seatId !== game.yourSeatId)!.seatId;
  if (sun !== undefined) Object.assign(sun, { status: "done", ownerSeatId: mate });
  const failed = camp.objectives.find((o) => o !== sun && o.ownerSeatId === game.yourSeatId) ?? camp.objectives.find((o) => o !== sun)!;
  Object.assign(failed, { status: "failed", ownerSeatId: game.yourSeatId });
  camp.campPhase = "ended";
  camp.currentActorSeatId = null;
  camp.goals = [{ id: "temple", status: "done" }];
  for (const m of next.stage.mods as TempleMod[]) for (const part of m.status) if (part.kind === "path") part.pressed = part.plates!.length;
  attempt.window = "rescue";
  attempt.pendingSeatIds = game.seats.map((s) => s.seatId);
  attempt.rescue = { failedObjectiveIds: [failed.id] };
  const token = { sourceKey: "temple", remaining: { kind: "crew", left: 1, earned: 1 } };
  next.seats = next.seats.map((s) => ({ ...s, usage: [...s.usage.filter((u) => u.sourceKey !== "temple"), token] }));
  next.yourAbilities = [
    ...next.yourAbilities.filter((a) => a.sourceKey !== "temple"),
    { sourceKey: "temple", usableNow: true, reason: null, steps: [{ kind: "objective", prompt: "Pick an open objective", choices: [`objective:${failed.id}`] }] },
  ];
  return next;
}

/** Camp 6 of a Long run, the disaster camp, reached with the dev panel's
 * jump (it needs the worker in dev mode). The run's own plan names its
 * disaster; a plan without one is given the Tornado. */
async function longCamp6(host: Page, tour: Tour, rewrite: Rewriter): Promise<void> {
  rewrite.current = (g) => g;
  await host.reload();
  await host.waitForFunction(() => window.__expeditionTest?.ready === true && window.__expeditionTest.scene !== null);
  await host.getByTestId("dev-toggle").click();
  const panel = host.getByTestId("dev-panel");
  const run = async (id: string, fields: Record<string, string>, label: string): Promise<void> => {
    for (const [name, value] of Object.entries(fields)) {
      const field = panel.getByTestId(`dev-field-${id}-${name}`);
      if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
      else await field.fill(value);
    }
    await panel.getByTestId(`dev-shortcut-${id}`).click();
    await expect(panel.getByTestId("dev-result")).toHaveText(new RegExp(`^${label}: done\\.`));
  };
  await run("jump-to-camp", { length: "long", camp: "6", stage: "camp" }, "Jump to camp");
  await waitForScene(host, "camp", 30_000);
  const boss = (await getModel<{ boss: { id: string } | null }>(host)).boss;
  if (boss === null) await run("set-plan-boss", { camp: "6", boss: "tornado" }, "Set a boss camp's boss");
  await host.getByTestId("dev-toggle").click();
  await expect.poll(async () => (await getModel<CampModel & { boss: unknown }>(host)).campIndex).toBe(6);
  await host.mouse.move(5, 5);
  await tour.shot("long-camp-6");
}

/** A five-seat table (you and four bots, through the dev panel): the route
 * vote into a boss camp, that camp mid-trick, and a Long run's temple, where
 * the back row's plates are narrowest. */
async function fiveSeats(browser: Browser, tour: Tour, size: { width: number; height: number }): Promise<void> {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  try {
    const page = await context.newPage();
    const panel = await soloTable(page, 4);
    const shot = async (name: string): Promise<void> => {
      await page.getByTestId("dev-toggle").click();
      await page.mouse.move(5, 5);
      await tour.shot(name, page);
      await page.getByTestId("dev-toggle").click();
    };
    const midTrick = async (): Promise<void> => {
      const objectives = (await getModel<CampModel>(page)).faceUpObjectives.length;
      await autoplay(panel, "everyone", objectives + 7);
    };
    await shortcut(panel, "jump-to-camp", { length: "long", camp: "2", stage: "camp" });
    await shortcut(panel, "set-plan-boss", { camp: "3", boss: "crocodile" });
    await shortcut(panel, "force-camp", { outcome: "cleared" });
    await autoplay(panel, "everyone", 5);
    await expect.poll(async () => (await getModel<TrailView>(page)).panel?.kind).toBe("route");
    await shot("five-route");
    await shortcut(panel, "jump-to-camp", { length: "long", camp: "3", stage: "camp" });
    await midTrick();
    if ((await getScene(page)) === "camp") await shot("five-camp");
    await shortcut(panel, "set-supplies", { supplies: "4" });
    await shortcut(panel, "jump-to-camp", { length: "long", camp: "8", stage: "camp" });
    await midTrick();
    if ((await getScene(page)) === "camp") await shot("five-temple");
  } finally {
    await context.close();
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
        await fiveSeats(browser, tour, size);
      } finally {
        const notes: string[] = [];
        if (!tour.has("between-camps-draft")) notes.push(`no camp was cleared in ${outcomes.length} run(s), so the draft after a cleared camp was not reached`);
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
