// Presets of one rack module (on/off, mix, every parameter, every flag), saved by module and reusable by the rhythm links.
import type { Rack, RackModuleId } from "./audio/Rack";
import { RACK_DEF } from "./audio/Rack";

export interface ModulePreset { on: boolean; mix: number; params: Record<string, number>; flags: Record<string, boolean> }
type Store = Partial<Record<RackModuleId, Record<string, ModulePreset>>>;

const KEY = "djsynth.modpresets.v1";

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function listModulePresets(id: string): string[] { return Object.keys(read()[id as RackModuleId] ?? {}); }
export function getModulePreset(id: string, name: string): ModulePreset | undefined { return read()[id as RackModuleId]?.[name]; }

export function saveModulePreset(id: RackModuleId, name: string, p: ModulePreset) {
  const s = read();
  s[id] = { ...s[id], [name]: p };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export function deleteModulePreset(id: RackModuleId, name: string) {
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
