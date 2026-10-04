import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { devModeEnabled } from "./dev-mode";

describe("dev-mode gate (worker half)", () => {
  it("is on only for DEV_MODE 1 or true", () => {
    expect(devModeEnabled({})).toBe(false);
    expect(devModeEnabled({ DEV_MODE: "" })).toBe(false);
    expect(devModeEnabled({ DEV_MODE: "0" })).toBe(false);
    expect(devModeEnabled({ DEV_MODE: "false" })).toBe(false);
    expect(devModeEnabled({ DEV_MODE: "1" })).toBe(true);
    expect(devModeEnabled({ DEV_MODE: "true" })).toBe(true);
  });

  it("is never set by wrangler.jsonc, so a plain deploy has it off", () => {
    const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url).pathname, "utf-8");
    expect(config).not.toContain("DEV_MODE");
  });

  it("is supplied by the dev script, not by the deploy build", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toContain("--var DEV_MODE:1");
    expect(pkg.scripts.build).not.toContain("DEV_MODE");
  });
});
