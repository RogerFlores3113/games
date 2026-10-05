import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { devPanelEnabled } from "./dev-gate";

describe("devPanelEnabled", () => {
  it("is off in production", () => {
    expect(devPanelEnabled({ NODE_ENV: "production" })).toBe(false);
  });
  it("is on in development", () => {
    expect(devPanelEnabled({ NODE_ENV: "development" })).toBe(true);
  });
  it("is on in production when the flag is 1", () => {
    expect(devPanelEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEV_MODE: "1" })).toBe(true);
  });
  it("stays off when the flag is 0", () => {
    expect(devPanelEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEV_MODE: "0" })).toBe(false);
  });
});

// The dev tools (toolbar, panel, right-click menu, Play solo) only ever load
// through a dynamic import behind DEV_PANEL_ENABLED, so a production build
// never mounts them.
describe("the dev tools' only entry points", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const sources = ["app", "components", "lib"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, encoding: "utf-8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join(dir, file)),
  );
  const devModule = /["'](?:\.\.?\/)+(?:components\/)?dev\/(?:DevPanel|PlaySoloButton)["']|["']\.\/dev-picks["']/;
  const outsideDevTools = sources.filter((file) => !file.startsWith(join("components", "dev")) && !file.endsWith("dev-picks.ts"));

  it("are the room page, the landing form and the Phaser mount", () => {
    const importers = outsideDevTools.filter((file) => devModule.test(readFileSync(join(root, file), "utf-8")));
    expect(importers.sort()).toEqual([join("app", "LandingForm.tsx"), join("app", "room", "[code]", "RoomClient.tsx"), join("components", "expedition", "phaser", "ExpeditionPhaserMount.tsx")]);
  });

  it("import the dev tools only dynamically, behind DEV_PANEL_ENABLED", () => {
    for (const file of outsideDevTools) {
      const lines = readFileSync(join(root, file), "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (!devModule.test(line)) return;
        expect(line, `${file}:${i + 1}`).toMatch(/import\(/);
        expect(lines.slice(Math.max(0, i - 2), i + 1).join("\n"), `${file}:${i + 1}`).toContain("DEV_PANEL_ENABLED");
      });
    }
  });
});
