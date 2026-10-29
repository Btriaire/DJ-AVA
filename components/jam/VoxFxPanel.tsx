"use client";
import { useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules } from "@/lib/audio/jamModules";
import type { FxName } from "@/lib/audio/fxTypes";
import { Knob } from "../Knob";
import { JamPad, JamSeg, JamShell, useJamRefresh } from "./JamKit";

const C = "#f472b6";
const pct = (v: number) => `${Math.round(v * 100)} %`;
// beat-synced throws: [key, label, sub, effect, beat division, wet]
const THROWS: [string, string, string, FxName, number | undefined, number][] = [
  ["echo", "ÉCHO", "1/4", "echo", 0.25, 1],
  ["dub", "DUB", "1/2", "dub", 0.5, 1],
  ["freeze", "FREEZE", "figé", "freeze", undefined, 0.9],
  ["gate", "GATE", "1/16", "gate", 0.0625, 1],
  ["vowel", "VOYELLE", "wah", "vowel", undefined, 0.9],
  ["reverse", "REVERSE", "1 temps", "reverse", 1, 1],
];

// VOX FX: throws held on the vocal stem, space, radio filter, and a sung harmony a third above, in key
export function VoxFxPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).vox;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [held, setHeld] = useState<Record<string, boolean>>({});
  const [double, setDouble] = useState(false);

  return (
    <JamShell title="Vox FX" tag="sur le stem voix" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="VOIX" value={m.level} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="ESPACE" value={m.space} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSpace(v); bump(); }} />
        <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
        <Knob label="RADIO" value={m.radio} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setRadio(v); bump(); }} />
      </div>
      <JamSeg label="Harmonie" color={C} value={String(m.harmonyUp)} options={[["2", "Tierce"], ["4", "Quinte"]] as const} onChange={(v) => { m.set("harmonyUp", v === "4" ? 4 : 2); bump(); }} />
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {THROWS.map(([k, label, sub, fx, div, wet]) => (
          <JamPad key={k} label={label} sub={sub} color={C} mode="hold" active={!!held[k]} onChange={(on) => { setHeld((h) => ({ ...h, [k]: on })); m.fx(fx, on, div, wet); }} />
        ))}
        <JamPad label="DOUBLE" sub="voix large" color={C} mode="toggle" active={double} onChange={(on) => { setDouble(on); m.fx("double", on, undefined, 0.7); }} />
        <JamPad label="HARMONIE" sub={m.harmonyUp === 4 ? "quinte" : "tierce"} color={C} mode="toggle" active={m.harmony} onChange={(on) => { m.set("harmony", on); bump(); }} />
      </div>
      <p className="text-[10px] text-neutral-500">Maintiens un jet : il part en rythme et s&apos;arrête au relâché. HARMONIE chante une tierce ou une quinte au-dessus de la voix, dans la tonalité.</p>
    </JamShell>
  );
}
