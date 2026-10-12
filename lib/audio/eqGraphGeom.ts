export const PAD = { l: 32, r: 8, t: 8, b: 18 };

export interface Geom {
  W: number; H: number; plotW: number; plotH: number;
  xOf(f: number): number;
  yOf(db: number): number;
  fOf(x: number): number;
  dbOf(y: number): number;
}

export function makeGeom(W: number, H: number): Geom {
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const log1000 = Math.log(1000);

  return {
    W, H, plotW, plotH,
    xOf: (f: number) => PAD.l + plotW * Math.log(f / 20) / log1000,
    yOf: (db: number) => PAD.t + plotH * (1 - (db + 18) / 36),
    fOf: (x: number) => 20 * Math.exp(log1000 * (x - PAD.l) / plotW),
    dbOf: (y: number) => 18 - 36 * (y - PAD.t) / plotH,
  };
}

export function clampDb(v: number): number {
  const clamped = Math.max(-18, Math.min(18, v));
  return Math.round(clamped * 10) / 10;
}

export function fmtFreq(f: number): string {
  if (f >= 10000) return `${Math.round(f / 1000)} kHz`;
  if (f >= 1000) return `${(f / 1000).toFixed(1).replace(/\.?0+$/, '')} kHz`;
  return `${Math.round(f)} Hz`;
}

export function nodeHue(i: number, n: number): number {
  return Math.round((i / (n - 1)) * 280);
}

export function nearestNode(g: Geom, freqs: number[], gains: number[], x: number, y: number, maxDist: number): number | null {
  let nearest: number | null = null;
  let minDist = maxDist;

  for (let i = 0; i < freqs.length; i++) {
    const dx = x - g.xOf(freqs[i]);
    const dy = y - g.yOf(gains[i]);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }

  return nearest;
}

export function smoothDeltas(i: number, delta: number, n: number): { k: number; d: number }[] {
  const result: { k: number; d: number }[] = [];

  for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) {
    if (k !== i) {
      result.push({ k, d: delta * 0.5 ** Math.abs(k - i) });
    }
  }

  return result;
}

export function traceValues(g: Geom, freqs: number[], x0: number, y0: number, x1: number, y1: number): { k: number; db: number }[] {
  const result: { k: number; db: number }[] = [];
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);

  for (let k = 0; k < freqs.length; k++) {
    const x = g.xOf(freqs[k]);
    if (x >= xMin && x <= xMax) {
      const t = x0 === x1 ? 1 : (x - x0) / (x1 - x0);
      const y = y0 + t * (y1 - y0);
      result.push({ k, db: clampDb(g.dbOf(y)) });
    }
  }

  return result;
}
