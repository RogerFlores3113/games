// Hand-drawn 16x16 "tricks won" icon: three fanned card backs. PixelLab's
// candidates read as barrels, so this one is drawn in code.
import sharp from "sharp";
import path from "node:path";

const W = 16, H = 16;
const px = new Uint8Array(W * H * 4);
const OUTLINE = [26, 20, 16, 255], FACE = [233, 220, 190, 255], BACK = [122, 54, 40, 255], TRIM = [201, 150, 64, 255];
const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; px.set(c, (y * W + x) * 4); };
function card(x0, y0, back) {
  for (let y = y0; y < y0 + 11; y++) for (let x = x0; x < x0 + 8; x++) {
    const edge = x === x0 || x === x0 + 7 || y === y0 || y === y0 + 10;
    set(x, y, edge ? OUTLINE : back ? (x === x0 + 1 || x === x0 + 6 || y === y0 + 1 || y === y0 + 9 ? TRIM : BACK) : FACE);
  }
}
card(1, 4, true);
card(4, 2, true);
card(7, 1, true);
await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(path.resolve(import.meta.dirname, "../../public/expedition/sprites/camp/icon-tricks.png"));
console.log("icon-tricks drawn");
