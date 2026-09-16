import { expect, test } from "@playwright/test";
import { createRoom, expectSeatCount, joinAs } from "./helpers";

test.describe("start game (ROOM-06 + D-10 + D-13 + D-02/D-03 Hanabi board)", () => {
  test("gating, variant lock, and the Hanabi board prove turn order and HIDE-01 redaction end to end", async ({
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

    // Both contexts switch to the real Hanabi board.
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();

    // Exactly one side reads "Your turn"; the other reads "Waiting for".
    const hostIndicator = hostPage.getByTestId("turn-indicator");
    const joinerIndicator = pageB.getByTestId("turn-indicator");
    const hostText = (await hostIndicator.textContent()) ?? "";
    const joinerText = (await joinerIndicator.textContent()) ?? "";
    const hostIsActive = hostText === "Your turn";
    const joinerIsActive = joinerText === "Your turn";
    expect(hostIsActive).not.toBe(joinerIsActive);
    expect(hostIsActive || joinerIsActive).toBe(true);
    if (!hostIsActive) {
      expect(hostText).toContain("Waiting for");
    }
    if (!joinerIsActive) {
      expect(joinerText).toContain("Waiting for");
    }

    // HIDE-01 browser surface: what the OTHER page renders for a player's
    // hand (their real card identities, seeded server-side and secret to
    // this test) must never appear as text on that player's OWN own-hand
    // region. Deriving the expected strings from what the other page
    // actually shows avoids hardcoding a card identity.
    const hostRealCardTexts = await pageB
      .locator('[data-testid^="other-hand-card-"]')
      .allTextContents();
    const joinerRealCardTexts = await hostPage
      .locator('[data-testid^="other-hand-card-"]')
      .allTextContents();
    expect(hostRealCardTexts.length).toBeGreaterThan(0);
    expect(joinerRealCardTexts.length).toBeGreaterThan(0);

    const hostOwnHandText = ((await hostPage.getByTestId("own-hand").textContent()) ?? "").trim();
    const joinerOwnHandText = ((await pageB.getByTestId("own-hand").textContent()) ?? "").trim();
    for (const cardText of hostRealCardTexts) {
      expect(hostOwnHandText).not.toContain(cardText.trim());
    }
    for (const cardText of joinerRealCardTexts) {
      expect(joinerOwnHandText).not.toContain(cardText.trim());
    }

    // Play/discard controls exist on both pages; disabled on the waiting
    // player's page regardless of selection, since it is not their turn.
    const activePage = hostIsActive ? hostPage : pageB;
    const waitingPage = hostIsActive ? pageB : hostPage;

    await expect(waitingPage.getByTestId("play-button")).toBeDisabled();
    await expect(waitingPage.getByTestId("discard-button")).toBeDisabled();

    // Discard is disabled at the starting 8/8 clue tokens (D-12), so the
    // active player plays their first own-hand slot instead: the deck count
    // drops by one and EITHER the discard pile gains an entry (a misplay
    // burns a fuse) OR a played stack advances — asserted structurally
    // rather than assuming which outcome the seeded deck produces, on
    // both pages — and the turn indicator swaps.
    const activeInitialDeckCount = ((await activePage.getByTestId("deck-count").textContent()) ?? "").trim();
    const initialDeckNumber = Number.parseInt(activeInitialDeckCount, 10);
    expect(Number.isNaN(initialDeckNumber)).toBe(false);

    const initialDiscardCount = await hostPage.locator('[data-testid="discard-pile"] li').count();
    const initialStackTexts = (
      await hostPage.locator('[data-testid^="played-stack-"]').allTextContents()
    ).join("|");

    await activePage.getByTestId("own-hand-slot-1").click();
    await expect(activePage.getByTestId("play-button")).toBeEnabled();
    await activePage.getByTestId("play-button").click();

    await expect(hostPage.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} cards left in deck`);
    await expect(pageB.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} cards left in deck`);

    await expect(async () => {
      const discardCount = await hostPage.locator('[data-testid="discard-pile"] li').count();
      const stackTexts = (await hostPage.locator('[data-testid^="played-stack-"]').allTextContents()).join("|");
      expect(discardCount > initialDiscardCount || stackTexts !== initialStackTexts).toBe(true);
    }).toPass();

    await expect(activePage.getByTestId("turn-indicator")).toContainText("Waiting for");
    await expect(waitingPage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // After the game starts, the host's variant control is gone (ROOM-05).
    await expect(hostPage.getByTestId("variant-picker")).toHaveCount(0);

    await contextB.close();
  });
});
