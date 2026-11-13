// Regenerates the installable-app icons from the brand mark in app/icon.svg.
// Usage: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public/icons");
await mkdir(out, { recursive: true });
const svg = await readFile(path.join(root, "app/icon.svg"));
// Mark only (no rounded tile) for full-bleed variants.
const mark = Buffer.from(String(svg).replace(/<rect width="64" height="64" rx="12" fill="#111e36"\/>/, ""));

async function standard(size, file) {
  await sharp(svg, { density: 1200 }).resize(size, size).png().toFile(path.join(out, file));
}
// Maskable icons keep the mark inside the central safe zone (~60%) on a full-bleed tile.
async function fullBleed(size, file, scale) {
  const inner = Math.round(size * scale);
  const glyph = await sharp(mark, { density: 1200 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#111e36" } })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toFile(path.join(out, file));
}
await standard(192, "icon-192.png");
await standard(512, "icon-512.png");
await fullBleed(512, "maskable-512.png", 0.62);
await fullBleed(180, "apple-touch-icon.png", 0.78);
console.log("Icons written to public/icons");
