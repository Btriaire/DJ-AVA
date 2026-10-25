// Covers are shown at 20 to 200 px: decoding a 720p thumbnail for each of them (4 bytes per pixel, several MB
// once decoded) is what fills the memory of a long list. YouTube serves the same cover at 320x180.
export function thumbSrc(art: string | undefined, px: number): string | undefined {
  if (!art) return art;
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\//.exec(art);
  return m && px <= 200 ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : art;
}
