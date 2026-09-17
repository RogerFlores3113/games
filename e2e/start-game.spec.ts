import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { createRoom, expectSeatCount, joinAs, startGameWithPlayers, startTwoPlayerGame } from "./helpers";

type WireCard = Record<string, unknown> & { id?: unknown; hidden?: unknown };
interface GameFrame {
  yourHand: WireCard[] | undefined;
  otherHandCards: WireCard[];
}

/** WR-07: collects the Hanabi game view out of every JSON frame the page's
 * WebSockets receive (non-JSON frames such as heartbeats are ignored). */
function recordGameFrames(page: Page, sink: GameFrame[]): void {
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      let message: unknown;
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      const game = (message as { view?: { game?: unknown } } | null)?.view?.game as
        | { yourHand?: WireCard[]; otherHands?: Array<{ cards?: WireCard[] }> }
        | null
        | undefined;
      if (!game || typeof game !== "object") return;
      sink.push({
        yourHand: game.yourHand,
        otherHandCards: (game.otherHands ?? []).flatMap((hand) => hand.cards ?? []),
      });
    });
  });
}

test.describe("start game (ROOM-06 + D-10 + D-13 + D-02/D-03 Hanabi board)", () => {
  test("gating, variant lock, and the Hanabi board prove turn order and HIDE-01 redaction end to end", async ({
    page: hostPage,
    browser,
  }) => {
    // WR-07: record every game frame each page receives, registered before
    // either page opens its socket.
    const hostFrames: GameFrame[] = [];
    const joinerFrames: GameFrame[] = [];
    recordGameFrames(hostPage, hostFrames);

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
    contextB.on("page", (page) => recordGameFrames(page, joinerFrames));
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

    // UI-01 (D-01/D-24): the tableau and every one of its elements are in
    // the viewport with NO interaction — checked before any click below.
    await expect(hostPage.getByTestId("tableau")).toBeInViewport();
    await expect(hostPage.getByTestId("clue-tokens")).toBeInViewport();
    await expect(hostPage.getByTestId("fuse-tokens")).toBeInViewport();
    await expect(hostPage.getByTestId("deck-count")).toBeInViewport();
    await expect(hostPage.getByTestId("discard-pile")).toBeInViewport();

    // Black variant has 6 suits (base 5 + Black) — every played stack is
    // present, in the viewport, and carries exactly one suit glyph (UI-03/
    // UI-06).
    const playedStacks = hostPage.locator('[data-testid^="played-stack-"]');
    await expect(playedStacks).toHaveCount(6);
    const playedStackCount = await playedStacks.count();
    for (let i = 0; i < playedStackCount; i++) {
      const stack = playedStacks.nth(i);
      await expect(stack).toBeInViewport();
      await expect(stack.locator("[data-glyph]")).toHaveCount(1);
    }

    // Every teammate card carries a suit glyph via card-identity (UI-03/
    // UI-06) — face-up by design, unlike the viewer's own hand.
    const otherHandCards = hostPage.locator('[data-testid^="other-hand-card-"]');
    const otherHandCardCount = await otherHandCards.count();
    expect(otherHandCardCount).toBeGreaterThan(0);
    for (let i = 0; i < otherHandCardCount; i++) {
      const card = otherHandCards.nth(i);
      await expect(card.locator('[data-testid="card-identity"] [data-glyph]')).toHaveCount(1);
    }

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

    // HIDE-01 wire surface (WR-07): every server frame either page received
    // must redact that page's own hand — `hidden: true` and no suit/rank key
    // on any `yourHand` card. The teammate-hand sanity check proves the
    // detector really sees identity keys when they are present, so a pass
    // here is not vacuous.
    for (const [who, frames] of [
      ["host", hostFrames],
      ["joiner", joinerFrames],
    ] as const) {
      const gameFrames = frames.filter((f) => f.yourHand !== undefined);
      expect(gameFrames.length, `${who} received at least one game frame`).toBeGreaterThan(0);
      for (const frame of gameFrames) {
        for (const card of frame.yourHand ?? []) {
          expect(card.hidden, `${who} own card ${String(card.id)} is hidden`).toBe(true);
          expect(card, `${who} own card ${String(card.id)} has no suit key`).not.toHaveProperty("suit");
          expect(card, `${who} own card ${String(card.id)} has no rank key`).not.toHaveProperty("rank");
        }
      }
      const teammateCards = gameFrames.flatMap((f) => f.otherHandCards);
      expect(teammateCards.some((card) => "suit" in card && "rank" in card)).toBe(true);
    }

    // HIDE-01 browser surface (WR-07): with no clue given yet, every own-hand
    // slot must show zero knowledge — no hint overlay rendered at all, and
    // the unclued luminosity. A rendering leak of any identity signal
    // changes at least one of these.
    for (const page of [hostPage, pageB]) {
      const slots = page.locator('[data-testid^="own-hand-slot-"]');
      const slotCount = await slots.count();
      expect(slotCount).toBeGreaterThan(0);
      for (let i = 0; i < slotCount; i++) {
        const slot = slots.nth(i);
        // HINT-01/02/04: clue hints now render on the tile itself via a
        // `own-hand-slot-N-hints` overlay (HintIndicator), not an automatic
        // clue-mark pip row above the card — that pip band is deleted.
        await expect(slot).toHaveAttribute("data-luminosity", "unclued");
        await expect(slot).toHaveAttribute("data-hints", "false");
        await expect(page.getByTestId(`own-hand-slot-${i + 1}-hints`)).toHaveCount(0);
      }
    }

    // No clues have been given yet at this point in the test, so no own-hand
    // card may carry any suit-exposing marker either — neither a
    // colorblind-safe glyph (`data-glyph`) nor identity text.
    await expect(
      hostPage.getByTestId("own-hand").locator('[data-glyph], [data-testid="card-identity"]'),
    ).toHaveCount(0);
    await expect(
      pageB.getByTestId("own-hand").locator('[data-glyph], [data-testid="card-identity"]'),
    ).toHaveCount(0);

    // Play/discard controls exist on both pages; disabled on the waiting
    // player's page regardless of selection, since it is not their turn.
    const activePage = hostIsActive ? hostPage : pageB;
    const waitingPage = hostIsActive ? pageB : hostPage;

    await expect(waitingPage.getByTestId("play-button")).toBeDisabled();
    await expect(waitingPage.getByTestId("discard-button")).toBeDisabled();

    // RULES-11: every disabled control shows a visible reason.
    await expect(waitingPage.getByTestId("action-reason-play")).toHaveText("Not your turn");
    await expect(activePage.getByTestId("action-reason-discard")).toHaveText(
      "Clue tokens are full — you can't discard",
    );
    await expect(activePage.getByTestId("action-reason-play")).toHaveText("Select a card in your hand first");

    // Discard is disabled at the starting 8/8 clue tokens (D-12), so the
    // active player plays their first own-hand slot instead: the deck count
    // drops by one and EITHER the discard pile gains an entry (a misplay
    // burns a fuse) OR a played stack advances — asserted structurally
    // rather than assuming which outcome the seeded deck produces, on
    // both pages — and the turn indicator swaps.
    const activeInitialDeckCount = ((await activePage.getByTestId("deck-count").textContent()) ?? "").trim();
    const initialDeckNumber = Number.parseInt(activeInitialDeckCount, 10);
    expect(Number.isNaN(initialDeckNumber)).toBe(false);

    const initialDiscardCount = Number(
      await hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"),
    );
    const initialStackTexts = (
      await hostPage.locator('[data-testid^="played-stack-"]').allTextContents()
    ).join("|");

    await activePage.getByTestId("own-hand-slot-1").click();
    await expect(activePage.getByTestId("action-reason-play")).toHaveCount(0);
    await expect(activePage.getByTestId("own-hand-slot-1")).toHaveAttribute("data-selected", "true");
    await expect(activePage.getByTestId("play-button")).toBeEnabled();
    await activePage.getByTestId("play-button").click();

    await expect(hostPage.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} cards left in deck`);
    await expect(pageB.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} cards left in deck`);

    await expect(async () => {
      const discardCount = Number(
        await hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"),
      );
      const stackTexts = (await hostPage.locator('[data-testid^="played-stack-"]').allTextContents()).join("|");
      expect(discardCount > initialDiscardCount || stackTexts !== initialStackTexts).toBe(true);
    }).toPass();

    await expect(activePage.getByTestId("turn-indicator")).toContainText("Waiting for");
    await expect(waitingPage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // After the game starts, the host's variant control is gone (ROOM-05).
    await expect(hostPage.getByTestId("variant-picker")).toHaveCount(0);

    await contextB.close();
  });

  test("UI-10: a game played to its end shows the designed end overlay (D-20/D-21)", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(240_000);

    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);
    const otherPage = pageB;

    // WR-09: the game can end at any point inside an iteration. Once it does,
    // the full-screen overlay covers (and the board disables) every control,
    // so a plain `.click()` would retry until the 240s test timeout. Every
    // click below uses a short timeout and, on failure, re-checks the overlay
    // before moving on.
    const endOverlayVisible = async () =>
      (await hostPage.getByTestId("end-overlay").isVisible()) ||
      (await otherPage.getByTestId("end-overlay").isVisible());
    const tryClick = async (locator: Locator): Promise<boolean> => {
      try {
        await locator.click({ timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    };

    let sawEndOverlay = false;
    for (let i = 0; i < 80; i++) {
      if (await endOverlayVisible()) {
        sawEndOverlay = true;
        break;
      }

      // Re-derive which page is active each iteration — the active seat
      // alternates as the game progresses.
      const hostText = ((await hostPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
      const activePlayer = hostText === "Your turn" ? hostPage : otherPage;

      if (await endOverlayVisible()) {
        sawEndOverlay = true;
        break;
      }
      if (!(await tryClick(activePlayer.getByTestId("own-hand-slot-1")))) {
        if (await endOverlayVisible()) {
          sawEndOverlay = true;
          break;
        }
        continue;
      }

      // Retrying wait for the play button (the selection re-render may not
      // have landed yet), rather than a one-shot `isEnabled()` read.
      const playEnabled = await expect(activePlayer.getByTestId("play-button"))
        .toBeEnabled({ timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (!playEnabled) {
        // Selection may have been dropped (card left the hand), it is not
        // this page's turn after all, or the game ended; re-check the overlay
        // before treating this as a failure.
        if (await endOverlayVisible()) {
          sawEndOverlay = true;
          break;
        }
        continue;
      }
      if (!(await tryClick(activePlayer.getByTestId("play-button")))) {
        if (await endOverlayVisible()) {
          sawEndOverlay = true;
          break;
        }
        continue;
      }

      await expect
        .poll(async () => {
          if (await hostPage.getByTestId("end-overlay").isVisible()) return true;
          const stillYourTurn = ((await activePlayer.getByTestId("turn-indicator").textContent()) ?? "") === "Your turn";
          return !stillYourTurn;
        })
        .toBe(true);
    }

    if (!sawEndOverlay) {
      sawEndOverlay = await hostPage.getByTestId("end-overlay").isVisible();
    }
    if (!sawEndOverlay) {
      throw new Error("UI-10: game did not reach an end state within 80 play iterations");
    }

    for (const page of [hostPage, otherPage]) {
      await expect(page.getByTestId("end-overlay")).toBeVisible();
      await expect(page.getByTestId("game-over-heading")).toHaveText("Game over");
      // WR-02: the turn indicator never names a turn after the game ended.
      await expect(page.getByTestId("turn-indicator")).toHaveText("Game over");
      await expect(page.getByTestId("final-score")).toHaveText(/^Final score: \d+ \/ 25 — .+$/);
      await expect(page.getByTestId("end-reason")).toHaveText(
        /^(Three fuses were lost\.|Every stack was completed!|The deck ran out and the final round elapsed\.)$/,
      );
      await expect(page.locator('[data-testid="end-stack"]')).toHaveCount(5);
      await expect(page.getByTestId("new-game-link")).toHaveAttribute("href", "/");
      await expect(page.getByTestId("play-button")).toBeDisabled();
      await expect(page.getByTestId("discard-button")).toBeDisabled();
      await expect(page.getByTestId("give-clue-button")).toBeDisabled();
      await expect(page.getByTestId("tableau")).toBeVisible();
    }

    await contextB.close();
  });

  test("UI-11: five players fit a 1280x720 desktop without scrolling and stay usable at 1024 wide (D-01)", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(120_000);

    const { contexts } = await startGameWithPlayers(hostPage, browser, ["Roger", "Bianca", "Chen", "Dara", "Eli"]);

    // Default viewport is 1280x720 (playwright.config.ts sets none).
    await expect(hostPage.locator('[data-testid^="other-hand-card-"]')).toHaveCount(16);

    const fitsNoScroll = await hostPage.evaluate(
      () =>
        document.documentElement.scrollHeight <= window.innerHeight + 1 &&
        document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(fitsNoScroll).toBe(true);

    const elementsToCheck = [
      hostPage.getByTestId("tableau"),
      hostPage.getByTestId("clue-tokens"),
      hostPage.getByTestId("fuse-tokens"),
      hostPage.getByTestId("deck-count"),
      hostPage.getByTestId("discard-pile"),
      hostPage.getByTestId("own-hand"),
      hostPage.getByTestId("turn-indicator"),
    ];
    for (const locator of elementsToCheck) {
      await expect(locator).toBeInViewport();
    }

    // Phase 6.1/6.2 D-01: the note/audio/discard-overlay additions and the
    // tile-borne hint surfaces still fit at 1280x720 alongside the rest of
    // the tableau. HINT-04 deletes the automatic clue-mark pip band —
    // own-hand-slot-1 and note-box-slot-1 (both present unconditionally,
    // note-box-slot-1 replacing 06.2-06's deleted note-chip-slot-1) are the
    // fit checks that replace the deleted pip-band assertions.
    await expect(hostPage.getByTestId("own-hand-slot-1")).toBeInViewport();
    await expect(hostPage.getByTestId("note-box-slot-1")).toBeInViewport();
    await expect(hostPage.getByTestId("audio-mute-toggle")).toBeInViewport();
    await expect(hostPage.getByTestId("discard-toggle")).toBeInViewport();
    await expect(
      hostPage.locator('[data-testid="teammates-band"] [data-testid^="other-hand-card-"]').first(),
    ).toBeInViewport();
    const playedStacksAt1280 = hostPage.locator('[data-testid^="played-stack-"]');
    const playedStacksAt1280Count = await playedStacksAt1280.count();
    for (let i = 0; i < playedStacksAt1280Count; i++) {
      await expect(playedStacksAt1280.nth(i)).toBeInViewport();
    }

    // Narrower desktop viewport: no horizontal overflow, and every tableau
    // element remains reachable and visible.
    await hostPage.setViewportSize({ width: 1024, height: 768 });

    const noHorizontalOverflow = await hostPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noHorizontalOverflow).toBe(true);

    for (const locator of elementsToCheck) {
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeVisible();
    }
    const playedStacksAt1024 = hostPage.locator('[data-testid^="played-stack-"]');
    const playedStacksAt1024Count = await playedStacksAt1024.count();
    for (let i = 0; i < playedStacksAt1024Count; i++) {
      const stack = playedStacksAt1024.nth(i);
      await stack.scrollIntoViewIfNeeded();
      await expect(stack).toBeVisible();
    }

    await hostPage.getByTestId("own-hand-slot-1").scrollIntoViewIfNeeded();
    await hostPage.getByTestId("own-hand-slot-1").click();
    await expect(hostPage.getByTestId("own-hand-slot-1")).toHaveAttribute("data-selected", "true");

    for (const context of contexts) {
      await context.close();
    }
  });
});
