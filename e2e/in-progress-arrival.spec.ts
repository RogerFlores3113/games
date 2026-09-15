import { expect, test } from "@playwright/test";
import { createRoom, expectSeatCount, joinAs } from "./helpers";

async function attemptJoin(context: import("@playwright/test").BrowserContext, code: string, name: string) {
  const page = await context.newPage();
  await page.goto(`/room/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
  return page;
}

test.describe("in-progress and full-room refusals (ROOM-07 + D-14 + D-06)", () => {
  test("a late arrival with no seat token sees the in-progress refusal, with no partial table rendered behind it", async ({
    page: hostPage,
    browser,
  }) => {
    const code = await createRoom(hostPage, { name: "Roger" });
    const contextB = await browser.newContext();
    await joinAs(contextB, code, "Bianca");
    await expectSeatCount(hostPage, 2);

    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("own-card")).toBeVisible();

    const contextC = await browser.newContext();
    const pageC = await attemptJoin(contextC, code, "Casey");

    const refusal = pageC.getByTestId("refusal-card");
    await expect(refusal).toBeVisible({ timeout: 10_000 });
    await expect(refusal).toContainText("This game is already in progress");
    await expect(refusal).toContainText(
      "You can't join mid-game. Ask the host for a new room, or wait for this one to finish.",
    );

    // The important assertion: a refusal must not render a partial table
    // behind it. Absence, not just presence of the message.
    await expect(pageC.getByTestId("seat-list")).toHaveCount(0);
    await expect(pageC.getByTestId("own-card")).toHaveCount(0);
    await expect(pageC.getByTestId("start-game")).toHaveCount(0);

    await contextB.close();
    await contextC.close();
  });

  test("a 6th arrival at a full 5-seat lobby sees the room-full refusal", async ({ page: hostPage, browser }) => {
    const code = await createRoom(hostPage, { name: "Roger" });

    const joinerContexts = await Promise.all(
      ["Bianca", "Casey", "Devon", "Eli"].map(async (name) => {
        const context = await browser.newContext();
        await joinAs(context, code, name);
        return context;
      }),
    );

    await expectSeatCount(hostPage, 5);

    const sixthContext = await browser.newContext();
    const sixthPage = await attemptJoin(sixthContext, code, "Frankie");

    const refusal = sixthPage.getByTestId("refusal-card");
    await expect(refusal).toBeVisible({ timeout: 10_000 });
    await expect(refusal).toContainText("This room is full");
    await expect(refusal).toContainText("All 5 seats are taken. Ask the host to open a new room.");

    await expect(sixthPage.getByTestId("seat-list")).toHaveCount(0);
    await expect(sixthPage.getByTestId("start-game")).toHaveCount(0);

    for (const context of joinerContexts) {
      await context.close();
    }
    await sixthContext.close();
  });
});
