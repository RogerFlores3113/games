import { describe, expect, it } from "vitest";
import { ExpeditionErrorCodeSchema } from "@games/schema/games/expedition";
import { PROMPT_MAX_CHARS } from "./build-prompt";
import { refusalText } from "./refusal-text";

const nameOf = (seatId: string) => ({ s3: "Cara" })[seatId] ?? "?";

describe("refusalText", () => {
  it("says a between-tricks action came too late in plain words", () => {
    expect(refusalText("wrong_window", null, nameOf)).toBe("That has to wait for the gap between tricks");
  });

  it("falls back to a generic line for a lead waiting on nobody it can name", () => {
    expect(refusalText("waiting_on_hold", null, nameOf)).toBe("A teammate asked you to wait");
  });

  it("gives every code a line that fits the prompt, with no em-dash", () => {
    for (const code of ExpeditionErrorCodeSchema.options) {
      const text = refusalText(code, null, nameOf);
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
      expect(text).not.toContain("—");
    }
  });
});
