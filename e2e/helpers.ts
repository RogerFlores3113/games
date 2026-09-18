import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type Variant = "base" | "rainbow" | "black";

export interface CreateRoomOptions {
  name: string;
  variant?: Variant;
}

/**
 * Fills the create-room screen, submits, waits for the URL to move to
 * `/room/{code}`, and returns the 6-character room code. The caller's
 * `page` ends up seated as host in the lobby.
 */
export async function createRoom(page: Page, { name, variant = "base" }: CreateRoomOptions): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  if (variant !== "base") {
    await page.getByRole("radio", { name: variantLabel(variant) }).check();
  }
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = new URL(page.url()).pathname.split("/").pop();
  if (!code) {
    throw new Error("createRoom: could not extract room code from URL " + page.url());
  }
  // Wait for the host's own seat row to render before returning control —
  // a bare URL match can win the race against the socket's `joined` reply.
  await expect(page.getByTestId("seat-row").and(page.locator('[data-self="true"]'))).toBeVisible();
  return code;
}

function variantLabel(variant: Variant): string {
  if (variant === "rainbow") return "Rainbow";
  if (variant === "black") return "Black";
  return "Base";
}

/**
 * Opens a fresh page in `context` at `/room/{code}`, fills the join form
 * with `name`, and waits for that player's own seat row to render. Returns
 * the new page so the caller can keep driving it.
 */
export async function joinAs(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/room/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("seat-row").and(page.locator('[data-self="true"]'))).toBeVisible();
  return page;
}

/**
 * Waits (with a bounded timeout) until exactly `n` seat rows are rendered
 * on `page`. Never sleeps — this is Playwright's own auto-retrying
 * assertion, just wrapped for call-site readability.
 */
export async function expectSeatCount(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId("seat-row")).toHaveCount(n, { timeout: 10_000 });
}

/**
 * Matches a rendered other-hand container (`other-hand-{seatId}`) but NOT
 * one of the per-card testids nested inside it (`other-hand-card-{id}`),
 * which also start with the bare `other-hand-` prefix.
 */
export const OTHER_HAND_SELECTOR = '[data-testid^="other-hand-"]:not([data-testid^="other-hand-card-"])';

/**
 * Matches a rendered own-hand card slot (`own-hand-slot-{n}`) but NOT the
 * hint overlay nested inside it (`own-hand-slot-{n}-hints`, added in
 * 06.2-04 when hints moved onto the tile), which also starts with the bare
 * `own-hand-slot-` prefix. The overlay carries no `data-luminosity`, so a
 * bare-prefix `:not([data-luminosity="unclued"])` locator silently counts
 * it as a marked slot; it is also conditionally rendered (it disappears
 * when the card has no positive clues, or when "keep hints visible" is off
 * and the next player has acted), so a bare-prefix slot COUNT drifts with
 * hint visibility rather than with the hand. Same shape as
 * `OTHER_HAND_SELECTOR` above, for the same reason.
 */
export const OWN_HAND_SLOT_SELECTOR = '[data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])';

/**
 * UAT gap 16: opens the quick-clue popover for one of `targetSeatId`'s hand
 * tiles (`tileIndex`, default the first) by clicking it, and returns
 * Locators for its colour/rank buttons — or `null` if no popover opened at
 * all (the deleted `CluePicker`'s "prefer not opening it when clue-giving is
 * currently illegal" case: not the caller's turn, no clue tokens, the game
 * ended, or the page is reconnecting). Callers are responsible for either
 * clicking one of the returned buttons (which sends the clue and closes the
 * popover) or otherwise closing it (second click, Escape, click elsewhere).
 */
export async function openTileCluePopover(
  page: Page,
  targetSeatId: string,
  tileIndex = 0,
): Promise<{ colorButton: Locator; rankButton: Locator } | null> {
  const tile = page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).nth(tileIndex);
  await tile.click();
  const popover = page.getByTestId("tile-clue-popover");
  if ((await popover.count()) === 0) return null;
  return { colorButton: page.getByTestId("tile-clue-color"), rankButton: page.getByTestId("tile-clue-rank") };
}

/**
 * UAT gap 16: gives a legal clue to `targetSeatId`, replacing the deleted
 * `CluePicker`'s target+value+give-clue-button flow. Since a tile's quick-
 * clue popover only ever offers clues derived from that tile's OWN suit/rank
 * (always touching at least that card), the rank button is enabled whenever
 * clue-giving is legal at all — this tries every hand tile (in case an
 * individual tile's colour is a non-nameable suit, e.g. Rainbow) and prefers
 * a colour clue when available, falling back to rank. Returns `false` if no
 * tile currently offers ANY legal clue (e.g. not the caller's turn).
 */
export async function giveAnyLegalClue(page: Page, targetSeatId: string): Promise<boolean> {
  const tileCount = await page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).count();
  for (let i = 0; i < tileCount; i += 1) {
    const opened = await openTileCluePopover(page, targetSeatId, i);
    if (!opened) return false;
    const { colorButton, rankButton } = opened;
    if (await colorButton.isEnabled()) {
      await colorButton.click();
      return true;
    }
    if (await rankButton.isEnabled()) {
      await rankButton.click();
      return true;
    }
    // Neither enabled on this tile (shouldn't normally happen once
    // clue-giving is legal at all) — close it and try the next tile.
    await page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).nth(i).click();
  }
  return false;
}

/**
 * UAT gap 16: gives a legal clue to ANY teammate rendered on `page`, trying
 * each `other-hand-{seatId}` container in turn via `giveAnyLegalClue`.
 * Replaces call sites that used to click the first `clue-target-*` button
 * with no specific seat in mind.
 */
export async function giveAnyLegalClueToAnyTeammate(page: Page): Promise<boolean> {
  const containers = page.locator(OTHER_HAND_SELECTOR);
  const count = await containers.count();
  for (let i = 0; i < count; i += 1) {
    const testId = await containers.nth(i).getAttribute("data-testid");
    if (!testId) continue;
    const seatId = testId.replace(/^other-hand-/, "");
    if (await giveAnyLegalClue(page, seatId)) return true;
  }
  return false;
}

/**
 * Reads the seatId of the sole other player rendered on `observer`'s board,
 * by stripping the `other-hand-` prefix off the first matching container's
 * testid. The board never renders the viewer's own seatId (D-14/RT-03
 * precedent), so seat identity is always read from the OTHER page.
 */
export async function seatIdOfOtherPlayer(observer: Page): Promise<string> {
  const testId = await observer.locator(OTHER_HAND_SELECTOR).first().getAttribute("data-testid");
  if (!testId) {
    throw new Error("seatIdOfOtherPlayer: no other-hand-{seatId} container found");
  }
  return testId.replace(/^other-hand-/, "");
}

/**
 * Creates a room as `names.host`, joins a second browser context as
 * `names.guest`, starts the game, and waits for both hands to render.
 * Returns both pages plus whichever is currently active (turn-indicator ===
 * "Your turn") so Phase 5 specs can pick a dropping/observer pair without
 * re-deriving the RT-03 start-game pattern themselves.
 */
export async function startTwoPlayerGame(
  hostPage: Page,
  browser: Browser,
  names: { host: string; guest: string } = { host: "Roger", guest: "Bianca" },
): Promise<{
  code: string;
  contextB: BrowserContext;
  pageB: Page;
  activePage: Page;
  passivePage: Page;
}> {
  const code = await createRoom(hostPage, { name: names.host });
  const contextB = await browser.newContext();
  const pageB = await joinAs(contextB, code, names.guest);
  await expectSeatCount(hostPage, 2);

  await hostPage.getByTestId("start-game").click();
  await expect(hostPage.getByTestId("own-hand")).toBeVisible();
  await expect(pageB.getByTestId("own-hand")).toBeVisible();

  const hostText = (await hostPage.getByTestId("turn-indicator").textContent()) ?? "";
  const hostIsActive = hostText === "Your turn";
  const activePage = hostIsActive ? hostPage : pageB;
  const passivePage = hostIsActive ? pageB : hostPage;

  return { code, contextB, pageB, activePage, passivePage };
}

/**
 * D-24 / UI-11: creates a room as `names[0]` (the host) and joins every
 * further name in `names` in its own new browser context, then starts the
 * game and waits for `own-hand` to render on every page. Generalizes
 * `startTwoPlayerGame` to N players (2-5) for multi-player layout/viewport
 * proofs. `pages[0]` is always `hostPage`; `contexts` holds only the joiner
 * contexts (never the host's own context) so the caller can close them.
 */
export async function startGameWithPlayers(
  hostPage: Page,
  browser: Browser,
  names: string[],
  options: { variant?: Variant } = {},
): Promise<{ code: string; pages: Page[]; contexts: BrowserContext[] }> {
  if (names.length < 2) {
    throw new Error("startGameWithPlayers: needs at least 2 names");
  }
  const [hostName, ...guestNames] = names as [string, ...string[]];
  const code = await createRoom(hostPage, { name: hostName, variant: options.variant });

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [hostPage];
  for (const guestName of guestNames) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await joinAs(context, code, guestName);
    pages.push(page);
  }

  await expectSeatCount(hostPage, names.length);
  await hostPage.getByTestId("start-game").click();

  for (const page of pages) {
    await expect(page.getByTestId("own-hand")).toBeVisible();
  }

  return { code, pages, contexts };
}

/**
 * D-14: redefines `document.visibilityState`/`document.hidden` and fires a
 * `visibilitychange` event, simulating a tab going to or returning from the
 * background without relying on Chromium's own (unreliable-to-drive)
 * backgrounding heuristics. Combined with `freezePage`/`resumePage` (CDP)
 * for the fullest simulation of a suspended mobile tab (Research Pitfall 4).
 */
export async function emulateVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => s === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * D-14: forces the page's lifecycle state via CDP, approximating OS-level
 * tab suspension (frozen JS timers) more faithfully than visibility
 * emulation alone. Per Research Pitfall 4, freezing does not guarantee the
 * WebSocket itself closes — callers should assert the OBSERVABLE outcome
 * (the other player's board eventually shows disconnected) rather than the
 * mechanism. Returns the CDP session so `resumePage` can reuse it.
 */
export async function freezePage(page: Page): Promise<import("@playwright/test").CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Page.setWebLifecycleState", { state: "frozen" });
  return session;
}

/** D-14: reverses `freezePage`, reusing the same CDP session. */
export async function resumePage(session: import("@playwright/test").CDPSession): Promise<void> {
  await session.send("Page.setWebLifecycleState", { state: "active" });
}

/**
 * D-20/D-30: drags `source` onto `target` using raw mouse events (never
 * HTML5 `dragTo`, which does not exercise the app's Pointer Event
 * listeners with `setPointerCapture`). Moves to the source center, presses
 * down, moves a few px to clear the app's own drag threshold, then glides
 * to the target center over several steps before releasing — giving the
 * app's `pointermove` handler enough intermediate points to resolve the
 * hovered drop zone before the final `pointerup`.
 */
export async function dragLocatorTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dragLocatorTo: source or target has no bounding box");
  }
  const sourceCenter = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const targetCenter = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

  await page.mouse.move(sourceCenter.x, sourceCenter.y);
  await page.mouse.down();
  // Clear the app's DRAG_THRESHOLD_PX before resolving any drop target.
  await page.mouse.move(sourceCenter.x + 10, sourceCenter.y + 10, { steps: 2 });
  await page.mouse.move(targetCenter.x, targetCenter.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Reads `[data-card-id]` from the viewer's own hand, in DOM order — the
 * D-15-safe way to observe reorder/slot-replacement effects without ever
 * touching a card's suit/rank identity (own-hand cards carry no identity
 * fields to read).
 */
export async function ownHandCardIds(page: Page): Promise<string[]> {
  const ids = await page.locator('[data-testid="own-hand"] [data-card-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-card-id") ?? ""),
  );
  return ids;
}

/**
 * Reads the ids off a teammate's rendered cards (`other-hand-card-{id}`
 * testids) inside `other-hand-{seatId}`, in DOM order.
 */
export async function teammateHandCardIds(page: Page, seatId: string): Promise<string[]> {
  const testIds = await page
    .locator(`[data-testid="other-hand-${seatId}"] [data-testid^="other-hand-card-"]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid") ?? ""));
  return testIds.map((testId) => testId.replace(/^other-hand-card-/, ""));
}
