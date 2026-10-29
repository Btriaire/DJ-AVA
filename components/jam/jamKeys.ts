// The computer keyboard plays the stem modules: one row of keys per module, by physical position (works on AZERTY too):
// 1-6 Bass Lab, Q-row Vox FX (with Shift: the vocal chops), A-row the Synth chords, Z-row Beat Lab fills.
import { useEffect, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type PadDef } from "@/lib/audio/jamModules";

export const KEY_ROWS = {
  bass: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"],
  vox: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"],
  synth: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"],
  beat: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma"],
};

// the character printed on the key in the user's layout, when the browser can tell (Chromium), else QWERTY
let layout: Map<string, string> | null = null;
type KeyboardWithLayout = { getLayoutMap?: () => Promise<Map<string, string>> };
if (typeof navigator !== "undefined") {
  (navigator as unknown as { keyboard?: KeyboardWithLayout }).keyboard?.getLayoutMap?.().then((m) => { layout = m; }).catch(() => {});
}
export function keyLabel(code: string): string {
  if (code.startsWith("maj ")) return `maj ${keyLabel(code.slice(4))}`; // the chops: Shift + the Vox row
  if (code.startsWith("Digit")) return code.slice(5); // the number row reads as digits, whatever symbol the layout prints first
  const k = layout?.get(code);
  if (k) return k.toUpperCase();
  return code.replace(/^Key|^Digit/, "").replace("Comma", ",");
}

const STORE = "djsynth.jamkeys.v1";
export function useJamKeysEnabled(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(STORE) !== "0"; } catch { return true; } });
  return [on, (v) => { setOn(v); try { localStorage.setItem(STORE, v ? "1" : "0"); } catch { /* the choice lasts the session */ } }];
}

export function useJamKeys(engine: DJEngine, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const m = jamModules(engine);
    const held = new Map<string, { press: (id: string, on: boolean, list?: PadDef[]) => void; id: string; list: PadDef[] }>();
    const find = (code: string, shift: boolean) => {
      const at = (row: string[], mod: typeof m.bass | typeof m.vox | typeof m.synth | typeof m.beat, list: PadDef[]) => {
        const i = row.indexOf(code);
        return i >= 0 && list[i] ? { press: mod.press.bind(mod), id: list[i].id, list } : null;
      };
      if (shift) return at(KEY_ROWS.vox, m.vox, m.vox.chopPads());
      return at(KEY_ROWS.bass, m.bass, m.bass.pads()) ?? at(KEY_ROWS.vox, m.vox, m.vox.pads()) ?? at(KEY_ROWS.synth, m.synth, m.synth.pads()) ?? at(KEY_ROWS.beat, m.beat, m.beat.pads());
    };
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || held.has(e.code)) return;
      const hit = find(e.code, e.shiftKey);
      if (!hit) return;
      e.preventDefault();
      held.set(e.code, hit);
      hit.press(hit.id, true, hit.list);
    };
    const up = (e: KeyboardEvent) => {
      const hit = held.get(e.code);
      if (!hit) return;
      held.delete(e.code);
      hit.press(hit.id, false, hit.list);
    };
    // leaving the window releases every held pad (a key let go elsewhere would stay stuck)
    const blur = () => { held.forEach((h) => h.press(h.id, false, h.list)); held.clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { blur(); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [engine, enabled]);
}
