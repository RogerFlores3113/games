import { expect, test } from "@playwright/test";
import { createRoom, expectSeatCount, joinAs } from "./helpers";

test.describe("start game (ROOM-06 + D-10 + D-13 + D-02/D-03 forehead-card toy)", () => {
  test("gating, variant lock, and the forehead-card toy prove turn order and HIDE-01 redaction end to end", async ({
    page: hostPage,
    browser,
  }) => {
    const code = await createRoom(hostPage, { name: "Roger" });

    // With only the host seated: "Start game" present but disabled, with the
    // "Need 2–5 players" caption.
    const startButton = hostPage.getByTestId("start-game");
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    await expect(hostPage.getByText("Need 2–5 players")).toBeVisible();

    // D-10/D-11's amendment: no element anywhere on the lobby contains the
    // text "ready" (case-insensitive), asserted at the surface a user
    // actually sees.
    await expect(hostPage.getByText(/ready/i)).toHaveCount(0);

    // Host changes the variant from Base to Black. The radio is a fully
    // controlled input (`checked={view.variant === value}`) driven by the
    // server-pushed RoomView, not local state — a plain `.click()` fires
    // the change and the assertion below auto-retries until the socket
    // round-trip lands, rather than `.check()`'s built-in immediate
    // post-click verification, which races the network round-trip.
    await hostPage.getByRole("radio", { name: "Black" }).click();
    await expect(hostPage.getByRole("radio", { name: "Black" })).toBeChecked();

    const contextB = await browser.newContext();
    const pageB = await joinAs(contextB, code, "Bianca");
    await expectSeatCount(hostPage, 2);

    // The joiner has no variant control.
    await expect(pageB.getByTestId("variant-picker")).toHaveCount(0);

    // With 2 seated, "Start game" becomes enabled.
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Both contexts switch to the forehead-card toy screen.
    await expect(hostPage.getByTestId("own-card")).toBeVisible();
    await expect(pageB.getByTestId("own-card")).toBeVisible();

    // Exactly one side reads "Your turn — guess your card"; the other reads
    // "Waiting for".
    const hostIndicator = hostPage.getByTestId("turn-indicator");
    const joinerIndicator = pageB.getByTestId("turn-indicator");
    const hostText = (await hostIndicator.textContent()) ?? "";
    const joinerText = (await joinerIndicator.textContent()) ?? "";
    const hostIsActive = hostText === "Your turn — guess your card";
    const joinerIsActive = joinerText === "Your turn — guess your card";
    expect(hostIsActive).not.toBe(joinerIsActive);
    expect(hostIsActive || joinerIsActive).toBe(true);
    if (!hostIsActive) {
      expect(hostText).toContain("Waiting for");
    }
    if (!joinerIsActive) {
      expect(joinerText).toContain("Waiting for");
    }

    // HIDE-01 browser surface: each page's teammate's other-card tile shows
    // the value that page's own-card tile must never reveal, and the
    // converse for the other page.
    const hostOtherCardValue = ((await hostPage.getByTestId("other-card").textContent()) ?? "").trim();
    const joinerOtherCardValue = ((await pageB.getByTestId("other-card").textContent()) ?? "").trim();
    expect(hostOtherCardValue.length).toBeGreaterThan(0);
    expect(joinerOtherCardValue.length).toBeGreaterThan(0);

    const hostOwnCardText = ((await hostPage.getByTestId("own-card").textContent()) ?? "").trim();
    const joinerOwnCardText = ((await pageB.getByTestId("own-card").textContent()) ?? "").trim();
    expect(joinerOwnCardText).toBe("");
    expect(joinerOwnCardText).not.toContain(hostOtherCardValue);
    expect(hostOwnCardText).toBe("");
    expect(hostOwnCardText).not.toContain(joinerOtherCardValue);

    // Guess controls: 16 guess buttons on both pages; enabled only for the
    // active player.
    const hostGuessButtons = hostPage.getByTestId(/^guess-button-/);
    const joinerGuessButtons = pageB.getByTestId(/^guess-button-/);
    await expect(hostGuessButtons).toHaveCount(16);
    await expect(joinerGuessButtons).toHaveCount(16);

    const activePage = hostIsActive ? hostPage : pageB;
    const waitingPage = hostIsActive ? pageB : hostPage;
    const activeButton = activePage.getByTestId(/^guess-button-/).first();
    const waitingButton = waitingPage.getByTestId(/^guess-button-/).first();
    await expect(activeButton).toBeEnabled();
    await expect(waitingButton).toBeDisabled();

    // The active player guesses: the deck count drops to 13, the revealed
    // pile gains one entry on both pages, and the turn indicator swaps.
    await activeButton.click();
    await expect(hostPage.getByTestId("revealed-entry")).toHaveCount(1);
    await expect(pageB.getByTestId("revealed-entry")).toHaveCount(1);
    await expect(hostPage.getByTestId("deck-count")).toHaveText("13 left in deck");
    await expect(pageB.getByTestId("deck-count")).toHaveText("13 left in deck");
    await expect(activePage.getByTestId("turn-indicator")).toContainText("Waiting for");
    await expect(waitingPage.getByTestId("turn-indicator")).toHaveText("Your turn — guess your card");

    // After the game starts, the host's variant control is gone (ROOM-05).
    await expect(hostPage.getByTestId("variant-picker")).toHaveCount(0);

    await contextB.close();
  });
});
