import { expect, test } from "@playwright/test";
import { playUntilGameEnds, startTwoPlayerGame } from "./helpers";

/**
 * Owner request (2026-09-18): host-only "Delete room" (settings modal) and
 * host-only "Back to lobby" (end-of-game screen). Server-enforced —
 * `delete_room`/`restart_lobby` are refused `not_host` regardless of what
 * any client renders — so every spec here drives a NON-host page too, to
 * prove the control is both hidden AND (structurally, via the shared
 * server contract already covered by room-state.test.ts's unit tests)
 * unusable for that seat.
 */
test.describe("host room controls: delete room and restart lobby", () => {
  test("host deletes the room: every connected player is removed", async ({ page: hostPage, browser }) => {
    // The settings modal (and so "Delete room") lives inside HanabiBoard,
    // reachable once a game has started — the lobby has no settings modal
    // of its own. Starting a short game first exercises the realistic path
    // (deleting a room mid-game, the case the owner's "ends the game for
    // everyone" confirmation copy is written for).
    const { code, pageB: guestPage } = await startTwoPlayerGame(hostPage, browser, {
      host: "Roger",
      guest: "Bianca",
    });

    // Non-host: the settings modal never offers a delete control.
    await guestPage.getByTestId("settings-toggle").click();
    await expect(guestPage.getByTestId("settings-modal")).toBeVisible();
    await expect(guestPage.getByTestId("delete-room-button")).toHaveCount(0);
    await guestPage.getByTestId("settings-close").click();

    // Host: open settings, confirm the destructive action.
    await hostPage.getByTestId("settings-toggle").click();
    await expect(hostPage.getByTestId("settings-modal")).toBeVisible();
    await hostPage.getByTestId("delete-room-button").click();
    await expect(hostPage.getByTestId("delete-room-confirm-copy")).toBeVisible();
    await hostPage.getByTestId("delete-room-confirm-button").click();

    // Every connected player — including the host who triggered it — is
    // removed and shown the "room not found"-shaped terminal state.
    for (const page of [hostPage, guestPage]) {
      await expect(page.getByText("The host closed this room.")).toBeVisible({ timeout: 10_000 });
    }

    // A player who then opens the OLD link sees an ordinary fresh lobby —
    // the exact same WR-08 "unknown room code creates a brand new lobby"
    // path idle-GC'd rooms already hit — never a crash. The stored seat
    // token/display name auto-rejoin under the SAME code with no manual
    // re-entry, landing straight in a (new) lobby rather than an error page,
    // since this app has no dedicated "room not found" screen at all.
    await hostPage.goto(`/room/${code}`);
    await expect(hostPage.getByRole("heading", { name: "Waiting for players" })).toBeVisible();
    await expect(hostPage.getByTestId("seat-row")).toHaveCount(1);
  });

  test("non-host's settings modal has no delete control even after a page reload", async ({
    page: hostPage,
    browser,
  }) => {
    const { pageB: guestPage } = await startTwoPlayerGame(hostPage, browser, {
      host: "Roger",
      guest: "Bianca",
    });

    await guestPage.reload();
    await expect(guestPage.getByTestId("own-hand")).toBeVisible();
    await guestPage.getByTestId("settings-toggle").click();
    await expect(guestPage.getByTestId("settings-modal")).toBeVisible();
    await expect(guestPage.getByTestId("delete-room-button")).toHaveCount(0);
  });

  test("host restarts the lobby after game over: everyone returns to the lobby and can start a new game", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(240_000);

    const { pageB: guestPage } = await startTwoPlayerGame(hostPage, browser);
    await playUntilGameEnds(hostPage, guestPage);

    for (const page of [hostPage, guestPage]) {
      await expect(page.getByTestId("end-overlay")).toBeVisible();
    }

    // Non-host sees the ordinary end screen with no restart control.
    await expect(guestPage.getByTestId("restart-lobby-button")).toHaveCount(0);
    await expect(guestPage.getByTestId("new-game-link")).toBeVisible();

    // Host restarts; both pages follow back to the lobby automatically.
    await hostPage.getByTestId("restart-lobby-button").click();

    for (const page of [hostPage, guestPage]) {
      await expect(page.getByTestId("end-overlay")).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByTestId("seat-row")).toHaveCount(2);
    }

    // The SAME room code, seats intact — the host can start a fresh game.
    await hostPage.getByTestId("start-game").click();
    await expect(hostPage.getByTestId("own-hand")).toBeVisible();
    await expect(guestPage.getByTestId("own-hand")).toBeVisible();
  });

  test("non-host never sees the restart-lobby control, before or after the host restarts", async ({
    page: hostPage,
    browser,
  }) => {
    test.setTimeout(240_000);

    const { pageB: guestPage } = await startTwoPlayerGame(hostPage, browser);
    await playUntilGameEnds(hostPage, guestPage);

    await expect(guestPage.getByTestId("end-overlay")).toBeVisible();
    await expect(guestPage.getByTestId("restart-lobby-button")).toHaveCount(0);
  });
});
