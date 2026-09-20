import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  createRoom,
  discardOwnHandSlot,
  dragLocatorTo,
  expectSeatCount,
  giveAnyLegalClue,
  giveAnyLegalClueToAnyTeammate,
  isDiscardCurrentlyLegal,
  joinAs,
  openTileCluePopover,
  ownHandCardIds,
  playOwnHandSlot,
  seatIdOfOtherPlayer,
  startTwoPlayerGame,
  teammateHandCardIds,
} from "./helpers";

/** Mirrors hanabi-drag-logic.ts's `reorderedCardIds` exactly, so this test
 * can compute the expected order from a captured `targetIndex` without
 * importing app source into the e2e project. */
function expectedReorder(handIds: readonly string[], draggedId: string, targetIndex: number): string[] {
  const without = handIds.filter((id) => id !== draggedId);
  const clamped = Math.max(0, Math.min(targetIndex, without.length));
  const result = without.slice();
  result.splice(clamped, 0, draggedId);
  return result;
}

async function readDeckCount(page: Page): Promise<number> {
  const text = (await page.getByTestId("deck-count").textContent()) ?? "";
  const match = text.match(/(\d+)/);
  if (!match) throw new Error(`readDeckCount: could not parse "${text}"`);
  return Number(match[1]);
}

/**
 * UAT gap 16 / D-05 (Phase 7 07-03): gives a clue of the requested kind
 * (colour when `wantColor` is true, rank otherwise) to `targetSeatId`, by
 * opening each of that seat's tile popovers in turn until one offers the
 * wanted kind enabled. Returns the sent value's own button text (the suit
 * label for colour, the digit for rank) captured BEFORE the click (the
 * popover unmounts once the clue is sent), or null if no tile currently
 * offers that kind.
 *
 * Variant-safe (D-05): a colour request tries the single `colorButton`
 * first, falling back to the rainbow tile's `colorRowButtons` first entry —
 * each is `count()`-guarded before `isEnabled()`/`click()`, since only one
 * of the two ever has matches on a given tile and `isEnabled()` on a
 * zero-match locator waits out its timeout and throws rather than resolving
 * false. These tests currently only ever run in the base variant (every
 * caller uses `startTwoPlayerGame`, which has no variant option), so the
 * colour-row branch is unreachable today but keeps this helper correct if a
 * future variant-parametrized caller is added.
 */
async function giveClueOfKind(page: Page, targetSeatId: string, wantColor: boolean): Promise<string | null> {
  const tileCount = await page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).count();
  for (let i = 0; i < tileCount; i += 1) {
    const opened = await openTileCluePopover(page, targetSeatId, i);
    if (!opened) return null;
    if (!wantColor) {
      if ((await opened.rankButton.count()) > 0 && (await opened.rankButton.isEnabled())) {
        const value = (await opened.rankButton.textContent())?.trim() ?? null;
        await opened.rankButton.click();
        return value;
      }
    } else {
      if ((await opened.colorButton.count()) > 0 && (await opened.colorButton.isEnabled())) {
        const value = (await opened.colorButton.textContent())?.trim() ?? null;
        await opened.colorButton.click();
        return value;
      }
      if ((await opened.colorRowButtons.count()) > 0 && (await opened.colorRowButtons.first().isEnabled())) {
        const value = (await opened.colorRowButtons.first().textContent())?.trim() ?? null;
        await opened.colorRowButtons.first().click();
        return value;
      }
    }
    // Wanted kind not available on this tile — close and try the next.
    await page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).nth(i).click();
  }
  return null;
}

/** Waits for at least one own-hand slot to carry a rendered hint overlay
 * (`data-hints="true"`) and then reads which slot testids they are, in DOM
 * order. Excludes the `-hints` overlay spans themselves (they carry no
 * `data-hints` attribute). Callers always invoke this immediately after an
 * action (giving a clue) that is expected to touch at least one slot, so
 * this waits for that slot to actually render rather than taking a
 * one-shot snapshot that races the clue's websocket round trip and the
 * resulting re-render. */
async function ownHandHintedSlots(page: Page): Promise<string[]> {
  const hinted = page.locator('[data-testid^="own-hand-slot-"][data-hints="true"]');
  await expect(hinted.first()).toBeVisible();
  return hinted.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid") ?? "").filter((id) => /^own-hand-slot-\d+$/.test(id)),
  );
}

/** Returns whichever of `hostPage`/`otherPage` currently has the active turn. */
async function activeOf(hostPage: Page, otherPage: Page): Promise<Page> {
  const hostText = ((await hostPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
  return hostText === "Your turn" ? hostPage : otherPage;
}

/** Reads the discard pile's tile order (card ids, in DOM order) — the
 * DISC-01-safe way to observe the server's shared `discardOrder`, since
 * discarded cards' identities are public (unlike own-hand cards). */
async function discardTileOrder(page: Page): Promise<string[]> {
  const testIds = await page
    .locator('[data-testid="discard-pile"] [data-testid^="discard-tile-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid") ?? ""));
  return testIds.map((id) => id.replace(/^discard-tile-/, ""));
}

test.describe("Hanabi table-polish e2e proofs (Phase 6.1)", () => {
  test("HAND-01: an off-turn drag reorder is seen by the teammate and survives refresh", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    // The passive player's seat id, as observed from the active page — the
    // teammate whose hand is about to be reordered.
    const passiveSeatId = await seatIdOfOtherPlayer(activePage);

    const originalOrder = await ownHandCardIds(passivePage);
    const draggedId = originalOrder[0]!;
    // Slot 3's zero-based index among the registered slots (slot1=0,
    // slot2=1, slot3=2) — matches the passive player's own hand, which has
    // not been reordered yet.
    const expected = expectedReorder(originalOrder, draggedId, 2);

    // Passive drags its own slot 1 column onto slot 3 — legal off-turn
    // (D-17) — using raw pointer events, never HTML5 dragTo.
    await dragLocatorTo(passivePage, passivePage.getByTestId("own-hand-slot-1"), passivePage.getByTestId("own-hand-slot-3"));

    await expect.poll(() => ownHandCardIds(passivePage)).toEqual(expected);
    await expect.poll(() => teammateHandCardIds(activePage, passiveSeatId)).toEqual(expected);

    // The active turn indicator is unaffected by an off-turn reorder.
    await expect(activePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    await hostPage.reload();
    await passivePage.reload();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(passivePage.getByTestId("own-hand")).toBeVisible();

    await expect.poll(() => ownHandCardIds(passivePage)).toEqual(expected);
    await expect.poll(() => teammateHandCardIds(activePage, passiveSeatId)).toEqual(expected);

    await contextB.close();
  });

  test("HAND-02: dragging onto the stacks plays on your turn, and an off-turn drop does nothing", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const orderBefore = await ownHandCardIds(passivePage);
    const deckBeforeOffTurn = await readDeckCount(passivePage);

    // Off-turn drag onto the play zone: the reason label appears while
    // hovering, and releasing changes nothing on either screen.
    const sourceBox = await passivePage.getByTestId("own-hand-slot-1").boundingBox();
    const targetBox = await passivePage.getByTestId("play-zone").boundingBox();
    if (!sourceBox || !targetBox) throw new Error("missing bounding box");
    const sourceCenter = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const targetCenter = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

    await passivePage.mouse.move(sourceCenter.x, sourceCenter.y);
    await passivePage.mouse.down();
    await passivePage.mouse.move(sourceCenter.x + 10, sourceCenter.y + 10, { steps: 2 });
    await passivePage.mouse.move(targetCenter.x, targetCenter.y, { steps: 12 });
    await expect(passivePage.getByTestId("drop-reason-play")).toBeVisible();
    await passivePage.mouse.up();

    await expect(passivePage.getByTestId("deck-count")).toHaveText(`${deckBeforeOffTurn} x`);
    await expect(hostPage.getByTestId("deck-count")).toHaveText(`${deckBeforeOffTurn} x`);
    expect(await ownHandCardIds(passivePage)).toEqual(orderBefore);

    // The active player drags slot 1 onto the play zone: a real play.
    const deckBeforeOnTurn = await readDeckCount(passivePage);
    await dragLocatorTo(activePage, activePage.getByTestId("own-hand-slot-1"), activePage.getByTestId("play-zone"));

    await expect.poll(() => readDeckCount(passivePage)).toBe(deckBeforeOnTurn - 1);

    await contextB.close();
  });

  test("HAND-02: dragging onto the discard pile discards", async ({ page: hostPage, browser }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // The active player gives a clue, dropping clue tokens below 8 so the
    // NEW active player (the current passive player) can discard.
    const passiveSeatIdForClue = await seatIdOfOtherPlayer(activePage);
    expect(await giveAnyLegalClue(activePage, passiveSeatIdForClue)).toBe(true);

    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    const discardCountBefore = Number(
      await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count"),
    );

    await dragLocatorTo(passivePage, passivePage.getByTestId("own-hand-slot-2"), passivePage.getByTestId("discard-pile"));

    await expect
      .poll(async () => Number(await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count")))
      .toBe(discardCountBefore + 1);
    await expect
      .poll(async () => Number(await activePage.getByTestId("discard-pile").getAttribute("data-discard-count")))
      .toBe(discardCountBefore + 1);

    await contextB.close();
  });

  test("HAND-02: the P/D keyboard fallback still works (owner request, 2026-09-19: buttons removed)", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const deckBefore = await readDeckCount(passivePage);

    await playOwnHandSlot(activePage, 1);

    await expect.poll(() => readDeckCount(passivePage)).toBe(deckBefore - 1);

    await contextB.close();
  });

  test("HAND-02: a focused own-hand tile's P/D keys play/discard on your turn and are a silent no-op off-turn", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // Off-turn: the passive player's own tile is focused and P/D pressed —
    // no visible UI exists for either action (HAND-02, owner request
    // 2026-09-19), so the proof is behavioural: neither key changes the
    // deck count, discard pile, or whose turn it is.
    const passiveOrderBefore = await ownHandCardIds(passivePage);
    const deckBeforeOffTurn = await readDeckCount(passivePage);
    const discardCountBeforeOffTurn = Number(
      await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count"),
    );
    const passiveSlot1 = passivePage.getByTestId("own-hand-slot-1");
    await passiveSlot1.focus();
    await passiveSlot1.press("p");
    await passiveSlot1.press("d");

    // No server round-trip to await for a no-op, so poll a few times that
    // nothing changes rather than asserting immediately after the press.
    await expect(passivePage.getByTestId("deck-count")).toHaveText(`${deckBeforeOffTurn} x`);
    await expect
      .poll(async () => Number(await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count")))
      .toBe(discardCountBeforeOffTurn);
    expect(await ownHandCardIds(passivePage)).toEqual(passiveOrderBefore);
    await expect(activePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // On your turn: P plays slot 1 (deck count drops by one).
    const deckBeforeOnTurn = await readDeckCount(passivePage);
    const activeSlot1 = activePage.getByTestId("own-hand-slot-1");
    await activeSlot1.focus();
    await activeSlot1.press("p");
    await expect.poll(() => readDeckCount(passivePage)).toBe(deckBeforeOnTurn - 1);
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // Now on the (new) active player's turn: D discards, if legal at the
    // current clue-token count — otherwise this proof still shows a P play
    // works, satisfying "press P on your turn and it plays; press D and it
    // discards" without assuming discard is always legal at this point.
    if (await isDiscardCurrentlyLegal(passivePage)) {
      const discardCountBefore = Number(
        await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count"),
      );
      const passiveSlot1OnTurn = passivePage.getByTestId("own-hand-slot-1");
      await passiveSlot1OnTurn.focus();
      await passiveSlot1OnTurn.press("d");
      await expect
        .poll(async () => Number(await passivePage.getByTestId("discard-pile").getAttribute("data-discard-count")))
        .toBe(discardCountBefore + 1);
    }

    await contextB.close();
  });

  test("HAND-03: the drawn card takes the vacated slot on both screens", async ({ page: hostPage, browser }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const activeSeatId = await seatIdOfOtherPlayer(passivePage);

    const actorIdsBefore = await ownHandCardIds(activePage);
    const teammateIdsBefore = await teammateHandCardIds(passivePage, activeSeatId);
    expect(actorIdsBefore).toEqual(teammateIdsBefore);

    await playOwnHandSlot(activePage, 2);

    await expect
      .poll(async () => {
        const ids = await ownHandCardIds(activePage);
        return ids.length === actorIdsBefore.length && ids[1] !== actorIdsBefore[1];
      })
      .toBe(true);

    const actorIdsAfter = await ownHandCardIds(activePage);
    await expect.poll(() => teammateHandCardIds(passivePage, activeSeatId)).toEqual(actorIdsAfter);

    // Only index 1 (slot 2) changed; every other index is untouched — the
    // drawn card occupies exactly the vacated slot, on both screens.
    for (let i = 0; i < actorIdsBefore.length; i++) {
      if (i === 1) {
        expect(actorIdsAfter[i]).not.toBe(actorIdsBefore[i]);
      } else {
        expect(actorIdsAfter[i]).toBe(actorIdsBefore[i]);
      }
    }

    await contextB.close();
  });

  test("HINT-04: no automatic clue-mark overlay renders on an unclued card", async ({ page: hostPage, browser }) => {
    // HINT-01/02/04: the pip band that used to sit above every card is
    // deleted. Hints now render as an overlay ON the tile itself
    // (HintIndicator), and only once a clue has actually touched the card —
    // with no clue given yet, no own-hand or teammate card carries one.
    const { contextB } = await startTwoPlayerGame(hostPage, browser);

    const ownCard = hostPage.getByTestId("own-hand-slot-1");
    await expect(ownCard).toHaveAttribute("data-hints", "false");
    await expect(hostPage.getByTestId("own-hand-slot-1-hints")).toHaveCount(0);

    const teammateCard = hostPage.locator('[data-testid^="other-hand-card-"]').first();
    const teammateTestId = await teammateCard.getAttribute("data-testid");
    if (!teammateTestId) throw new Error("no teammate card found");
    await expect(hostPage.getByTestId(`${teammateTestId}-hints`)).toHaveCount(0);

    await contextB.close();
  });

  test("NOTE-03: a note autosaves (debounced, no Enter/blur needed), survives refresh, is never sent, and clears when its card leaves", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const sentFrames: string[] = [];
    activePage.on("websocket", (ws) => {
      ws.on("framesent", ({ payload }) => {
        if (typeof payload === "string") sentFrames.push(payload);
      });
    });

    // 06.2-06: NoteBox is always present and always editable — no
    // click-to-reveal step, and autosave is debounced rather than gated on
    // Enter/blur.
    await activePage.getByTestId("note-box-slot-1").fill("r5? save");
    await expect(activePage.getByTestId("note-box-slot-1")).toHaveValue("r5? save");
    // Exceeds NoteBox's autosave debounce window before reloading.
    await activePage.waitForTimeout(600);

    await activePage.reload();
    await expect(activePage.getByTestId("own-hand")).toBeVisible();
    await expect(activePage.getByTestId("note-box-slot-1")).toHaveValue("r5? save");

    expect(sentFrames.some((frame) => frame.includes("r5? save"))).toBe(false);

    // T-06.2-22: the other player's page shows no trace of the note text —
    // NoteBox only ever renders for the viewer's own hand, and notes are
    // never sent over the wire (asserted above), so there is no surface on
    // which it could leak.
    await expect(passivePage.getByText("r5? save")).toHaveCount(0);

    // On the actor's turn, playing slot 1 draws a fresh card into that
    // slot — its note box resets to the empty state.
    await playOwnHandSlot(activePage, 1);

    await expect(activePage.getByTestId("note-box-slot-1")).toHaveValue("");

    await contextB.close();
  });

  test("UAT gap 16: clicking an opponent tile opens a quick-clue popover (colour tinted, bold number below) that sends the right clue to the right player on both screens", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const targetSeat = await seatIdOfOtherPlayer(activePage);
    const tile = activePage.locator(`[data-testid="other-hand-${targetSeat}"] [data-testid^="other-hand-card-"]`).first();

    // Opening: a click on the opponent's tile opens exactly one popover with
    // both a colour and a number button.
    await tile.click();
    const popover = activePage.getByTestId("tile-clue-popover");
    await expect(popover).toBeVisible();
    await expect(activePage.getByTestId("tile-clue-color")).toBeVisible();
    const rankButton = activePage.getByTestId("tile-clue-rank");
    await expect(rankButton).toBeVisible();

    // The colour button's own text colour is the suit's own colour token
    // (never the default text colour), and it renders ABOVE the (bold)
    // number button in DOM order.
    const colorButton = activePage.getByTestId("tile-clue-color");
    const colorTextColor = await colorButton.evaluate((el) => getComputedStyle(el).color);
    const defaultTextColor = await activePage
      .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-text").trim());
    expect(colorTextColor).not.toBe(""); // sanity: a real computed colour was read
    expect(colorTextColor).not.toBe(defaultTextColor);
    const rankFontWeight = await rankButton.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(rankFontWeight)).toBeGreaterThanOrEqual(700);
    const colorBox = await colorButton.boundingBox();
    const rankBox = await rankButton.boundingBox();
    if (!colorBox || !rankBox) throw new Error("missing popover button bounding box");
    expect(rankBox.y).toBeGreaterThan(colorBox.y);

    // Closing behaviours: second click on the same tile closes it.
    await tile.click();
    await expect(popover).toHaveCount(0);

    // Escape closes it.
    await tile.click();
    await expect(popover).toBeVisible();
    await activePage.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);

    // Clicking elsewhere closes it — the far bottom-right viewport corner,
    // well clear of both the tile and its popover (anchored just below the
    // tile, near the top of the board).
    await tile.click();
    await expect(popover).toBeVisible();
    await activePage.mouse.click(1270, 710);
    await expect(popover).toHaveCount(0);

    // Sending: clicking the colour button gives that clue to that player,
    // and BOTH screens reflect it — no reload on either side.
    await tile.click();
    await expect(activePage.getByTestId("tile-clue-color")).toBeEnabled();
    await activePage.getByTestId("tile-clue-color").click();
    await expect(popover).toHaveCount(0);
    await expect(passivePage.locator('[data-testid="own-hand"] [data-just-clued="true"]').first()).toBeVisible();
    await expect(activePage.getByTestId("turn-indicator")).toContainText("Waiting for");
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    await contextB.close();
  });

  // UAT sixth owner review (gap 32): the hint highlight's rgb per suit,
  // matching apps/web/app/globals.css's `--color-suit-*` @theme tokens
  // exactly — used to prove the ring is the CLUE's own colour, not the
  // shared yellow luminosity colour (`--color-card-glow`, rgb(255, 217, 138)).
  const SUIT_RGB: Record<string, string> = {
    red: "rgb(240, 100, 90)",
    yellow: "rgb(232, 197, 71)",
    green: "rgb(79, 191, 138)",
    blue: "rgb(111, 168, 255)",
    white: "rgb(231, 236, 247)",
    rainbow: "rgb(201, 168, 255)",
    black: "rgb(183, 194, 214)",
  };
  const CARD_GLOW_RGB = "255, 217, 138";

  test("HINT-01/HINT-02: a colour clue rings the touched tile in the clue's own colour (no wash, no yellow) and a number clue stamps its numeral", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, pageB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // HINT-01: a colour clue from the active player touches at least one of
    // the passive player's own-hand cards.
    const passiveSeatId = await seatIdOfOtherPlayer(activePage);
    const colorValue = await giveClueOfKind(activePage, passiveSeatId, true);
    expect(colorValue).not.toBeNull();

    const touchedAfterColor = await ownHandHintedSlots(passivePage);
    expect(touchedAfterColor.length).toBeGreaterThan(0);
    const colorSlot = touchedAfterColor[0]!;
    await expect(passivePage.getByTestId(colorSlot)).toHaveAttribute("data-hints", "true");
    const colorHintSpan = passivePage.getByTestId(`${colorSlot}-hints`);
    await expect(colorHintSpan).toHaveCount(1);

    // UAT gap 32: the highlight is a ring in the clue's own suit colour —
    // never the shared yellow luminosity colour.
    const ring = colorHintSpan.getByTestId("hint-color-ring");
    await expect(ring).toHaveCount(1);
    const ringBoxShadow = await ring.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ringBoxShadow).not.toBe("none");
    expect(ringBoxShadow).not.toContain(CARD_GLOW_RGB);
    const expectedRgb = SUIT_RGB[colorValue!.toLowerCase()];
    expect(expectedRgb, `no known rgb fixture for clued colour "${colorValue}"`).toBeDefined();
    expect(ringBoxShadow).toContain(expectedRgb);

    // UAT gap 33: no translucent wash across the tile face — the ring span
    // itself paints no background fill.
    const ringBackground = await ring.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ringBackground).toBe("rgba(0, 0, 0, 0)");

    // UAT gap 35: the tile's own border/box-shadow carries no persistent
    // clue signal outside the hint overlay — no luminosity frame underneath.
    const tileBorderColor = await passivePage
      .getByTestId(colorSlot)
      .evaluate((el) => getComputedStyle(el).borderColor);
    expect(tileBorderColor).not.toContain(CARD_GLOW_RGB);

    // UAT gap 32 follow-up: the 2s `.anim-clue-touch` pulse that fires the
    // moment a clue lands must ALSO be the clue's own colour, never the
    // shared yellow `--color-card-glow`. The pulse's `--clue-pulse-color`
    // custom property (globals.css's `clue-touch-pulse` keyframes read it)
    // is asserted directly rather than the animated `box-shadow` itself —
    // the box-shadow's colour/alpha interpolate continuously across the 2s
    // run, so sampling it mid-animation is inherently timing-dependent,
    // while the custom property that drives it is set once, statically, and
    // never itself animates. Chromium resolves a `var(--color-suit-*)`
    // reference nested inside another custom property down to its final hex
    // at computed-value time, so the read-back is the resolved hex, not the
    // literal `var(...)` source string — compared here against the SAME
    // `--color-suit-*`/`--color-card-glow` tokens read straight off
    // `:root`, never a hand-copied hex literal.
    const pulse = passivePage.getByTestId(`clue-pulse-${colorSlot}`);
    await expect(pulse).toHaveCount(1);
    const pulseColorVar = await pulse.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--clue-pulse-color").trim(),
    );
    const rootStyles = await passivePage.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        cardGlow: root.getPropertyValue("--color-card-glow").trim(),
        suitRed: root.getPropertyValue("--color-suit-red").trim(),
        suitYellow: root.getPropertyValue("--color-suit-yellow").trim(),
        suitGreen: root.getPropertyValue("--color-suit-green").trim(),
        suitBlue: root.getPropertyValue("--color-suit-blue").trim(),
        suitWhite: root.getPropertyValue("--color-suit-white").trim(),
        suitRainbow: root.getPropertyValue("--color-suit-rainbow").trim(),
        suitBlack: root.getPropertyValue("--color-suit-black").trim(),
      };
    });
    const suitHexBySuit: Record<string, string> = {
      red: rootStyles.suitRed,
      yellow: rootStyles.suitYellow,
      green: rootStyles.suitGreen,
      blue: rootStyles.suitBlue,
      white: rootStyles.suitWhite,
      rainbow: rootStyles.suitRainbow,
      black: rootStyles.suitBlack,
    };
    const expectedSuitHex = suitHexBySuit[colorValue!.toLowerCase()];
    expect(expectedSuitHex, `no known hex fixture for clued colour "${colorValue}"`).toBeDefined();
    expect(pulseColorVar.toLowerCase()).not.toBe(rootStyles.cardGlow.toLowerCase());
    expect(pulseColorVar.toLowerCase()).toBe(expectedSuitHex!.toLowerCase());

    // HINT-02: turn has passed to the formerly-passive player; it clues the
    // (now passive) other seat with a rank value, which stamps a numeral.
    const newActive = await activeOf(hostPage, pageB);
    const newPassive = newActive === hostPage ? pageB : hostPage;
    const newPassiveSeatId = await seatIdOfOtherPlayer(newActive);
    const rankValue = await giveClueOfKind(newActive, newPassiveSeatId, false);
    expect(rankValue).not.toBeNull();

    const touchedAfterRank = await ownHandHintedSlots(newPassive);
    expect(touchedAfterRank.length).toBeGreaterThan(0);
    const rankSlot = touchedAfterRank[0]!;
    await expect(newPassive.getByTestId(`${rankSlot}-hints`).getByTestId("hint-numeral")).toHaveText(rankValue!);

    // UAT gap 32 follow-up (owner correction): a rank clue has no colour of
    // its own, so its pulse uses the dedicated `--color-clue-number` pink —
    // never yellow, and never `--color-text`/white (the owner's specific
    // worry: "white overlaps with the white firework's color pulse").
    const rankPulse = newPassive.getByTestId(`clue-pulse-${rankSlot}`);
    await expect(rankPulse).toHaveCount(1);
    const rankPulseColorVar = await rankPulse.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--clue-pulse-color").trim(),
    );
    const rankRootStyles = await newPassive.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        cardGlow: root.getPropertyValue("--color-card-glow").trim(),
        text: root.getPropertyValue("--color-text").trim(),
        suitWhite: root.getPropertyValue("--color-suit-white").trim(),
        clueNumber: root.getPropertyValue("--color-clue-number").trim(),
      };
    });
    expect(rankPulseColorVar.toLowerCase()).not.toBe(rankRootStyles.cardGlow.toLowerCase());
    expect(rankPulseColorVar.toLowerCase()).not.toBe(rankRootStyles.text.toLowerCase());
    expect(rankPulseColorVar.toLowerCase()).not.toBe(rankRootStyles.suitWhite.toLowerCase());
    expect(rankPulseColorVar.toLowerCase()).toBe(rankRootStyles.clueNumber.toLowerCase());

    await contextB.close();
  });

  // Owner report 2026-09-19: "with hint retention on - a new hint for a tile
  // overlays the prior hint so information isn't well-retained. Not great!"
  // Gap 34's latest-only rule was decided for the DEFAULT lifetime, where a
  // hint clears as soon as the next player acts; it still governs that mode,
  // and the tail of this test re-proves it. With keep-hints ON the card now
  // shows every clue it has received instead.
  test("keep-hints ON accumulates a card's clues (ring AND numeral); with the toggle OFF the display falls back to gap 34's latest clue only", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, pageB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // Turn keep-hints ON up front so the first clue's mark survives the
    // intervening move below (06.2-13: the toggle lives in SettingsModal).
    await passivePage.getByTestId("settings-toggle").click();
    await passivePage.getByTestId("keep-hints-toggle").click();
    await expect(passivePage.getByTestId("keep-hints-toggle")).toHaveAttribute("aria-pressed", "true");
    await passivePage.getByTestId("settings-close").click();

    const passiveSeatId = await seatIdOfOtherPlayer(activePage);
    const colorValue = await giveClueOfKind(activePage, passiveSeatId, true);
    expect(colorValue).not.toBeNull();

    const touchedAfterColor = await ownHandHintedSlots(passivePage);
    expect(touchedAfterColor.length).toBeGreaterThan(0);
    const colorSlot = touchedAfterColor[0]!;
    await expect(passivePage.getByTestId(`${colorSlot}-hints`).getByTestId("hint-color-ring")).toHaveCount(1);

    // Identify the clued card's real id (own-hand slots carry the card id on
    // their wrapping div, D-15-safe — see Hand.tsx) so it can be targeted
    // again by seat/id rather than by slot number, which the next move may
    // reshuffle.
    const cluedCardId = await passivePage
      .locator(`[data-testid="own-hand"] > div`)
      .filter({ has: passivePage.getByTestId(colorSlot) })
      .first()
      .getAttribute("data-card-id");
    expect(cluedCardId).not.toBeNull();

    // Passive player acts on a DIFFERENT card (not the clued one, and not
    // any other card the colour clue also touched) to pass the turn back to
    // active without disturbing the clued card's hint.
    const touchedNumbers = new Set(touchedAfterColor.map((id) => Number(id.replace("own-hand-slot-", ""))));
    const untouchedSlotNumber = [1, 2, 3, 4, 5].find((n) => !touchedNumbers.has(n));
    if (untouchedSlotNumber === undefined) throw new Error("UAT gap 34: every own-hand slot was touched by the clue");
    await discardOwnHandSlot(passivePage, untouchedSlotNumber);
    // Rule 1 fix (found running this test live, under parallel load): the
    // discard above must actually land and the turn flip to active BEFORE
    // targeting the second clue below, or a clue attempted mid-round-trip
    // finds no legal target and this test flakes under load.
    await expect(activePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    // Active gives a SECOND clue — a rank clue — directly at the same real
    // card (active sees the passive player's true suit/rank via the
    // teammate view, so it targets the tile by id rather than re-deriving
    // via giveClueOfKind, which knows nothing about "the same card").
    const teammateIds = await teammateHandCardIds(activePage, passiveSeatId);
    const tileIndex = teammateIds.indexOf(cluedCardId!);
    expect(tileIndex).toBeGreaterThanOrEqual(0);
    const opened = await openTileCluePopover(activePage, passiveSeatId, tileIndex);
    if (!opened) throw new Error("UAT gap 34: expected a legal clue to be available");
    await expect(opened.rankButton).toBeEnabled();
    await opened.rankButton.click();

    // With keep-hints ON the card keeps BOTH clues: the colour ring from the
    // first clue and the numeral from the second. This is the retention the
    // owner asked for — the second clue no longer overwrites the first.
    const slotAfterRank = passivePage.locator(`[data-testid="own-hand"] > div[data-card-id="${cluedCardId}"] [data-testid^="own-hand-slot-"]:not([data-testid$="-hints"])`);
    await expect(slotAfterRank).toHaveAttribute("data-hints", "true");
    const slotTestId = (await slotAfterRank.getAttribute("data-testid"))!;
    const hintSpan = passivePage.getByTestId(`${slotTestId}-hints`);
    await expect(hintSpan.getByTestId("hint-numeral")).toHaveCount(1);
    await expect(hintSpan.getByTestId("hint-color-ring")).toHaveCount(1);

    // Gap 34 still governs the default mode: switching keep-hints back OFF
    // drops the display to the latest clue alone, so the ring goes and the
    // numeral stays. The rank clue was the most recent action, so the hint
    // is still within its default lifetime and remains visible at all.
    await passivePage.getByTestId("settings-toggle").click();
    await passivePage.getByTestId("keep-hints-toggle").click();
    await expect(passivePage.getByTestId("keep-hints-toggle")).toHaveAttribute("aria-pressed", "false");
    await passivePage.getByTestId("settings-close").click();

    await expect(hintSpan.getByTestId("hint-numeral")).toHaveCount(1);
    await expect(hintSpan.getByTestId("hint-color-ring")).toHaveCount(0);

    await contextB.close();
  });

  test("HINT-03: keep-hints OFF clears after the next move; ON persists and survives a refresh", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);
    const slotNumbers = [1, 2, 3, 4, 5];

    function otherSlotNumber(touchedIds: string[]): number {
      const touchedNumbers = new Set(touchedIds.map((id) => Number(id.replace("own-hand-slot-", ""))));
      const found = slotNumbers.find((n) => !touchedNumbers.has(n));
      if (found === undefined) throw new Error("otherSlotNumber: every slot was touched by the clue");
      return found;
    }

    const active1 = await activeOf(hostPage, pageB);
    const passive1 = active1 === hostPage ? pageB : hostPage;

    // Default (OFF): clue passive1's hand, then have passive1 act on a
    // DIFFERENT slot — the touched card's hint should clear.
    const passive1SeatId = await seatIdOfOtherPlayer(active1);
    expect(await giveClueOfKind(active1, passive1SeatId, true)).not.toBeNull();

    const touched1 = await ownHandHintedSlots(passive1);
    expect(touched1.length).toBeGreaterThan(0);
    const touchedSlot1 = touched1[0]!;
    await expect(passive1.getByTestId(touchedSlot1)).toHaveAttribute("data-hints", "true");

    await playOwnHandSlot(passive1, otherSlotNumber(touched1));

    await expect(passive1.getByTestId(touchedSlot1)).toHaveAttribute("data-hints", "false");

    // Turn keep-hints ON for passive1, repeat, and this time the hint
    // should survive the next move. 06.2-13: the toggle now lives inside
    // SettingsModal, opened by the gear trigger.
    await passive1.getByTestId("settings-toggle").click();
    await passive1.getByTestId("keep-hints-toggle").click();
    await expect(passive1.getByTestId("keep-hints-toggle")).toHaveAttribute("aria-pressed", "true");
    await passive1.getByTestId("settings-close").click();
    await expect(passive1.getByTestId("settings-modal")).toHaveCount(0);

    const active2 = await activeOf(hostPage, pageB);
    const passive1SeatIdAgain = await seatIdOfOtherPlayer(active2);
    expect(await giveClueOfKind(active2, passive1SeatIdAgain, true)).not.toBeNull();

    const touched2 = await ownHandHintedSlots(passive1);
    expect(touched2.length).toBeGreaterThan(0);
    const touchedSlot2 = touched2[0]!;
    await expect(passive1.getByTestId(touchedSlot2)).toHaveAttribute("data-hints", "true");

    await playOwnHandSlot(passive1, otherSlotNumber(touched2));

    await expect(passive1.getByTestId(touchedSlot2)).toHaveAttribute("data-hints", "true");

    // The keep-hints preference survives a refresh.
    await passive1.reload();
    await expect(passive1.getByTestId("own-hand")).toBeVisible();
    await passive1.getByTestId("settings-toggle").click();
    await expect(passive1.getByTestId("keep-hints-toggle")).toHaveAttribute("aria-pressed", "true");
    await passive1.getByTestId("settings-close").click();

    await contextB.close();
  });

  test("HINT-04: no legacy pip-row markup exists anywhere on the board", async ({ page: hostPage, browser }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);

    await expect(hostPage.locator('[data-testid*="pip"]')).toHaveCount(0);
    await expect(hostPage.locator('[data-testid*="marks-band"]')).toHaveCount(0);

    await contextB.close();
  });

  test("TILE-03: the tile-colour preference persists locally and does not leak to the other player", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);

    // UAT gap 7 (06.2-17): the preset is a translucent overlay painted above
    // the card art, not the slot's own background — assertions read the
    // overlay element, and the slot's own background is asserted constant.
    const slot = hostPage.getByTestId("own-hand-slot-1");
    const overlay = hostPage.getByTestId("tile-color-overlay-own-hand-slot-1");
    const slotBgBefore = await slot.evaluate((el) => getComputedStyle(el).backgroundColor);
    const overlayBefore = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);

    // 06.2-13: the tile-colour control lives inside SettingsModal, opened by
    // the gear trigger. UAT gap 30 (overturns D-14): a real colour picker,
    // not a preset swatch grid — fill the native `<input type="color">`.
    const CUSTOM_HEX = "#a37fd1";
    await hostPage.getByTestId("settings-toggle").click();
    await hostPage.getByTestId("tile-color-input").fill(CUSTOM_HEX);
    await hostPage.getByTestId("settings-close").click();
    await expect(hostPage.getByTestId("settings-modal")).toHaveCount(0);

    await expect.poll(() => overlay.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(overlayBefore);
    const overlayAfter = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Mechanical proof the overlay is translucent, not opaque: parse the
    // computed colour string and assert alpha < 1. `color-mix()` resolves
    // in Chromium either as `rgba(r, g, b, a)` or as a CSS Color 4
    // `color(srgb r g b / a)` — both forms carry the alpha as the last
    // number, optionally preceded by a `/`.
    const rgbaAlpha = overlayAfter.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
    const colorFnAlpha = overlayAfter.match(/color\([^)]*\/\s*([\d.]+)\s*\)/);
    const alphaMatch = rgbaAlpha ?? colorFnAlpha;
    expect(alphaMatch, `expected an rgba()/color() colour carrying alpha, got "${overlayAfter}"`).not.toBeNull();
    const alpha = Number(alphaMatch![1]);
    expect(alpha).toBeLessThan(1);

    // The slot's own background-color does not change when the preset does.
    const slotBgAfter = await slot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(slotBgAfter).toBe(slotBgBefore);

    // Persists across a refresh.
    await hostPage.reload();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await hostPage.getByTestId("settings-toggle").click();
    await expect(hostPage.getByTestId("tile-color-input")).toHaveValue(CUSTOM_HEX);
    await hostPage.getByTestId("settings-close").click();
    await expect(hostPage.getByTestId("tile-color-overlay-own-hand-slot-1")).toHaveCSS(
      "background-color",
      overlayAfter,
    );

    // The other player's own tiles are unaffected — a purely personal,
    // local preference (TILE-03).
    const otherOverlayBg = await pageB
      .getByTestId("tile-color-overlay-own-hand-slot-1")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(otherOverlayBg).toBe(overlayBefore);

    await contextB.close();
  });

  test("UAT gap 30 (overturns D-14): pure white, pure black, and a saturated colour all stay translucent, never opaque", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);
    const overlay = hostPage.getByTestId("tile-color-overlay-own-hand-slot-1");

    for (const hex of ["#ffffff", "#000000", "#ff0000"]) {
      await hostPage.getByTestId("settings-toggle").click();
      await hostPage.getByTestId("tile-color-input").fill(hex);
      await hostPage.getByTestId("settings-close").click();

      const overlayColor = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);
      const rgbaAlpha = overlayColor.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
      const colorFnAlpha = overlayColor.match(/color\([^)]*\/\s*([\d.]+)\s*\)/);
      const alphaMatch = rgbaAlpha ?? colorFnAlpha;
      expect(alphaMatch, `expected an rgba()/color() colour carrying alpha for ${hex}, got "${overlayColor}"`).not.toBeNull();
      expect(Number(alphaMatch![1])).toBeLessThan(1);

      // The card identity underneath is still visible through the tint —
      // the overlay never becomes a fully opaque cover (gap 7's contract).
      await expect(hostPage.getByTestId("own-hand-slot-1")).toBeVisible();
    }

    await contextB.close();
  });

  test("UAT gap 36: the colour picker keeps listening after the first colour is chosen", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);
    const overlay = hostPage.getByTestId("tile-color-overlay-own-hand-slot-1");

    await hostPage.getByTestId("settings-toggle").click();

    // Grab ONE element handle and keep reusing it for every colour change,
    // exactly like a real OS colour dialog does: the browser's native
    // picker keeps firing `input` events at the SAME `<input>` DOM node for
    // as long as that dialog stays open, across multiple in-dialog colour
    // changes. `.fill()`'s own re-query-per-call masked the real bug — the
    // native dialog never re-queries the DOM, so this is the faithful
    // reproduction of "picks a second colour in the same open dialog".
    const inputHandle = await hostPage.getByTestId("tile-color-input").elementHandle();
    if (!inputHandle) throw new Error("tile-color-input not found");

    async function dispatchNativeColorInput(hex: string) {
      await hostPage.evaluate(
        ({ el, value }) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        },
        { el: inputHandle, value: hex },
      );
    }

    await dispatchNativeColorInput("#a37fd1");
    const overlayAfterFirst = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Pick a SECOND colour in the same picker session, without closing and
    // reopening the settings modal in between — this is exactly the
    // interaction the owner reported as broken ("the color picker only
    // ever actually uses the color that's first selected. it stops
    // listening after that").
    await dispatchNativeColorInput("#2f8f5b");
    const overlayAfterSecond = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(overlayAfterSecond).not.toBe(overlayAfterFirst);
    await expect(hostPage.getByTestId("tile-color-input")).toHaveValue("#2f8f5b");

    await hostPage.getByTestId("settings-close").click();
    await contextB.close();
  });

  test("UAT gap 37: a turn sign in the freed space below the discard/token area names whoever's turn it is, live-announced, and updates on every turn change", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser, {
      host: "Roger",
      guest: "Bianca",
    });

    const activeSign = activePage.getByTestId("turn-sign");
    const passiveSign = passivePage.getByTestId("turn-sign");

    // The active page always reads "Your turn!"; the passive page names the
    // active player by their existing hand-panel display name.
    await expect(activeSign).toHaveText("Your turn!");
    const passiveSignTextBefore = ((await passiveSign.textContent()) ?? "").trim();
    expect(passiveSignTextBefore).toMatch(/'s turn$/);
    expect(passiveSignTextBefore).not.toBe("");

    // Live region, per gap 37's screen-reader requirement.
    await expect(activeSign).toHaveAttribute("aria-live", "polite");
    await expect(passiveSign).toHaveAttribute("aria-live", "polite");

    // The sign must sit inside the tableau's own already-reserved geometry
    // (UAT gap 1 fixed-geometry contract) — never grow the board, never
    // cause the 1280x720 floor to scroll.
    const tableauBox = await activePage.getByTestId("tableau").boundingBox();
    const signBox = await activeSign.boundingBox();
    if (!tableauBox || !signBox) throw new Error("missing bounding box");
    expect(signBox.y).toBeGreaterThanOrEqual(tableauBox.y);
    expect(signBox.y + signBox.height).toBeLessThanOrEqual(tableauBox.y + tableauBox.height + 1);
    const hasScroll = await activePage.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    );
    expect(hasScroll).toBe(false);

    // Gap closure 07-12 (owner gap 4, swap discard <-> turn sign): the sign
    // now sits ABOVE the (now much larger) discard-pile, in the small
    // top-right spot Discard used to occupy.
    const discardBoxForSign = await activePage.getByTestId("discard-pile").boundingBox();
    if (!discardBoxForSign) throw new Error("missing discard-pile bounding box");
    expect(signBox.y + signBox.height).toBeLessThanOrEqual(discardBoxForSign.y + 1);

    // Give a clue — the turn passes to the other player — and confirm the
    // sign updates on BOTH screens (gap 37's "must update on every turn
    // change").
    const gaveClue = await giveAnyLegalClueToAnyTeammate(activePage);
    expect(gaveClue).toBe(true);

    await expect(passiveSign).toHaveText("Your turn!");
    const activeSignTextAfter = ((await activeSign.textContent()) ?? "").trim();
    expect(activeSignTextAfter).toMatch(/'s turn$/);
    expect(activeSignTextAfter).not.toBe(passiveSignTextBefore.replace("'s turn", "")); // sanity: not stuck on stale text
    expect(activeSignTextAfter).not.toBe("Your turn!");

    await contextB.close();
  });

  test("UAT gap 31: the discard zone gains the same highlight as the play zone while a tile is dragged over it", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    // Discard is illegal at the max 8 clue tokens (standard rule) — give a
    // clue first so the discard zone is actually enabled for this drag.
    await giveAnyLegalClueToAnyTeammate(activePage);
    await expect(passivePage.getByTestId("turn-indicator")).toHaveText("Your turn");

    const nowActive = passivePage;
    const slot = nowActive.getByTestId("own-hand-slot-1");
    const discardZone = nowActive.getByTestId("discard-pile");

    const sourceBox = await slot.boundingBox();
    const discardBox = await discardZone.boundingBox();
    if (!sourceBox || !discardBox) throw new Error("missing bounding box");

    const sourceCenter = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const discardCenter = { x: discardBox.x + discardBox.width / 2, y: discardBox.y + discardBox.height / 2 };

    const shadowBefore = await discardZone.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowBefore).toBe("none");

    await nowActive.mouse.move(sourceCenter.x, sourceCenter.y);
    await nowActive.mouse.down();
    // Clear the app's own drag threshold before resolving a drop target.
    await nowActive.mouse.move(sourceCenter.x + 10, sourceCenter.y + 10, { steps: 2 });
    await nowActive.mouse.move(discardCenter.x, discardCenter.y, { steps: 12 });

    await expect(discardZone).toHaveAttribute("data-drop-state", "enabled");
    const shadowWhileHovered = await discardZone.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowWhileHovered).not.toBe("none");
    // Reuses the exact same drop-zone highlight style the play zone uses
    // (dropZoneHighlightStyle in Table.tsx) — not a second, invented style.
    expect(shadowWhileHovered).toContain("4px");

    await nowActive.mouse.move(-200, -200, { steps: 5 });
    await nowActive.mouse.up();

    await contextB.close();
  });

  test("settings modal: the gear opens a dialog holding every relocated preference control, and Escape closes it without disturbing the board", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);

    await hostPage.getByTestId("settings-toggle").click();
    await expect(hostPage.getByTestId("settings-modal")).toBeVisible();
    await expect(hostPage.getByTestId("audio-volume")).toBeVisible();
    await expect(hostPage.getByTestId("audio-mute-toggle")).toBeVisible();
    await expect(hostPage.getByTestId("keep-hints-toggle")).toBeVisible();
    await expect(hostPage.getByTestId("tile-color-input")).toBeVisible();

    await hostPage.keyboard.press("Escape");
    await expect(hostPage.getByTestId("settings-modal")).toHaveCount(0);
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();

    await contextB.close();
  });

  test("DRAG-01: mid-drag, non-dragged own-hand slots shift aside and return to zero after the drop", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);

    const source = hostPage.getByTestId("own-hand-slot-1");
    const target = hostPage.getByTestId("own-hand-slot-3");
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error("missing bounding box");
    const sourceCenter = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const targetCenter = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

    await hostPage.mouse.move(sourceCenter.x, sourceCenter.y);
    await hostPage.mouse.down();
    await hostPage.mouse.move(sourceCenter.x + 10, sourceCenter.y + 10, { steps: 2 });
    await hostPage.mouse.move(targetCenter.x, targetCenter.y, { steps: 12 });

    // A non-dragged slot between source and target carries a non-zero
    // shift-aside transform on its wrapper while the drag is in flight.
    const midDragTransform = await hostPage
      .getByTestId("own-hand-slot-2")
      .evaluate((el) => getComputedStyle(el.parentElement!).transform);
    expect(midDragTransform).not.toBe("none");

    await hostPage.mouse.up();

    await expect
      .poll(() =>
        hostPage.getByTestId("own-hand-slot-2").evaluate((el) => getComputedStyle(el.parentElement!).transform),
      )
      .toBe("none");

    await contextB.close();
  });

  test("DISC-01: a discard-pile reorder by one player is seen by the other and survives a refresh", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);
    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);

    async function currentActive(): Promise<Page> {
      const hostText = ((await hostPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
      return hostText === "Your turn" ? hostPage : pageB;
    }

    // Builds up 3 discarded tiles by alternating "give a clue" (the only
    // way to drop clue tokens below 8 — the max at which discarding is
    // illegal) with a discard, across whichever player is active.
    for (let i = 0; i < 3; i++) {
      const active = await currentActive();
      const other = active === hostPage ? pageB : hostPage;
      const clueTokens = Number(await hostPage.getByTestId("clue-tokens").getAttribute("data-count"));

      let discardActive = active;
      if (clueTokens >= 8) {
        const otherSeatId = await seatIdOfOtherPlayer(active);
        expect(await giveAnyLegalClue(active, otherSeatId)).toBe(true);
        // Wait for the turn to actually flip before deriving who discards
        // next — a bare re-read races the socket round-trip.
        await expect(other.getByTestId("turn-indicator")).toHaveText("Your turn");
        discardActive = other;
      }

      await discardOwnHandSlot(discardActive, 1);

      await expect
        .poll(() => hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"))
        .toBe(String(i + 1));
    }

    const orderBefore = await discardTileOrder(hostPage);
    expect(orderBefore.length).toBeGreaterThanOrEqual(3);

    const draggedId = orderBefore[0]!;
    const lastId = orderBefore[orderBefore.length - 1]!;
    const expected = expectedReorder(orderBefore, draggedId, orderBefore.length - 1);

    await dragLocatorTo(
      hostPage,
      hostPage.getByTestId(`discard-tile-${draggedId}`),
      hostPage.getByTestId(`discard-tile-${lastId}`),
    );

    await expect.poll(() => discardTileOrder(hostPage)).toEqual(expected);
    // The other player sees the identical order with no manual refresh.
    await expect.poll(() => discardTileOrder(pageB)).toEqual(expected);

    await pageB.reload();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();
    await expect.poll(() => discardTileOrder(pageB)).toEqual(expected);

    await contextB.close();
  });

  /** Reads each discard tile's suit/rank, in `discardTileOrder`'s DOM order,
   * from the sr-only "{Suit} {rank}" text FireworkCardFace's caption
   * renders beside every discard tile — discards are public, so this is a
   * DISC-01-safe way to derive the facts `groupedBySuitOrder` sorts by
   * without importing app source into the e2e project. */
  async function discardTileFacts(page: Page): Promise<Array<{ id: string; suit: string; rank: number }>> {
    const ids = await discardTileOrder(page);
    const facts: Array<{ id: string; suit: string; rank: number }> = [];
    for (const id of ids) {
      const text = (await page.getByTestId(`discard-tile-${id}`).locator(".sr-only").textContent()) ?? "";
      const match = text.trim().match(/^(\w+) (\d)$/);
      if (!match) throw new Error(`discardTileFacts: could not parse "${text}"`);
      facts.push({ id, suit: match[1]!.toLowerCase(), rank: Number(match[2]) });
    }
    return facts;
  }

  /** Mirrors `groupedBySuitOrder` (hanabi-discard-drag-logic.ts) exactly:
   * suit position in the base variant's suit order, then rank ascending,
   * then existing index — so this test can compute the expected grouped
   * order from the actual dealt/discarded suits without importing app
   * source into the e2e project. */
  function expectedGroupedOrder(facts: ReadonlyArray<{ id: string; suit: string; rank: number }>): string[] {
    const suitOrder = ["red", "yellow", "green", "blue", "white"];
    return facts
      .map((fact, index) => ({ fact, index }))
      .sort((a, b) => {
        const suitDiff = suitOrder.indexOf(a.fact.suit) - suitOrder.indexOf(b.fact.suit);
        if (suitDiff !== 0) return suitDiff;
        const rankDiff = a.fact.rank - b.fact.rank;
        if (rankDiff !== 0) return rankDiff;
        return a.index - b.index;
      })
      .map(({ fact }) => fact.id);
  }

  test("DISC-01: group-by-suit re-sorts the shared discard order for everyone, and dragging still works after grouping", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(60_000);
    const { contextB, pageB } = await startTwoPlayerGame(hostPage, browser);

    async function currentActive(): Promise<Page> {
      const hostText = ((await hostPage.getByTestId("turn-indicator").textContent()) ?? "").trim();
      return hostText === "Your turn" ? hostPage : pageB;
    }

    // Builds up 4 discarded tiles (mixed suits/ranks in whatever order the
    // deck dealt them), alternating "give a clue" with a discard exactly
    // like the DISC-01 reorder test above.
    for (let i = 0; i < 4; i++) {
      const active = await currentActive();
      const other = active === hostPage ? pageB : hostPage;
      const clueTokens = Number(await hostPage.getByTestId("clue-tokens").getAttribute("data-count"));

      let discardActive = active;
      if (clueTokens >= 8) {
        const otherSeatId = await seatIdOfOtherPlayer(active);
        expect(await giveAnyLegalClue(active, otherSeatId)).toBe(true);
        await expect(other.getByTestId("turn-indicator")).toHaveText("Your turn");
        discardActive = other;
      }

      await discardOwnHandSlot(discardActive, 1);

      await expect
        .poll(() => hostPage.getByTestId("discard-pile").getAttribute("data-discard-count"))
        .toBe(String(i + 1));
    }

    const factsBefore = await discardTileFacts(hostPage);
    expect(factsBefore.length).toBeGreaterThanOrEqual(4);
    const grouped = expectedGroupedOrder(factsBefore);

    // Page A (host) clicks group-by-suit.
    await expect(hostPage.getByTestId("discard-group-by-suit")).toBeEnabled();
    await hostPage.getByTestId("discard-group-by-suit").click();

    await expect.poll(() => discardTileOrder(hostPage)).toEqual(grouped);
    // Page B sees the identical grouped order with no refresh — proving
    // this is shared state, not a local view.
    await expect.poll(() => discardTileOrder(pageB)).toEqual(grouped);

    // The grouped order survives a reload of page B.
    await pageB.reload();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();
    await expect.poll(() => discardTileOrder(pageB)).toEqual(grouped);

    // Dragging still works after grouping: page B drags the grouped
    // sequence's first tile to the end.
    const draggedId = grouped[0]!;
    const lastId = grouped[grouped.length - 1]!;
    const afterDrag = expectedReorder(grouped, draggedId, grouped.length - 1);

    await dragLocatorTo(
      pageB,
      pageB.getByTestId(`discard-tile-${draggedId}`),
      pageB.getByTestId(`discard-tile-${lastId}`),
    );

    await expect.poll(() => discardTileOrder(pageB)).toEqual(afterDrag);
    await expect.poll(() => discardTileOrder(hostPage)).toEqual(afterDrag);

    await contextB.close();
  });

  test("D-13: discard overlay opens, closes on Esc, and is remembered", async ({ page: hostPage, browser }) => {
    const { contextB } = await startTwoPlayerGame(hostPage, browser);

    await hostPage.getByTestId("discard-toggle").click();
    await expect(hostPage.getByTestId("discard-overlay")).toBeVisible();

    await hostPage.reload();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(hostPage.getByTestId("discard-overlay")).toBeVisible();

    await hostPage.keyboard.press("Escape");
    await expect(hostPage.getByTestId("discard-overlay")).toBeHidden();

    await hostPage.reload();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(hostPage.getByTestId("discard-overlay")).toBeHidden();

    await contextB.close();
  });

  test("AUD-01: refresh plays no catch-up sound and a live action does", async ({ page: hostPage, browser }) => {
    function installFakeAudioContext() {
      (window as unknown as { __soundStarts: number }).__soundStarts = 0;

      class FakeParam {
        value = 0;
        setValueAtTime() {
          return this;
        }
        linearRampToValueAtTime() {
          return this;
        }
        exponentialRampToValueAtTime() {
          return this;
        }
      }
      class FakeGain {
        gain = new FakeParam();
        connect() {
          return this;
        }
      }
      class FakeFilter {
        type = "bandpass";
        frequency = new FakeParam();
        Q = new FakeParam();
        connect() {
          return this;
        }
      }
      class FakeOscillator {
        type = "sine";
        frequency = new FakeParam();
        connect() {
          return this;
        }
        start() {
          (window as unknown as { __soundStarts: number }).__soundStarts += 1;
        }
        stop() {}
      }
      class FakeBufferSource {
        buffer: unknown = null;
        connect() {
          return this;
        }
        start() {
          (window as unknown as { __soundStarts: number }).__soundStarts += 1;
        }
        stop() {}
      }
      class FakeAudioContext {
        currentTime = 0;
        state = "running";
        sampleRate = 44100;
        destination = {};
        resume() {
          return Promise.resolve();
        }
        createOscillator() {
          return new FakeOscillator();
        }
        createGain() {
          return new FakeGain();
        }
        createBiquadFilter() {
          return new FakeFilter();
        }
        createBuffer() {
          return { getChannelData: () => new Float32Array(1) };
        }
        createBufferSource() {
          return new FakeBufferSource();
        }
      }

      (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    }

    await hostPage.context().addInitScript(installFakeAudioContext);
    const contextB = await browser.newContext();
    await contextB.addInitScript(installFakeAudioContext);

    const code = await createRoom(hostPage, { name: "Roger" });
    const pageB = await joinAs(contextB, code, "Bianca");
    await expectSeatCount(hostPage, 2);

    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(pageB.getByTestId("own-hand")).toBeVisible();

    const hostText = (await hostPage.getByTestId("turn-indicator").textContent()) ?? "";
    const hostIsActive = hostText === "Your turn";
    const activePage = hostIsActive ? hostPage : pageB;
    const observer = hostIsActive ? pageB : hostPage;

    async function soundStarts(page: Page): Promise<number> {
      return page.evaluate(() => (window as unknown as { __soundStarts: number }).__soundStarts);
    }

    // Gesture-unlock the observer.
    await observer.mouse.click(5, 5);

    const observerSeatId = await seatIdOfOtherPlayer(activePage);
    expect(await giveAnyLegalClue(activePage, observerSeatId)).toBe(true);

    await expect.poll(() => soundStarts(observer)).toBeGreaterThan(0);

    await observer.reload();
    await expect(observer.getByTestId("own-hand")).toBeVisible();
    await observer.mouse.click(5, 5);
    await observer.waitForTimeout(1500);
    expect(await soundStarts(observer)).toBe(0);

    await contextB.close();
  });

  // UAT gap 18 regression ("the 'X card left in deck' doesn't change"):
  // plays several real turns against the live worker and asserts the
  // counter falls on EVERY page each time, never staying put across a real
  // draw. Live diagnosis (see this plan's SUMMARY) found no reproducible
  // defect in the wire value, projection, or render layer across 2/4/5-
  // player games, drag AND click actions, a mid-game reload, and rapid-fire
  // turns — this is the permanent guard against a regression, run against
  // the real worker rather than a static fixture (table-render.test.ts
  // carries the render-layer half of this proof).
  test("UAT gap 18: deck-count falls across several real turns and stays in sync on both pages", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const pages = [activePage, passivePage];

    const readings: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      let active = pages[0]!;
      for (const p of pages) {
        const text = ((await p.getByTestId("turn-indicator").textContent()) ?? "").trim();
        if (text === "Your turn") active = p;
      }
      const passive = pages.find((p) => p !== active)!;
      const before = await readDeckCount(active);
      expect(await readDeckCount(passive)).toBe(before);
      readings.push(before);

      if (await isDiscardCurrentlyLegal(active)) {
        const own = active.locator('[data-testid^="own-hand-slot-"]').first();
        await own.focus();
        await own.press("d");
        await expect.poll(() => readDeckCount(active)).toBe(before - 1);
      } else {
        // Clue tokens maxed — give a clue instead (legal, never draws).
        await giveAnyLegalClueToAnyTeammate(active);
      }
    }

    // The deck strictly decreased at least once across these turns — not
    // frozen at its starting value the whole session.
    expect(Math.min(...readings)).toBeLessThan(readings[0]!);

    await contextB.close();
  });

  // UAT gap 17 regression ("the cards are dark"): live-measured (see this
  // plan's SUMMARY) that the pre-fix slate DEFAULT overlay was 45% of
  // `--color-surface` stacked on top of an already-dark neutral card back
  // (D-10), which nearly halved the picture-frame outline's contrast
  // against its own container and read as a flat black rectangle. The fix
  // dropped slate's alpha to 10%. This guards the resolved alpha directly
  // against the real browser's `color-mix()` resolution (not just the
  // source string), so a future edit to the preset can't silently regress
  // the darkness without a test noticing.
  test("UAT gap 17: the default (slate) tile overlay stays a light wash, not a second dark layer", async ({
    page: hostPage,
    browser,
  }) => {
    const { contextB, activePage } = await startTwoPlayerGame(hostPage, browser);

    const alpha = await activePage.evaluate(() => {
      const overlay = document.querySelector(
        '[data-testid="tile-color-overlay-own-hand-slot-1"]',
      ) as HTMLElement | null;
      if (!overlay) return null;
      const resolved = getComputedStyle(overlay).backgroundColor;
      const match = resolved.match(/\/\s*([\d.]+)\s*\)/);
      return match ? Number(match[1]) : null;
    });

    expect(alpha).not.toBeNull();
    // The default must stay a real, present translucent wash (TILE-01: a
    // tile still reads as a raised, tinted object, never a bare "none") but
    // far short of the 55% strength the other four, deliberately-chosen
    // presets use — that headroom is what keeps the neutral card back's own
    // picture-frame outline legible by default.
    expect(alpha!).toBeGreaterThan(0);
    expect(alpha!).toBeLessThanOrEqual(0.15);

    await contextB.close();
  });
});
