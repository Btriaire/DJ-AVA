"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules } from "@/lib/audio/jamModules";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";

const C = "#f472b6";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// VOX FX: throws held on the vocal stem, space, radio filter, and a sung harmony a third above, in key
export function VoxFxPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).vox;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell title="Vox FX" tag="sur le stem voix" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="VOIX" value={m.level} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="ESPACE" value={m.space} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSpace(v); bump(); }} />
        <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
        <Knob label="RADIO" value={m.radio} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setRadio(v); bump(); }} />
      </div>
      <JamSeg label="Harmonie" color={C} value={String(m.harmonyUp)} options={[["2", "Tierce"], ["4", "Quinte"]] as const} onChange={(v) => { m.set("harmonyUp", v === "4" ? 4 : 2); bump(); }} />
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-4 gap-2 sm:grid-cols-8" keys={KEY_ROWS.vox} />
      {/* CHOPS: the bars just sung become 8 slices to replay in time (Shift + the same keys) */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-black/25 p-2">
        <button type="button" onClick={() => m.capture()} className="h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em]" style={{ background: `color-mix(in srgb, ${C} 30%, #111)`, color: "#fff", boxShadow: `inset 0 0 0 1px ${C}` }} title="Prend les dernières mesures de la voix et les découpe en 8 morceaux">
          CAPTURER LA VOIX
        </button>
        <JamSeg label="Longueur" color={C} value={String(m.chopBeats)} options={[["2", "2 temps"], ["4", "1 mesure"], ["8", "2 mesures"]] as const} onChange={(v) => { m.set("chopBeats", v === "2" ? 2 : v === "8" ? 8 : 4); bump(); }} />
        <span className="text-[10px] text-neutral-500">{m.chop ? `Phrase de ${m.chop.beats} temps prise à ${Math.floor(m.chop.start / 60)}:${String(Math.floor(m.chop.start % 60)).padStart(2, "0")}` : "Aucune phrase capturée"}</span>
      </div>
      <JamPads m={m} list={m.chopPads()} color={C} className="grid grid-cols-8 gap-1.5" keys={KEY_ROWS.vox.map((k) => `maj ${k}`)} />
      <p className="text-[10px] text-neutral-500">Maintiens un jet : il part en rythme et s&apos;arrête au relâché. CAPTURER prend les dernières mesures chantées : rejoue-les en morceaux, toujours en rythme. HARMONIE chante une tierce ou une quinte au-dessus de la voix, dans la tonalité.</p>
    </JamShell>
  );
}
