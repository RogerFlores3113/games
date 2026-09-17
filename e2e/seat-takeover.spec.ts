import { expect, test } from "@playwright/test";
import {
  OTHER_HAND_SELECTOR,
  OWN_HAND_SLOT_SELECTOR,
  createRoom,
  expectSeatCount,
  joinAs,
  seatIdOfOtherPlayer,
  startTwoPlayerGame,
} from "./helpers";

function selfSeatRow(page: import("@playwright/test").Page) {
  return page.getByTestId("seat-row").and(page.locator('[data-self="true"]'));
}

async function selfSeatId(page: import("@playwright/test").Page): Promise<string> {
  const seatId = await selfSeatRow(page).getAttribute("data-seat-id");
  if (!seatId) {
    throw new Error("selfSeatId: no data-seat-id found on the self-marked row");
  }
  return seatId;
}

// Exactly SEAT_TOKEN_LENGTH (24) characters, deliberately NOT a real
// server-minted nanoid — used to prove the server never trusts a
// client-presented token at face value (T-1-01 / RT-07).
const FABRICATED_TOKEN_24 = "ffffffffffffffffffffffff";

test.describe("seat takeover — the RT-07 adversary (RT-07 + D-05 + D-08)", () => {
  test("a link holder never lands on an occupied seat, forged tokens are rejected, and second-tab supersede does not duplicate a seat", async ({
    page: hostPage,
    browser,
  }) => {
    // 1. Host creates a room; joiner B joins in context 2.
    const code = await createRoom(hostPage, { name: "Roger" });
    const contextB = await browser.newContext();
    const pageB = await joinAs(contextB, code, "Bianca");
    const seatIdB = await selfSeatId(pageB);
    await expectSeatCount(hostPage, 2);

    // 2. Context 3 opens the link with EMPTY storage and joins with a
    // different name. It must receive a NEW seat, never B's.
    const contextC = await browser.newContext();
    const pageC = await joinAs(contextC, code, "Casey");
    const seatIdC = await selfSeatId(pageC);
    expect(seatIdC).not.toBe(seatIdB);
    await expectSeatCount(hostPage, 3);

    // 3. Context 4 opens the link and injects a FABRICATED 24-character
    // token into localStorage before load. It must also be given a new
    // seat (or refused "This room is full" at 5 seats) — never B's seat.
    const contextD = await browser.newContext();
    const pageD = await contextD.newPage();
    await pageD.addInitScript(
      ({ key, token }) => window.localStorage.setItem(key, token),
      { key: `room:${code}`, token: FABRICATED_TOKEN_24 },
    );
    await pageD.goto(`/room/${code}`);

    // The forged token auto-connects (no join form) since a token is
    // present, but the server must reject it as unknown and mint a fresh
    // seat rather than binding to B's.
    const dSeatRow = selfSeatRow(pageD);
    const dRefusal = pageD.getByTestId("refusal-card");
    await expect(dSeatRow.or(dRefusal)).toBeVisible({ timeout: 10_000 });

    if (await dRefusal.isVisible()) {
      await expect(dRefusal).toContainText("This room is full");
    } else {
      const seatIdD = await selfSeatId(pageD);
      expect(seatIdD).not.toBe(seatIdB);
      await expectSeatCount(hostPage, 4);
    }

    const seatCountAfterD = await hostPage.getByTestId("seat-row").count();

    // 4. Reload context 2 (B's own tab). It must reattach to the SAME
    // seatId with no join form shown — the legitimate reclaim path.
    await pageB.reload();
    await expect(pageB.getByLabel("Your name")).toHaveCount(0);
    const seatIdBAfterReload = await selfSeatId(pageB);
    expect(seatIdBAfterReload).toBe(seatIdB);

    // 5. Open a second tab in context 2's SAME browser context (sharing
    // localStorage, hence the same token). The new tab must be seated and
    // the ORIGINAL tab must show the superseded notice verbatim. The seat
    // count must not increase — supersession must not duplicate a seat.
    const pageB2 = await contextB.newPage();
    await pageB2.goto(`/room/${code}`);
    await expect(selfSeatRow(pageB2)).toBeVisible();
    const seatIdB2 = await selfSeatId(pageB2);
    expect(seatIdB2).toBe(seatIdB);

    await expect(pageB.getByText("This room was opened in another tab.")).toBeVisible({ timeout: 10_000 });

    await expect(hostPage.getByTestId("seat-row")).toHaveCount(seatCountAfterD);

    await contextB.close();
    await contextC.close();
    await contextD.close();
  });

  test("RT-08 (D-10/D-11/D-12): mid-game, a second tab supersedes the first, Use this tab reclaims the seat, and the seat is never duplicated or ping-ponged", async ({
    page: hostPage,
    browser,
  }) => {
    test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "needs locally injected heartbeat timing (D-15)");
    test.setTimeout(90_000);

    const { code, contextB, pageB } = await startTwoPlayerGame(hostPage, browser);

    // Observer = hostPage; the seat under test is pageB's.
    const bSeatId = await seatIdOfOtherPlayer(hostPage);
    const pageBOwnHandSlotCountBefore = await pageB.locator(OWN_HAND_SLOT_SELECTOR).count();
    const pageBTurnIndicatorBefore = ((await pageB.getByTestId("turn-indicator").textContent()) ?? "").trim();
    await expect(hostPage.locator(OTHER_HAND_SELECTOR)).toHaveCount(1);

    const pageB2 = await contextB.newPage();
    await pageB2.goto(`/room/${code}`);
    await expect(pageB2.getByLabel("Your name")).toHaveCount(0);
    await expect(pageB2.getByTestId("own-hand")).toBeVisible();
    await expect(pageB2.getByTestId("turn-indicator")).toHaveText(pageBTurnIndicatorBefore);

    await expect(pageB.getByText("This room was opened in another tab.")).toBeVisible();
    await expect(pageB.getByTestId("use-this-tab-button")).toBeVisible();
    await expect(pageB.getByTestId("use-this-tab-button")).toBeEnabled();

    await expect(hostPage.locator(OTHER_HAND_SELECTOR)).toHaveCount(1);
    expect(await seatIdOfOtherPlayer(hostPage)).toBe(bSeatId);
    await expect(hostPage.getByTestId(`seat-status-${bSeatId}`)).toHaveAttribute("data-connected", "true");

    await pageB.getByTestId("use-this-tab-button").click();

    await expect(pageB.getByTestId("own-hand")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText("This room was opened in another tab.")).toHaveCount(0);
    await expect(pageB.locator(OWN_HAND_SLOT_SELECTOR)).toHaveCount(pageBOwnHandSlotCountBefore);

    await expect(pageB2.getByText("This room was opened in another tab.")).toBeVisible();
    await expect(pageB2.getByTestId("use-this-tab-button")).toBeVisible();

    await expect(hostPage.locator(OTHER_HAND_SELECTOR)).toHaveCount(1);
    expect(await seatIdOfOtherPlayer(hostPage)).toBe(bSeatId);
    await expect(hostPage.getByTestId(`seat-status-${bSeatId}`)).toHaveAttribute("data-connected", "true");

    // D-11: no ping-pong. Wait more than 4 injected heartbeat intervals
    // (1000ms) and one full injected stale window (5000ms) — a deliberate
    // negative-window wait proving the two tabs never auto-flip back.
    await pageB.waitForTimeout(5_000);

    await expect(pageB.getByTestId("own-hand")).toBeVisible();
    await expect(pageB2.getByText("This room was opened in another tab.")).toBeVisible();
    await expect(hostPage.locator(OTHER_HAND_SELECTOR)).toHaveCount(1);
    expect(await seatIdOfOtherPlayer(hostPage)).toBe(bSeatId);
    await expect(hostPage.getByTestId(`seat-status-${bSeatId}`)).toHaveAttribute("data-connected", "true");

    await contextB.close();
  });
});
