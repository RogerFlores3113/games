import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { startGameWithPlayers } from "./helpers";
import { startExpeditionGame, waitForBridge } from "./expedition-helpers";

// D-01: 6-character nanoid over the speakable, disambiguated alphabet.
const ROOM_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

// Mirrors apps/web/scripts/check-expedition-build.mjs's PHASER_SIGNATURE
// exactly — keep the two in sync. Chosen from node_modules/phaser's own
// runtime string literal (`this.gameURL = ... 'https://phaser.io/' + ...`),
// which survives minification/tree-shaking intact.
const PHASER_SIGNATURE = "https://phaser.io/";

/**
 * Records the text body of every script response loaded on `page` into
 * `bodies`, ignoring bodies that fail to read (e.g. cross-origin/opaque
 * responses). Callers register this before navigating, then inspect
 * `bodies` for the Phaser signature.
 */
function recordScriptBodies(page: Page, bodies: string[]): void {
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    response
      .text()
      .then((text) => bodies.push(text))
      .catch(() => {
        // Ignore bodies that can't be read (e.g. redirects, opaque responses).
      });
  });
}

test.describe("Expedition room creation (SCENE-01, D-17/WR-06)", () => {
  test("a native form POST with gameId=expedition redirects into a seated Expedition lobby", async ({ page }) => {
    // page.request shares the browser context's cookie jar, so the
    // pending-room cookie set by the redirect response lands where the
    // subsequent page.goto navigation can consume it.
    const response = await page.request.post("/api/room", {
      form: { gameId: "expedition", displayName: "Roger" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(303);
    const location = response.headers()["location"]!;
    expect(location).toMatch(/\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(location).not.toContain("error=create");

    await page.goto(location);

    const selfRow = page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toContainText("Roger");

    const code = new URL(location, page.url()).pathname.split("/").pop()!;
    expect(code).toMatch(ROOM_CODE_REGEX);
  });

  test("a native form POST with an empty displayName still redirects to /?error=create", async ({ page }) => {
    const response = await page.request.post("/api/room", {
      form: { gameId: "expedition", displayName: "" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(303);
    const location = response.headers()["location"]!;
    expect(location).toContain("error=create");
  });

  test("choosing Expedition on the landing page creates a seated Expedition lobby", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Game").selectOption("expedition");

    const createButton = page.getByRole("button", { name: "Create room" });
    await expect(createButton).toBeEnabled();
    await page.getByLabel("Your name").fill("Roger");
    await createButton.click();
    await page.waitForURL(/\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    const selfRow = page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toContainText("Roger");

    await expect(page.getByRole("radio", { name: "Base" })).toHaveCount(0);
  });
});

test.describe("Phaser bundle isolation (SCENE-01)", () => {
  test("the landing page never loads the Phaser bundle", async ({ page }) => {
    test.setTimeout(90_000);
    const bodies: string[] = [];
    recordScriptBodies(page, bodies);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(bodies.some((body) => body.includes(PHASER_SIGNATURE))).toBe(false);
  });

  test("a Hanabi game never loads the Phaser bundle", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const bodies: string[] = [];
    recordScriptBodies(page, bodies);

    const { contexts } = await startGameWithPlayers(page, browser, ["Roger", "Bianca"]);
    await page.waitForLoadState("networkidle");

    expect(bodies.some((body) => body.includes(PHASER_SIGNATURE))).toBe(false);

    for (const context of contexts) await context.close();
  });

  test("an Expedition game does load the Phaser bundle (positive control)", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const bodies: string[] = [];
    recordScriptBodies(page, bodies);

    const { contexts } = await startExpeditionGame(browser, page, ["Roger", "Bianca", "Chuck"]);
    await waitForBridge(page);
    await page.waitForLoadState("networkidle");

    expect(bodies.some((body) => body.includes(PHASER_SIGNATURE))).toBe(true);

    for (const context of contexts) await context.close();
  });
});
