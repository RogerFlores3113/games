import { expect, test } from "@playwright/test";
import { createRoom } from "./helpers";

// D-01: 6-character nanoid over the speakable, disambiguated alphabet —
// excludes I, O, 0, 1 and any other visually/aurally confusable characters.
const ROOM_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

test.describe("create room (ROOM-01)", () => {
  test("creates a room, lands directly in the seated lobby, code matches the speakable alphabet", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const code = await createRoom(page, { name: "Roger", variant: "rainbow" });

    // Exact speakable-alphabet regex, not a generic [A-Z0-9]{6}.
    expect(page.url()).toMatch(/\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(code).toMatch(ROOM_CODE_REGEX);

    // The visible room code equals the code in the URL.
    await expect(page.getByTestId("room-code")).toHaveText(code);

    // The host's own seat row is present, marked self and host.
    const selfRow = page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toContainText("Roger");
    await expect(selfRow).toContainText("Host");

    // WR-04: the variant picked on the create screen is the lobby's variant,
    // not silently reset to Base.
    await expect(page.getByRole("radio", { name: "Rainbow" })).toBeChecked();

    // "Copy link" swaps its label to "Copied!" after a click.
    const copyButton = page.getByRole("button", { name: "Copy link" });
    await copyButton.click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  });

  test("two rooms created in the same run have different codes", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const codeA = await createRoom(pageA, { name: "Alice" });
    const codeB = await createRoom(pageB, { name: "Bob" });

    expect(codeA).not.toBe(codeB);

    await contextA.close();
    await contextB.close();
  });
});

test.describe("landing page game picker (D-12, D-17)", () => {
  test("title reads 'Board games', Expedition is disabled, Create room is visible before any game is chosen, and the variant fieldset only shows once Hanabi is chosen", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Board games");
    await expect(page.getByRole("heading", { name: "Board games" })).toBeVisible();

    const expeditionOption = page.locator('option[value="expedition"]');
    await expect(expeditionOption).toBeDisabled();
    await expect(expeditionOption).toHaveText("Expedition - coming soon");
    await expect(page.locator('option[value="innovation"]')).toHaveCount(0);

    // UI-SPEC note 3: "Create room"'s visibility is independent of the
    // selected game — it is visible and enabled BEFORE any game is picked.
    const createButton = page.getByRole("button", { name: "Create room" });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    // Only the per-game settings fieldset is gated on the selection.
    await expect(page.getByRole("radio", { name: "Base" })).toHaveCount(0);

    await page.getByLabel("Game").selectOption("hanabi");

    await expect(page.getByRole("radio", { name: "Base" })).toBeVisible();
    await expect(createButton).toBeVisible();
  });

  test("a room can be created after choosing Hanabi", async ({ page }) => {
    const code = await createRoom(page, { name: "Roger" });
    expect(code).toMatch(ROOM_CODE_REGEX);
  });
});

test.describe("Create room works before hydration (D-17)", () => {
  test("a native form submit lands in the seated lobby with no query string, and the pending-room cookie is consumed on arrival", async ({
    page,
    context,
  }) => {
    // Block Next's client bundle so React never hydrates — proves the form
    // works from a pure server-rendered page via its native POST fallback.
    await page.route("**/_next/static/**", (route) => route.abort());

    await page.goto("/");
    await page.getByLabel("Game").selectOption("hanabi");
    await expect(page.getByRole("radio", { name: "Rainbow" })).toBeVisible();
    await page.getByRole("radio", { name: "Rainbow" }).check();
    await page.getByLabel("Your name").fill("Roger");
    await page.getByRole("button", { name: "Create room" }).click();
    await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);

    const url = new URL(page.url());
    expect(url.search).toBe("");
    const code = url.pathname.split("/").pop()!;

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === `pending_room_${code}`)).toBe(true);

    // Unblock JS and reload so the room page's client hydrates, consumes
    // the cookie, and auto-joins.
    await page.unroute("**/_next/static/**");
    await page.reload();

    const selfRow = page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toContainText("Roger");
    await expect(selfRow).toContainText("Host");
    await expect(page.getByRole("radio", { name: "Rainbow" })).toBeChecked();

    const cookiesAfter = await context.cookies();
    expect(cookiesAfter.some((c) => c.name === `pending_room_${code}`)).toBe(false);
  });
});

test.describe("the share link never carries name, game or config (D-17)", () => {
  test("Copy link copies exactly the room URL with no query string", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const code = await createRoom(page, { name: "Roger", variant: "rainbow" });

    const url = new URL(page.url());
    expect(url.search).toBe("");

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(`${url.origin}/room/${code}`);
  });
});

test.describe("rendered geometry (no collapsed layout)", () => {
  for (const [label, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 800 }],
  ] as const) {
    test(`lobby renders with sane width and no horizontal overflow at ${label} viewport`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await createRoom(page, { name: "Roger" });

      // A collapsed `max-w-*` (the real Plan 09 defect: --spacing-* colliding
      // with Tailwind v4's reserved sizing namespace, computing max-w-sm to
      // 8px) would fail both of these. No horizontal scrollbar anywhere:
      const overflowCheck = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflowCheck.scrollWidth).toBeLessThanOrEqual(overflowCheck.clientWidth);

      // The lobby's main container has a sane rendered width, not a
      // collapsed one-word-per-line column.
      const mainBox = await page.locator("main").first().boundingBox();
      expect(mainBox).not.toBeNull();
      expect(mainBox!.width).toBeGreaterThan(200);

      await context.close();
    });
  }
});
