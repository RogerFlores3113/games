import { test, expect } from "@playwright/test";
import { GEAR_DISPLAY } from "@games/rules";
import { clickUntilChanged, draftOffer, type FiresideView } from "./expedition-driver";
import { getModel, startExpeditionGame } from "./expedition-helpers";

test("rules modal shows the reference, lists drafted gear, and closes on Escape", async ({ browser, page }) => {
  const { pages, contexts } = await startExpeditionGame(browser, page, ["Hana", "Ivo", "Jun"]);
  try {
    const host = pages[0]!;
    await expect.poll(async () => draftOffer(await getModel<FiresideView>(host)) !== null).toBe(true);
    const pick = draftOffer(await getModel<FiresideView>(host))![0]!;
    await clickUntilChanged<FiresideView>(host, pick.objectId, (m) => draftOffer(m) === null, { perAttemptTimeoutMs: 15_000 });

    await host.getByTestId("expedition-rules-button").click();
    const dialog = host.getByRole("dialog", { name: "Rules" });
    await expect(dialog).toBeVisible();
    for (const heading of ["Goal", "Tricks", "Objectives", "The Whisper", "Gear", "This camp"]) {
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(dialog.getByText(/Your capacity this camp: \d+\./)).toBeVisible();
    await expect(dialog.getByText(GEAR_DISPLAY[pick.gearId]!.name, { exact: true })).toBeVisible();

    await host.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
