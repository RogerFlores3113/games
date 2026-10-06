import { expect, test } from "@playwright/test";

test("web dev server serves the landing screen", async ({ request }) => {
  // The home page is the game picker; its "Board games" heading is the
  // stable sentinel.
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Board games");
});

test("worker dev server serves both workspace smoke sentinels", async ({ request }) => {
  const response = await request.get("http://localhost:8787/__smoke");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("rules-smoke-ok");
});
