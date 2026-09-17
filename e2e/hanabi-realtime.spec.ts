import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  createRoom,
  emulateVisibility,
  expectSeatCount,
  freezePage,
  joinAs,
  resumePage,
  seatIdOfOtherPlayer,
  startTwoPlayerGame,
} from "./helpers";

/**
 * Selects a clue value on `page` (already targeting the sole other seat)
 * that the board itself shows as touching at least one visible card, by
 * trying each rendered `clue-value-*` button in turn until the submit
 * button (`give-clue-button`) becomes enabled. Never guesses at card
 * identities — the deck is server-seeded and secret to this test.
 *
 * D-17: zero-touch clue-value options are now rendered disabled, so a
 * `.click()` on one would hang until Playwright's actionability timeout
 * (disabled elements never become clickable). Skip any button whose
 * `isEnabled()` is false before attempting to click it.
 */
async function selectAClueValueThatTouchesSomething(page: Page): Promise<void> {
  const valueButtons = page.locator('[data-testid^="clue-value-"]');
  const count = await valueButtons.count();
  for (let i = 0; i < count; i++) {
    const button = valueButtons.nth(i);
    if (!(await button.isEnabled())) {
      continue;
    }
    await button.click();
    const enabled = await page.getByTestId("give-clue-button").isEnabled();
    if (enabled) {
      return;
    }
  }
  throw new Error("selectAClueValueThatTouchesSomething: no clue value touched any visible card");
}

test.describe("Hanabi realtime proofs (RT-01 + RT-03 + D-14)", () => {
  test("RT-01: a clue and a play/discard taken in one browser appear on the other browser with no reload", async ({
    page: hostPage,
    browser,
  }) => {
    const code = await createRoom(hostPage, { name: "Roger" });
    const contextB = await browser.newContext();
    const pageB = await joinAs(contextB, code, "Bianca");
    await expectSeatCount(hostPage, 2);

    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();

    const hostText = (await hostPage.getByTestId("turn-indicator").textContent()) ?? "";
    const hostIsActive = hostText === "Your turn";
    const activePage = hostIsActive ? hostPage : pageB;
    const passivePage = hostIsActive ? pageB : hostPage;

    // Capture the PASSIVE page's own state before the active page acts —
    // the load-bearing assertions below are made against THIS page, never
    // against the page that performed the action, since a page trivially
    // already knows what it just did.
    const passiveClueTokensBefore = ((await passivePage.getByTestId("clue-tokens").textContent()) ?? "").trim();

    // The active page targets the sole other seat and gives a clue that
    // the board confirms touches at least one visible card.
    const otherSeatButton = activePage.locator('[data-testid^="clue-target-"]').first();
    await otherSeatButton.click();
    await selectAClueValueThatTouchesSomething(activePage);
    await activePage.getByTestId("give-clue-button").click();

    // This test body never manually refreshes either page (no page-reload
    // call anywhere above or below this line) — the point of this test is
    // that the PASSIVE page updates on its own, driven purely by the
    // realtime push from the worker, with no manual refresh on the
    // observing side.
    await expect(passivePage.getByTestId("clue-tokens")).not.toHaveText(passiveClueTokensBefore);
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // Second proof, same test: a non-clue action (play or discard) taken
    // by the NOW-active page (the former passive page) also reaches the
    // other page with no reload. Clue tokens are below max after the clue
    // above, so discard is available; fall back to play if it is not.
    const secondActingPage = passivePage; // now active, per the assertion above
    const secondObservingPage = activePage; // now passive

    const observerDeckCountBefore = ((await secondObservingPage.getByTestId("deck-count").textContent()) ?? "").trim();

    await secondActingPage.getByTestId("own-hand-slot-1").click();
    const discardEnabled = await secondActingPage.getByTestId("discard-button").isEnabled();
    if (discardEnabled) {
      await secondActingPage.getByTestId("discard-button").click();
    } else {
      await secondActingPage.getByTestId("play-button").click();
    }

    await expect(secondObservingPage.getByTestId("deck-count")).not.toHaveText(observerDeckCountBefore);

    await contextB.close();
  });

  test("RT-03: a mid-game refresh returns the player to the same seat with full state and no lost turn", async ({
    page: hostPage,
    browser,
  }) => {
    const code = await createRoom(hostPage, { name: "Roger" });
    const contextB = await browser.newContext();
    const pageB = await joinAs(contextB, code, "Bianca");
    await expectSeatCount(hostPage, 2);

    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();

    const hostText = (await hostPage.getByTestId("turn-indicator").textContent()) ?? "";
    const hostIsActive = hostText === "Your turn";
    const activePage = hostIsActive ? hostPage : pageB;
    const otherPage = hostIsActive ? pageB : hostPage;

    // Take at least one action before reloading, so this is genuinely a
    // mid-game reload rather than one at the opening state.
    const otherSeatButton = activePage.locator('[data-testid^="clue-target-"]').first();
    await otherSeatButton.click();
    await selectAClueValueThatTouchesSomething(activePage);
    await activePage.getByTestId("give-clue-button").click();
    await expect(otherPage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // The page that reloads is now the active one (the clue's target, who
    // just received the turn) — reloading the ACTIVE seat mid-turn is the
    // strictest version of this proof.
    const reloadingPage = otherPage;
    const untouchedPage = activePage;

    // The board never renders the viewer's own seatId directly (it is
    // deliberately absent from the redacted board — only clue facts and
    // position are), so seat identity is proven from the OTHER page's
    // perspective instead: the `other-hand-{seatId}` testid it renders for
    // the reloading player names that player's seat, and reattaching to a
    // NEW seat (rather than reclaiming the same one) would change it.
    const otherHandTestIdBefore = await untouchedPage
      .locator('[data-testid^="other-hand-"]')
      .first()
      .getAttribute("data-testid");
    const ownHandSlotCountBefore = await reloadingPage.locator('[data-testid^="own-hand-slot-"]').count();
    const ownHandTextBefore = ((await reloadingPage.getByTestId("own-hand").textContent()) ?? "").trim();
    const clueTokensBefore = ((await reloadingPage.getByTestId("clue-tokens").textContent()) ?? "").trim();
    const deckCountBefore = ((await reloadingPage.getByTestId("deck-count").textContent()) ?? "").trim();
    const turnIndicatorBefore = ((await reloadingPage.getByTestId("turn-indicator").textContent()) ?? "").trim();

    const untouchedTurnIndicatorBefore =
      ((await untouchedPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
    const untouchedClueTokensBefore = ((await untouchedPage.getByTestId("clue-tokens").textContent()) ?? "").trim();

    await reloadingPage.reload();

    // Not the in-progress refusal — a seat-token failure would surface as
    // exactly that, and would otherwise look superficially like a working
    // page if this assertion were skipped.
    await expect(reloadingPage.getByTestId("refusal-card")).toHaveCount(0);
    await expect(reloadingPage.getByTestId("own-hand")).toBeVisible();

    const otherHandTestIdAfter = await untouchedPage
      .locator('[data-testid^="other-hand-"]')
      .first()
      .getAttribute("data-testid");
    expect(otherHandTestIdAfter).toBe(otherHandTestIdBefore);
    await expect(reloadingPage.locator('[data-testid^="own-hand-slot-"]')).toHaveCount(ownHandSlotCountBefore);
    await expect(reloadingPage.getByTestId("own-hand")).toHaveText(ownHandTextBefore);
    await expect(reloadingPage.getByTestId("clue-tokens")).toHaveText(clueTokensBefore);
    await expect(reloadingPage.getByTestId("deck-count")).toHaveText(deckCountBefore);
    await expect(reloadingPage.getByTestId("turn-indicator")).toHaveText(turnIndicatorBefore);

    // The other player's page was unaffected throughout.
    await expect(untouchedPage.getByTestId("turn-indicator")).toHaveText(untouchedTurnIndicatorBefore);
    await expect(untouchedPage.getByTestId("clue-tokens")).toHaveText(untouchedClueTokensBefore);

    await contextB.close();
  });

  test("UI-02 + UI-04: the active marker moves and a clue marks the same cards on the giver's and target's screens, persisting across the target's refresh (D-02/D-14/D-24)", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const giverSeat = await seatIdOfOtherPlayer(passivePage);
    const targetSeat = await seatIdOfOtherPlayer(activePage);

    // UI-02 before: the active marker is on the giver's own-band/turn-
    // indicator, and on the passive page's rendering of the giver's hand.
    await expect(activePage.getByTestId("own-band")).toHaveAttribute("data-active", "true");
    await expect(activePage.getByTestId("turn-indicator")).toHaveAttribute("data-your-turn", "true");
    await expect(passivePage.getByTestId("own-band")).toHaveAttribute("data-active", "false");
    await expect(passivePage.getByTestId(`other-hand-${giverSeat}`)).toHaveAttribute("data-active", "true");
    await expect(activePage.getByTestId(`other-hand-${targetSeat}`)).toHaveAttribute("data-active", "false");

    // Giver targets the sole other seat and selects a clue value that
    // touches at least one visible card, keeping focus on that value button
    // (its preview stays active via onFocus/onBlur) — collect the preview
    // ids before giving the clue.
    await activePage.getByTestId(`clue-target-${targetSeat}`).click();
    await selectAClueValueThatTouchesSomething(activePage);

    const previewLocator = activePage.locator(`[data-testid="other-hand-${targetSeat}"] [data-preview="true"]`);
    await expect(previewLocator.first()).toBeVisible();
    const previewTestIds = await previewLocator.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")),
    );
    expect(previewTestIds.length).toBeGreaterThan(0);
    const touchedCount = previewTestIds.length;

    await activePage.getByTestId("give-clue-button").click();

    // Transient (D-14): the just-clued highlight appears on BOTH the
    // target's own-hand (passivePage) and the giver's rendering of the
    // target's hand (activePage), matching the touched count.
    await expect(passivePage.locator('[data-testid="own-hand"] [data-just-clued="true"]')).toHaveCount(
      touchedCount,
    );
    await expect(
      activePage.locator(`[data-testid="other-hand-${targetSeat}"] [data-just-clued="true"]`),
    ).toHaveCount(touchedCount);

    // Persistent marks: on the giver's page, every previously-previewed card
    // now carries a non-"unclued" luminosity, and the touched count matches
    // exactly. On the target's own page, the same number of own-hand slots
    // are non-"unclued".
    for (const testId of previewTestIds) {
      if (!testId) continue;
      await expect(activePage.locator(`[data-testid="${testId}"]`)).toHaveAttribute(
        "data-luminosity",
        /^(touched|known)$/,
      );
    }
    await expect(
      activePage.locator(`[data-testid="other-hand-${targetSeat}"] [data-luminosity]:not([data-luminosity="unclued"])`),
    ).toHaveCount(touchedCount);
    await expect(
      passivePage.locator('[data-testid^="own-hand-slot-"]:not([data-luminosity="unclued"])'),
    ).toHaveCount(touchedCount);

    // The transient highlight clears after CLUE_HIGHLIGHT_MS while the
    // persistent marks remain.
    await expect(passivePage.locator('[data-just-clued="true"]')).toHaveCount(0, { timeout: 5000 });
    await expect(
      passivePage.locator('[data-testid^="own-hand-slot-"]:not([data-luminosity="unclued"])'),
    ).toHaveCount(touchedCount);

    // UI-02 after: the active marker has moved to the target.
    await expect(passivePage.getByTestId("own-band")).toHaveAttribute("data-active", "true");
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");
    await expect(activePage.getByTestId(`other-hand-${targetSeat}`)).toHaveAttribute("data-active", "true");
    await expect(activePage.getByTestId("own-band")).toHaveAttribute("data-active", "false");

    // Refresh persistence (D-14): the target's own-hand luminosity survives
    // a reload with no transient replay.
    const before = await passivePage
      .locator('[data-testid^="own-hand-slot-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-luminosity")));

    await passivePage.reload();

    await expect(passivePage.getByTestId("refusal-card")).toHaveCount(0);
    await expect(passivePage.getByTestId("own-hand")).toBeVisible();

    await expect
      .poll(() =>
        passivePage
          .locator('[data-testid^="own-hand-slot-"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute("data-luminosity"))),
      )
      .toEqual(before);
    await expect(
      passivePage.locator('[data-testid^="own-hand-slot-"]:not([data-luminosity="unclued"])'),
    ).toHaveCount(touchedCount);
    await expect(passivePage.locator('[data-just-clued="true"]')).toHaveCount(0);

    await contextB.close();
  });

  test("CR-01: the just-clued highlight still clears when another action lands inside the highlight window (D-14)", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const targetSeat = await seatIdOfOtherPlayer(activePage);

    await activePage.getByTestId(`clue-target-${targetSeat}`).click();
    await selectAClueValueThatTouchesSomething(activePage);
    await activePage.getByTestId("give-clue-button").click();

    const giverView = activePage.locator(`[data-testid="other-hand-${targetSeat}"] [data-just-clued="true"]`);
    await expect(passivePage.locator('[data-testid="own-hand"] [data-just-clued="true"]').first()).toBeVisible();
    await expect(giverView.first()).toBeVisible();

    // Immediately (well inside CLUE_HIGHLIGHT_MS) the target discards a card
    // that was NOT just clued, so the clued cards stay in hand and the
    // highlight on them must still clear. Before the CR-01 fix, this second
    // frame cancelled the clear timer and the highlight stuck until the next
    // clue. If every card was clued, discarding one still leaves the others.
    const unclued = passivePage.locator('[data-testid^="own-hand-slot-"][data-just-clued="false"]');
    const slot = (await unclued.count()) > 0 ? unclued.first() : passivePage.getByTestId("own-hand-slot-1");
    await slot.click();
    await expect(slot).toHaveAttribute("data-selected", "true");
    await passivePage.getByTestId("discard-button").click();
    await expect(activePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // Precondition: the discard frame landed while the highlight was still
    // showing — otherwise this test would not exercise the CR-01 path.
    expect(
      await giverView.count(),
      "discard must land inside CLUE_HIGHLIGHT_MS for this test to be meaningful",
    ).toBeGreaterThan(0);

    await expect(giverView).toHaveCount(0, { timeout: 5000 });
    await expect(passivePage.locator('[data-just-clued="true"]')).toHaveCount(0, { timeout: 5000 });

    await contextB.close();
  });
});

test.describe("Phase 5 reconnect hardening (RT-04 + RT-06 + D-14)", () => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "needs locally injected heartbeat timing (D-15)");

  test("RT-04/RT-06: a network drop mid-game shows Reconnecting…, the table pauses in place for the other player, and the player returns to the same seat and turn", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(90_000);

    const { contextB, pageB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // Give one clue so this is genuinely mid-game, then wait for the turn to
    // pass — the now-active page becomes the DROPPING page (so the other
    // player's "Waiting for X" text applies to it), and the other page is
    // the OBSERVER.
    const otherSeatButton = activePage.locator('[data-testid^="clue-target-"]').first();
    await otherSeatButton.click();
    await selectAClueValueThatTouchesSomething(activePage);
    await activePage.getByTestId("give-clue-button").click();
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    const droppingPage = passivePage; // now active, per the assertion above
    const observer = activePage; // now passive

    const droppingContext = droppingPage === hostPage ? hostPage.context() : contextB;

    const droppedSeatId = await seatIdOfOtherPlayer(observer);
    const droppedNameText = ((await observer.getByTestId("turn-indicator").textContent()) ?? "").trim();
    const droppedName = droppedNameText.replace(/^Waiting for /, "").trim();
    const observerClueTokensBefore = ((await observer.getByTestId("clue-tokens").textContent()) ?? "").trim();
    const observerDeckCountBefore = ((await observer.getByTestId("deck-count").textContent()) ?? "").trim();

    const droppingClueTokensBefore = ((await droppingPage.getByTestId("clue-tokens").textContent()) ?? "").trim();
    const droppingDeckCountBefore = ((await droppingPage.getByTestId("deck-count").textContent()) ?? "").trim();
    const droppingOwnHandSlotCountBefore = await droppingPage.locator('[data-testid^="own-hand-slot-"]').count();

    await droppingContext.setOffline(true);

    await expect(droppingPage.getByTestId("reconnecting-banner")).toBeVisible({ timeout: 15_000 });
    await expect(droppingPage.getByTestId("play-button")).toBeDisabled();
    await expect(droppingPage.getByTestId("discard-button")).toBeDisabled();
    await expect(droppingPage.getByTestId("give-clue-button")).toBeDisabled();
    await expect(droppingPage.getByTestId("action-reason-play")).toHaveText("Reconnecting — actions paused");
    await expect(droppingPage.getByText(/Connecting to room/)).toHaveCount(0);
    await expect(droppingPage.getByTestId("own-hand")).toBeVisible();

    await expect(observer.getByTestId(`seat-status-${droppedSeatId}`)).toHaveAttribute("data-connected", "false", {
      timeout: 20_000,
    });
    await expect(observer.getByTestId(`seat-status-${droppedSeatId}`)).toContainText("Disconnected");
    await expect(observer.getByTestId("turn-indicator")).toHaveText(`Waiting for ${droppedName} — disconnected`);
    await expect(observer.getByTestId("clue-tokens")).toHaveText(observerClueTokensBefore);
    await expect(observer.getByTestId("deck-count")).toHaveText(observerDeckCountBefore);

    await droppingContext.setOffline(false);

    await expect(droppingPage.getByTestId("reconnecting-banner")).toHaveCount(0, { timeout: 15_000 });
    await expect(droppingPage.getByTestId("turn-indicator")).toHaveText("Your turn");
    await expect(droppingPage.getByTestId("clue-tokens")).toHaveText(droppingClueTokensBefore);
    await expect(droppingPage.getByTestId("deck-count")).toHaveText(droppingDeckCountBefore);
    await expect(droppingPage.locator('[data-testid^="own-hand-slot-"]')).toHaveCount(droppingOwnHandSlotCountBefore);

    await expect(observer.getByTestId(`seat-status-${droppedSeatId}`)).toHaveAttribute("data-connected", "true");
    await expect(observer.getByTestId(`seat-status-${droppedSeatId}`)).toContainText("Connected");
    await expect(observer.getByTestId("turn-indicator")).toHaveText(`Waiting for ${droppedName}`);
    expect(await seatIdOfOtherPlayer(observer)).toBe(droppedSeatId);

    await contextB.close();
  });

  test("RT-04: a frozen, hidden tab is detected as disconnected and resumes its seat on return without a reload", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(90_000);

    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);
    const sleeper = pageB;
    const observer = hostPage;

    const sleeperSeatId = await seatIdOfOtherPlayer(observer);
    const observerTurnIndicatorBefore = ((await observer.getByTestId("turn-indicator").textContent()) ?? "").trim();
    const sleeperTurnIndicatorBefore = ((await sleeper.getByTestId("turn-indicator").textContent()) ?? "").trim();

    // WR-06 (review): swallow the page's `online` event so restoring the
    // network below cannot itself trigger the D-01 resume path — only the
    // visibility change can. A capture listener on the target runs before
    // the hook's own listener, and stopImmediatePropagation keeps it from
    // ever firing. Installed BEFORE the freeze (evaluate on a frozen page is
    // unreliable).
    await sleeper.evaluate(() => {
      window.addEventListener("online", (event) => event.stopImmediatePropagation(), { capture: true });
    });

    await emulateVisibility(sleeper, "hidden");
    let session: Awaited<ReturnType<typeof freezePage>> | undefined;
    try {
      session = await freezePage(sleeper);
    } catch {
      // Fallback per plan: if CDP freeze throws (unsupported in the
      // installed Chromium), rely on the network drop below alone.
    }
    // Rule 1 fix (found running this test live): a bare CDP forced freeze
    // did NOT reliably stop the client's heartbeat interval in the
    // installed Chromium — the seat never went stale within the injected
    // window, confirming Research Pitfall 4's documented uncertainty
    // ("frozen" and "socket closed" are different subsystems; forced
    // freeze is not a guarantee). Per Pitfall 4's own recommended defense
    // in depth, pair the freeze attempt with a hard network drop for the
    // sleep window so the staleness signal is guaranteed regardless of
    // which mechanism the installed browser actually honors.
    await contextB.setOffline(true);

    await expect(observer.getByTestId(`seat-status-${sleeperSeatId}`)).toHaveAttribute("data-connected", "false", {
      timeout: 25_000,
    });

    // Stay offline long enough that partysocket's own backoff has grown well
    // past the recovery window asserted below (1s x 1.5^n: its retries are
    // ~11s+ apart by now), so a prompt return can only come from the
    // visibility handler rather than a coincidental scheduled retry.
    await sleeper.waitForTimeout(15_000);

    await contextB.setOffline(false);
    if (session) {
      await resumePage(session);
    }
    // Network is back but (with `online` swallowed above) nothing has told
    // the hook yet: the tab must still be showing the reconnecting banner.
    await expect(sleeper.getByTestId("reconnecting-banner")).toBeVisible();
    await emulateVisibility(sleeper, "visible");

    // D-01: the visibility change alone must reseat the tab promptly — well
    // inside partysocket's current backoff interval.
    await expect(sleeper.getByTestId("reconnecting-banner")).toHaveCount(0, { timeout: 4_000 });
    await expect(sleeper.getByTestId("own-hand")).toBeVisible();
    await expect(sleeper.getByTestId("turn-indicator")).toHaveText(sleeperTurnIndicatorBefore);

    await expect(observer.getByTestId(`seat-status-${sleeperSeatId}`)).toHaveAttribute("data-connected", "true");
    expect(await seatIdOfOtherPlayer(observer)).toBe(sleeperSeatId);
    await expect(observer.getByTestId("turn-indicator")).toHaveText(observerTurnIndicatorBefore);

    await contextB.close();
  });
});
