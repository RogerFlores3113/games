// Downloads a finished PixelLab image into the sprites folder, scales it by an
// integer factor with nearest-neighbour, and records it in CREDITS.md.
//
//   node apps/web/art/expedition/fetch-art.mjs <artId> <file> <url> [scale] [--frames N]
//
// <file> is the ArtDef.file path under public/expedition/sprites/.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [artId, file, url, scaleArg] = process.argv.slice(2);
if (!artId || !file || !url) {
  console.error("usage: fetch-art.mjs <artId> <file> <url> [scale]");
  process.exit(1);
}
const scale = Number(scaleArg ?? 1);
const root = path.resolve(import.meta.dirname, "../../public/expedition");
const out = path.join(root, "sprites", file);

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
const input = Buffer.from(await res.arrayBuffer());
const meta = await sharp(input).metadata();
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(input)
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
const existing = fs.readFileSync(credits, "utf8");
const lines = existing.split("\n").filter((l) => !l.startsWith(`| ${artId} |`));
fs.writeFileSync(credits, lines.join("\n").replace(/\n*$/, "\n") + row);
console.log(`${artId}: ${meta.width}x${meta.height} x${scale} -> ${out}`);
