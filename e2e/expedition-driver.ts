import type { Page } from "@playwright/test";
import { getModel } from "./expedition-helpers";

/** Click-driving helpers shared by the UI tour. Extracted verbatim from
 * expedition-camp.spec.ts (which keeps its own copy until it is migrated). */

/** Characters and draft picks whose abilities the camp drivers can target
 * (a seat, a hand card or an objective) and that never hold a gated window
 * (before the deal, or a rescue). */
export const DRAFT_PREFERENCE = [
  "guide",
  "scout",
  "cartographer",
  "signaller",
  "guide.pathfinder",
  "scout.keen-eye",
  "cartographer.detour",
  "trail-map",
  "trained-monkey",
  "smoke-signal",
  "whetstone",
];

export type SceneName = "camp" | "fireside" | "run-end";

/** The fireside model fields the drivers read (mirrors
 * apps/web/lib/expedition/fireside-model.ts). Optional because a click can
 * move the page on to another scene before the predicate runs. */
export interface DraftTile {
  sourceId: string;
  objectId: string;
  name: string;
}

export interface MusterCard {
  characterId: string;
  objectId: string;
  name: string;
  pickable: boolean;
  yours: boolean;
  takenBy: string | null;
}

export interface FiresideView {
  sceneKey?: string;
  /** The six characters while the crew musters. */
  muster?: MusterCard[] | null;
  draft?: { kind: "offer"; items: DraftTile[] } | { kind: "taken" | "none" };
  kit?: { sourceId: string; objectId: string; name: string }[] | null;
  ready?: { state: "blocked" | "open" | "done" } | null;
  lastResult?: { campNumber: number; status: "succeeded" | "failed" } | null;
}

/** What you may pick now: the free characters at muster until yours is
 * picked, then a draft offer after a cleared camp. */
export function draftOffer(m: FiresideView): DraftTile[] | null {
  if (m.muster != null) {
    if (m.muster.some((c) => c.yours)) return null;
    return m.muster.filter((c) => c.pickable).map((c) => ({ sourceId: c.characterId, objectId: c.objectId, name: c.name }));
  }
  return m.draft?.kind === "offer" ? m.draft.items : null;
}

/** Your character, then your kit. */
export function kitIds(m: FiresideView): string[] {
  return (m.kit ?? []).map((k) => k.sourceId);
}

export function isReady(m: FiresideView): boolean {
  return m.ready?.state === "done";
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

export function pickDraftOffer<T extends { sourceId: string }>(offers: T[], preference: readonly string[] = DRAFT_PREFERENCE): T {
  for (const preferred of preference) {
    const found = offers.find((o) => o.sourceId === preferred);
    if (found) return found;
  }
  const first = offers[0];
  if (!first) throw new Error("pickDraftOffer: draftOffer was empty");
  return first;
}

