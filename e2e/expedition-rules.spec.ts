import { test, expect, type Page } from "@playwright/test";
import { CHARACTER_DISPLAY, MOD_DISPLAY } from "@games/rules";
import { clickUntilChanged, draftOffer, type TrailView } from "./expedition-driver";
import { getModel, startExpeditionGame } from "./expedition-helpers";

async function shot(page: Page, name: string) {
  const dir = process.env.RULES_SHOTS_DIR;
  if (dir !== undefined) await page.screenshot({ path: `${dir}/${name}.png` });
}

test("rules modal shows the reference, lists your character, and closes on Escape", async ({ browser, page }) => {
  const { pages, contexts } = await startExpeditionGame(browser, page, ["Hana", "Ivo", "Jun"]);
  try {
    const host = pages[0]!;
    await expect.poll(async () => draftOffer(await getModel<TrailView>(host)) !== null).toBe(true);
    const pick = draftOffer(await getModel<TrailView>(host))![0]!;
    await clickUntilChanged<TrailView>(host, pick.objectId, (m) => draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });

    await host.getByTestId("expedition-rules-button").click();
    const dialog = host.getByRole("dialog", { name: "Rules" });
    await expect(dialog).toBeVisible();
    for (const heading of ["Goal", "Between camps", "Tricks", "Objectives", "The Whisper", "Explorers and gear", "The temple", "Your kit"]) {
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    const character = CHARACTER_DISPLAY[pick.sourceId]!;
    await expect(dialog.getByText(`${character.power} (${character.name})`, { exact: true })).toBeVisible();

    const modPages = [
      { tab: "locations", entry: "magma", image: true },
      { tab: "weather", entry: "thunderstorm", image: false },
      { tab: "bosses", entry: "tiger", image: true },
    ];
    for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      await host.setViewportSize(size);
      await host.getByTestId("expedition-rules-tab-rules").click();
      await shot(host, `rules-${size.width}`);
      for (const { tab, entry, image } of modPages) {
        await host.getByTestId(`expedition-rules-tab-${tab}`).click();
        const row = dialog.getByTestId(`expedition-rules-entry-${entry}`);
        await expect(row).toContainText(MOD_DISPLAY[entry]!.text);
        if (image) {
          const img = dialog.getByTestId(`expedition-rules-image-${entry}`);
          await expect(img).toBeVisible();
          await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        } else {
          await expect(dialog.getByTestId(`expedition-rules-icon-${entry}`)).toBeVisible();
        }
        await shot(host, `${tab}-${size.width}`);
      }
    }

    await host.getByTestId("expedition-rules-tab-rules").focus();
    await host.keyboard.press("ArrowRight");
    await expect(host.getByTestId("expedition-rules-tab-locations")).toHaveAttribute("aria-selected", "true");

    await host.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
