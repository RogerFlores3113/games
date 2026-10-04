// Downloads a finished PixelLab image into the sprites folder, scales it by an
// integer factor with nearest-neighbour, and records it in CREDITS.md.
//
//   node apps/web/art/expedition/fetch-art.mjs <artId> <file> <url> [scale] [--matte]
//
// <file> is the ArtDef.file path under public/expedition/sprites/. PixelLab
// often returns "transparent" sprites on a flat backdrop; --matte makes every
// pixel of the top-left colour that touches the border transparent.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const matte = args.includes("--matte");
const [artId, file, url, scaleArg] = args.filter((a) => a !== "--matte");
if (!artId || !file || !url) {
  console.error("usage: fetch-art.mjs <artId> <file> <url> [scale] [--matte]");
  process.exit(1);
}
const scale = Number(scaleArg ?? 1);
const root = path.resolve(import.meta.dirname, "../../public/expedition");
const out = path.join(root, "sprites", file);

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (matte) keyOutBorderColour(data, info.width, info.height);
const meta = { width: info.width, height: info.height };
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(meta.width * scale, meta.height * scale, { kernel: sharp.kernel.nearest })
  .png()
  .toFile(out);

const credits = path.join(root, "CREDITS.md");
if (!fs.existsSync(credits)) {
  fs.writeFileSync(
    credits,
    "# Expedition art credits\n\n" +
      "Every asset is a PixelLab generation used under the PixelLab Terms of Service " +
      "(https://pixellab.ai/termsofservice). Prompt specs live in `apps/web/art/expedition/prompts/`.\n\n" +
      "| Asset | File | Source | Licence | Added |\n|---|---|---|---|---|\n",
  );
}
const row = `| ${artId} | sprites/${file} | PixelLab generation, spec \`prompts/${artId}.json\` | PixelLab ToS | ${new Date().toLocaleDateString("en-CA")} |\n`;
const lines = fs.readFileSync(credits, "utf8").split("\n").filter((l) => !l.startsWith(`| ${artId} |`));
// The art table comes first; later sections (audio) have tables of their own.
const header = lines.findIndex((l) => l.startsWith("| Asset |"));
let end = header;
while (lines[end + 1]?.startsWith("|")) end++;
lines.splice(end + 1, 0, row.trimEnd());
fs.writeFileSync(credits, lines.join("\n"));
console.log(`${artId}: ${meta.width}x${meta.height} x${scale} -> ${out}`);

function keyOutBorderColour(rgba, w, h) {
  const [r, g, b] = [rgba[0], rgba[1], rgba[2]];
  const matches = (p) => rgba[p * 4] === r && rgba[p * 4 + 1] === g && rgba[p * 4 + 2] === b && rgba[p * 4 + 3] !== 0;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const p = stack.pop();
    if (!matches(p)) continue;
    rgba[p * 4 + 3] = 0;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < (h - 1) * w) stack.push(p + w);
  }
}
