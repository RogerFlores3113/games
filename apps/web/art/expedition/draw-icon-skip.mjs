// Hand-drawn 16x16 icon for the temple's skip: the Sun with a forward
// arrow cut through it, since the skip is earned by winning the Sun.
import sharp from "sharp";
import path from "node:path";

const W = 16, H = 16;
const px = new Uint8Array(W * H * 4);
const OUTLINE = [26, 20, 16, 255], GOLD = [242, 190, 64, 255], LIGHT = [255, 232, 140, 255], RAY = [214, 138, 40, 255], ARROW = [250, 246, 232, 255];
const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; px.set(c, (y * W + x) * 4); };

const cx = 7.5, cy = 7.5;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= 4.6) set(x, y, d <= 3.6 ? (x + y < 13 ? LIGHT : GOLD) : OUTLINE);
}
for (const [x, y] of [[7, 0], [8, 0], [7, 1], [8, 1], [7, 14], [8, 14], [7, 15], [8, 15], [0, 7], [0, 8], [1, 7], [1, 8], [14, 7], [14, 8], [15, 7], [15, 8], [2, 2], [3, 3], [13, 2], [12, 3], [2, 13], [3, 12], [13, 13], [12, 12]]) set(x, y, RAY);
for (let x = 4; x <= 9; x++) set(x, 7, ARROW), set(x, 8, ARROW);
for (const [x, y] of [[9, 5], [10, 6], [11, 7], [11, 8], [10, 9], [9, 10], [9, 6], [10, 7], [10, 8], [9, 9]]) set(x, y, ARROW);

await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(path.resolve(import.meta.dirname, "../../public/expedition/sprites/sources/temple.png"));
console.log("temple skip icon drawn");
