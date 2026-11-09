// The look of a set: its colour and its cover, the same everywhere; colours are OKLCH and their ink reads at WCAG AAA

export type SetArtId = "image" | "mosaic" | "disc" | "waves" | "rays" | "grid" | "orbits" | "energy";
export interface SetLook { color?: string; art?: SetArtId; showTitle?: boolean }
export const SET_ARTS: { id: SetArtId; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "mosaic", label: "Mosaïque" },
  { id: "disc", label: "Disque" },
  { id: "waves", label: "Ondes" },
  { id: "rays", label: "Rayons" },
  { id: "grid", label: "Damier" },
  { id: "orbits", label: "Orbites" },
  { id: "energy", label: "Énergie" }
];
export const SET_COLORS: { id: string; label: string; css: string }[] = [
  { id: "cyan", label: "Cyan", css: "oklch(0.84 0.13 205)" },
  { id: "bleu", label: "Bleu", css: "oklch(0.80 0.12 255)" },
  { id: "violet", label: "Violet", css: "oklch(0.80 0.13 300)" },
  { id: "rose", label: "Rose", css: "oklch(0.82 0.14 350)" },
  { id: "rouge", label: "Rouge", css: "oklch(0.80 0.15 25)" },
  { id: "orange", label: "Orange", css: "oklch(0.82 0.15 60)" },
  { id: "or", label: "Or", css: "oklch(0.86 0.15 90)" },
  { id: "vert", label: "Vert", css: "oklch(0.84 0.16 150)" },
  { id: "menthe", label: "Menthe", css: "oklch(0.86 0.12 175)" },
  { id: "ivoire", label: "Ivoire", css: "oklch(0.92 0.02 90)" }
];

export function luminance(css: string): number {
  const srgbToLinear = (c: number): number => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const oklchToLinear = (l: number, c: number, h: number): [number, number, number] => {
    const rad = h * Math.PI / 180;
    const labA = c * Math.cos(rad);
    const labB = c * Math.sin(rad);
    const lmsL = l + 0.3963377774 * labA + 0.2158037573 * labB;
    const lmsM = l - 0.1055613458 * labA - 0.0638541728 * labB;
    const lmsS = l - 0.0894841775 * labA - 1.2914855480 * labB;
    const linL = Math.pow(lmsL, 3);
    const linM = Math.pow(lmsM, 3);
    const linS = Math.pow(lmsS, 3);
    const linR = Math.max(0, Math.min(1, 4.0767416621 * linL - 3.3077115913 * linM + 0.2309699292 * linS));
    const linG = Math.max(0, Math.min(1, -1.2684380046 * linL + 2.6097574011 * linM - 0.3413193965 * linS));
    const linB = Math.max(0, Math.min(1, -0.0041960863 * linL - 0.7034186147 * linM + 1.7076147010 * linS));
    return [linR, linG, linB];
  };

  if (css.startsWith("#")) {
    const hex = css.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const linR = srgbToLinear(r);
    const linG = srgbToLinear(g);
    const linB = srgbToLinear(b);
    return 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
  } else if (css.startsWith("oklch(")) {
    const match = css.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
    if (match) {
      const l = parseFloat(match[1]);
      const c = parseFloat(match[2]);
      const h = parseFloat(match[3]);
      const [linR, linG, linB] = oklchToLinear(l, c, h);
      return 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
    }
  }
  return 0.5;
}

export function contrast(a: number, b: number): number {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (max + 0.05) / (min + 0.05);
}

export function inkOn(css: string): "#000000" | "#ffffff" {
  const lum = luminance(css);
  const blackContrast = contrast(lum, 0);
  const whiteContrast = contrast(1, lum);
  return blackContrast > whiteContrast ? "#000000" : "#ffffff";
}

export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function setAccent(set: { look?: SetLook }, index: number, fallback: readonly string[]): string {
  return set.look?.color ?? fallback[index % fallback.length];
}

export function resolveArt(set: { cover?: string; look?: SetLook }): SetArtId {
  const a = set.look?.art;
  if (a === undefined) {
    return set.cover ? "image" : "mosaic";
  }
  if (a === "image" && !set.cover) {
    return "mosaic";
  }
  return a;
}

export function dominantAccent(rgba: Uint8ClampedArray): string | null {
  const histogram: number[] = new Array(36).fill(0);
  const cosSum: number[] = new Array(36).fill(0);
  const sinSum: number[] = new Array(36).fill(0);

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;

    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;

    const linR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const linG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const linB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    const lmsL = 0.4122214708 * linR + 0.5363325363 * linG + 0.0514459929 * linB;
    const lmsM = 0.2119034982 * linR + 0.6806995451 * linG + 0.1073969566 * linB;
    const lmsS = 0.0883024619 * linR + 0.2817188376 * linG + 0.6299787005 * linB;

    const labL = 0.2104542553 * Math.pow(lmsL, 1/3) + 0.7936177850 * Math.pow(lmsM, 1/3) - 0.0040720468 * Math.pow(lmsS, 1/3);
    const labA = 1.9779984951 * Math.pow(lmsL, 1/3) - 2.4285922050 * Math.pow(lmsM, 1/3) + 0.4505937099 * Math.pow(lmsS, 1/3);
    const labB = 0.0259040371 * Math.pow(lmsL, 1/3) + 0.7827717662 * Math.pow(lmsM, 1/3) - 0.8086757660 * Math.pow(lmsS, 1/3);

    const c = Math.hypot(labA, labB);
    if (c < 0.05) continue;

    const h = Math.atan2(labB, labA) * 180 / Math.PI;
    const bin = Math.floor((h + 360) % 360 / 10);

    histogram[bin] += c;
    cosSum[bin] += c * Math.cos(h * Math.PI / 180);
    sinSum[bin] += c * Math.sin(h * Math.PI / 180);
  }

  let maxBin = -1;
  let maxWeight = 0;
  for (let i = 0; i < histogram.length; i++) {
    if (histogram[i] > maxWeight) {
      maxWeight = histogram[i];
      maxBin = i;
    }
  }

  if (maxBin === -1) return null;

  const hue = Math.atan2(sinSum[maxBin], cosSum[maxBin]) * 180 / Math.PI;
  const roundedHue = Math.round((hue + 360) % 360 * 10) / 10;

  return `oklch(0.84 0.13 ${roundedHue})`;
}

export type SetShape =
  | { t: "circle"; cx: number; cy: number; r: number; o: number; fill: boolean }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; o: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; o: number }
  | { t: "poly"; points: [number, number][]; o: number };

export function patternShapes(art: SetArtId, seed: number, values: number[]): SetShape[] {
  const rng = (): number => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const shapes: SetShape[] = [];

  switch (art) {
    case "disc": {
      const centerX = 50;
      const centerY = 50;
      const numCircles = 6 + Math.floor(rng() * 4);
      const maxRadius = 46;
      const step = maxRadius / numCircles;

      for (let i = 0; i < numCircles; i++) {
        const radius = step * (i + 1);
        const o = 0.25 + rng() * 0.55;
        shapes.push({ t: "circle", cx: centerX, cy: centerY, r: radius, o, fill: false });
      }

      const finalRadius = 10 + rng() * 6;
      shapes.push({ t: "circle", cx: centerX, cy: centerY, r: finalRadius, o: 1, fill: true });
      break;
    }
    case "waves": {
      const numWaves = 5;
      const baseY = 50;
      const ampRange = 20;
      const freqRange = 0.1;

      for (let i = 0; i < numWaves; i++) {
        const base = baseY + (i - numWaves / 2) * 10;
        const amp = 5 + rng() * ampRange;
        const freq = 0.05 + rng() * freqRange;
        const phase = rng() * Math.PI * 2;
        const o = 0.35 + rng() * 0.6;

        const points: [number, number][] = [];
        for (let x = 0; x <= 100; x += 4) {
          const y = base + amp * Math.sin(freq * x + phase);
          points.push([x, Math.max(0, Math.min(100, y))]);
        }

        shapes.push({ t: "poly", points, o });
      }
      break;
    }
    case "rays": {
      const centerX = 30 + rng() * 40;
      const centerY = 30 + rng() * 40;
      const numRays = 16 + Math.floor(rng() * 13);

      for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2 + rng() * 0.2;
        const o = 0.3 + rng() * 0.6;

        const x2 = centerX + Math.cos(angle) * 100;
        const y2 = centerY + Math.sin(angle) * 100;

        shapes.push({
          t: "line",
          x1: centerX,
          y1: centerY,
          x2: Math.max(0, Math.min(100, x2)),
          y2: Math.max(0, Math.min(100, y2)),
          o
        });
      }
      break;
    }
    case "grid": {
      const size = 6;
      const cellSize = 100 / size;

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const x = i * cellSize;
          const y = j * cellSize;
          const o = Math.max(0.08, Math.min(1, 0.08 + rng() * 0.9));

          shapes.push({ t: "rect", x, y, w: cellSize, h: cellSize, o });
        }
      }
      break;
    }
    case "orbits": {
      const centerX = 50;
      const centerY = 50;
      const numCircles = 3 + Math.floor(rng() * 2);

      for (let i = 0; i < numCircles; i++) {
        const radius = 10 + rng() * 30;
        shapes.push({ t: "circle", cx: centerX, cy: centerY, r: radius, o: 0.5, fill: false });

        const numPoints = 1 + Math.floor(rng() * 2);
        for (let j = 0; j < numPoints; j++) {
          const angle = rng() * Math.PI * 2;
          const pointRadius = 2 + rng() * 2;
          const pointX = centerX + Math.cos(angle) * radius;
          const pointY = centerY + Math.sin(angle) * radius;

          shapes.push({
            t: "circle",
            cx: Math.max(0, Math.min(100, pointX)),
            cy: Math.max(0, Math.min(100, pointY)),
            r: pointRadius,
            o: 1,
            fill: true
          });
        }
      }
      break;
    }
    case "energy": {
      const tracks = values.length > 0 ? values.slice(0, 24) : Array.from({ length: 12 }, () => rng() * 100);
      const min = Math.min(...tracks);
      const max = Math.max(...tracks);
      const range = max - min || 1;

      for (let i = 0; i < tracks.length; i++) {
        const v = tracks[i];
        const h = 18 + 72 * (v - min) / range;
        const o = 0.5 + 0.5 * (v - min) / range;
        const w = 100 / tracks.length * 0.72;
        const x = i * (100 / tracks.length) + (100 / tracks.length - w) / 2;

        shapes.push({
          t: "rect",
          x: Math.max(0, Math.min(100, x)),
          y: 100 - h,
          w: Math.max(0, Math.min(100, w)),
          h: Math.max(0, Math.min(100, h)),
          o: Math.max(0, Math.min(1, o))
        });
      }
      break;
    }
    case "image":
    case "mosaic":
      break;
  }

  return shapes;
}
