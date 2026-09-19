import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  createRoom,
  discardOwnHandSlot,
  expectSeatCount,
  giveAnyLegalClue,
  giveAnyLegalClueToAnyTeammate,
  isDiscardCurrentlyLegal,
  joinAs,
  playOwnHandSlot,
  playUntilGameEnds,
  seatIdOfOtherPlayer,
  startGameWithPlayers,
  startTwoPlayerGame,
} from "./helpers";
import {
  BOARD_CHROME_PX,
  OWN_BAND_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
} from "../apps/web/lib/layout-budget";

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

/** Returns whichever of `hostPage`/`otherPage` currently has the active turn. */
async function currentActivePage(hostPage: Page, otherPage: Page): Promise<Page> {
  const hostText = ((await hostPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
  return hostText === "Your turn" ? hostPage : otherPage;
}

/** Walks up to 5 ancestors from `locator` looking for a computed solid
 * border — a generic way to prove "this area is outlined" without coupling
 * to which exact ancestor div carries the border style (BOARD-01). */
async function hasBorderedAncestor(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    for (let i = 0; i < 5 && node; i += 1) {
      const style = getComputedStyle(node);
      if (style.borderStyle.split(" ").some((s) => s === "solid") && parseFloat(style.borderWidth) > 0) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
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

    // Black variant has 7 suits (5 colours + Rainbow + Black) — every played
    // stack is present, in the viewport, and carries exactly one suit glyph
    // (UI-03/UI-06).
    const playedStacks = hostPage.locator('[data-testid^="played-stack-"]');
    await expect(playedStacks).toHaveCount(7);
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
    // slot must show zero knowledge — no hint overlay rendered at all. A
    // rendering leak of any identity signal changes at least one of these.
    // UAT gap 35: the Phase 6 luminosity frame (`data-luminosity`) that used
    // to also assert an "unclued" step here is deleted entirely — `data-hints`
    // is now the only clue-presence signal on a tile.
    for (const page of [hostPage, pageB]) {
      const slots = page.locator('[data-testid^="own-hand-slot-"]');
      const slotCount = await slots.count();
      expect(slotCount).toBeGreaterThan(0);
      for (let i = 0; i < slotCount; i++) {
        const slot = slots.nth(i);
        // HINT-01/02/04: clue hints now render on the tile itself via a
        // `own-hand-slot-N-hints` overlay (HintIndicator), not an automatic
        // clue-mark pip row above the card — that pip band is deleted.
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

    // HAND-02 (owner request, 2026-09-19): the visible Play/Discard buttons
    // are gone — RULES-11 ("illegal actions are visibly unavailable") is now
    // proven behaviourally: an off-turn P/D key press on the waiting
    // player's own tile is a silent no-op (deck count and turn indicator
    // both unchanged), routed through the same `disabledReasonFor` gate the
    // deleted buttons' disabled state used to read.
    const activePage = hostIsActive ? hostPage : pageB;
    const waitingPage = hostIsActive ? pageB : hostPage;

    const waitingDeckCountBefore = ((await waitingPage.getByTestId("deck-count").textContent()) ?? "").trim();
    const waitingTurnTextBefore = ((await waitingPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
    await playOwnHandSlot(waitingPage, 1);
    await discardOwnHandSlot(waitingPage, 1);
    await expect(waitingPage.getByTestId("deck-count")).toHaveText(waitingDeckCountBefore);
    await expect(waitingPage.getByTestId("turn-indicator")).toHaveText(waitingTurnTextBefore);

    // Discard is illegal at the starting 8/8 clue tokens (D-12) — confirm via
    // `clue-tokens`' own data-count (the deleted discard-button's disabled
    // state used to carry this) and prove a D press on the active page is
    // also a no-op before falling through to the legal play below.
    expect(await isDiscardCurrentlyLegal(activePage)).toBe(false);
    const activeDeckCountBeforeDiscardAttempt = (
      (await activePage.getByTestId("deck-count").textContent()) ?? ""
    ).trim();
    await discardOwnHandSlot(activePage, 1);
    await expect(activePage.getByTestId("deck-count")).toHaveText(activeDeckCountBeforeDiscardAttempt);

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

    await playOwnHandSlot(activePage, 1);

    await expect(hostPage.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} x`);
    await expect(pageB.getByTestId("deck-count")).toHaveText(`${initialDeckNumber - 1} x`);

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

  // D-17: one shared test body proves the correct score ceiling, score ===
  // sum of played-stack played counts, and column count for base, Rainbow
  // and Black — no per-variant branch beyond this table.
  const UI10_VARIANTS = [
    { variant: "base" as const, maxScore: 25, columns: 5 },
    { variant: "rainbow" as const, maxScore: 30, columns: 6 },
    { variant: "black" as const, maxScore: 35, columns: 7 },
  ];

  for (const { variant, maxScore, columns } of UI10_VARIANTS) {
    test(`UI-10 (${variant}): a game played to its end shows the designed end overlay (D-17/D-20/D-21)`, async ({
      page: hostPage,
      browser,
    }) => {
      test.setTimeout(240_000);

      const { pages, contexts } = await startGameWithPlayers(hostPage, browser, ["Roger", "Bianca"], { variant });
      const [playerA, playerB] = pages as [Page, Page];

      // 07-10: Black's deck grew again to 70 tiles (three 5s, two each of
      // 4/3/2, one 1); the shared playUntilGameEnds cap is raised uniformly
      // for all three rows so a 2-player Black game (60 cards left to draw,
      // plus clues and the final round) can't exhaust the iteration budget
      // before it ends.
      await playUntilGameEnds(playerA, playerB, 140);

      for (const page of pages) {
        await expect(page.getByTestId("end-overlay")).toBeVisible();
        await expect(page.getByTestId("game-over-heading")).toHaveText("Game over");
        // WR-02: the turn indicator never names a turn after the game ended.
        await expect(page.getByTestId("turn-indicator")).toHaveText("Game over");

        const scoreRegex = new RegExp(`^Final score: (\\d+) / ${maxScore} — .+$`);
        await expect(page.getByTestId("final-score")).toHaveText(scoreRegex);
        const finalScoreText = (await page.getByTestId("final-score").textContent()) ?? "";
        const match = finalScoreText.match(scoreRegex);
        expect(match, `could not parse final score from "${finalScoreText}"`).not.toBeNull();
        const finalScore = Number(match![1]);

        await expect(page.getByTestId("end-reason")).toHaveText(
          /^(Three fuses were lost\.|Every stack was completed!|The deck ran out and the final round elapsed\.)$/,
        );

        const endStacks = page.locator('[data-testid="end-stack"]');
        await expect(endStacks).toHaveCount(columns);
        const playedCounts = await endStacks.evaluateAll((els) =>
          els.map((el) => Number(el.getAttribute("data-played-count") ?? "0")),
        );
        expect(finalScore).toBe(playedCounts.reduce((sum, count) => sum + count, 0));

        await expect(page.getByTestId("new-game-link")).toHaveAttribute("href", "/");
        // HAND-02: the deleted Play/Discard buttons' disabled state is
        // replaced by the own-hand tile's own `disabled` attribute, tied to
        // the same `reconnecting || ended` gate.
        await expect(page.getByTestId("own-hand-slot-1")).toBeDisabled();
        // UAT gap 16: the deleted CluePicker's persistent give-clue-button is
        // gone — an ended game's illegality now shows as the quick-clue
        // popover simply not opening at all on a tile click.
        const teammateTile = page.locator('[data-testid^="other-hand-card-"]').first();
        if ((await teammateTile.count()) > 0) {
          await teammateTile.click();
          await expect(page.getByTestId("tile-clue-popover")).toHaveCount(0);
        }
        await expect(page.getByTestId("tableau")).toBeVisible();

        await expect(page.locator('[data-testid^="played-stack-"][data-played-count]')).toHaveCount(columns);
      }

      for (const context of contexts) {
        await context.close();
      }
    });
  }

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
    // 06.2-13: the mute toggle no longer lives on the board — every
    // non-play preference control (including mute) moved into
    // SettingsModal, reached via the gear trigger. Assert the gear itself
    // fits, and that the modal is not present by default.
    await expect(hostPage.getByTestId("own-hand-slot-1")).toBeInViewport();
    await expect(hostPage.getByTestId("note-box-slot-1")).toBeInViewport();
    await expect(hostPage.getByTestId("settings-toggle")).toBeInViewport();
    await expect(hostPage.getByTestId("settings-modal")).toHaveCount(0);
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

    // HAND-02: no click-to-select state exists any more — the fit/reachability
    // proof is that the tile can still be focused (the keyboard fallback's
    // prerequisite) at this narrower viewport.
    const ownSlot1 = hostPage.getByTestId("own-hand-slot-1");
    await ownSlot1.scrollIntoViewIfNeeded();
    await ownSlot1.focus();
    await expect(ownSlot1).toBeFocused();

    for (const context of contexts) {
      await context.close();
    }
  });

  test("UI-11/gap-11: the board scales up on a larger-than-floor viewport (1280x720 is the minimum, not the target)", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(120_000);

    const { contexts } = await startGameWithPlayers(hostPage, browser, ["Roger", "Bianca", "Chen", "Dara", "Eli"]);

    // Default viewport is 1280x720 (playwright.config.ts sets none) — the
    // floor. computeBoardZoom returns exactly 1 here, so this measurement
    // is byte-identical to every other 1280x720 fit check in this file.
    const tableauAt720 = await hostPage.getByTestId("tableau").boundingBox();
    const rankSlotAt720 = await hostPage.locator('[data-testid^="played-stack-"]').first().boundingBox();
    if (!tableauAt720 || !rankSlotAt720) throw new Error("missing bounding box at 1280x720");

    // No scroll at the floor, matching every other UI-11 check.
    const fitsNoScrollAt720 = await hostPage.evaluate(() => {
      const el = document.scrollingElement;
      return el !== null && el.scrollHeight <= el.clientHeight + 1;
    });
    expect(fitsNoScrollAt720).toBe(true);

    // Grow the window well past the floor — gap 11 requires a real,
    // measured increase in board size here, not merely "more empty margin
    // around an unchanged board".
    await hostPage.setViewportSize({ width: 1920, height: 1080 });
    // CSS `zoom` recomputes on resize (see useBoardZoom); wait for the
    // tableau's own rendered size to actually grow before asserting, so
    // this never races the resize listener/re-render.
    await expect
      .poll(async () => (await hostPage.getByTestId("tableau").boundingBox())?.height ?? 0)
      .toBeGreaterThan(tableauAt720.height * 1.2);

    const tableauAt1080 = await hostPage.getByTestId("tableau").boundingBox();
    const rankSlotAt1080 = await hostPage.locator('[data-testid^="played-stack-"]').first().boundingBox();
    if (!tableauAt1080 || !rankSlotAt1080) throw new Error("missing bounding box at 1920x1080");

    // computeBoardZoom(1920, 1080) === min(1080/720, 1920/1280) === 1.5 —
    // assert real growth close to that factor on both the board region and
    // an individual played-stack tile, not just a looser "is bigger" check.
    expect(tableauAt1080.height).toBeGreaterThan(tableauAt720.height * 1.4);
    expect(tableauAt1080.width).toBeGreaterThan(tableauAt720.width * 1.4);
    expect(rankSlotAt1080.width).toBeGreaterThan(rankSlotAt720.width * 1.4);
    expect(rankSlotAt1080.height).toBeGreaterThan(rankSlotAt720.height * 1.4);

    // Still no scroll at the larger viewport — growth must stay
    // proportional and never overflow the (also larger) window.
    const fitsNoScrollAt1080 = await hostPage.evaluate(() => {
      const el = document.scrollingElement;
      return el !== null && el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    });
    expect(fitsNoScrollAt1080).toBe(true);

    for (const context of contexts) {
      await context.close();
    }
  });

  test("06.2-07 early fit check: the reworked board fits 1280x720 with no vertical scrollbar at 5 players", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(120_000);

    const { contexts } = await startGameWithPlayers(hostPage, browser, ["Roger", "Bianca", "Chen", "Dara", "Eli"]);

    // Default viewport is 1280x720 (playwright.config.ts sets none).
    await expect(hostPage.locator('[data-testid^="other-hand-card-"]')).toHaveCount(16);

    const fitsNoScroll = await hostPage.evaluate(
      () => document.scrollingElement !== null && document.scrollingElement.scrollHeight <= window.innerHeight + 1,
    );
    expect(fitsNoScroll).toBe(true);

    for (const context of contexts) {
      await context.close();
    }
  });

  test("BOARD-01..05: Play/Discard order and outline, deck placement, token column position, token counts track actions, and every played card renders", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);
    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);

    // BOARD-01: Play above Discard, each labelled and outlined.
    const tableau = hostPage.getByTestId("tableau");
    await expect(tableau.getByText("Play", { exact: true })).toBeVisible();
    await expect(tableau.getByText("Discard", { exact: true })).toBeVisible();
    expect(await hasBorderedAncestor(hostPage.getByTestId("play-zone"))).toBe(true);
    expect(await hasBorderedAncestor(hostPage.getByTestId("discard-pile"))).toBe(true);

    const playBox = await hostPage.getByTestId("play-zone").boundingBox();
    const deckBox = await hostPage.getByTestId("deck-count").boundingBox();
    const discardBox = await hostPage.getByTestId("discard-pile").boundingBox();
    const clueTokensBox = await hostPage.getByTestId("clue-tokens").boundingBox();
    const fuseTokensBox = await hostPage.getByTestId("fuse-tokens").boundingBox();
    const turnSignBox = await hostPage.getByTestId("turn-sign").boundingBox();
    if (!playBox || !deckBox || !discardBox || !clueTokensBox || !fuseTokensBox || !turnSignBox) {
      throw new Error("missing bounding box");
    }

    // BOARD-02: the token column sits to the right of Play.
    expect(clueTokensBox.x).toBeGreaterThan(playBox.x + playBox.width);

    // UAT gap 21 (third owner review): the deck counter sits BELOW the
    // clue/fuse tokens, in the same narrow right-hand column, and shows
    // "{n} x [card back]" rather than the old "{n} cards left in deck".
    expect(deckBox.y).toBeGreaterThan(clueTokensBox.y + clueTokensBox.height);
    expect(deckBox.y).toBeGreaterThan(fuseTokensBox.y + fuseTokensBox.height);
    await expect(hostPage.getByTestId("deck-count")).toHaveText(/^\d+ x$/);

    // Gap closure 07-12 (owner gap 4, swap discard <-> turn sign): the turn
    // sign now sits to the RIGHT of the clue/fuse token column, in the
    // small spot Discard used to occupy — and Discard now sits BELOW that
    // whole row, filling the large lower area the turn sign used to fill.
    expect(turnSignBox.x).toBeGreaterThan(clueTokensBox.x + clueTokensBox.width);
    expect(turnSignBox.x).toBeGreaterThan(fuseTokensBox.x + fuseTokensBox.width);
    expect(discardBox.y).toBeGreaterThan(deckBox.y + deckBox.height);
    expect(discardBox.y).toBeGreaterThan(turnSignBox.y + turnSignBox.height);

    // BOARD-02/03: the clue-token element count and text track the
    // remaining clue count, and drop by one after a clue is given.
    const clueTokensBefore = Number(await hostPage.getByTestId("clue-tokens").getAttribute("data-count"));
    await expect(hostPage.locator('[data-testid="clue-token"]')).toHaveCount(clueTokensBefore);
    await expect(hostPage.getByTestId("clue-tokens")).toHaveText(`${clueTokensBefore} clues left`);

    const clueGiver = await currentActivePage(hostPage, pageB);
    const clueTargetSeatId = await seatIdOfOtherPlayer(clueGiver);
    const gaveClue = await giveAnyLegalClue(clueGiver, clueTargetSeatId);
    expect(gaveClue).toBe(true);

    await expect(hostPage.getByTestId("clue-tokens")).toHaveAttribute("data-count", String(clueTokensBefore - 1));
    await expect(hostPage.getByTestId("clue-tokens")).toHaveText(`${clueTokensBefore - 1} clues left`);
    await expect(hostPage.locator('[data-testid="clue-token"]')).toHaveCount(clueTokensBefore - 1);

    // BOARD-03/BOARD-05: playing a card always either advances a stack or
    // misplays (burns a fuse) — a bounded number of turns reliably produces
    // a fuse drop, and whichever stack (if any) has advanced renders every
    // one of its cards (fanned, per PlayedStack).
    let fuseDroppedOnce = false;
    for (let i = 0; i < 15 && !fuseDroppedOnce; i += 1) {
      if (await hostPage.getByTestId("end-overlay").isVisible()) break;
      const active = await currentActivePage(hostPage, pageB);
      const fuseBefore = Number(await hostPage.getByTestId("fuse-tokens").getAttribute("data-count"));

      // HAND-02: play is always legal on the active player's own turn (no
      // "selection" precondition exists any more), so the deleted enabled-
      // check before clicking is gone too — just play via the keyboard
      // fallback.
      await playOwnHandSlot(active, 1);

      await expect
        .poll(async () => {
          const fuseNow = Number(await hostPage.getByTestId("fuse-tokens").getAttribute("data-count"));
          const stillSameActive = (await currentActivePage(hostPage, pageB)) === active;
          return fuseNow !== fuseBefore || !stillSameActive;
        })
        .toBe(true);

      const fuseAfter = Number(await hostPage.getByTestId("fuse-tokens").getAttribute("data-count"));
      if (fuseAfter < fuseBefore) fuseDroppedOnce = true;
    }
    expect(fuseDroppedOnce).toBe(true);

    const stacks = await hostPage
      .locator('[data-testid^="played-stack-"]:not([data-testid*="-card-"])')
      .evaluateAll((els) =>
        els.map((el) => ({
          suit: (el.getAttribute("data-testid") ?? "").replace("played-stack-", ""),
          playedCount: Number(el.getAttribute("data-played-count") ?? "0"),
        })),
      );
    const advanced = stacks.find((s) => s.playedCount > 0);
    if (advanced) {
      await expect(hostPage.locator(`[data-testid^="played-stack-${advanced.suit}-card-"]`)).toHaveCount(
        advanced.playedCount,
      );
    }

    await contextB.close();
  });

  test("UI-11 worst case: 5 seats, Black variant, a deep discard pile and advanced stacks measured against the layout-budget ledger", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(180_000);

    const { pages, contexts } = await startGameWithPlayers(
      hostPage,
      browser,
      ["Roger", "Bianca", "Chen", "Dara", "Eli"],
      { variant: "black" },
    );

    async function activePageAmong(): Promise<Page> {
      for (const page of pages) {
        const text = ((await page.getByTestId("turn-indicator").textContent()) ?? "").trim();
        if (text === "Your turn") return page;
      }
      throw new Error("activePageAmong: no page currently has the active turn");
    }

    async function maxStackRank(): Promise<number> {
      const counts = await hostPage
        .locator('[data-testid^="played-stack-"]:not([data-testid*="-card-"])')
        .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-played-count") ?? "0")));
      return counts.length ? Math.max(...counts) : 0;
    }

    // Drives the game toward the worst case this build supports for the fit
    // check below: a deep discard pile and at least one advanced stack.
    // Never forces an exact target — see the SUMMARY for the actual state
    // reached when the bounded loop below runs out of attempts first.
    const TARGET_DISCARD_COUNT = 8;
    const TARGET_STACK_RANK = 3;
    for (let i = 0; i < 60; i += 1) {
      if (await hostPage.getByTestId("end-overlay").isVisible()) break;
      const discardCount = Number(await hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"));
      const rank = await maxStackRank();
      if (discardCount >= TARGET_DISCARD_COUNT && rank >= TARGET_STACK_RANK) break;

      const active = await activePageAmong();
      const clueTokens = Number(await hostPage.getByTestId("clue-tokens").getAttribute("data-count"));
      const fusesRemaining = Number(await hostPage.getByTestId("fuse-tokens").getAttribute("data-count"));

      // HAND-02: play is always legal on your own turn; discard is legal
      // whenever clueTokens < 8 (already guaranteed by the branches below
      // that reach a discard) — so, unlike the deleted buttons, neither
      // keyboard-fallback press needs its own enabled check here.
      if (clueTokens >= 8) {
        const gave = await giveAnyLegalClueToAnyTeammate(active);
        if (!gave) {
          await playOwnHandSlot(active, 1);
        }
      } else if (fusesRemaining <= 1) {
        // Preserve the game (only 3 fuses total) — discard only from here.
        await discardOwnHandSlot(active, 1);
      } else if (i % 2 === 0) {
        await playOwnHandSlot(active, 1);
      } else {
        await discardOwnHandSlot(active, 1);
      }

      await expect
        .poll(async () => {
          if (await hostPage.getByTestId("end-overlay").isVisible()) return true;
          try {
            return (await activePageAmong()) !== active;
          } catch {
            // Transient: mid-broadcast, no page has yet rendered the new
            // active turn — treat as "not yet flipped" and keep polling.
            return false;
          }
        })
        .toBe(true);
    }

    const finalDiscardCount = Number(await hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"));
    const finalMaxRank = await maxStackRank();
    // eslint-disable-next-line no-console -- worst-case state is recorded in the SUMMARY by hand from this log
    console.log(`UI-11 worst case reached: discardCount=${finalDiscardCount}, maxStackRank=${finalMaxRank}`);

    // Default viewport is 1280x720 (playwright.config.ts sets none).
    const fitsNoScroll = await hostPage.evaluate(() => {
      const el = document.scrollingElement;
      return el !== null && el.scrollHeight <= el.clientHeight;
    });
    expect(fitsNoScroll).toBe(true);

    const elementsToCheck = [
      hostPage.getByTestId("tableau"),
      hostPage.getByTestId("play-zone"),
      hostPage.getByTestId("discard-pile"),
      hostPage.getByTestId("deck-count"),
      hostPage.getByTestId("clue-tokens"),
      hostPage.getByTestId("fuse-tokens"),
    ];
    for (const locator of elementsToCheck) {
      await expect(locator).toBeInViewport();
    }

    const otherHands = hostPage.locator('[data-testid^="other-hand-"]:not([data-testid^="other-hand-card-"])');
    const otherHandCount = await otherHands.count();
    expect(otherHandCount).toBeGreaterThan(0);
    for (let i = 0; i < otherHandCount; i += 1) {
      await expect(otherHands.nth(i)).toBeInViewport();
    }

    const ownSlots = hostPage.locator('[data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])');
    const ownSlotCount = await ownSlots.count();
    expect(ownSlotCount).toBeGreaterThan(0);
    for (let i = 0; i < ownSlotCount; i += 1) {
      await expect(ownSlots.nth(i)).toBeInViewport();
    }

    // Measure the real band heights and reconcile against layout-budget.ts
    // (RESEARCH.md Pitfall 1) — the ledger must match the rendered board,
    // not the reverse.
    const teammatesBandBox = await hostPage.getByTestId("teammates-band").boundingBox();
    const tableauBox = await hostPage.getByTestId("tableau").boundingBox();
    const bottomRowBox = await hostPage.getByTestId("bottom-controls-row").boundingBox();
    if (!teammatesBandBox || !tableauBox || !bottomRowBox) throw new Error("missing band bounding box");

    // eslint-disable-next-line no-console -- measured values recorded in the SUMMARY by hand from this log
    console.log(
      `Measured bands: teammates=${teammatesBandBox.height}, tableau=${tableauBox.height}, bottomRow=${bottomRowBox.height}`,
    );

    // Real-browser reconciliation (06.2-19): `tableau`'s own inline style is
    // exactly `TABLE_BAND_MIN_PX` (Table.tsx sets `height: BOARD_INNER_PX +
    // 2 * BOARD_PANEL_PADDING_PX`, which IS `TABLE_BAND_MIN_PX`) — comparing
    // against `TABLE_BAND_MIN_PX + BOARD_CHROME_PX` double-counted the
    // page-level chrome that `BOARD_CHROME_PX` already accounts for
    // separately (see this file's total-fit check above and
    // layout-budget.ts's header comment). Corrected here; a tight tolerance
    // catches real regressions instead of a 40px window wide enough to hide
    // them.
    const TOLERANCE_PX = 2;
    expect(Math.abs(teammatesBandBox.height - TEAMMATE_BAND_PX)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(tableauBox.height - TABLE_BAND_MIN_PX)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(bottomRowBox.height - OWN_BAND_PX)).toBeLessThanOrEqual(TOLERANCE_PX);

    // 06.2-19: assert the newly-added elements this ledger reconciliation
    // covers are still in the viewport at the worst case, not just present.
    await expect(hostPage.getByTestId("settings-toggle")).toBeInViewport();
    await expect(hostPage.getByTestId("discard-group-by-suit")).toBeInViewport();
    const rankFiveSlot = hostPage
      .locator('[data-testid^="played-slot-"][data-testid$="-5"], [data-testid^="played-stack-"][data-testid$="-card-5"]')
      .first();
    await expect(rankFiveSlot).toBeInViewport();

    for (const context of contexts) {
      await context.close();
    }
  });

  test("UAT gap 1 fixed geometry: the board's rendered box does not grow as tiles accumulate", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(180_000);

    // The owner's core complaint, made mechanically checkable: "things
    // should be taking up space that's already portioned out" — reserved
    // board regions must render at the SAME box before and after real game
    // progress, not merely "still fit the viewport" (that's UI-11's job).
    const names = ["Roger", "Bianca", "Chen", "Dara", "Eli"];
    const { pages, contexts } = await startGameWithPlayers(hostPage, browser, names, { variant: "black" });

    // Under load the five pages receive each server push at different
    // moments, so no single page's DOM can be trusted as "the game state
    // now". Reading one page (the host) for token/discard counts, and picking
    // "the first page that says Your turn" as the actor, raced those lagging
    // pages: the loop could act on a page whose turn had already passed
    // ("Discard (Not your turn)"), or decide on a stale token count. Instead
    // every step waits for a SETTLED board: all five pages render the same
    // public state, it differs from the state before the action, and exactly
    // one page holds the turn. Every decision is read from that settled
    // state and every action is taken on the page it names.
    interface BoardSnapshot {
      key: string;
      yourTurn: boolean;
      ended: boolean;
      clueTokens: number;
      discardCount: number;
      maxPlayedCount: number;
      /** Suit -> the rank that must be played next on that stack (direction-
       * agnostic: a descending Black column's next rank starts at 5, not 1).
       * A suit is absent once its stack is complete. */
      nextRankBySuit: Record<string, number>;
    }
    interface SettledBoard extends Omit<BoardSnapshot, "yourTurn"> {
      activeIdx: number;
    }

    async function readSnapshot(page: Page): Promise<BoardSnapshot> {
      return page.evaluate(() => {
        const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`);
        const stacks = [
          ...document.querySelectorAll('[data-testid^="played-stack-"]:not([data-testid*="-card-"])'),
        ].map((el) => ({
          suit: (el.getAttribute("data-testid") ?? "").replace("played-stack-", ""),
          playedCount: Number(el.getAttribute("data-played-count") ?? "0"),
          nextRank: el.getAttribute("data-next-rank") ?? "",
        }));
        const clueTokens = Number(byTestId("clue-tokens")?.getAttribute("data-count"));
        const fuses = byTestId("fuse-tokens")?.getAttribute("data-count") ?? "";
        const discardCount = Number(byTestId("discard-pile")?.getAttribute("data-discard-count"));
        const deck = (byTestId("deck-count")?.textContent ?? "").trim();
        const ended = byTestId("end-overlay") !== null;
        // Every Hanabi action changes this public tuple: a clue spends a
        // token, a discard grows the pile, a play draws from the deck or
        // moves a stack or a fuse.
        const key = [
          clueTokens,
          fuses,
          discardCount,
          deck,
          stacks
            .map((s) => `${s.suit}:${s.playedCount}`)
            .sort()
            .join(","),
          ended,
        ].join("|");
        const nextRankBySuit: Record<string, number> = {};
        for (const s of stacks) {
          if (s.nextRank !== "") nextRankBySuit[s.suit] = Number(s.nextRank);
        }
        return {
          key,
          yourTurn: byTestId("turn-indicator")?.getAttribute("data-your-turn") === "true",
          ended,
          clueTokens,
          discardCount,
          maxPlayedCount: stacks.length ? Math.max(...stacks.map((s) => s.playedCount)) : 0,
          nextRankBySuit,
        };
      });
    }

    /** Waits until every page renders one identical state that is not
     * `previousKey`, with exactly one page holding the turn (or the game
     * over on every page), and returns it. */
    async function waitForSettledBoard(previousKey: string | null): Promise<SettledBoard> {
      let settled: SettledBoard | null = null;
      await expect
        .poll(async () => {
          const snapshots = await Promise.all(pages.map(readSnapshot));
          const [first] = snapshots;
          if (!snapshots.every((s) => s.key === first.key)) return "pages disagree";
          if (first.key === previousKey) return "action not applied yet";
          const holders = snapshots.flatMap((s, idx) => (s.yourTurn ? [idx] : []));
          if (!first.ended && holders.length !== 1) return `turn held by ${holders.length} pages`;
          settled = {
            key: first.key,
            ended: first.ended,
            clueTokens: first.clueTokens,
            discardCount: first.discardCount,
            maxPlayedCount: first.maxPlayedCount,
            nextRankBySuit: first.nextRankBySuit,
            activeIdx: first.ended ? -1 : holders[0],
          };
          return "settled";
        })
        .toBe("settled");
      return settled as unknown as SettledBoard;
    }

    /** After an action by `actorIdx`, waits for the settled board and
     * asserts the turn passed strictly round-robin (`packages/rules/src/
     * hanabi/actions.ts`: `(turnIndex + 1) % seatIds.length`; seats are in
     * join order, which is `pages`' order). */
    async function afterActionBy(actorIdx: number, previousKey: string): Promise<SettledBoard> {
      const next = await waitForSettledBoard(previousKey);
      if (!next.ended) expect(next.activeIdx).toBe((actorIdx + 1) % pages.length);
      return next;
    }

    /** Runs one attempt at an action on `page`, re-trying only when the
     * attempt could not act. Playwright's e2e heartbeat injection (1s ping,
     * 1s pong deadline, playwright.config.ts) makes a loaded browser miss a
     * pong now and then and force-reconnect; while "Reconnecting…" shows,
     * the board drops every action (`HanabiBoard`'s `act` returns early and
     * the clue popover never opens). So each attempt first waits for this
     * page's own connection to be back, and an attempt caught by a fresh
     * reconnect mid-way is simply made again. A retry cannot double-act: the
     * server is authoritative and rejects any action once the turn moves. */
    async function actWhenConnected(page: Page, attempt: () => Promise<boolean>): Promise<void> {
      for (let tries = 0; tries < 5; tries += 1) {
        await expect(page.getByTestId("reconnecting-banner")).toHaveCount(0);
        if (await attempt()) return;
        await page.keyboard.press("Escape"); // close any clue popover left open
      }
      throw new Error("actWhenConnected: the action could not be taken in 5 connected attempts");
    }

    /** `locator.click` that reports failure instead of throwing, bounded so
     * a control a reconnect disabled mid-attempt fails this attempt fast. */
    async function tryClick(locator: Locator): Promise<boolean> {
      try {
        await locator.click({ timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    }

    /** HAND-02: the keyboard-fallback equivalent of `tryClick` above — focus
     * the tile then press P (play) or D (discard), reporting failure instead
     * of throwing so a reconnect disabled mid-attempt fails this attempt
     * fast, same as `tryClick`. */
    async function tryKeyAction(locator: Locator, key: "p" | "d"): Promise<boolean> {
      try {
        await locator.focus({ timeout: 2000 });
        await locator.press(key, { timeout: 2000 });
        return true;
      } catch {
        return false;
      }
    }

    /** The id of a card in `targetLabel`'s hand (as rendered on
     * `viewerPage`) whose identity's rank equals that suit's `nextRankBySuit`
     * entry — one the game rules will always accept as a legal play right
     * now, direction-agnostic (a descending Black column's next rank is 5,
     * not 1). Teammates' cards are visible to every other seat, so this
     * reads real identity, not a guess. Returns `null` if no such card is
     * currently held. */
    async function findPlayableCandidate(
      viewerPage: Page,
      targetLabel: string,
      nextRankBySuit: Record<string, number>,
    ): Promise<string | null> {
      const container = viewerPage
        .locator('[data-testid^="other-hand-"]:not([data-testid^="other-hand-card-"])', { hasText: targetLabel })
        .first();
      if ((await container.count()) === 0) return null;
      const cards = container.locator('[data-testid^="other-hand-card-"]');
      const cardCount = await cards.count();
      for (let i = 0; i < cardCount; i += 1) {
        const identity = cards.nth(i).locator('[data-testid="card-identity"]');
        if ((await identity.count()) === 0) continue;
        const text = ((await identity.textContent()) ?? "").trim();
        const match = text.match(/^(\S+)\s+(\d)$/);
        if (!match) continue;
        const suit = match[1].toLowerCase();
        const rank = Number(match[2]);
        if (nextRankBySuit[suit] !== rank) continue;
        const testId = (await cards.nth(i).getAttribute("data-testid")) ?? "";
        return testId.replace(/^other-hand-card-/, "");
      }
      return null;
    }

    const regionsToMeasure = ["tableau", "play-zone", "discard-pile", "clue-tokens", "turn-sign"] as const;
    async function measureRegions(): Promise<Record<(typeof regionsToMeasure)[number], { width: number; height: number }>> {
      const result = {} as Record<(typeof regionsToMeasure)[number], { width: number; height: number }>;
      for (const testId of regionsToMeasure) {
        const box = await hostPage.getByTestId(testId).boundingBox();
        if (!box) throw new Error(`missing bounding box for ${testId}`);
        result[testId] = { width: box.width, height: box.height };
      }
      return result;
    }

    // Measure immediately after game start, before any tiles have moved.
    const boxesAtStart = await measureRegions();

    // Play forward until at least eight tiles are discarded, at least one
    // stack has advanced, and at least one clue token has been spent — the
    // three kinds of state change gap 1 complained could reflow the board.
    // Random own-hand plays risk misplays (fuse loss) that this bounded loop
    // can't recover from within only 3 fuses, so the "stack has advanced"
    // requirement is driven deterministically: find a teammate's real,
    // currently-safe rank-1 card, clue it (spending the clue token this
    // test also requires), then have that exact teammate play that exact
    // card (by id) on the very next turn, before anything else can change.
    const TARGET_DISCARD_COUNT = 8;
    let clueTokenSpent = false;
    let guaranteedAdvanceDone = false;
    let pendingPlay: { seatIdx: number; cardId: string } | null = null;
    // Gap closure 07-12 (owner gap 4): the discard tile's own box must be
    // just as fixed as the reserved regions above — captured the first
    // time the pile holds exactly one tile, and compared against the same
    // (first, by discardOrder) tile's box once the pile holds at least
    // TARGET_DISCARD_COUNT.
    let discardTileBoxAtOne: { width: number; height: number } | null = null;
    let board = await waitForSettledBoard(null);
    for (let i = 0; i < 60; i += 1) {
      if (board.ended) break;
      if (discardTileBoxAtOne === null && board.discardCount >= 1) {
        const box = await hostPage.locator('[data-testid^="discard-tile-"]').first().boundingBox();
        if (!box) throw new Error("missing bounding box for first discard tile at count 1");
        discardTileBoxAtOne = { width: box.width, height: box.height };
      }
      if (board.discardCount >= TARGET_DISCARD_COUNT && board.maxPlayedCount >= 1 && clueTokenSpent) break;

      const activeIdx = board.activeIdx;
      const active = pages[activeIdx];
      const nextIdx = (activeIdx + 1) % pages.length;

      // Step 2 of the guaranteed advance: the clued teammate plays the
      // clued card. Turns are strictly round-robin, so this is the turn
      // immediately after the clue and the card's stack is still empty.
      if (pendingPlay !== null) {
        expect(pendingPlay.seatIdx).toBe(activeIdx);
        const cardSlot = active
          .locator(`[data-testid="own-hand"] [data-card-id="${pendingPlay.cardId}"]`)
          .locator('[data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])');
        await actWhenConnected(active, async () => tryKeyAction(cardSlot, "p"));
        pendingPlay = null;
        guaranteedAdvanceDone = true;
        board = await afterActionBy(activeIdx, board.key);
        continue;
      }

      // Step 1 of the guaranteed advance: clue a real rank-1 card of a
      // currently-empty stack to the next player — tried until it succeeds.
      if (!guaranteedAdvanceDone && board.clueTokens > 0) {
        await expect(active.getByTestId("reconnecting-banner")).toHaveCount(0);
        const candidateId = await findPlayableCandidate(active, names[nextIdx], board.nextRankBySuit);
        if (candidateId !== null) {
          const card = active.getByTestId(`other-hand-card-${candidateId}`);
          await card.click();
          const rankButton = active.getByTestId("tile-clue-rank");
          if (await rankButton.isEnabled()) {
            await rankButton.click();
            clueTokenSpent = true;
            pendingPlay = { seatIdx: nextIdx, cardId: candidateId };
            board = await afterActionBy(activeIdx, board.key);
            continue;
          }
          // Popover offered nothing clickable (or a reconnect began) —
          // close it and fall through to the fallback below on this same
          // turn, which retries through any reconnect.
          await active.keyboard.press("Escape");
        }
      }

      // Fallback: discarding refunds a clue token (standard Hanabi rule),
      // so clue tokens are periodically back at the 8-token max — and
      // discarding is illegal while tokens are full. Give a clue whenever
      // tokens are full or a clue hasn't been spent yet; otherwise always
      // discard — discarding never risks a fuse, so it reliably grows the
      // pile toward the discard-count target without endangering the game.
      // `board.clueTokens` is the settled count every page agrees on, not
      // one possibly-lagging page's.
      if (board.clueTokens >= 8 || (!clueTokenSpent && board.clueTokens > 0)) {
        await actWhenConnected(active, () => giveAnyLegalClueToAnyTeammate(active));
        clueTokenSpent = true;
      } else {
        await actWhenConnected(active, async () => tryKeyAction(active.getByTestId("own-hand-slot-1"), "d"));
      }
      board = await afterActionBy(activeIdx, board.key);
    }

    // `board` is the settled state all five pages agree on, host included.
    expect(board.discardCount).toBeGreaterThanOrEqual(TARGET_DISCARD_COUNT);
    expect(board.maxPlayedCount).toBeGreaterThanOrEqual(1);
    expect(clueTokenSpent).toBe(true);

    // Measure again after real game progress and assert the five reserved
    // regions' width and height are byte-identical (1px tolerance only for
    // sub-pixel rounding) — the board must not grow or reflow.
    const boxesAtEnd = await measureRegions();
    const TOLERANCE_PX = 1;
    for (const testId of regionsToMeasure) {
      expect(
        Math.abs(boxesAtEnd[testId].width - boxesAtStart[testId].width),
        `${testId} width changed from ${boxesAtStart[testId].width} to ${boxesAtEnd[testId].width}`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(
        Math.abs(boxesAtEnd[testId].height - boxesAtStart[testId].height),
        `${testId} height changed from ${boxesAtStart[testId].height} to ${boxesAtEnd[testId].height}`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
    }

    // Gap closure 07-12 (owner gap 4): a discard TILE's own rendered box is
    // just as fixed as the reservation around it — the same first tile's
    // box, measured at discardCount 1 and again at discardCount >=
    // TARGET_DISCARD_COUNT, must be byte-identical.
    if (discardTileBoxAtOne === null) throw new Error("never observed discardCount >= 1 during the loop");
    const discardTileBoxAtEnd = await hostPage.locator('[data-testid^="discard-tile-"]').first().boundingBox();
    if (!discardTileBoxAtEnd) throw new Error("missing bounding box for first discard tile at end");
    expect(
      Math.abs(discardTileBoxAtEnd.width - discardTileBoxAtOne.width),
      `discard-tile width changed from ${discardTileBoxAtOne.width} to ${discardTileBoxAtEnd.width}`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(
      Math.abs(discardTileBoxAtEnd.height - discardTileBoxAtOne.height),
      `discard-tile height changed from ${discardTileBoxAtOne.height} to ${discardTileBoxAtEnd.height}`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);

    const fitsNoScroll = await hostPage.evaluate(() => {
      const el = document.scrollingElement;
      return el !== null && el.scrollHeight <= el.clientHeight + 1;
    });
    expect(fitsNoScroll).toBe(true);

    for (const context of contexts) {
      await context.close();
    }
  });
});
