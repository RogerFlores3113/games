import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { clickObject, getModel, getScene, hoverObject, startExpeditionGame, waitForBridge } from "./expedition-helpers";

/**
 * Full-camp, reconnect, card-pack and interactables e2e (Plan 12-13, spec
 * §8). Drives an entire camp — draft, loadout, play, a gear use, a Whisper,
 * the last-trick glance — through `window.__expeditionTest` plus real mouse
 * input, then proves refresh-and-resume, per-browser card packs, and that
 * the four interactables never touch game state. Every id used below
 * mirrors `apps/web/lib/expedition/expedition-ids.ts`'s literal scheme
 * (`draft:<id>`, `loadout:<id>`, `gear:<id>`, `seat:<seatId>`,
 * `objective:<label>`, `hand:<label>`, "ready", "whisper", "confirm",
 * "last-trick", `interactable:<id>`) verbatim, per the plan's own
 * `<interfaces>` block — this spec never imports app code.
 */

const WHISPER_ID = "whisper";
const CONFIRM_ID = "confirm";
const READY_ID = "ready";
const LAST_TRICK_ID = "last-trick";
const DRAFT_PREFERENCE = ["peek", "ghost", "chatter", "broadcast"];

interface CardModel {
  id: string;
  objectId: string;
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

interface GearChip {
  gearId: string;
  objectId: string;
  spent: boolean;
  usable: boolean;
}

interface SeatModel {
  seatId: string;
  objectId: string;
  isYou: boolean;
  mayAct: boolean;
  gear: GearChip[];
  objectives: ObjectiveChip[];
  reveals: { objectId: string }[];
  targetable: boolean;
}

interface TrickPlayModel {
  seatId: string;
  card: CardModel;
}

interface Targeting {
  sourceObjectId: string;
  nextKind: "own-card" | "teammate" | "face-up-objective" | "own-objective" | null;
  canConfirm: boolean;
}

interface CampModel {
  sceneKey: "camp" | "between-camps";
  cardPackId: string;
  youSeatId: string | null;
  sign: { label: string };
  seats: SeatModel[];
  hand: CardModel[];
  lastTrick: { plays: TrickPlayModel[]; open: boolean } | null;
  faceUpObjectives: ObjectiveChip[];
  whisper: { visible: boolean; active: boolean };
  targeting: Targeting | null;
}

interface DraftOfferItem {
  gearId: string;
  objectId: string;
  size: number;
}

interface OwnedItem {
  gearId: string;
  objectId: string;
  equipped: boolean;
  fits: boolean;
}

interface BetweenCampsModel {
  draftOffer: DraftOfferItem[] | null;
  owned: OwnedItem[];
  youReady: boolean;
  lastResult: { campNumber: number; status: "succeeded" | "failed" } | null;
}

interface DriveState {
  whisperDone: boolean;
  gearDone: boolean;
  lastTrickChecked: boolean;
}

// ---------------------------------------------------------------------------
// Shared low-level waits
// ---------------------------------------------------------------------------

/** Waits until the bridge's `scene` (not `model`) reports `expected`. */
async function waitForScene(page: Page, expected: "camp" | "between-camps", timeout = 60_000): Promise<void> {
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
    // advances the whole room past the fireside) may have already
    // satisfied the expected condition even though its own poll window
    // expired first, or before we ever click at all. Check before touching
    // the object, since a legitimately-satisfied state can make the object
    // disappear entirely (a played card leaves the hand; every fireside id
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

function pickDraftOffer<T extends { gearId: string; size: number }>(offers: T[]): T {
  for (const preferred of DRAFT_PREFERENCE) {
    const found = offers.find((o) => o.gearId === preferred);
    if (found) return found;
  }
  const sizeOne = offers.find((o) => o.size <= 1);
  if (sizeOne) return sizeOne;
  const first = offers[0];
  if (!first) throw new Error("pickDraftOffer: draftOffer was empty");
  return first;
}

// ---------------------------------------------------------------------------
// reachCamp / stepCamp — shared full-camp driver helpers
// ---------------------------------------------------------------------------

/** Drives every page in `pages` from a fresh (or replayed) fireside
 * draft/loadout/ready screen to the camp scene: picks a draft offer by
 * preference, equips a fitting owned item if one exists, readies up, and
 * waits until every page's scene is "camp". */
async function reachCamp(pages: Page[]): Promise<void> {
  for (const page of pages) {
    // The store's model can update to the fireside's BetweenCampsModel
    // slightly before CampScene's own DESTROY/BetweenCampsScene's own
    // create() finish the actual Phaser scene switch (they're two separate,
    // independently-timed reactions to the same server view arriving).
    // Wait for the SCENE itself, not just a non-null model, so the ids we
    // are about to click ("draft:<id>", "ready", ...) are actually
    // registered by the time we look for them.
    await waitForScene(page, "between-camps", 60_000);
    const model = await getModel<BetweenCampsModel>(page);
    if (model.draftOffer === null) continue;
    const pick = pickDraftOffer(model.draftOffer);
    await clickUntilChanged<BetweenCampsModel>(page, pick.objectId, (m) => m.draftOffer === null, { perAttemptTimeoutMs: 15_000 });
  }

  for (const page of pages) {
    await page.waitForFunction(() => window.__expeditionTest?.model && (window.__expeditionTest.model as BetweenCampsModel).draftOffer === null, undefined, { timeout: 15_000 });
  }

  for (const page of pages) {
    // Another page's own "ready" click a moment ago may have already made
    // every seat ready (this page's own readiness was already true from
    // its own earlier pass), which the server can advance out of the
    // fireside before we get here. In that case there is nothing left for
    // THIS page to click — it has already arrived at camp.
    if ((await getScene(page)) === "camp") continue;
    const model = await getModel<BetweenCampsModel>(page);
    if (model.youReady) continue;
    const fitting = model.owned.find((o) => o.fits && !o.equipped);
    if (fitting) {
      await clickUntilChanged<BetweenCampsModel>(
        page,
        fitting.objectId,
        (m) => m.owned.find((o) => o.gearId === fitting.gearId)?.equipped === true,
        { perAttemptTimeoutMs: 15_000 },
      );
    }
    // Once every seat is ready the room advances straight past the
    // fireside (possibly from another page's own "ready" click landing a
    // moment after this one), so "ready" itself vanishes — accept either
    // this page's own `youReady` flipping true, or the scene having
    // already moved on to "camp", as success.
    await clickUntilChanged<BetweenCampsModel & { sceneKey?: string }>(
      page,
      READY_ID,
      (m) => m.youReady === true || m.sceneKey === "camp",
      { perAttemptTimeoutMs: 15_000 },
    );
  }

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

  model = await clickUntilChanged<CampModel>(page, WHISPER_ID, (m) => m.whisper.active);

  const cardTarget = model.hand.find((c) => c.targetable);
  if (!cardTarget) throw new Error("runWhisper: no targetable hand card after opening Whisper");
  model = await clickHandCard<CampModel>(page, cardTarget.objectId, (m) => m.targeting !== null && m.targeting.nextKind === "teammate");

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

  if (thirdPage !== null) {
    const thirdModel = await getModel<CampModel>(thirdPage);
    const revealCount = thirdModel.seats.find((s) => s.seatId === whispererSeatId)?.reveals.length ?? 0;
    expect(revealCount).toBe(0);
  }
}

/** Runs the D-02 highlight-then-confirm gear flow on `page` for `gearId`:
 * click the gear chip, walk `targeting.nextKind` (own-card / teammate /
 * face-up-objective / own-objective) clicking the first targetable object
 * of each kind, then confirm and wait until that chip reports `spent`. */
async function runGear(page: Page, gearId: string): Promise<void> {
  let model = await clickUntilChanged<CampModel>(
    page,
    `gear:${gearId}`,
    (m) => m.targeting !== null && m.targeting.sourceObjectId === `gear:${gearId}`,
  );

  while (model.targeting !== null && model.targeting.nextKind !== null) {
    const kind = model.targeting.nextKind;
    const kindBefore = kind;
    let targetObjectId: string | undefined;
    let isHandCard = false;
    if (kind === "own-card") {
      targetObjectId = model.hand.find((c) => c.targetable)?.objectId;
      isHandCard = true;
    } else if (kind === "teammate") {
      targetObjectId = model.seats.find((s) => s.targetable)?.objectId;
    } else {
      targetObjectId =
        model.faceUpObjectives.find((o) => o.targetable)?.objectId ??
        model.seats.flatMap((s) => s.objectives).find((o) => o.targetable)?.objectId;
    }
    if (!targetObjectId) throw new Error(`runGear: no targetable object found for kind "${kind}"`);
    const progressed = (m: CampModel) => m.targeting === null || m.targeting.nextKind !== kindBefore;
    if (isHandCard) {
      model = await clickHandCard<CampModel>(page, targetObjectId, progressed);
    } else {
      model = await clickUntilChanged<CampModel>(page, targetObjectId, progressed);
    }
  }

  if (model.targeting === null || !model.targeting.canConfirm) {
    throw new Error("runGear: targeting never reached a confirmable state");
  }
  await clickUntilChanged<CampModel>(page, CONFIRM_ID, (m) => m.targeting === null);
  await expect
    .poll(
      async () => {
        const after = await getModel<CampModel>(page);
        return after.seats.find((s) => s.isYou)?.gear.find((g) => g.gearId === gearId)?.spent ?? false;
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
 * dimmed card, the in-world sign reads "Your turn" or "Between tricks" —
 * dimming only ever happens on your own turn. */
async function assertDimmingInvariant(pages: Page[]): Promise<void> {
  for (const page of pages) {
    const model = await getModel<CampModel>(page);
    if (model.sceneKey !== "camp") continue;
    const hasDimmed = model.hand.some((c) => c.dimmed);
    if (hasDimmed) {
      expect(["Your turn", "Between tricks"]).toContain(model.sign.label);
    }
  }
}

/** One driving pass over every page: picks a pickable face-up objective if
 * the viewer may act, otherwise (with a playable card available) runs the
 * Whisper once, the gear flow once, and otherwise plays the first legal
 * card. */
async function stepCamp(pages: Page[], state: DriveState): Promise<void> {
  for (const page of pages) {
    const model = await getModel<CampModel>(page);
    if (model.sceneKey !== "camp") continue;
    const you = model.seats.find((s) => s.isYou);
    if (!you) continue;

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
      if (!state.gearDone) {
        const gear = you.gear.find((g) => g.usable);
        if (gear) {
          await runGear(page, gear.gearId);
          state.gearDone = true;
          continue;
        }
      }
      const playedCardId = playable.id;
      // Playing the trick's final card can end the camp outright (success
      // or failure), moving the scene straight to "between-camps" — at
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
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
    const hostPage = pages[0]!;
    const state: DriveState = { whisperDone: false, gearDone: false, lastTrickChecked: false };

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
          if (scenes.every((s) => s === "between-camps")) {
            campOver = true;
            break;
          }
          await stepCamp(pages, state);
          await maybeCheckLastTrick(hostPage, state);
          await assertDimmingInvariant(pages);
        }
        if (!campOver) {
          throw new Error(`camp ${camps} did not reach "between-camps" within 400 driver passes`);
        }
        if (state.whisperDone && state.gearDone) {
          resolved = true;
        }
      }

      if (!resolved) {
        const missing: string[] = [];
        if (!state.whisperDone) missing.push("the Whisper");
        if (!state.gearDone) missing.push("a gear use");
        throw new Error(`Ran ${camps} camp(s) but never exercised: ${missing.join(", ")}`);
      }

      expect(state.whisperDone).toBe(true);
      expect(state.gearDone).toBe(true);

      const finalModels = await Promise.all(pages.map((p) => getModel<BetweenCampsModel>(p)));
      for (const m of finalModels) {
        expect(m.lastResult).not.toBeNull();
      }
      const serialized = finalModels.map((m) => JSON.stringify(m.lastResult));
      expect(serialized.every((s) => s === serialized[0])).toBe(true);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // Task 2: refresh-and-resume, per-browser card pack, inert interactables
  // -------------------------------------------------------------------------

  test("refresh mid-draft, mid-loadout and in an open window resumes the same seat (SCENE-11)", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);

    try {
      // Mid-draft reload.
      let hostBetween = await getModel<BetweenCampsModel>(page);
      const draftIdsBefore = (hostBetween.draftOffer ?? []).map((o) => o.gearId).sort();
      await page.reload();
      await waitForBridge(page);
      hostBetween = await getModel<BetweenCampsModel>(page);
      expect((hostBetween.draftOffer ?? []).map((o) => o.gearId).sort()).toEqual(draftIdsBefore);

      // Pick a draft, then mid-loadout reload.
      if (hostBetween.draftOffer === null) throw new Error("host has no draft offer after reload");
      const pick = pickDraftOffer(hostBetween.draftOffer);
      hostBetween = await clickUntilChanged<BetweenCampsModel>(page, pick.objectId, (m) => m.draftOffer === null, { perAttemptTimeoutMs: 15_000 });

      const fitting = hostBetween.owned.find((o) => o.fits && !o.equipped);
      if (fitting) {
        await clickUntilChanged<BetweenCampsModel>(
          page,
          fitting.objectId,
          (m) => m.owned.find((o) => o.gearId === fitting.gearId)?.equipped === true,
          { perAttemptTimeoutMs: 15_000 },
        );
      }

      await page.reload();
      await waitForBridge(page);
      const afterLoadoutReload = await getModel<BetweenCampsModel>(page);
      expect(afterLoadoutReload.draftOffer).toBeNull();
      if (fitting) {
        expect(afterLoadoutReload.owned.find((o) => o.gearId === fitting.gearId)?.equipped).toBe(true);
      }

      // Ready the host, drive the other two through the fireside, reach camp.
      await clickUntilChanged<BetweenCampsModel & { sceneKey?: string }>(
        page,
        READY_ID,
        (m) => m.youReady === true || m.sceneKey === "camp",
        { perAttemptTimeoutMs: 15_000 },
      );
      await reachCamp(pages.slice(1));
      await waitForScene(page, "camp", 60_000);

      // Drive until the host sees an open window, then reload mid-window.
      const state: DriveState = { whisperDone: false, gearDone: false, lastTrickChecked: false };
      let openWindow = false;
      for (let i = 0; i < 300 && !openWindow; i++) {
        const model = await getModel<CampModel>(page);
        if (model.sign.label === "Pick objectives" || model.sign.label === "Between tricks") {
          openWindow = true;
          break;
        }
        await stepCamp(pages, state);
      }
      if (!openWindow) throw new Error("host never reached an open window (Pick objectives / Between tricks)");

      const before = await getModel<CampModel>(page);
      const youSeatIdBefore = before.youSeatId;
      const handIdsBefore = before.hand.map((c) => c.objectId).sort();
      const signBefore = before.sign.label;

      await page.reload();
      await waitForBridge(page);
      const after = await getModel<CampModel>(page);
      expect(after.youSeatId).toBe(youSeatIdBefore);
      expect(after.hand.map((c) => c.objectId).sort()).toEqual(handIdsBefore);
      expect(after.sign.label).toBe(signBefore);
    } finally {
      for (const context of contexts) await context.close();
    }
  });

  test("card pack is per browser and persists (SCENE-08)", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);
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
    const { pages, contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Sam"]);

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
