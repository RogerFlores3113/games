import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { draftOffer, kitIds, pickDraftOffer, trailToCamp, walkTrail, type TrailView, type SceneName } from "./expedition-driver";
import { clickObject, createExpeditionRoom, getModel, getScene, hoverObject, startExpeditionGame, waitForBridge } from "./expedition-helpers";

/**
 * Full-camp, reconnect, card-pack and interactables e2e (Plan 12-13, spec
 * §8). Drives an entire camp — muster, ready, play, an ability use, a Whisper,
 * the last-trick glance — through `window.__expeditionTest` plus real mouse
 * input, then proves refresh-and-resume, per-browser card packs, and that
 * the four interactables never touch game state. Every id used below
 * mirrors `apps/web/lib/expedition/expedition-ids.ts`'s literal scheme
 * (`draft:<id>`, `source:<id>`, `seat:<seatId>`, "gate-skip",
 * `objective:<label>`, `hand:<label>`, "ready", "whisper", "confirm",
 * "last-trick", `interactable:<id>`) verbatim, per the plan's own
 * `<interfaces>` block — this spec never imports app code.
 */

const WHISPER_ID = "whisper";
const CONFIRM_ID = "confirm";
const LAST_TRICK_ID = "last-trick";
const GATE_SKIP_ID = "gate-skip";
const NAMES = ["Roger", "Bianca", "Sam"];
/** Abilities whose every target step is a seat, a hand card or an objective:
 * the kinds this driver can click. */
const DRIVABLE_ABILITIES = new Set(["explorer", "hermit", "leader.delegate", "jd.free-spirit", "cartographer.redraw", "trail-map", "trained-monkey"]);

interface CardModel {
  id: string;
  objectId: string;
  label: string;
  blockedReason: string | null;
  dragging: boolean;
  playable: boolean;
  dimmed: boolean;
  targetable: boolean;
  selected: boolean;
}

interface ObjectiveChip {
  objectiveId: string;
  objectId: string;
  pickable: boolean;
  targetable: boolean;
}

interface SourceChip {
  sourceId: string;
  objectId: string;
  spent: boolean;
  usable: boolean;
}

interface SeatModel {
  seatId: string;
  objectId: string;
  isYou: boolean;
  mayAct: boolean;
  sources: SourceChip[];
  objectives: ObjectiveChip[];
  reveals: { objectId: string }[];
  targetable: boolean;
  handObjectId: string;
  handPick: { targetable: boolean; selected: boolean };
}

/** A face-down play (a Cave, the Night's lead) has no card, only its suit. */
interface TrickPlayModel {
  seatId: string;
  hidden: boolean;
  card?: CardModel;
  suit?: string;
  objectId?: string;
}

interface Targeting {
  sourceObjectId: string;
  nextKind: string | null;
  canConfirm: boolean;
}

interface CampModel {
  sceneKey: SceneName;
  cardPackId: string;
  youSeatId: string | null;
  prompt: { text: string; tone: "your-move" | "waiting" | "info" | "alert" };
  seats: SeatModel[];
  hand: CardModel[];
  trick: { leaderSeatId: string; plays: TrickPlayModel[] } | null;
  lastTrick: { plays: TrickPlayModel[]; open: boolean } | null;
  faceUpObjectives: ObjectiveChip[];
  whisper: { shown: boolean; visible: boolean; active: boolean; state: "ready" | "wait-between-tricks" | "used" | "blocked"; reason: string | null; left: number };
  receivedWhispers: { fromSeatId: string; fromName: string; card: string }[];
  sentWhispers: { toSeatId: string; toName: string; card: string }[];
  whisperLog: string[];
  tooltip: { title: string; text: string; badges: string[]; reason: string | null } | null;
  drag: { cardId: string; legal: boolean } | null;
  targeting: Targeting | null;
  banner: { youPending: boolean } | null;
  tray: { options: { objectId: string }[] } | null;
  boardPick: { targetable: boolean } | null;
  topBar: { suppliesPick: { targetable: boolean } | null };
}

interface DriveState {
  whisperDone: boolean;
  abilityDone: boolean;
  lastTrickChecked: boolean;
}

// ---------------------------------------------------------------------------
// Shared low-level waits
// ---------------------------------------------------------------------------

/** Waits until the bridge's `scene` (not `model`) reports `expected`. */
async function waitForScene(page: Page, expected: SceneName, timeout = 60_000): Promise<void> {
  await page.waitForFunction((wanted) => window.__expeditionTest?.scene === wanted, expected, { timeout });
}

/** Waits until the bridge's model has changed (by deep-equal serialization)
 * from `previous`, so the next `getModel` read is fresh — every helper
 * below calls this immediately after a `clickObject`. */
async function waitForModelChange(page: Page, previous: unknown, timeout = 15_000): Promise<void> {
  const previousJson = JSON.stringify(previous);
  await page.waitForFunction(
    (prevJson) => JSON.stringify(window.__expeditionTest?.model ?? null) !== prevJson,
    previousJson,
    { timeout },
  );
}

interface ClickUntilChangedOptions {
  /** Fraction of the object's reported width to add to its centre before
   * clicking (0 clicks the dead centre). Hand-card images register a
   * custom Phaser hit-area rectangle that is never origin-adjusted (their
   * `setOrigin(0.5, 0)` shifts the RENDER position but not the hit test),
   * so the reported centre sits exactly on the hit rectangle's left edge —
   * a positive fraction is required to land solidly inside it. Every other
   * test-bridge object (containers with a default, auto-centred hit area)
   * is fine with 0. */
  xOffsetFraction?: number;
  attempts?: number;
  perAttemptTimeoutMs?: number;
}

/** Clicks a test-bridge object and retries (re-querying its position each
 * time, since the camp scene fully redraws its dynamic layer on every model
 * change per Plan 12-08/09) until `isSatisfied` is true of the bridge's
 * model. A single move+down+up dispatched in one tick can race
 * `CampScene.renderModel`'s destroy-and-redraw of the very object being
 * clicked — e.g. a hand card's own hover-triggered lift, or a re-render
 * kicked off by an unrelated concurrent state update — so Phaser's pointer
 * processing sometimes hit-tests the "down" against an already-replaced
 * display list and silently drops the click. `isSatisfied` must check the
 * SPECIFIC effect the click is meant to have (not merely "the model
 * changed") — an unrelated redraw (e.g. a hover highlight elsewhere) can
 * otherwise pass a looser check even though the click itself missed.
 * Splitting move/down/up across ticks and retrying against the real
 * expected condition makes each call robust to that race without depending
 * on precise knowledge of Phaser's internal event scheduling. Returns the
 * first model that satisfies `isSatisfied`. */
async function clickUntilChanged<T>(
  page: Page,
  objectId: string,
  isSatisfied: (model: T) => boolean,
  opts: ClickUntilChangedOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 6;
  const perAttemptTimeoutMs = opts.perAttemptTimeoutMs ?? 3_000;
  const pollIntervalMs = 100;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // A prior attempt's click (or, for the very first attempt, some other
    // page's own click a moment ago — e.g. the last teammate readying up
    // advances the whole room past the trail) may have already
    // satisfied the expected condition even though its own poll window
    // expired first, or before we ever click at all. Check before touching
    // the object, since a legitimately-satisfied state can make the object
    // disappear entirely (a played card leaves the hand; every trail id
    // disappears once the room moves on to camp), which would otherwise
    // look like a missing target rather than a race already won.
    const already = await getModel<T>(page);
    if (isSatisfied(already)) return already;

    const entry = await page.evaluate((id) => window.__expeditionTest?.objects()[id] ?? null, objectId);
    if (entry === null) {
      const known = await page.evaluate(() => Object.keys(window.__expeditionTest?.objects() ?? {}));
      throw new Error(`clickUntilChanged: no object registered for id "${objectId}". Known ids: ${known.join(", ")}`);
    }
    const x = entry.x + (opts.xOffsetFraction ?? 0) * entry.width;
    const y = entry.y;
    await page.mouse.move(x, y);
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();

    const deadline = Date.now() + perAttemptTimeoutMs;
    while (Date.now() < deadline) {
      const model = await getModel<T>(page);
      if (isSatisfied(model)) return model;
      await page.waitForTimeout(pollIntervalMs);
    }
  }
  throw new Error(`clickUntilChanged: clicking "${objectId}" never satisfied the expected condition after ${attempts} attempts`);
}

/** Clicks a hand-card object (see `clickUntilChanged`'s `xOffsetFraction`
 * doc for why hand cards need the nudge). */
async function clickHandCard<T>(page: Page, objectId: string, isSatisfied: (model: T) => boolean): Promise<T> {
  return clickUntilChanged(page, objectId, isSatisfied, { xOffsetFraction: 0.25 });
}

/** Presses a hand card with the real mouse, drags it over the middle of the
 * stump in small steps and releases it there. */
async function dragHandCardToStump(page: Page, objectId: string, whileHeld?: () => Promise<void>): Promise<void> {
  const from = await page.evaluate((id) => window.__expeditionTest?.positionOf(id) ?? null, objectId);
  const to = await page.evaluate(() => window.__expeditionTest?.pagePoint({ x: 320, y: 180 }) ?? null);
  if (from === null || to === null) throw new Error(`dragHandCardToStump: "${objectId}" or the stump is not on screen`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await whileHeld?.();
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// reachCamp / stepCamp — shared full-camp driver helpers
// ---------------------------------------------------------------------------

/** Drives every page in `pages` through the trail (muster, draft, route
 * vote, event, loadout) to the camp scene, and waits until every page's
 * scene is "camp". */
async function reachCamp(pages: Page[]): Promise<void> {
  await trailToCamp(pages, { length: "short" });
  for (const page of pages) {
    await waitForScene(page, "camp", 60_000);
  }
}

/** Runs the D-02 highlight-then-confirm Whisper flow on `page`: click
 * `whisper`, target the first eligible own-card then the first eligible
 * teammate, confirm — then asserts the reveal lands on the target's page
 * (at the whisperer's seat) and NOT on the remaining (non-target)
 * teammate's page (T-12-30). */
async function runWhisper(pages: Page[], page: Page): Promise<void> {
  let model = await getModel<CampModel>(page);
  const whispererSeatId = model.youSeatId;
  if (whispererSeatId === null) throw new Error("runWhisper: whisperer has no seat");
  const leftBefore = model.whisper.left;

  model = await clickUntilChanged<CampModel>(page, WHISPER_ID, (m) => m.whisper.active);

  const cardTarget = model.hand.find((c) => c.targetable);
  if (!cardTarget) throw new Error("runWhisper: no targetable hand card after opening Whisper");
  model = await clickHandCard<CampModel>(page, cardTarget.objectId, (m) => m.targeting !== null && m.targeting.nextKind === "player");

  const seatTarget = model.seats.find((s) => s.targetable);
  if (!seatTarget) {
    throw new Error(
      `runWhisper: no targetable seat after selecting the card. targeting=${JSON.stringify(model.targeting)} hand=${JSON.stringify(model.hand.map((c) => ({ objectId: c.objectId, targetable: c.targetable, selected: c.selected })))}`,
    );
  }
  model = await clickUntilChanged<CampModel>(page, seatTarget.objectId, (m) => m.targeting !== null && m.targeting.canConfirm);

  if (model.targeting === null || !model.targeting.canConfirm) {
    throw new Error("runWhisper: targeting never reached a confirmable state");
  }
  await clickUntilChanged<CampModel>(page, CONFIRM_ID, (m) => m.targeting === null);

  const whisperedCard = cardTarget.label;
  const targetSeatId = seatTarget.seatId;
  let targetPage: Page | null = null;
  for (const candidate of pages) {
    const candidateModel = await getModel<CampModel>(candidate);
    if (candidateModel.youSeatId === targetSeatId) {
      targetPage = candidate;
      break;
    }
  }
  if (targetPage === null) throw new Error(`runWhisper: no page found for target seat ${targetSeatId}`);
  const thirdPage = pages.find((p) => p !== page && p !== targetPage) ?? null;

  await expect
    .poll(
      async () => {
        const targetModel = await getModel<CampModel>(targetPage!);
        return targetModel.seats.find((s) => s.seatId === whispererSeatId)?.reveals.length ?? 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  const nameOfPage = async (p: Page): Promise<string> => NAMES[pages.indexOf(p)]!;
  const whispererName = await nameOfPage(page);
  const targetName = await nameOfPage(targetPage);

  // The recipient keeps the card face up, labelled with who named it.
  await expect
    .poll(async () => (await getModel<CampModel>(targetPage!)).receivedWhispers.map(({ fromSeatId, fromName, card }) => ({ fromSeatId, fromName, card })))
    .toEqual([{ fromSeatId: whispererSeatId, fromName: whispererName, card: whisperedCard }]);
  expect((await getModel<CampModel>(targetPage)).whisperLog).toEqual([`${whispererName} whispered to you`]);

  // The sender is told what they sent and to whom, and the button counts it
  // (a Heavy Pack or J.D.'s starting item can leave a second whisper).
  await expect
    .poll(async () => (await getModel<CampModel>(page)).sentWhispers.map(({ toSeatId, toName, card }) => ({ toSeatId, toName, card })))
    .toEqual([{ toSeatId: targetSeatId, toName: targetName, card: whisperedCard }]);
  const senderAfter = await getModel<CampModel>(page);
  expect(senderAfter.whisperLog).toEqual([`You whispered ${whisperedCard} to ${targetName}`]);
  expect(senderAfter.whisper.left).toBe(leftBefore - 1);
  if (senderAfter.whisper.left === 0) expect(senderAfter.whisper).toMatchObject({ visible: false, state: "used", reason: "Used this camp" });

  if (thirdPage !== null) {
    const thirdModel = await getModel<CampModel>(thirdPage);
    const revealCount = thirdModel.seats.find((s) => s.seatId === whispererSeatId)?.reveals.length ?? 0;
    expect(revealCount).toBe(0);
    // A bystander learns who whispered to whom, never the card.
    await expect
      .poll(async () => (await getModel<CampModel>(thirdPage!)).whisperLog)
      .toEqual([`${whispererName} whispered to ${targetName}`]);
    const bystander = await getModel<CampModel>(thirdPage);
    expect(bystander.receivedWhispers).toEqual([]);
    expect(bystander.sentWhispers).toEqual([]);
  }
}

/** Runs the D-02 highlight-then-confirm ability flow on `page` for `chip`:
 * click it, walk `targeting.nextKind` clicking the first targetable hand
 * card, seat or objective the server offers (never the seat that already
 * leads, which a leader-changing power would refuse), then confirm and wait until that chip
 * reports `spent`, or leaves with an item's last use. */
async function runAbility(page: Page, chip: SourceChip): Promise<void> {
  const chipId = chip.objectId;
  let model = await clickUntilChanged<CampModel>(page, chipId, (m) => m.targeting !== null && m.targeting.sourceObjectId === chipId);

  while (model.targeting !== null && model.targeting.nextKind !== null) {
    const kindBefore = model.targeting.nextKind;
    const selectedBefore = JSON.stringify(model.targeting);
    const leader = model.trick?.leaderSeatId;
    const card = model.hand.find((c) => c.targetable);
    const seat = model.seats.find((s) => s.targetable && s.seatId !== leader) ?? model.seats.find((s) => s.targetable);
    const hand = model.seats.find((s) => s.handPick.targetable);
    const played = model.trick?.plays.find((p) => p.card?.targetable);
    const option = model.tray?.options[0];
    const objective = model.faceUpObjectives.find((o) => o.targetable) ?? model.seats.flatMap((s) => s.objectives).find((o) => o.targetable);
    const progressed = (m: CampModel) => m.targeting === null || m.targeting.nextKind !== kindBefore || JSON.stringify(m.targeting) !== selectedBefore || JSON.stringify(m.tray) !== JSON.stringify(model.tray);
    if (option) {
      model = await clickUntilChanged<CampModel>(page, option.objectId, progressed);
    } else if (card) {
      model = await clickHandCard<CampModel>(page, card.objectId, progressed);
    } else if (hand) {
      model = await clickUntilChanged<CampModel>(page, hand.handObjectId, progressed);
    } else if (played) {
      model = await clickUntilChanged<CampModel>(page, played.card!.objectId, progressed);
    } else if (model.boardPick?.targetable) {
      model = await clickUntilChanged<CampModel>(page, "board", progressed);
    } else if (model.topBar.suppliesPick?.targetable) {
      model = await clickUntilChanged<CampModel>(page, "supplies", progressed);
    } else if (seat) {
      model = await clickUntilChanged<CampModel>(page, seat.objectId, progressed);
    } else if (objective) {
      model = await clickUntilChanged<CampModel>(page, objective.objectId, progressed);
    } else {
      throw new Error(`runAbility: no targetable object found for kind "${kindBefore}"`);
    }
  }

  if (model.targeting === null || !model.targeting.canConfirm) {
    throw new Error("runAbility: targeting never reached a confirmable state");
  }
  await clickUntilChanged<CampModel>(page, CONFIRM_ID, (m) => m.targeting === null);
  await expect
    .poll(
      async () => {
        const after = await getModel<CampModel>(page);
        return after.seats.find((s) => s.isYou)?.sources.find((g) => g.objectId === chipId)?.spent ?? true;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** The first time `lastTrick` is non-null on `hostPage`, hovers the pile,
 * asserts it fans open with all 3 plays, then moves away and asserts it
 * closes (D-06, SCENE-04). */
async function maybeCheckLastTrick(hostPage: Page, state: DriveState): Promise<void> {
  if (state.lastTrickChecked) return;
  const model = await getModel<CampModel>(hostPage);
  if (model.sceneKey !== "camp" || model.lastTrick === null) return;
  state.lastTrickChecked = true;

  await hoverObject(hostPage, LAST_TRICK_ID);
  await expect
    .poll(async () => (await getModel<CampModel>(hostPage)).lastTrick?.open ?? false, { timeout: 10_000 })
    .toBe(true);
  const opened = await getModel<CampModel>(hostPage);
  expect(opened.lastTrick?.plays.length).toBe(3);

  await hostPage.mouse.move(5, 5);
  await expect
    .poll(async () => (await getModel<CampModel>(hostPage)).lastTrick?.open ?? true, { timeout: 10_000 })
    .toBe(false);
}

/** Asserts SCENE-03's dimming rule: whenever the viewer's own hand has a
 * dimmed card, the prompt addresses the viewer — dimming only ever happens
 * on your own turn. */
async function assertDimmingInvariant(pages: Page[]): Promise<void> {
  for (const page of pages) {
    const model = await getModel<CampModel>(page);
    if (model.sceneKey !== "camp") continue;
    const hasDimmed = model.hand.some((c) => c.dimmed);
    if (hasDimmed) {
      expect(model.prompt.tone).toBe("your-move");
    }
    // The Whisper button always says why it cannot be pressed.
    if (model.whisper.shown) {
      expect(model.whisper.visible).toBe(model.whisper.state === "ready");
      expect(model.whisper.reason === null).toBe(model.whisper.state === "ready");
      if ((model.trick?.plays.length ?? 0) > 0 && model.whisper.state !== "used") {
        expect(model.whisper.state).toBe("wait-between-tricks");
      }
    }
  }
}

/** One driving pass over every page: passes a gated window it holds,
 * picks a pickable face-up objective if the viewer may act, otherwise (with
 * a playable card available) runs the Whisper once, an ability once, and
 * otherwise plays the first legal card. */
async function stepCamp(pages: Page[], state: DriveState): Promise<void> {
  for (const page of pages) {
    const model = await getModel<CampModel>(page);
    if (model.sceneKey !== "camp") continue;
    const you = model.seats.find((s) => s.isYou);
    if (!you) continue;

    if (model.banner?.youPending && model.targeting === null) {
      await clickUntilChanged<CampModel>(page, GATE_SKIP_ID, (m) => m.sceneKey !== "camp" || !(m.banner?.youPending ?? false));
      continue;
    }

    if (you.mayAct) {
      const objective = model.faceUpObjectives.find((o) => o.pickable);
      if (objective) {
        const objectiveId = objective.objectiveId;
        await clickUntilChanged<CampModel>(
          page,
          objective.objectId,
          (m) => !(m.faceUpObjectives.find((o) => o.objectiveId === objectiveId)?.pickable ?? false),
        );
        continue;
      }
    }

    const playable = model.hand.find((c) => c.playable);
    if (playable) {
      if (!state.whisperDone && model.whisper.visible) {
        await runWhisper(pages, page);
        state.whisperDone = true;
        continue;
      }
      if (!state.abilityDone) {
        const ability = you.sources.find((g) => g.usable && DRIVABLE_ABILITIES.has(g.sourceId));
        if (ability) {
          await runAbility(page, ability);
          state.abilityDone = true;
          continue;
        }
      }
      const playedCardId = playable.id;
      // Playing the trick's final card can end the camp outright (success
      // or failure), moving the scene straight to the trail — at
      // which point `hand` no longer exists on the model at all. Accept
      // that scene transition as success too, alongside the ordinary
      // "card left the hand" case.
      await clickHandCard<CampModel & { hand?: CardModel[] }>(
        page,
        playable.objectId,
        (m) => m.sceneKey !== "camp" || !(m.hand ?? []).some((c) => c.id === playedCardId),
      );
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Task 1: full-camp driver
// ---------------------------------------------------------------------------

test.describe("Expedition full camp (SCENE-02/03/04/08/09/11, criterion 5)", () => {
  test("a full 3-player camp through the test bridge (criterion 5)", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, NAMES);
    const hostPage = pages[0]!;
    const state: DriveState = { whisperDone: false, abilityDone: false, lastTrickChecked: false };

    try {
      let camps = 0;
      let resolved = false;

      while (camps < 3 && !resolved) {
        camps++;
        await reachCamp(pages);

        let passes = 0;
        let campOver = false;
        while (passes < 400 && !campOver) {
          passes++;
          const scenes = await Promise.all(pages.map((p) => getScene(p)));
          if (scenes.every((s) => s !== "camp")) {
            campOver = true;
            break;
          }
          await stepCamp(pages, state);
          await maybeCheckLastTrick(hostPage, state);
          await assertDimmingInvariant(pages);
        }
        if (!campOver) {
          throw new Error(`camp ${camps} did not reach the trail within 400 driver passes`);
        }
        if (state.whisperDone && state.abilityDone) {
          resolved = true;
        }
      }

      if (!resolved) {
        const missing: string[] = [];
        if (!state.whisperDone) missing.push("the Whisper");
        if (!state.abilityDone) missing.push("an ability use");
        throw new Error(`Ran ${camps} camp(s) but never exercised: ${missing.join(", ")}`);
      }

      expect(state.whisperDone).toBe(true);
      expect(state.abilityDone).toBe(true);

      const finalModels = await Promise.all(pages.map((p) => getModel<TrailView & { trail?: unknown }>(p)));
      for (const m of finalModels) {
        expect(m.sceneKey).not.toBe("camp");
      }
      const serialized = finalModels.map((m) => JSON.stringify([m.panel?.kind, m.trail]));
      expect(serialized.every((s) => s === serialized[0])).toBe(true);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // Drag and drop onto the table
  // -------------------------------------------------------------------------

  test("a card is played by dragging it onto the stump; an illegal drop snaps back", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, NAMES);
    const state: DriveState = { whisperDone: true, abilityDone: true, lastTrickChecked: false };

    try {
      await reachCamp(pages);

      let mover: Page | null = null;
      let idler: Page | null = null;
      for (let pass = 0; pass < 200 && mover === null; pass++) {
        const models = await Promise.all(pages.map((p) => getModel<CampModel>(p)));
        const turn = models.findIndex((m) => m.sceneKey === "camp" && m.hand.some((c) => c.playable) && !m.faceUpObjectives.some((o) => o.pickable));
        if (turn !== -1) {
          mover = pages[turn]!;
          idler = pages.find((p, i) => i !== turn && models[i]!.sceneKey === "camp" && models[i]!.hand.length > 0) ?? null;
          break;
        }
        await stepCamp(pages, state);
      }
      if (mover === null || idler === null) throw new Error("no page ever had a playable card with a teammate waiting");

      // Illegal: the idle seat drags a card onto the stump.
      const idleBefore = await getModel<CampModel>(idler);
      const refused = idleBefore.hand[0]!;
      expect(refused.blockedReason).toBe("Not your turn yet");
      await dragHandCardToStump(idler, refused.objectId);
      await expect.poll(async () => (await getModel<CampModel>(idler!)).tooltip).toEqual({
        title: `Can't play ${refused.label}`,
        text: "",
        badges: [],
        reason: "Not your turn yet",
      });
      const idleAfter = await getModel<CampModel>(idler);
      expect(idleAfter.hand.map((c) => c.id)).toEqual(idleBefore.hand.map((c) => c.id));
      expect(idleAfter.trick?.plays.length ?? 0).toBe(idleBefore.trick?.plays.length ?? 0);

      // Legal: the seat on turn drags a playable card onto the stump.
      const before = await getModel<CampModel>(mover);
      const played = before.hand.find((c) => c.playable)!;
      const playsBefore = before.trick?.plays.length ?? 0;
      await dragHandCardToStump(mover, played.objectId, async () => {
        await expect.poll(async () => (await getModel<CampModel>(mover!)).drag).toEqual({ cardId: played.id, legal: true });
        const held = await getModel<CampModel>(mover!);
        expect(held.hand.find((c) => c.id === played.id)?.dragging).toBe(true);
        expect(held.trick?.plays.length ?? 0).toBe(playsBefore);
      });
      await expect
        .poll(async () => {
          const m = await getModel<CampModel>(mover!);
          return m.sceneKey !== "camp" || !m.hand.some((c) => c.id === played.id);
        })
        .toBe(true);
      const after = await getModel<CampModel>(mover);
      if (after.sceneKey === "camp") {
        expect(after.trick?.plays.length ?? 0).toBeGreaterThan(playsBefore);
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // Task 2: refresh-and-resume, per-browser card pack, inert interactables
  // -------------------------------------------------------------------------

  test("refresh mid-muster, after a pick and in an open window resumes the same seat (SCENE-11)", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, NAMES);

    try {
      // Mid-muster reload.
      let hostFireside = await getModel<TrailView>(page);
      const offerIdsBefore = (draftOffer(hostFireside) ?? []).map((o) => o.sourceId).sort();
      expect(offerIdsBefore).toHaveLength(9);
      await page.reload();
      await waitForBridge(page);
      hostFireside = await getModel<TrailView>(page);
      expect((draftOffer(hostFireside) ?? []).map((o) => o.sourceId).sort()).toEqual(offerIdsBefore);

      // Pick a character, then reload.
      const offer = draftOffer(hostFireside);
      if (offer === null) throw new Error("host has no character offer after reload");
      const pick = pickDraftOffer(offer);
      await clickUntilChanged<TrailView>(page, pick.objectId, (m) => draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });

      await page.reload();
      await waitForBridge(page);
      const afterPickReload = await getModel<TrailView>(page);
      expect(draftOffer(afterPickReload)).toBeNull();
      expect(kitIds(afterPickReload)).toEqual([pick.sourceId]);

      // Vote on the host, walk everyone through the trail, reach camp.
      await walkTrail(page, { length: "short" });
      await reachCamp(pages);

      // Drive until the host sees an open window, then reload mid-window.
      const state: DriveState = { whisperDone: false, abilityDone: false, lastTrickChecked: false };
      let openWindow = false;
      for (let i = 0; i < 300 && !openWindow; i++) {
        const model = await getModel<CampModel>(page);
        if (model.sceneKey !== "camp") {
          await reachCamp(pages);
          continue;
        }
        const you = model.seats.find((s) => s.isYou);
        const leading = (model.trick?.plays.length ?? 0) === 0;
        if (model.faceUpObjectives.some((o) => o.pickable) || (you?.mayAct && leading && model.whisper.visible)) {
          openWindow = true;
          break;
        }
        await stepCamp(pages, state);
      }
      if (!openWindow) throw new Error("host never reached an open window (objective pick / between tricks)");

      const before = await getModel<CampModel>(page);
      const youSeatIdBefore = before.youSeatId;
      const handIdsBefore = before.hand.map((c) => c.objectId).sort();
      const promptBefore = before.prompt;

      await page.reload();
      await waitForBridge(page);
      const after = await getModel<CampModel>(page);
      expect(after.youSeatId).toBe(youSeatIdBefore);
      expect(after.hand.map((c) => c.objectId).sort()).toEqual(handIdsBefore);
      expect(after.prompt).toEqual(promptBefore);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("card pack is per browser and persists (SCENE-08)", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, NAMES);
    const guestPage = pages[1]!;

    try {
      await reachCamp(pages);

      await page.getByTestId("expedition-settings-button").click();
      await page.getByRole("radio", { name: "Classic" }).check();
      await page.keyboard.press("Escape");

      await expect.poll(async () => (await getModel<CampModel>(page)).cardPackId).toBe("classic");
      const stored = await page.evaluate(() => window.localStorage.getItem("expedition-card-pack"));
      expect(stored).toBe("classic");

      const guestModel = await getModel<CampModel>(guestPage);
      expect(guestModel.cardPackId).toBe("big-index");

      await page.reload();
      await waitForBridge(page);
      const afterReload = await getModel<CampModel>(page);
      expect(afterReload.cardPackId).toBe("classic");
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("interactables never send game actions (SCENE-09)", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, NAMES);

    try {
      await reachCamp(pages);

      let gameActionFrames = 0;
      page.on("websocket", (ws) => {
        ws.on("framesent", (frame) => {
          const payload = typeof frame.payload === "string" ? frame.payload : "";
          if (payload.includes("game_action")) gameActionFrames++;
        });
      });

      await page.reload();
      await waitForBridge(page);

      const countBeforeClicks = gameActionFrames;
      const snapshot = JSON.stringify(await getModel<CampModel>(page));

      for (const id of ["campfire", "fireflies", "lantern", "mascot"]) {
        await clickObject(page, `interactable:${id}`);
        await clickObject(page, `interactable:${id}`);
      }

      await page.waitForTimeout(750);

      expect(gameActionFrames).toBe(countBeforeClicks);
      const after = JSON.stringify(await getModel<CampModel>(page));
      expect(after).toBe(snapshot);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// A forced Thunderstorm (needs the worker in dev mode, see dev-mode.spec.ts)
// ---------------------------------------------------------------------------

interface StormModel {
  sceneKey: SceneName;
  youSeatId: string;
  mods: { id: string; name: string; badge: string | null; pips: number; alert: boolean }[];
  sky: { location: string; precipitation: string; strike: string | null; notice: string | null };
  lastTrick: { winnerSeatId: string; plays: { seatId: string; card: { identity: { kind: string; rank?: number } } }[] } | null;
  prompt: { text: string };
}

test("a forced Thunderstorm: its chance on the top bar, a strike's alert, and the lowest card winning the struck trick", async ({ page }) => {
  test.setTimeout(120_000);
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
  await page.getByTestId("start-game").click();
  await waitForBridge(page);
  const model = () => getModel<StormModel>(page);

  await panel.getByTestId("dev-field-jump-to-camp-camp").fill("2");
  await panel.getByTestId("dev-field-jump-to-camp-stage").selectOption("camp");
  await panel.getByTestId("dev-shortcut-jump-to-camp").click();
  await expect.poll(async () => (await model()).sceneKey).toBe("camp");
  await panel.getByTestId("dev-field-set-spec-location").selectOption("clifftop");
  await panel.getByTestId("dev-field-set-spec-weather").selectOption("thunderstorm");
  await panel.getByTestId("dev-shortcut-set-spec").click();
  await expect.poll(async () => (await model()).mods.map((m) => m.id)).toEqual(["clifftop", "thunderstorm"]);
  let m = await model();
  expect(m.mods[1]).toMatchObject({ name: "Thunderstorm", badge: "20%", pips: 2, alert: false });
  expect(m.sky).toMatchObject({ location: "clifftop", precipitation: "storm" });

  // One objective nobody can finish or fail this trick, and a strike on the
  // trick about to start: the strike lands and the lowest card wins.
  const json = JSON.parse(await panel.getByTestId("dev-state-json").inputValue());
  const attempt = json.stage.attempt;
  attempt.camp.objectives = [{ id: "steady", kind: "exactly-n", n: 3, ownerSeatId: m.youSeatId }];
  attempt.effects = [{ origin: { kind: "mod", modId: "thunderstorm", strength: "full" }, atTrick: 0, lasts: "trick", deferIfFatal: true, params: { strike: true }, audience: "public" }];
  await panel.getByTestId("dev-state-json").fill(JSON.stringify(json));
  await panel.getByTestId("dev-apply-state").click();
  await expect.poll(async () => (await model()).sky.strike).not.toBeNull();
  m = await model();
  const struck = m.sky.strike;
  expect(m.mods[1]).toMatchObject({ badge: "Lowest wins", pips: 1, alert: true });
  expect(m.sky.notice).toBe("Lightning struck: the lowest card wins this trick");

  await panel.getByTestId("dev-autoplay-scope").selectOption("everyone");
  await panel.getByTestId("dev-autoplay-steps").fill("3");
  await panel.getByTestId("dev-autoplay-run").click();
  await expect.poll(async () => (await model()).lastTrick?.plays.length ?? 0).toBe(3);
  m = await model();
  const strength = (play: NonNullable<StormModel["lastTrick"]>["plays"][number]) => (play.card.identity.kind === "joker" ? 99 : play.card.identity.rank!);
  const lowest = m.lastTrick!.plays.reduce((low, play) => (strength(play) < strength(low) ? play : low));
  expect(m.lastTrick!.winnerSeatId).toBe(lowest.seatId);
  expect(m.sky.strike, "the strike stays on its trick; a new roll may strike the next").not.toBe(struck);
});

// ---------------------------------------------------------------------------
// A forced Cave (needs the worker in dev mode, see dev-mode.spec.ts)
// ---------------------------------------------------------------------------

interface CaveModel {
  sceneKey: SceneName;
  youSeatId: string;
  mods: { id: string }[];
  trick: { plays: TrickPlayModel[] } | null;
  lastTrick: { plays: TrickPlayModel[] } | null;
}

test("a forced Cave: teammates' cards lie face down showing only their suit, and flip when the trick completes", async ({ page }) => {
  test.setTimeout(120_000);
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 1 joined\./);
  await panel.getByTestId("dev-add-bot").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Bot 2 joined\./);
  await page.getByTestId("start-game").click();
  await waitForBridge(page);
  const model = () => getModel<CaveModel>(page);

  await panel.getByTestId("dev-field-jump-to-camp-camp").fill("2");
  await panel.getByTestId("dev-field-jump-to-camp-stage").selectOption("camp");
  await panel.getByTestId("dev-shortcut-jump-to-camp").click();
  await expect.poll(async () => (await model()).sceneKey).toBe("camp");
  await panel.getByTestId("dev-field-set-spec-location").selectOption("cave");
  await panel.getByTestId("dev-field-set-spec-weather").selectOption("fair");
  await panel.getByTestId("dev-shortcut-set-spec").click();
  await expect.poll(async () => (await model()).mods.map((m) => m.id)).toEqual(["cave", "fair"]);

  // One objective no single trick can settle, so the camp is still open
  // when the first trick completes.
  await expect(panel.getByTestId("dev-state-json")).toHaveValue(/"location":\s*"cave"/);
  const json = JSON.parse(await panel.getByTestId("dev-state-json").inputValue());
  json.stage.attempt.camp.objectives = [{ id: "steady", kind: "exactly-n", n: 3, ownerSeatId: (await model()).youSeatId }];
  await panel.getByTestId("dev-state-json").fill(JSON.stringify(json));
  await panel.getByTestId("dev-apply-state").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^State loaded/);

  // One step at a time until a teammate's card is on the stump.
  await panel.getByTestId("dev-autoplay-scope").selectOption("everyone");
  await panel.getByTestId("dev-autoplay-steps").fill("1");
  const botPlay = async () => {
    const m = await model();
    return m.trick?.plays.find((p) => p.seatId !== m.youSeatId) ?? null;
  };
  for (let step = 0; step < 12 && (await botPlay()) === null; step++) {
    const before = JSON.stringify(await model());
    await panel.getByTestId("dev-autoplay-run").click();
    await expect.poll(async () => JSON.stringify(await model())).not.toBe(before);
  }
  const hidden = (await botPlay())!;
  expect(hidden).toMatchObject({ hidden: true, objectId: `trick:face-down:${hidden.seatId}` });
  expect(["spades", "hearts", "diamonds", "clubs", "joker"]).toContain(hidden.suit);
  expect(hidden.card, "a face-down play carries no card").toBeUndefined();
  expect(await page.evaluate((id) => window.__expeditionTest?.positionOf(id) ?? null, hidden.objectId)).not.toBeNull();
  const now = await model();
  const mine = now.trick!.plays.find((p) => p.seatId === now.youSeatId);
  if (mine !== undefined) expect(mine).toMatchObject({ hidden: false, card: { label: expect.any(String) } });

  // Finish the trick: every card in it shows on the last-trick pile.
  for (let step = 0; step < 6 && ((await model()).lastTrick?.plays.length ?? 0) === 0; step++) {
    const before = JSON.stringify(await model());
    await panel.getByTestId("dev-autoplay-run").click();
    await expect.poll(async () => JSON.stringify(await model())).not.toBe(before);
  }
  const last = (await model()).lastTrick!.plays;
  expect(last).toHaveLength(3);
  expect(last.find((p) => p.seatId === hidden.seatId)!.card!.label).toMatch(/^([2-9]|10|[JQKA])[♠♥♦♣]$|^(Sun|Moon)$/);
});
