// One-off icon generator: draws the DJSynth mark as SVG, rasterizes to every
// PWA/apple-touch-icon size with sharp (already a Next.js dependency, no new
// install needed). Run once with `node scripts/gen-icons.mjs`; outputs land
// straight in /public so app/layout.tsx can reference stable filenames.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a1c"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#ffe680"/>
      <stop offset="45%" stop-color="#ffcc00"/>
      <stop offset="100%" stop-color="#a37a00"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="#2a2a2c" stroke-width="14"/>
  <circle cx="256" cy="256" r="150" fill="url(#glow)"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#00000055" stroke-width="6"/>
  <circle cx="256" cy="256" r="34" fill="#111"/>
  <circle cx="256" cy="256" r="34" fill="none" stroke="#000" stroke-width="4"/>
  <text x="256" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900"
        font-size="76" fill="#ffcc00" letter-spacing="2">DJ</text>
</svg>`;

const targets = [
  { file: "icon-512.png", size: 512 },
  { file: "icon-192.png", size: 192 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-16.png", size: 16 },
];

for (const { file, size } of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, file));
  console.log("wrote", file);
}
