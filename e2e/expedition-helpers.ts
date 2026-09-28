import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Shared Expedition e2e helpers (Plan 12-10). Every helper here drives the
 * canvas ONLY through `window.__expeditionTest` (spec §7.5) plus real mouse
 * events — never by reaching into app internals or importing app code.
 * Plan 12-13's full-camp spec reuses these verbatim.
 */

// Local mirror of `apps/web/components/expedition/phaser/test-bridge.ts`'s
// `ExpeditionTestBridge` shape — declared here rather than imported, since
// e2e specs never import from `apps/web` (a separate build/runtime target).
interface ExpeditionTestBridgeShape {
  ready: boolean;
  liveGames: number;
  scene: string | null;
  model: unknown;
  objects(): Record<string, { x: number; y: number; width: number; height: number }>;
  positionOf(id: string): { x: number; y: number } | null;
}

declare global {
  interface Window {
    __expeditionTest?: ExpeditionTestBridgeShape;
  }
}

/**
 * Native-form POST to `/api/room` with `gameId=expedition` (the D-17/WR-06
 * path — works without JS), then navigates the redirect and waits for the
 * host's own seat row. Returns the 6-character room code.
 */
export async function createExpeditionRoom(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/api/room", {
    form: { gameId: "expedition", displayName: name },
    maxRedirects: 0,
  });
  const location = response.headers()["location"];
  if (!location) {
    throw new Error("createExpeditionRoom: no Location header on /api/room response");
  }
  await page.goto(location);

  const selfRow = page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
  await expect(selfRow).toBeVisible();

  const code = new URL(location, page.url()).pathname.split("/").pop();
  if (!code) {
    throw new Error("createExpeditionRoom: could not extract room code from " + location);
  }
  return code;
}

/**
 * Waits until `window.__expeditionTest.ready === true` on `page`.
 */
export async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__expeditionTest?.ready === true);
}

/**
 * Creates an Expedition room as `names[0]` (the host), joins every further
 * name in its own new browser context, starts the game, and waits for the
 * bridge to be ready on every page. Mirrors `e2e/helpers.ts`'s
 * `startGameWithPlayers` for Expedition.
 */
export async function startExpeditionGame(
  browser: Browser,
  hostPage: Page,
  names: string[],
): Promise<{ code: string; pages: Page[]; contexts: BrowserContext[] }> {
  if (names.length < 1) {
    throw new Error("startExpeditionGame: needs at least 1 name");
  }
  const [hostName, ...guestNames] = names as [string, ...string[]];
  const code = await createExpeditionRoom(hostPage, hostName);

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [hostPage];
  for (const guestName of guestNames) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`/room/${code}`);
    await page.getByLabel("Your name").fill(guestName);
    await page.getByRole("button", { name: "Join room" }).click();
    await expect(page.getByTestId("seat-row").and(page.locator('[data-self="true"]'))).toBeVisible();
    pages.push(page);
  }

  await expect(hostPage.getByTestId("seat-row")).toHaveCount(names.length, { timeout: 10_000 });
  await hostPage.getByTestId("start-game").click();

  for (const page of pages) {
    await waitForBridge(page);
  }

  return { code, pages, contexts };
}

/**
 * Reads `window.__expeditionTest.model` on `page`.
 */
export async function getModel<T = unknown>(page: Page): Promise<T> {
  return page.evaluate(() => window.__expeditionTest?.model) as Promise<T>;
}

/**
 * Reads `window.__expeditionTest.scene` on `page`.
 */
export async function getScene(page: Page): Promise<"camp" | "between-camps" | null> {
  return page.evaluate(() => window.__expeditionTest?.scene ?? null) as Promise<"camp" | "between-camps" | null>;
}

/**
 * Clicks the test-bridge object registered under `id` via a real mouse
 * click at its reported centre (page CSS px). Throws a descriptive error
 * (listing every currently-registered id) if `id` is not found — a missing
 * id almost always means the model changed shape or the object isn't
 * visible yet, and a bare Playwright timeout on a `null` position gives no
 * clue which.
 */
export async function clickObject(page: Page, id: string): Promise<void> {
  const position = await page.evaluate((objectId) => window.__expeditionTest?.positionOf(objectId) ?? null, id);
  if (position === null) {
    const known = await page.evaluate(() => Object.keys(window.__expeditionTest?.objects() ?? {}));
    throw new Error(`clickObject: no object registered for id "${id}". Known ids: ${known.join(", ")}`);
  }
  await page.mouse.click(position.x, position.y);
}

/**
 * Hovers the test-bridge object registered under `id` via a real mouse
 * move at its reported centre. Same missing-id error shape as `clickObject`.
 */
export async function hoverObject(page: Page, id: string): Promise<void> {
  const position = await page.evaluate((objectId) => window.__expeditionTest?.positionOf(objectId) ?? null, id);
  if (position === null) {
    const known = await page.evaluate(() => Object.keys(window.__expeditionTest?.objects() ?? {}));
    throw new Error(`hoverObject: no object registered for id "${id}". Known ids: ${known.join(", ")}`);
  }
  await page.mouse.move(position.x, position.y);
}

/**
 * Waits until `predicateSource` (the SOURCE of a function taking the
 * bridge's current `model` and returning boolean) is satisfied, via
 * `page.waitForFunction`. `predicateSource` is passed as a string so it is
 * evaluated in the page's own context (it cannot close over Node values).
 */
export async function waitForModel(page: Page, predicateSource: string, timeout?: number): Promise<void> {
  await page.waitForFunction(
    (source) => {
      // eslint-disable-next-line no-new-func
      const predicate = new Function("model", `return (${source})(model);`) as (model: unknown) => boolean;
      const model = window.__expeditionTest?.model ?? null;
      return predicate(model);
    },
    predicateSource,
    timeout !== undefined ? { timeout } : undefined,
  );
}
