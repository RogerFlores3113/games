import { describe, expect, it } from "vitest";
import { pickTransitionSpeed } from "./transition-speed";

describe("pickTransitionSpeed", () => {
  it("plays the full sign, or the still one under reduced motion", () => {
    expect(pickTransitionSpeed({ pref: null, devJumped: false, reducedMotion: false })).toBe("full");
    expect(pickTransitionSpeed({ pref: null, devJumped: false, reducedMotion: true })).toBe("reduced");
  });

  it("a dev jump skips the transition, unless this browser asked for signs after jumps too", () => {
    expect(pickTransitionSpeed({ pref: null, devJumped: true, reducedMotion: false })).toBe("skip");
    expect(pickTransitionSpeed({ pref: "fast", devJumped: true, reducedMotion: false })).toBe("skip");
    expect(pickTransitionSpeed({ pref: "always", devJumped: true, reducedMotion: false })).toBe("full");
    expect(pickTransitionSpeed({ pref: "always", devJumped: true, reducedMotion: true })).toBe("reduced");
  });

  it("the e2e flag compresses every sign; an unknown value is ignored", () => {
    expect(pickTransitionSpeed({ pref: "fast", devJumped: false, reducedMotion: true })).toBe("fast");
    expect(pickTransitionSpeed({ pref: "slow", devJumped: false, reducedMotion: false })).toBe("full");
  });
});
