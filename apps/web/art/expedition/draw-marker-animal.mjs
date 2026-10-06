// Hand-drawn 16x16 trail marker for an animal boss camp: a paw print, so the
// length cards and the trail map tell an animal camp from a disaster's storm
// cloud (marker-boss) at a glance.
import sharp from "sharp";
import path from "node:path";

const W = 16, H = 16;
const OUTLINE = [43, 43, 63, 255], FILL = [214, 138, 58, 255], LIGHT = [242, 192, 112, 255], SHADE = [158, 88, 40, 255];
const PADS = [
  { cx: 2.4, cy: 5.6, rx: 1.4, ry: 1.8 },
  { cx: 6, cy: 2.9, rx: 1.4, ry: 1.9 },
  { cx: 10, cy: 2.9, rx: 1.4, ry: 1.9 },
  { cx: 13.6, cy: 5.6, rx: 1.4, ry: 1.8 },
  { cx: 8, cy: 11.4, rx: 4, ry: 3.2 },
];
const inPad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && PADS.some((p) => ((x + 0.5 - p.cx) / p.rx) ** 2 + ((y + 0.5 - p.cy) / p.ry) ** 2 <= 1);

const px = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let color = null;
    if (inPad(x, y)) color = !inPad(x, y - 1) || !inPad(x - 1, y) ? LIGHT : !inPad(x, y + 1) || !inPad(x + 1, y) ? SHADE : FILL;
    else if (inPad(x - 1, y) || inPad(x + 1, y) || inPad(x, y - 1) || inPad(x, y + 1)) color = OUTLINE;
    if (color !== null) px.set(color, (y * W + x) * 4);
  }
}
await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(path.resolve(import.meta.dirname, "../../public/expedition/sprites/fireside/marker-animal.png"));
console.log("marker-animal drawn");
