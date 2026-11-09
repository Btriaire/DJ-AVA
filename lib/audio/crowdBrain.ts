export function nextRise(peakStarts: number[], cheers: number[], pos: number): number | null {
    const allRises = [...peakStarts, ...cheers].filter(t => t > pos);
    return allRises.length > 0 ? Math.min(...allRises) : null;
}

export class Fatigue {
    private fatigueMap: Map<string, { n: number; t: number }>;

    constructor() {
        this.fatigueMap = new Map();
    }

    hit(kind: string, now: number): void {
        const entry = this.fatigueMap.get(kind) || { n: 0, t: now };
        const dt = Math.max(0, now - entry.t);
        const decay = Math.exp(-Math.LN2 * dt / 20);
        entry.n = entry.n * decay + 1;
        entry.t = now;
        this.fatigueMap.set(kind, entry);
    }

    gain(kind: string, now: number): number {
        const entry = this.fatigueMap.get(kind);
        if (!entry) return 1;
        const dt = Math.max(0, now - entry.t);
        const decay = Math.exp(-Math.LN2 * dt / 20);
        const n = entry.n * decay;
        return 1 / (1 + 0.35 * n);
    }
}

export function talkDuck(talking: boolean): number {
    return talking ? 0.35 : 1;
}

export function buildGain(secondsToPeak: number, lead: number): number {
    if (lead <= 0 || secondsToPeak > lead) return 0;
    const gain = 0.15 + 0.85 * (1 - secondsToPeak / lead);
    return Math.max(0, Math.min(1, gain));
}

// Fonction pour choisir un indice différent de last
export function variedIndex(n: number, last: number, r: number): number {
  if (n <= 1) return 0;
  const max = n - 1;
  let index = Math.floor(r * n);
  if (index >= n) index = max;
  if (index === last) index = (index + 1) % n;
  return index;
}

// Fonction pour ajuster la vitesse de lecture et le gain
export function jitter(r: number): { rate: number; gain: number } {
  const rate = 0.92 + 0.16 * r;
  const gain = 0.8 + 0.4 * r;
  return { rate, gain };
}

// Fonction pour ajuster le niveau de la foule
export function crowdGain(k: number): number {
  k = Math.min(Math.max(k, 0), 1);
  return k === 0 ? 0 : 0.95 * Math.pow(k, 0.6);
}

// Fonction pour ajuster le niveau du lit de foule
export function bedFloor(e: number): number {
  e = Math.min(Math.max(e, 0), 1);
  return 0.45 + 0.55 * e;
}
