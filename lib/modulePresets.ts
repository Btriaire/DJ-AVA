// Presets of one rack module (on/off, mix, every parameter, every flag), saved by module and reusable by the rhythm links.
import type { Rack, RackModuleId } from "./audio/Rack";
import { RACK_DEF } from "./audio/Rack";
import type { DJEngine } from "./audio/engine";
import type { DjSynthState } from "./audio/DjSynth";

export interface ModulePreset { on: boolean; mix: number; params: Record<string, number>; flags: Record<string, boolean>; extra?: unknown }
// besides the rack modules, two engine-wide modules have presets
export const GLOBAL_MODULES = [{ id: "djsynth", label: "Synthé DJ" }, { id: "supersampler", label: "Super-Sampler" }] as const;
export type PresetModuleId = RackModuleId | (typeof GLOBAL_MODULES)[number]["id"];
type Store = Partial<Record<string, Record<string, ModulePreset>>>;

const KEY = "djsynth.modpresets.v1";

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function listModulePresets(id: string): string[] { return Object.keys(read()[id] ?? {}); }
export function getModulePreset(id: string, name: string): ModulePreset | undefined { return read()[id]?.[name]; }

export function saveModulePreset(id: PresetModuleId, name: string, p: ModulePreset) {
  const s = read();
  s[id] = { ...s[id], [name]: p };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export function deleteModulePreset(id: PresetModuleId, name: string) {
  const s = read();
  if (!s[id]) return;
  delete s[id][name];
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export function snapshotModule(rack: Rack, id: RackModuleId): ModulePreset {
  const def = RACK_DEF.get(id);
  return {
    on: rack.isOn(id),
    mix: rack.getMix(id),
    params: Object.fromEntries((def?.params ?? []).map((p) => [p.key, rack.getParam(id, p.key)])),
    flags: Object.fromEntries((def?.flags ?? []).map((f) => [f.key, rack.getFlag(id, f.key)])),
  };
}

const glides = new Map<Rack, Map<string, number>>();

// the module goes to the preset; with `ms` the numbers glide there (a jump of a delay time or a cutoff clicks)
export function applyModule(rack: Rack, id: RackModuleId, p: ModulePreset, ms = 0) {
  const gens = glides.get(rack) ?? new Map<string, number>();
  glides.set(rack, gens);
  const gen = (gens.get(id) ?? 0) + 1;
  gens.set(id, gen);
  for (const [k, v] of Object.entries(p.flags)) rack.setFlag(id, k, v);
  if (p.on) rack.setEnabled(id, true);
  const from = snapshotModule(rack, id);
  const set = (x: number) => {
    for (const [k, v] of Object.entries(p.params)) rack.setParam(id, k, (from.params[k] ?? v) + (v - (from.params[k] ?? v)) * x);
    rack.setMix(id, from.mix + (p.mix - from.mix) * x);
  };
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) setTimeout(() => { if (gens.get(id) === gen) set(i / steps); }, i * 16);
  setTimeout(() => {
    if (gens.get(id) !== gen) return;
    set(1);
    if (!p.on) rack.setEnabled(id, false);
  }, steps * 16);
}

// ---- the engine-wide modules, and one entry point for every module ----
const SS_SKIP = new Set(["start", "end"]); // the region belongs to the loaded sample
const SS_STEPPED = new Set(["rootNote", "filterType", "delayDiv"]);

function glideNums(owner: object, id: string, from: Record<string, number>, to: Record<string, number>, ms: number, set: (k: string, v: number) => void) {
  const gens = glides.get(owner as Rack) ?? new Map<string, number>();
  glides.set(owner as Rack, gens);
  const gen = (gens.get(id) ?? 0) + 1;
  gens.set(id, gen);
  const put = (x: number) => { for (const [k, v] of Object.entries(to)) set(k, (from[k] ?? v) + (v - (from[k] ?? v)) * x); };
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) setTimeout(() => { if (gens.get(id) === gen) put(i / steps); }, i * 16);
  setTimeout(() => { if (gens.get(id) === gen) put(1); }, steps * 16);
}

export function snapshotAny(eng: DJEngine, rack: Rack, id: PresetModuleId): ModulePreset {
  if (id === "djsynth") {
    const st = eng.djSynth.exportState();
    return { on: true, mix: 1, params: { ...st.knobs }, flags: {}, extra: st };
  }
  if (id === "supersampler") {
    const params: Record<string, number> = {};
    const flags: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(eng.superSampler.getParams())) {
      if (SS_SKIP.has(k)) continue;
      if (typeof v === "boolean") flags[k] = v; else if (typeof v === "number") params[k] = v;
    }
    return { on: true, mix: 1, params, flags };
  }
  return snapshotModule(rack, id);
}

export function applyAny(eng: DJEngine, rack: Rack, id: PresetModuleId, p: ModulePreset, ms = 0) {
  if (id === "djsynth") {
    const st = p.extra as DjSynthState | undefined;
    if (st) eng.djSynth.importState({ ...st, knobs: undefined });
    const knobs = eng.djSynth.knobs as unknown as Record<string, number>;
    glideNums(eng.djSynth, id, { ...knobs }, p.params, ms, (k, v) => eng.djSynth.setKnob(k as keyof DjSynthState["knobs"], v));
  } else if (id === "supersampler") {
    const ss = eng.superSampler;
    const set = ss.setParam.bind(ss) as (k: string, v: number | boolean) => void;
    for (const [k, v] of Object.entries(p.flags)) set(k, v);
    const cur = ss.getParams() as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(p.params)) if (SS_STEPPED.has(k)) set(k, v);
    glideNums(ss, id, cur, Object.fromEntries(Object.entries(p.params).filter(([k]) => !SS_STEPPED.has(k))), ms, set);
  } else applyModule(rack, id, p, ms);
}
