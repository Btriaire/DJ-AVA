// Every setting and preset of the app (the "djsynth." keys of the browser storage) in one file, to keep or move to another machine.
interface Store { length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface SettingsFile { app: "djsynth"; version: 1; savedAt: string; items: Record<string, string> }

const PREFIX = "djsynth.";
const MAX_BYTES = 8 * 1024 * 1024;

export function collectSettings(s: Store): SettingsFile {
  const items: Record<string, string> = {};
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PREFIX)) items[k] = s.getItem(k) ?? "";
  }
  return { app: "djsynth", version: 1, savedAt: new Date().toISOString(), items };
}

// a file from outside: only our keys, only strings, bounded size; returns how many settings were written or an error
export function restoreSettings(s: Store, text: string): { count: number } | { error: string } {
  if (text.length > MAX_BYTES) return { error: "Fichier trop gros pour des réglages." };
  let f: unknown;
  try { f = JSON.parse(text); } catch { return { error: "Ce fichier n'est pas un export de réglages DJSynth." }; }
  const o = f as Partial<SettingsFile>;
  if (o?.app !== "djsynth" || o.version !== 1 || typeof o.items !== "object" || !o.items) return { error: "Ce fichier n'est pas un export de réglages DJSynth." };
  let count = 0;
  for (const [k, v] of Object.entries(o.items)) {
    if (!k.startsWith(PREFIX) || typeof v !== "string") continue;
    s.setItem(k, v);
    count++;
  }
  return { count };
}

export function settingsBackupTest(): void {
  const mem = new Map<string, string>([["djsynth.a", "1"], ["other", "x"]]);
  const store: Store = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const f = collectSettings(store);
  if (Object.keys(f.items).join() !== "djsynth.a") throw new Error("backup collect");
  const r = restoreSettings(store, JSON.stringify({ ...f, items: { "djsynth.b": "2", evil: "3", "djsynth.c": 4 } }));
  if (!("count" in r) || r.count !== 1 || mem.get("djsynth.b") !== "2" || mem.has("evil")) throw new Error("backup restore");
  if (!("error" in restoreSettings(store, "{}"))) throw new Error("backup reject");
}
