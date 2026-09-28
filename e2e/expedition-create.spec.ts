import { expect, test } from "@playwright/test";

// D-01: 6-character nanoid over the speakable, disambiguated alphabet.
const ROOM_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

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
