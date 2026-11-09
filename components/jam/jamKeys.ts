// The computer keyboard plays the stem modules: one row of keys per module, by physical position (works on AZERTY too):
// 1-6 Bass Lab, Q-row Vox FX (with Shift: the vocal chops), A-row the Synth chords, Z-row Beat Lab fills.
// K L ; ' O P [ ] / . : Voix du morceau (syllabes, bégaiement, écho de fin)
// pavé numérique : Batterie du morceau (7 8 9 / 4 5 6 / 1 2 3 / 0 .)
import { useEffect, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type PadDef } from "@/lib/audio/jamModules";
import { drumLab } from "@/lib/audio/drumLab";
import { voiceChop } from "@/lib/audio/voiceChop";
import { bassSlicer, otherSlicer } from "@/lib/audio/stemSlicer";

export const KEY_ROWS = {
  bass: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"],
  vox: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"],
  synth: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"],
  beat: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma"],
  drum: ["Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "Backquote", "Backslash"],
  bassSlice: ["maj Digit1", "maj Digit2", "maj Digit3", "maj Digit4", "maj Digit5", "maj Digit6", "maj Digit7", "maj Digit8", "maj Digit9", "maj Digit0"],
  otherSlice: ["maj KeyA", "maj KeyS", "maj KeyD", "maj KeyF", "maj KeyG", "maj KeyH", "maj KeyJ", "maj KeyK", "maj KeyL", "maj Semicolon"],
  drumFx: ["maj KeyZ", "maj KeyX", "maj KeyC"], // Demi-tempo, Frein, Éparpille (pads 9 to 11 of the drums)
  voiceFx: ["maj KeyV"], // Inverse (pad 11 of the voice chops)
  voiceChop: ["KeyK", "KeyL", "Semicolon", "Quote", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Slash", "Period"],
};

// the character printed on the key in the user's layout, when the browser can tell (Chromium), else QWERTY
let layout: Map<string, string> | null = null;
type KeyboardWithLayout = { getLayoutMap?: () => Promise<Map<string, string>> };
if (typeof navigator !== "undefined") {
  (navigator as unknown as { keyboard?: KeyboardWithLayout }).keyboard?.getLayoutMap?.().then((m) => { layout = m; }).catch(() => {});
}
export function keyLabel(code: string): string {
  if (code.startsWith("Numpad")) {
    if (code === "NumpadDecimal") return "N.";
    return "N" + code.slice(6);
  }
  if (code.startsWith("maj ")) return `maj ${keyLabel(code.slice(4))}`; // the chops: Shift + the Vox row
  if (code.startsWith("Digit")) return code.slice(5); // the number row reads as digits, whatever symbol the layout prints first
  const k = layout?.get(code);
  if (k) return k.toUpperCase();
  if (!k) return { Minus: "-", Equal: "=", Backquote: "`", Backslash: "\\", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Slash: "/", Period: "." }[code] ?? code.replace(/^Key|^Digit/, "").replace("Comma", ",");
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
      const at = (row: string[], mod: { press: (id: string, on: boolean, list?: PadDef[]) => void }, list: PadDef[]) => {
        const i = row.indexOf(code);
        return i >= 0 && list[i] ? { press: mod.press.bind(mod), id: list[i].id, list } : null;
      };
      if (shift) {
        const sl = (rows: string[], mod: { press: (id: string, on: boolean, list?: PadDef[]) => void }, list: PadDef[]) => { const i = rows.indexOf(`maj ${code}`); return i >= 0 && list[i] ? { press: mod.press.bind(mod), id: list[i].id, list } : null; };
        return at(KEY_ROWS.vox, m.vox, m.vox.chopPads()) ?? sl(KEY_ROWS.bassSlice, bassSlicer(engine), bassSlicer(engine).pads()) ?? sl(KEY_ROWS.otherSlice, otherSlicer(engine), otherSlicer(engine).pads()) ?? sl(KEY_ROWS.drumFx, drumLab(engine), drumLab(engine).pads().slice(8)) ?? sl(KEY_ROWS.voiceFx, voiceChop(engine), voiceChop(engine).pads().slice(10));
      }
      if (KEY_ROWS.drum.includes(code)) return at(KEY_ROWS.drum, drumLab(engine), drumLab(engine).pads());
      if (KEY_ROWS.voiceChop.includes(code)) return at(KEY_ROWS.voiceChop, voiceChop(engine), voiceChop(engine).pads());
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
