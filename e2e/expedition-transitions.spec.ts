import { expect, test, type Page } from "@playwright/test";
import { clickObject, getModel, getScene, waitForBridge } from "./expedition-helpers";
import { clickUntilChanged } from "./expedition-driver";

// The signboard between scenes, at its real speed: every other spec runs it
// compressed (playwright.config.ts). Needs the dev servers in dev mode.
test.use({ storageState: { cookies: [], origins: [] } });

type Transition = { caseId: string; phase: "sign" | "fade-in"; title: string; sub: string | null };
type TrailModel = {
  sceneKey: string;
  panel: {
    kind: string;
    characters?: { objectId: string; pickable: boolean; yours: boolean }[];
    lengths?: { id: string; objectId: string; yours: boolean }[];
    draft?: { kind: string; bundles?: { objectId: string }[] };
  };
  ready: { state: string } | null;
};

const transition = (page: Page) => page.evaluate(() => (window.__expeditionTest as unknown as { transition: Transition | null }).transition);
const texts = (page: Page) => page.evaluate(() => (window.__expeditionTest as unknown as { layout(): { kind: string; label: string }[] }).layout().filter((e) => e.kind === "text").map((e) => e.label));

async function toolbar(page: Page, id: string, fields: Record<string, string>): Promise<void> {
  await page.getByTestId("dev-toolbar-collapse").click();
  for (const [name, value] of Object.entries(fields)) await page.getByTestId(`dev-toolbar-field-${id}-${name}`).selectOption(value);
  await page.getByTestId(`dev-toolbar-${id}`).click();
  await expect(page.getByTestId("dev-toolbar-result")).toHaveText(/: done\.$/);
  await page.getByTestId("dev-toolbar-collapse").click();
}

/** Play solo to a locked-in muster's last step: an explorer and Standard chosen. */
async function readyToLockIn(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expedition/start");
  await page.getByLabel("Your name").fill("Roger");
  await page.getByTestId("play-solo-dev").click();
  await waitForBridge(page);
  await expect.poll(async () => (await getModel<TrailModel>(page)).panel.characters?.filter((c) => !c.pickable).length ?? 0).toBe(2);
  const free = (await getModel<TrailModel>(page)).panel.characters!.find((c) => c.pickable)!;
  await clickUntilChanged<TrailModel>(page, free.objectId, (m) => m.panel.characters?.some((c) => c.yours) ?? false);
  const standard = (await getModel<TrailModel>(page)).panel.lengths!.find((l) => l.id === "standard")!;
  await clickUntilChanged<TrailModel>(page, standard.objectId, (m) => m.ready?.state === "open");
}

test("locking in hangs the run's length on a sign over the muster, then fades the first draft in", async ({ page }) => {
  test.setTimeout(60_000);
  await readyToLockIn(page);

  await clickObject(page, "ready");
  await expect.poll(() => transition(page)).toEqual({ caseId: "run-start", phase: "sign", title: "Standard run", sub: "6 camps" });
  const hung = Date.now();
  await expect.poll(() => texts(page)).toContain("STANDARD RUN");
  expect((await getModel<TrailModel>(page)).panel.kind).toBe("muster");

  await expect.poll(async () => (await getModel<TrailModel>(page)).panel.kind, { timeout: 10_000 }).toBe("draft");
  expect(Date.now() - hung).toBeGreaterThan(2500);
  await expect.poll(() => transition(page)).toBeNull();
  expect(await texts(page)).not.toContain("STANDARD RUN");

  // The draft before camp 1 moves on to its loadout with no sign.
  const first = (await getModel<TrailModel>(page)).panel.draft!.bundles![0]!;
  await clickUntilChanged<TrailModel>(page, first.objectId, (m) => m.panel.kind === "loadout");
  expect(await transition(page)).toBeNull();

  // Set out: the table's sign, then the camp.
  await clickObject(page, "ready");
  await expect.poll(() => transition(page)).toMatchObject({ caseId: "table", phase: "sign", title: "Camp 1" });
  expect(await getScene(page)).toBe("trail");
  await expect.poll(() => getScene(page), { timeout: 10_000 }).toBe("camp");
});

test("a dev jump shows the next scene at once, unless this browser asks for signs after jumps; a refresh plays nothing", async ({ page }) => {
  test.setTimeout(90_000);
  await readyToLockIn(page);
  await clickObject(page, "ready");
  await expect.poll(async () => (await getModel<TrailModel>(page)).panel.kind, { timeout: 10_000 }).toBe("draft");
  await expect.poll(() => transition(page)).toBeNull();

  await toolbar(page, "jump-to-camp", { length: "standard", stage: "camp" });
  await expect.poll(() => getScene(page)).toBe("camp");
  await expect.poll(() => transition(page)).toBeNull();
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seenTransitions: string[] }).seenTransitions = seen;
    const watch = () => {
      const t = (window.__expeditionTest as unknown as { transition: Transition | null }).transition;
      if (t !== null) seen.push(t.caseId);
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await toolbar(page, "force-camp", { outcome: "cleared" });
  await expect.poll(() => getScene(page)).toBe("trail");
  expect(await page.evaluate(() => (window as unknown as { seenTransitions: string[] }).seenTransitions)).toEqual([]);

  // Previewing signs: the toolbar's Skip camp hangs "Camp won!" over the table.
  await page.evaluate(() => localStorage.setItem("expedition-transitions", "always"));
  await toolbar(page, "jump-to-camp", { length: "standard", stage: "camp" });
  await expect.poll(() => transition(page)).toBeNull();
  await expect.poll(() => getScene(page)).toBe("camp");
  await toolbar(page, "force-camp", { outcome: "cleared" });
  await expect.poll(() => transition(page)).toMatchObject({ caseId: "camp-won", phase: "sign", title: "Camp won!" });
  await expect.poll(() => texts(page)).toContain("CAMP WON!");
  expect(await getScene(page)).toBe("camp");
  await expect.poll(() => getScene(page), { timeout: 10_000 }).toBe("trail");

  await page.reload();
  await waitForBridge(page);
  for (let i = 0; i < 5; i++) {
    expect(await transition(page)).toBeNull();
    await page.waitForTimeout(200);
  }
  expect(await getScene(page)).toBe("trail");
});
