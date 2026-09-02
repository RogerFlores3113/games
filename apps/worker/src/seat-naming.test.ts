import { describe, expect, it } from "vitest";
import { deriveDisplayLabel } from "./seat-naming";

describe("deriveDisplayLabel", () => {
  it("returns the requested name unchanged when there is no collision", () => {
    expect(deriveDisplayLabel("Roger", [])).toBe("Roger");
    expect(deriveDisplayLabel("Roger", ["Alice"])).toBe("Roger");
  });

  it("appends (2) on a single collision", () => {
    expect(deriveDisplayLabel("Roger", ["Roger"])).toBe("Roger (2)");
  });

  it("appends (3) when (2) is also taken", () => {
    expect(deriveDisplayLabel("Roger", ["Roger", "Roger (2)"])).toBe("Roger (3)");
  });

  it("detects collisions case-insensitively but preserves the caller's casing", () => {
    expect(deriveDisplayLabel("roger", ["Roger"])).toBe("roger (2)");
  });

  it("trims leading/trailing whitespace before comparison", () => {
    expect(deriveDisplayLabel("  Roger  ", ["Roger"])).toBe("Roger (2)");
    expect(deriveDisplayLabel("  Roger  ", [])).toBe("Roger");
  });

  it("advances past a name that already literally ends in (2)", () => {
    expect(deriveDisplayLabel("Roger (2)", ["Roger (2)"])).toBe("Roger (2) (2)");
  });
});
