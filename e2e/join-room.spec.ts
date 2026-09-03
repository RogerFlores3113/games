import { expect, test } from "@playwright/test";
import { createRoom, joinAs } from "./helpers";

test.describe("join room (ROOM-02)", () => {
  test("a second browser context joins by display name only, no account fields, and sees both seats", async ({
    page,
    browser,
  }) => {
    const code = await createRoom(page, { name: "Roger" });

    const joinerContext = await browser.newContext();
    const joinerPage = await joinerContext.newPage();
    await joinerPage.goto(`/room/${code}`);

    // No password/email/account field anywhere on the join screen.
    await expect(joinerPage.locator('input[type="password"]')).toHaveCount(0);
    await expect(joinerPage.locator('input[type="email"]')).toHaveCount(0);
    await expect(joinerPage.getByLabel(/email/i)).toHaveCount(0);
    await expect(joinerPage.getByLabel(/password/i)).toHaveCount(0);

    await joinerPage.getByLabel("Your name").fill("Junior");
    await joinerPage.getByRole("button", { name: "Join room" }).click();

    // The joiner's own seat appears.
    const selfRow = joinerPage.getByTestId("seat-row").and(joinerPage.locator('[data-self="true"]'));
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toContainText("Junior");

    // The joiner also sees the host's seat.
    await expect(joinerPage.getByTestId("seat-row").filter({ hasText: "Roger" })).toBeVisible();

    await joinerContext.close();
  });

  test("joinAs helper produces a seated joiner in one call", async ({ page, browser }) => {
    const code = await createRoom(page, { name: "Roger" });
    const context = await browser.newContext();
    const joinerPage = await joinAs(context, code, "Junior");

    await expect(joinerPage.getByTestId("seat-row")).toHaveCount(2);

    await context.close();
  });
});
