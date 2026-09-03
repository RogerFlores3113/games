import { expect, test } from "@playwright/test";
import { createRoom, joinAs } from "./helpers";

test.describe("live seat list (ROOM-04 + D-09)", () => {
  test("duplicate names are auto-suffixed for every viewer, and disconnect is shown live without a reload", async ({
    page: hostPage,
    browser,
  }) => {
    const code = await createRoom(hostPage, { name: "Roger" });

    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    const pageB = await joinAs(contextB, code, "Roger");
    const pageC = await joinAs(contextC, code, "Roger");

    // All three seats visible to all three contexts.
    for (const p of [hostPage, pageB, pageC]) {
      await expect(p.getByTestId("seat-row")).toHaveCount(3);
      await expect(p.getByText("Roger", { exact: true })).toBeVisible();
      await expect(p.getByText("Roger (2)", { exact: true })).toBeVisible();
      await expect(p.getByText("Roger (3)", { exact: true })).toBeVisible();
    }

    // Close context C entirely (terminates its WebSocket) and confirm both
    // remaining viewers see "Disconnected" live, with no manual page refresh.
    await contextC.close();

    await expect(hostPage.getByTestId("seat-row").filter({ hasText: "Disconnected" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageB.getByTestId("seat-row").filter({ hasText: "Disconnected" })).toBeVisible({
      timeout: 10_000,
    });

    await contextB.close();
  });
});
