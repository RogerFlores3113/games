import type { Browser, BrowserContext, Page } from "@playwright/test";
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
