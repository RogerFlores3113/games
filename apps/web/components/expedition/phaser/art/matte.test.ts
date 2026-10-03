import { describe, expect, it } from "vitest";
import { keyOutBorderColour } from "./matte";

const G = [208, 204, 202, 255];
const W = [139, 90, 43, 255];

function alphas(pixels: number[][], w: number): string {
  const rgba = new Uint8ClampedArray(pixels.flat());
  keyOutBorderColour(rgba, w, pixels.length / w);
  return Array.from({ length: pixels.length }, (_, p) => (rgba[p * 4 + 3] === 0 ? "." : "#")).join("");
}

describe("keyOutBorderColour", () => {
  it("clears backdrop that reaches the border, even a pocket cut off from the corners, and keeps one the sprite encloses", () => {
    // prettier-ignore
    const image = [
      G, G, G, G, G, G,
      G, W, W, W, W, G,
      G, W, G, W, W, G,
      G, W, W, W, W, G,
      G, G, W, G, W, G,
    ];
    expect(alphas(image, 6)).toBe("......" + ".####." + ".####." + ".####." + "..#.#.");
  });
});
