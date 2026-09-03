import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type Variant = "base" | "rainbow" | "black";

export interface CreateRoomOptions {
  name: string;
  variant?: Variant;
}

/**
 * Fills the create-room screen, submits, waits for the URL to move to
 * `/room/{code}`, and returns the 6-character room code. The caller's
 * `page` ends up seated as host in the lobby.
 */
export async function createRoom(page: Page, { name, variant = "base" }: CreateRoomOptions): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  if (variant !== "base") {
    await page.getByRole("radio", { name: variantLabel(variant) }).check();
  }
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = new URL(page.url()).pathname.split("/").pop();
  if (!code) {
    throw new Error("createRoom: could not extract room code from URL " + page.url());
  }
  // Wait for the host's own seat row to render before returning control —
  // a bare URL match can win the race against the socket's `joined` reply.
  await expect(page.getByTestId("seat-row").and(page.locator('[data-self="true"]'))).toBeVisible();
  return code;
}

function variantLabel(variant: Variant): string {
  if (variant === "rainbow") return "Rainbow";
  if (variant === "black") return "Black";
  return "Base";
}

/**
 * Opens a fresh page in `context` at `/room/{code}`, fills the join form
 * with `name`, and waits for that player's own seat row to render. Returns
 * the new page so the caller can keep driving it.
 */
export async function joinAs(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/room/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("seat-row").and(page.locator('[data-self="true"]'))).toBeVisible();
  return page;
}

/**
 * Waits (with a bounded timeout) until exactly `n` seat rows are rendered
 * on `page`. Never sleeps — this is Playwright's own auto-retrying
 * assertion, just wrapped for call-site readability.
 */
export async function expectSeatCount(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId("seat-row")).toHaveCount(n, { timeout: 10_000 });
}
