// TRIM for the stem pads: each pad can start later and end sooner than the slice that was found, with the small
// two-handle slider under it (components/jam/PadTrim.tsx). Kept per song, per stem and per slice (where it starts in
// the song), as fractions of the slice: [0, 1] is the whole slice.
export type Trim = [number, number];
export const FULL: Trim = [0, 1];

// how many times a loop plays before it stops by itself (0 = endless, as before)
export const REPEATS = [1, 2, 4, 8, 0] as const;
export type Repeats = (typeof REPEATS)[number];

const STORE = "djsynth.padTrim.v1";
let all: Record<string, Trim> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Record<string, Trim> {
  if (all) return all;
  all = {};
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    if (v && typeof v === "object") all = v;
  } catch {
    // private window: trims are kept for this visit
  }
  return all!;
}

export function trimKey(hash: string, part: string, start: number): string {
  return `${hash}|${part}|${start.toFixed(2)}`;
}

export function isFull(t: Trim): boolean {
  return t[0] <= 0 && t[1] >= 1;
}

// the handles on a grid of `steps` (a loop keeps whole 16ths), never closer than one step
export function snapTrim(t: Trim, steps: number, moved: 0 | 1 = 1): Trim {
  const n = Math.max(2, Math.round(steps));
  let a = Math.round(Math.min(1, Math.max(0, t[0])) * n);
  let b = Math.round(Math.min(1, Math.max(0, t[1])) * n);
  if (b - a < 1) {
    if (moved === 0) a = Math.max(0, b - 1);
    else b = Math.min(n, a + 1);
    if (b - a < 1) {
      a = n - 1;
      b = n;
    }
  }
  return [a / n, b / n];
}

export function getTrim(key: string | null): Trim {
  if (!key || typeof window === "undefined") return FULL;
  const t = load()[key];
  return Array.isArray(t) && t.length === 2 ? t : FULL;
}

export function setTrim(key: string | null, t: Trim): void {
  if (!key || typeof window === "undefined") return;
  const store = load();
  if (isFull(t)) delete store[key];
  else store[key] = [t[0], t[1]];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const keys = Object.keys(store);
      for (const k of keys.slice(0, Math.max(0, keys.length - 2000))) delete store[k];
      localStorage.setItem(STORE, JSON.stringify(store));
    } catch {
      // full storage: kept for this visit
    }
  }, 300);
}

// the part of a slice that plays: [start, end] in the song
export function trimmed(start: number, end: number, t: Trim): [number, number] {
  const len = end - start;
  return [start + t[0] * len, start + t[1] * len];
}

// how many 16ths of a beat grid a loop of `bars` bars has (the trim steps of a loop)
export function loopSteps(bars: number): number {
  return Math.min(64, Math.max(4, Math.round(bars * 16)));
}
