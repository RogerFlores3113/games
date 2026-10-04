import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createExpeditionRoom, waitForBridge } from "./expedition-helpers";

// Drives the dev panel (it needs the worker in dev mode, see dev-mode.spec.ts).

/** A table of "Solo" and `bots` bots, started, with the dev panel open. */
export async function soloTable(page: Page, bots = 2): Promise<Locator> {
  await createExpeditionRoom(page, "Solo");
  await page.getByTestId("dev-toggle").click();
  const panel = page.getByTestId("dev-panel");
  for (let n = 1; n <= bots; n++) {
    await panel.getByTestId("dev-add-bot").click();
    await expect(panel.getByTestId("dev-result")).toHaveText(new RegExp(`^Bot ${n} joined\\.`));
  }
  await page.getByTestId("start-game").click();
  await waitForBridge(page);
  return panel;
}

const LABELS: Readonly<Record<string, string>> = {
  "jump-to-camp": "Jump to camp",
  "set-plan-boss": "Set a boss camp's boss",
  "force-camp": "Force the camp's outcome",
  "set-supplies": "Set supplies",
  "give-item": "Give a seat an item",
  "move-card": "Move a card to another hand",
  "set-objective-owner": "Set an objective's owner",
  "set-spec": "Set the camp's location and weather",
};

/** Runs a dev shortcut and waits for its own answer and for the panel to
 * take input again. A field value is an option's value, or for a select
 * `{ label }`, the first option whose label starts with it. */
export async function shortcut(panel: Locator, id: string, fields: Record<string, string | { label: string }> = {}): Promise<void> {
  await idle(panel);
  for (const [name, value] of Object.entries(fields)) {
    const field = panel.getByTestId(`dev-field-${id}-${name}`);
    if (typeof value !== "string") {
      const option = await field.evaluate((el, prefix) => [...(el as HTMLSelectElement).options].find((o) => o.label.startsWith(prefix))?.value ?? null, value.label);
      if (option === null) throw new Error(`shortcut ${id}: no ${name} option starts with "${value.label}"`);
      await field.selectOption(option);
    } else if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
    else await field.fill(value);
  }
  await panel.getByTestId(`dev-shortcut-${id}`).click();
  await expect(panel.getByTestId("dev-result")).toHaveText(new RegExp(`^${LABELS[id]}: done\\.`));
  await idle(panel);
}

export async function idle(panel: Locator): Promise<void> {
  await expect(panel.getByTestId("dev-autoplay-run")).toBeEnabled();
}

export async function autoplay(panel: Locator, scope: "everyone" | "others", steps: number): Promise<void> {
  await panel.getByTestId("dev-autoplay-scope").selectOption(scope);
  // "My decision" would stop an everyone-scope run before its first step.
  await panel.getByTestId("dev-autoplay-stop").selectOption(scope === "everyone" ? "milestone" : "decision");
  await panel.getByTestId("dev-autoplay-steps").fill(String(steps));
  await panel.getByTestId("dev-autoplay-run").click();
  await expect(panel.getByTestId("dev-result")).toHaveText(/^Autoplay: /);
  await idle(panel);
}
