/** Makes transparent every pixel that has the top-left pixel's exact colour
 * and is connected (4-way) to the image border. `rgba` is row-major RGBA, as
 * `ImageData.data`. No `phaser` import. */
export function keyOutBorderColour(rgba: Uint8ClampedArray, w: number, h: number): void {
  const [r, g, b] = [rgba[0], rgba[1], rgba[2]];
  const matches = (p: number): boolean => rgba[p * 4] === r && rgba[p * 4 + 1] === g && rgba[p * 4 + 2] === b && rgba[p * 4 + 3] !== 0;
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (!matches(p)) continue;
    rgba[p * 4 + 3] = 0;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < (h - 1) * w) stack.push(p + w);
  }
}
