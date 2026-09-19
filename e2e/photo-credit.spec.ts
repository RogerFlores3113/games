import { expect, test } from "@playwright/test";
import { startTwoPlayerGame } from "./helpers";

// Both Creative Commons-licensed background photos require visible on-page
// attribution — see apps/web/public/backgrounds/CREDITS.md and
// apps/web/lib/image-credits.ts (the single source of truth both this
// test and the two pages read from).

test.describe("photo credit (CC BY attribution)", () => {
  test("landing page shows the Camel Up game credit with correct links", async ({ page }) => {
    await page.goto("/");

    const credit = page.getByTestId("photo-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("Camel Up game - Poznań 2017");
    await expect(credit).toContainText("Klapi");
    await expect(credit).toContainText("CC BY-SA 4.0");

    const titleLink = credit.getByRole("link", { name: "Camel Up game - Poznań 2017" });
    await expect(titleLink).toHaveAttribute(
      "href",
      "https://commons.wikimedia.org/wiki/File:Camel_Up_game_-_Pozna%C5%84_2017.jpg",
    );
    await expect(titleLink).toHaveAttribute("target", "_blank");
    await expect(titleLink).toHaveAttribute("rel", "noopener noreferrer");

    const licenseLink = credit.getByRole("link", { name: "CC BY-SA 4.0" });
    await expect(licenseLink).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
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
