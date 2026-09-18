import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  createRoom,
  dragLocatorTo,
  expectSeatCount,
  giveAnyLegalClue,
  giveAnyLegalClueToAnyTeammate,
  joinAs,
  openTileCluePopover,
  ownHandCardIds,
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
 * UAT gap 16: gives a clue of the requested kind (colour when `wantColor` is
 * true, rank otherwise) to `targetSeatId`, by opening each of that seat's
 * tile popovers in turn until one offers the wanted kind enabled. Returns
 * the sent value's own button text (the suit label for colour, the digit
 * for rank) captured BEFORE the click (the popover unmounts once the clue
 * is sent), or null if no tile currently offers that kind.
 */
async function giveClueOfKind(page: Page, targetSeatId: string, wantColor: boolean): Promise<string | null> {
  const tileCount = await page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).count();
  for (let i = 0; i < tileCount; i += 1) {
    const opened = await openTileCluePopover(page, targetSeatId, i);
    if (!opened) return null;
    const button = wantColor ? opened.colorButton : opened.rankButton;
    if (await button.isEnabled()) {
      const value = (await button.textContent())?.trim() ?? null;
      await button.click();
      return value;
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

    await expect(passivePage.getByTestId("deck-count")).toHaveText(`${deckBeforeOffTurn} cards left in deck`);
    await expect(hostPage.getByTestId("deck-count")).toHaveText(`${deckBeforeOffTurn} cards left in deck`);
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

  test("HAND-02: Play and Discard buttons still work", async ({ page: hostPage, browser }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);

    const deckBefore = await readDeckCount(passivePage);

    await activePage.getByTestId("own-hand-slot-1").click();
    await expect(activePage.getByTestId("play-button")).toBeEnabled();
    await activePage.getByTestId("play-button").click();

    await expect.poll(() => readDeckCount(passivePage)).toBe(deckBefore - 1);

    await contextB.close();
  });

  test("HAND-03: the drawn card takes the vacated slot on both screens", async ({ page: hostPage, browser }) => {
    const { contextB, activePage, passivePage } = await startTwoPlayerGame(hostPage, browser);
    const activeSeatId = await seatIdOfOtherPlayer(passivePage);

    const actorIdsBefore = await ownHandCardIds(activePage);
    const teammateIdsBefore = await teammateHandCardIds(passivePage, activeSeatId);
    expect(actorIdsBefore).toEqual(teammateIdsBefore);

    await activePage.getByTestId("own-hand-slot-2").click();
    await expect(activePage.getByTestId("play-button")).toBeEnabled();
    await activePage.getByTestId("play-button").click();

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
    await activePage.getByTestId("own-hand-slot-1").click();
    await expect(activePage.getByTestId("play-button")).toBeEnabled();
    await activePage.getByTestId("play-button").click();

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

  test("HINT-01/HINT-02: a colour clue tints the touched tile and a number clue stamps its numeral", async ({
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
    const tintBg = await colorHintSpan
      .locator("> span")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tintBg).not.toBe("rgba(0, 0, 0, 0)");

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

    await passive1.getByTestId(`own-hand-slot-${otherSlotNumber(touched1)}`).click();
    await expect(passive1.getByTestId("play-button")).toBeEnabled();
    await passive1.getByTestId("play-button").click();

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

    await passive1.getByTestId(`own-hand-slot-${otherSlotNumber(touched2)}`).click();
    await expect(passive1.getByTestId("play-button")).toBeEnabled();
    await passive1.getByTestId("play-button").click();

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

    // 06.2-13: the tile-colour swatch grid now lives inside SettingsModal,
    // opened by the gear trigger.
    await hostPage.getByTestId("settings-toggle").click();
    await hostPage.getByTestId("tile-color-swatch-plum").click();
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
    await expect(hostPage.getByTestId("tile-color-swatch-plum")).toHaveAttribute("aria-pressed", "true");
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
    await expect(hostPage.getByTestId("tile-color-swatch-plum")).toBeVisible();

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

      await discardActive.getByTestId("own-hand-slot-1").click();
      await expect(discardActive.getByTestId("discard-button")).toBeEnabled();
      await discardActive.getByTestId("discard-button").click();

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

      await discardActive.getByTestId("own-hand-slot-1").click();
      await expect(discardActive.getByTestId("discard-button")).toBeEnabled();
      await discardActive.getByTestId("discard-button").click();

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

      const own = active.locator('[data-testid^="own-hand-slot-"]').first();
      await own.click();
      const discardBtn = active.getByTestId("discard-button");
      if (await discardBtn.isEnabled()) {
        await discardBtn.click();
        await expect.poll(() => readDeckCount(active)).toBe(before - 1);
      } else {
        // Clue tokens maxed — give a clue instead (legal, never draws).
        await own.click();
        await giveAnyLegalClueToAnyTeammate(active);
      }
    }

    // The deck strictly decreased at least once across these turns — not
    // frozen at its starting value the whole session.
    expect(Math.min(...readings)).toBeLessThan(readings[0]!);

    await contextB.close();
  });
});
