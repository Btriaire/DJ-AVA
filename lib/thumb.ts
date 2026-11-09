import { existsSync, readFileSync } from "node:fs";

// Covers are shown at 20 to 200 px: decoding a 720p thumbnail for each of them (4 bytes per pixel, several MB
// once decoded) is what fills the memory of a long list. YouTube serves the same cover at 320x180.
export function thumbSrc(art: string | undefined, px: number): string | undefined {
  if (!art) return art;
  const g = /^https:\/\/(yt3|lh3)\.googleusercontent\.com\//.test(art);
  if (g) {
    const s = Math.min(544, Math.round(px * 2));
    return art.replace(/=w\d+-h\d+/, `=w${s}-h${s}`);
  }
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\//.exec(art);
  return m && px <= 200 ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : art;
}
