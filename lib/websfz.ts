export interface SfzRegion {
  sample: string;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  center: number;
  volume: number;
  tune: number;
  seqLength: number;
  seqPosition: number;
  release: number | null;
  offset: number;
  path: string;
}

// global, then group, then region opcodes (later wins), read into one region each
export function parseWebSfz(json: unknown): { name: string; baseUrl: string; regions: SfzRegion[] } {
    const result = { name: "", baseUrl: "", regions: [] as SfzRegion[] };
    if (typeof json !== "object" || json === null) return result;
    const { meta, global, groups } = json as { meta?: { name?: string; baseUrl?: string }, global?: Record<string, unknown>, groups?: { regions?: Record<string, unknown>[], [opcode: string]: unknown }[] };
    if (typeof meta?.name === "string") result.name = meta.name;
    if (typeof meta?.baseUrl === "string") result.baseUrl = meta.baseUrl;
    if (!Array.isArray(groups)) return result;
    const num = (v: unknown): number | undefined => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && !isNaN(Number(v)) && Number.isFinite(Number(v))) return Number(v);
        return undefined;
    };
    for (const group of groups) {
        if (typeof group !== "object" || group === null) continue;
        const { regions: groupRegions, ...groupWithoutRegions } = group;
        if (!Array.isArray(groupRegions)) continue;
        for (const region of groupRegions) {
            if (typeof region !== "object" || region === null) continue;
            const o = { ...global, ...groupWithoutRegions, ...region };
            if (typeof o.sample !== "string") continue;
            if (o.trigger === "release") continue; // release-trigger samples (damper noise) are not played
            if (Object.keys(o).some((k) => /^locc\d+$/.test(k) && (num(o[k as keyof typeof o]) ?? 0) > 0)) continue; // needs a pedal or controller we do not send
            const key = num(o.key);
            const lokey = num(o.lokey) ?? key ?? 0;
            const hikey = num(o.hikey) ?? key ?? 127;
            const lovel = num(o.lovel) ?? 0;
            const hivel = num(o.hivel) ?? 127;
            const center = num(o.pitch_keycenter) ?? key ?? num(o.lokey) ?? 60;
            const volume = (num(o.volume) ?? 0) + (num(o.group_volume) ?? 0);
            const tune = (num(o.tune) ?? 0) + 100 * (num(o.transpose) ?? 0);
            const seqLength = num(o.seq_length) ?? 1;
            const seqPosition = num(o.seq_position) ?? 1;
            const release = num(o.ampeg_release) ?? null;
            const offset = num(o.offset) ?? 0;
            const path = typeof o.default_path === "string" ? o.default_path : "";
            result.regions.push({ sample: o.sample, lokey, hikey, lovel, hivel, center, volume, tune, seqLength, seqPosition, release, offset, path });
        }
    }
    return result;
}

// each path segment encoded on its own: "#" in note names (A#3) and "," in folder names must not end the URL
export function sampleUrl(baseUrl: string, r: SfzRegion, ext = "ogg"): string {
  const base = baseUrl.replace(/\/+$/, "");
  const rel = `${r.path}${r.sample}.${ext}`.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${/%[0-9A-Fa-f]{2}/.test(base) ? base : encodeURI(base)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

// 0 inside [lo, hi], else how far x is from the range
function dist(lo: number, hi: number, x: number): number {
  return x < lo ? lo - x : x > hi ? x - hi : 0;
}

// the regions of `list` whose range is nearest to x (0 = inside)
function nearest(list: SfzRegion[], range: (r: SfzRegion) => [number, number], x: number): SfzRegion[] {
  let best = Infinity, out: SfzRegion[] = [];
  for (const r of list) {
    const d = dist(...range(r), x);
    if (d < best) { best = d; out = [r]; } else if (d === best) out.push(r);
  }
  return out;
}

const keys = (r: SfzRegion): [number, number] => [r.lokey, r.hikey];
const vels = (r: SfzRegion): [number, number] => [r.lovel, r.hivel];

// the sample to play: exact key and velocity, else the nearest key in this velocity layer, else the nearest layer;
// round robin among equal candidates (two hits of the same drum never sound quite the same)
export function pickRegion(regions: SfzRegion[], midi: number, vel: number, rr: number): SfzRegion | null {
  vel = Math.max(1, Math.min(127, vel));
  let c = regions.filter((r) => dist(r.lokey, r.hikey, midi) === 0 && dist(r.lovel, r.hivel, vel) === 0);
  if (!c.length) {
    const layer = regions.filter((r) => dist(r.lovel, r.hivel, vel) === 0);
    c = layer.length ? nearest(layer, keys, midi) : nearest(nearest(regions, keys, midi), vels, vel);
  }
  if (!c.length) return null;
  const n = c[0].seqLength;
  return (n > 1 && c.find((r) => r.seqPosition === (rr % n) + 1)) || c[0];
}

export function regionRate(r: SfzRegion, midi: number): number {
  return 2 ** ((midi - r.center + r.tune / 100) / 12);
}

export { selfTest } from "./websfzTest";
