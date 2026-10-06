import type { Page } from "@playwright/test";
import { getModel } from "./expedition-helpers";

/** Click-driving helpers shared by the UI tour. Extracted verbatim from
 * expedition-camp.spec.ts (which keeps its own copy until it is migrated). */

/** Characters and drafted items whose abilities the camp drivers can
 * target (a seat, a hand card or an objective) and that never hold a gated
 * window (a rescue). */
export const DRAFT_PREFERENCE = ["explorer", "jd", "cartographer", "leader", "trail-map", "trained-monkey", "smoke-signal", "whetstone"];

export type SceneName = "camp" | "trail" | "run-end";

/** The trail model fields the drivers read (mirrors
 * apps/web/lib/expedition/trail-model.ts). Optional because a click can
 * move the page on to another scene before the predicate runs. */
export interface DraftTile {
  sourceId: string;
  objectId: string;
  name: string;
  /** A draft bundle's items; absent for a muster character. */
  itemIds?: string[];
}

export interface MusterCard {
  characterId: string;
  objectId: string;
  name: string;
  pickable: boolean;
  yours: boolean;
  takenBy: string | null;
}

export interface VoteOption {
  id: string;
  objectId: string;
  yours: boolean;
  voters: string[];
}

export interface GearTile {
  uid: string;
  itemId: string;
  objectId: string;
}

export interface Gear {
  equipped: string[];
  slots: { objectId: string; item: GearTile | null }[];
  backpack: GearTile[];
  locked: boolean;
}

export interface ShopEntry {
  stockId: string;
  objectId: string;
  price: number | null;
  buy: { kind: "buy" } | { kind: "disabled"; reason: string } | { kind: "status"; label: string };
}

export type TrailPanel =
  | { kind: "muster"; characters: MusterCard[]; lengths: VoteOption[] }
  | { kind: "draft"; draft: { kind: "offer"; bundles: DraftTile[] } | { kind: "taken" | "none" } }
  | { kind: "route"; options: VoteOption[] }
  | { kind: "event" }
  | { kind: "loadout"; gear: Gear | null; shop: { purse: number; entries: ShopEntry[] } | null };

export interface TrailView {
  sceneKey?: string;
  topBar?: { supplies: number; purse: number };
  panel?: TrailPanel;
  kit?: { sourceId: string; objectId: string; name: string }[] | null;
  ready?: { state: "open" | "done" | "disabled"; label: string } | null;
  vote?: { title: string; winner: string; flip: unknown } | null;
}

/** What you may pick now: the free characters at muster until yours is
 * picked, then the bundles of a draft offer after a cleared camp. */
export function draftOffer(m: TrailView): DraftTile[] | null {
  const panel = m.panel;
  if (panel?.kind === "muster") {
    if (panel.characters.some((c) => c.yours)) return null;
    return panel.characters.filter((c) => c.pickable).map((c) => ({ sourceId: c.characterId, objectId: c.objectId, name: c.name }));
  }
  return panel?.kind === "draft" && panel.draft.kind === "offer" ? panel.draft.bundles : null;
}

/** The muster's lengths or the route options, while this page has not voted. */
export function openVote(m: TrailView): VoteOption[] | null {
  const panel = m.panel;
  const options = panel?.kind === "muster" ? panel.lengths : panel?.kind === "route" ? panel.options : null;
  if (options === null || options.some((o) => o.yours)) return null;
  return options;
}

/** Your character, your upgrade, then your equipped items, by def id. */
export function kitIds(m: TrailView): string[] {
  return (m.kit ?? []).map((k) => k.sourceId);
}

export function isReady(m: TrailView): boolean {
  return m.ready?.state === "done";
}

export interface TrailChoices {
  /** Draft picks and characters, most wanted first. */
  preference?: readonly string[];
  /** The run length this page votes for at muster. */
  length?: "short" | "standard" | "long";
}

/** Does the next thing this page owes in the trail scene, in stage order:
 * picks a character or a draft offer, votes (the given length, else the
 * first option), or readies. False when the page waits on the crew or has
 * left the trail. */
export async function trailStep(page: Page, choices: TrailChoices = {}): Promise<boolean> {
  if ((await getModel<TrailView>(page)).sceneKey !== "trail") return false;
  await waitForScene(page, "trail");
  const model = await getModel<TrailView>(page);
  const offer = draftOffer(model);
  if (offer !== null && offer.length > 0) {
    const pick = pickDraftOffer(offer, choices.preference);
    await clickUntilChanged<TrailView>(page, pick.objectId, (m) => m.sceneKey !== "trail" || draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });
    return true;
  }
  const vote = openVote(model);
  if (vote !== null) {
    const choice = vote.find((o) => o.id === choices.length) ?? vote[0]!;
    await clickUntilChanged<TrailView>(page, choice.objectId, (m) => m.sceneKey !== "trail" || openVote(m) === null, { perAttemptTimeoutMs: 15_000 });
    return true;
  }
  if (model.ready?.state === "open") {
    await clickUntilChanged<TrailView>(page, "ready", (m) => m.sceneKey !== "trail" || isReady(m) || m.panel?.kind !== model.panel?.kind, { perAttemptTimeoutMs: 15_000 });
    return true;
  }
  return false;
}

/** Does everything this page owes in the trail until it waits on the crew
 * or leaves the trail. */
export async function walkTrail(page: Page, choices: TrailChoices = {}): Promise<void> {
  for (let step = 0; step < 12 && (await trailStep(page, choices)); step++);
}

/** Walks every page through the trail until every page is in a camp (or the
 * run ended). */
export async function trailToCamp(pages: readonly Page[], choices: TrailChoices = {}): Promise<void> {
  for (let round = 0; round < 8; round++) {
    for (const p of pages) await walkTrail(p, choices);
    const scenes = await Promise.all(pages.map((p) => getModel<TrailView>(p).then((m) => m.sceneKey)));
    if (scenes.every((scene) => scene !== "trail")) return;
  }
  throw new Error("trailToCamp: the crew never left the trail");
}

/** Your slots and backpack in the loadout; null elsewhere or for a spectator. */
export function gearOf(m: TrailView): Gear | null {
  return m.panel?.kind === "loadout" ? m.panel.gear : null;
}

export function shopEntry(m: TrailView, stockId: string): ShopEntry | null {
  return m.panel?.kind === "loadout" ? (m.panel.shop?.entries.find((e) => e.stockId === stockId) ?? null) : null;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((uid, i) => uid === b[i]);

/** Taps one of your items: an equipped one goes back to the backpack, a
 * backpack one fills the next free slot. Returns the model once the
 * equipped set changed. */
export async function tapGear(page: Page, uid: string): Promise<TrailView> {
  const before = gearOf(await getModel<TrailView>(page));
  if (before === null) throw new Error("tapGear: not in a loadout");
  return clickUntilChanged<TrailView>(page, objectIdOfItem(before, uid), (m) => !sameSet(gearOf(m)?.equipped ?? [], before.equipped));
}

function objectIdOfItem(gear: Gear, uid: string): string {
  const tile = [...gear.slots.flatMap((s) => (s.item === null ? [] : [s.item])), ...gear.backpack].find((t) => t.uid === uid);
  if (tile === undefined) throw new Error(`no item ${uid} in your slots or backpack`);
  return tile.objectId;
}

/** Drags one of your items onto `targetId` (a `slot:<n>`, or any backpack
 * tile) with real mouse moves, and returns the model once the equipped set
 * changed. */
export async function dragGear(page: Page, uid: string, targetId: string): Promise<TrailView> {
  const before = gearOf(await getModel<TrailView>(page));
  if (before === null) throw new Error("dragGear: not in a loadout");
  const at = (id: string) => page.evaluate((i) => window.__expeditionTest?.objects()[i] ?? null, id);
  const from = await at(objectIdOfItem(before, uid));
  const to = await at(targetId);
  if (from === null || to === null) throw new Error(`dragGear: ${uid} or ${targetId} is not on screen`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  let model = await getModel<TrailView>(page);
  for (let poll = 0; poll < 50 && sameSet(gearOf(model)?.equipped ?? [], before.equipped); poll++) {
    await page.waitForTimeout(100);
    model = await getModel<TrailView>(page);
  }
  return model;
}

/** Buys a shop entry and returns the model once the purse paid for it. */
export async function buyStock(page: Page, stockId: string): Promise<TrailView> {
  const before = await getModel<TrailView>(page);
  const entry = shopEntry(before, stockId);
  if (entry === null || entry.buy.kind !== "buy") throw new Error(`buyStock: ${stockId} is not for sale (${JSON.stringify(entry?.buy)})`);
  const purse = before.topBar?.purse ?? 0;
  return clickUntilChanged<TrailView>(page, entry.objectId, (m) => (m.topBar?.purse ?? purse) === purse - (entry.price ?? 0));
}

/** Waits until the bridge's `scene` (not `model`) reports `expected`. */
export async function waitForScene(page: Page, expected: SceneName, timeout = 60_000): Promise<void> {
  await page.waitForFunction((wanted) => window.__expeditionTest?.scene === wanted, expected, { timeout });
}

export interface ClickUntilChangedOptions {
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
export async function clickUntilChanged<T>(
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
export async function clickHandCard<T>(
  page: Page,
  objectId: string,
  isSatisfied: (model: T) => boolean,
  opts: ClickUntilChangedOptions = {},
): Promise<T> {
  return clickUntilChanged(page, objectId, isSatisfied, { xOffsetFraction: 0.25, ...opts });
}

/** The first offer holding a preferred character or item, else the first. */
/** Drafted items that hold a gated window (a rescue), taken only when
 * nothing else is offered: a second rescuer would change who the table
 * waits on. */
const RESCUE_ITEMS = ["rope-ladder"];

export function pickDraftOffer<T extends { sourceId: string; itemIds?: string[] }>(offers: T[], preference: readonly string[] = DRAFT_PREFERENCE): T {
  for (const preferred of preference) {
    const found = offers.find((o) => (o.itemIds ?? [o.sourceId]).includes(preferred));
    if (found) return found;
  }
  const first = offers.find((o) => !(o.itemIds ?? []).some((id) => RESCUE_ITEMS.includes(id))) ?? offers[0];
  if (!first) throw new Error("pickDraftOffer: draftOffer was empty");
  return first;
}

