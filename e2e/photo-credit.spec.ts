import { expect, test } from "@playwright/test";
import { startTwoPlayerGame } from "./helpers";

// Both CC BY-licensed background photos require visible on-page
// attribution — see apps/web/public/backgrounds/CREDITS.md and
// apps/web/lib/image-credits.ts (the single source of truth both this
// test and the two pages read from).

test.describe("photo credit (CC BY attribution)", () => {
  test("landing page shows the Golden Gate Bridge credit with correct links", async ({ page }) => {
    await page.goto("/");

    const credit = page.getByTestId("photo-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("Golden Gate Bridge Above the Fog");
    await expect(credit).toContainText("Dongmin03");
    await expect(credit).toContainText("CC BY 4.0");

    const titleLink = credit.getByRole("link", { name: "Golden Gate Bridge Above the Fog" });
    await expect(titleLink).toHaveAttribute(
      "href",
      "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_Above_the_Fog_from_Battery_Spencer.jpg",
    );
    await expect(titleLink).toHaveAttribute("target", "_blank");
    await expect(titleLink).toHaveAttribute("rel", "noopener noreferrer");

    const licenseLink = credit.getByRole("link", { name: "CC BY 4.0" });
    await expect(licenseLink).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    await expect(licenseLink).toHaveAttribute("target", "_blank");
    await expect(licenseLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("room page shows the Hong Kong firework show credit with correct links", async ({ page, browser }) => {
    const { activePage } = await startTwoPlayerGame(page, browser);

    const credit = activePage.getByTestId("photo-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("Hong Kong firework show");
    await expect(credit).toContainText("Dennis Wong");
    await expect(credit).toContainText("CC BY 2.0");

    const titleLink = credit.getByRole("link", { name: "Hong Kong firework show" });
    await expect(titleLink).toHaveAttribute(
      "href",
      "https://commons.wikimedia.org/wiki/File:Hong_Kong_firework_show.jpg",
    );
    await expect(titleLink).toHaveAttribute("target", "_blank");
    await expect(titleLink).toHaveAttribute("rel", "noopener noreferrer");

    const licenseLink = credit.getByRole("link", { name: "CC BY 2.0" });
    await expect(licenseLink).toHaveAttribute("href", "https://creativecommons.org/licenses/by/2.0/");
    await expect(licenseLink).toHaveAttribute("target", "_blank");
    await expect(licenseLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});
