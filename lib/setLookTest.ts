// Fixed contract of the sets' look: colours readable at WCAG AAA, generated covers reproducible and inside their box
import { readFileSync } from "node:fs";
import { SET_ARTS, SET_COLORS, contrast, dominantAccent, inkOn, luminance, patternShapes, resolveArt, seedOf, setAccent, type SetShape } from "./setLook";

export function setLookTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  check(Math.abs(luminance("#ffffff") - 1) < 0.001 && luminance("#000000") < 0.001, "luminance of white and black");
  check(Math.abs(luminance("oklch(1 0 0)") - 1) < 0.01 && luminance("oklch(0 0 0)") < 0.001, "luminance from OKLCH");
  check(Math.abs(contrast(1, 0) - 21) < 0.001, "the contrast of black on white is 21");
  check(luminance("var(--x)") === 0.5, "an unreadable colour counts as a middle grey");
  check(SET_COLORS.length >= 8 && new Set(SET_COLORS.map((c) => c.css)).size === SET_COLORS.length, "at least 8 distinct colours");
  for (const c of SET_COLORS) {
    check(c.css.startsWith("oklch("), `${c.id}: an OKLCH colour`);
    const ink = inkOn(c.css);
    check(contrast(luminance(ink), luminance(c.css)) >= 7, `${c.id}: its ink ${ink} reads at AAA: luminance ${luminance(c.css).toFixed(3)}, contrast ${contrast(luminance(ink), luminance(c.css)).toFixed(2)}`);
  }
  check(inkOn("#ffffff") === "#000000" && inkOn("#000000") === "#ffffff", "the ink is the opposite of the colour");

  // the colour of an image: its strongest saturated hue, always readable
  const px = (rgb: [number, number, number], n = 100) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4); return a; };
  const mix = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { const o = new Uint8ClampedArray(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const hueOf = (css: string | null) => Number(css?.match(/oklch\(\S+ \S+ ([\d.]+)\)/)?.[1]);
  const red = dominantAccent(px([220, 30, 30]));
  check(red !== null && (hueOf(red) < 45 || hueOf(red) > 340), `a red image gives a red accent (${red})`);
  const blue = dominantAccent(px([30, 60, 230]));
  check(blue !== null && hueOf(blue) > 240 && hueOf(blue) < 290, `a blue image gives a blue accent (${blue})`);
  check(dominantAccent(px([128, 128, 128])) === null, "a grey image has no accent");
  check(dominantAccent(new Uint8ClampedArray(0)) === null, "no pixels");
  const mostlyGrey = dominantAccent(mix(px([120, 120, 120], 900), px([30, 200, 60], 100)));
  check(mostlyGrey !== null && hueOf(mostlyGrey) > 110 && hueOf(mostlyGrey) < 170, "greys are ignored: the green of the picture is found");
  for (const rgb of [[220, 30, 30], [30, 60, 230], [240, 220, 30], [20, 40, 20], [90, 10, 90]] as [number, number, number][]) {
    const a = dominantAccent(px(rgb));
    if (a) check(contrast(luminance(inkOn(a)), luminance(a)) >= 7, `${rgb}: the accent reads at AAA`);
  }
  const t = new Uint8ClampedArray(px([220, 30, 30], 10)); for (let i = 3; i < t.length; i += 4) t[i] = 0;
  check(dominantAccent(t) === null, "transparent pixels do not count");

  check(setAccent({ look: { color: "oklch(0.8 0.1 200)" } }, 3, ["#111", "#222"]) === "oklch(0.8 0.1 200)", "the set's own colour wins");
  check(setAccent({}, 3, ["#111", "#222"]) === "#222", "otherwise the list colour by position");
  check(seedOf("Set A") === seedOf("Set A") && seedOf("Set A") !== seedOf("Set B"), "the seed follows the name");

  check(resolveArt({}) === "mosaic", "no look, no image: the mosaic");
  check(resolveArt({ cover: "data:x" }) === "image", "an image alone is shown, as before");
  check(resolveArt({ cover: "data:x", look: { art: "rays" } }) === "rays", "a chosen cover wins over the image");
  check(resolveArt({ look: { art: "image" } }) === "mosaic", "image chosen but none there: the mosaic");
  check(resolveArt({ cover: "data:x", look: { art: "mosaic" } }) === "mosaic", "mosaic chosen");

  const generated = SET_ARTS.filter((a) => a.id !== "image" && a.id !== "mosaic").map((a) => a.id);
  check(generated.length >= 6, "at least six generated covers");
  check(SET_ARTS.some((a) => a.id === "image") && SET_ARTS.some((a) => a.id === "mosaic"), "image and mosaic stay in the list");
  const nums = (s: SetShape): number[] => s.t === "circle" ? [s.cx, s.cy] : s.t === "line" ? [s.x1, s.y1, s.x2, s.y2] : s.t === "rect" ? [s.x, s.y, s.x + s.w, s.y + s.h] : s.points.flat();
  for (const art of generated) {
    const a = patternShapes(art, 12345, [120, 124, 128, 126]);
    check(a.length > 0 && a.length <= 90, `${art}: ${a.length} shapes`);
    check(JSON.stringify(a) === JSON.stringify(patternShapes(art, 12345, [120, 124, 128, 126])), `${art}: reproducible`);
    if (art !== "energy") check(JSON.stringify(a) !== JSON.stringify(patternShapes(art, 999, [120, 124, 128, 126])), `${art}: differs from one set to another`); // energy draws the BPM of the set, not its name
    for (const s of a) {
      check(nums(s).every((n) => Number.isFinite(n) && n >= -0.001 && n <= 100.001), `${art}: inside the box`);
      check(s.o > 0 && s.o <= 1, `${art}: opacity`);
    }
  }
  const low = patternShapes("energy", 1, [100, 100, 100, 180]), bars = low.filter((s) => s.t === "rect") as Extract<SetShape, { t: "rect" }>[];
  check(bars.length === 4, "energy: one bar per track");
  check(bars[3].h > bars[0].h, "energy: a faster track has a taller bar");
  check(patternShapes("energy", 1, []).length > 0, "energy: an empty set still draws");

  // every place draws the same picture
  const read = (p: string) => readFileSync(p, "utf8");
  for (const f of ["components/playlist/SetRail.tsx", "components/prep/AmbientHero.tsx", "components/PrepView.tsx", "components/playlist/PlaylistStudio.tsx"]) check(read(f).includes("<SetArt"), `${f} draws the set with SetArt`);
  check(read("components/playlist/SetRail.tsx").includes("<Mosaic") === false, "the rail no longer ignores the set's picture");
  check(read("lib/library.ts").includes("look?: SetLook"), "the look is saved with the set");
  check(read("components/MediaLibrary.tsx").includes("onUpdateSet"), "the Sets view can edit a set");
  return fails;
}
