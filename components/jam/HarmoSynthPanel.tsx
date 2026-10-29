"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type ArpShape, type SynthMode } from "@/lib/audio/jamModules";
import { degreeNames, type ChordColor } from "@/lib/audio/stemJam";
import type { SynthPatch } from "@/lib/audio/jamVoices";
import type { ProgressionName } from "@/lib/audio/jamProgressions";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";
import { ChordStrip } from "./ChordStrip";

const C = "var(--jam-synth)";
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function HarmoSynthPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).synth;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const names = degreeNames(m.deck());

  return (
    <JamShell title="Synth" tag="dans la tonalité · stem autre" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <ChordStrip data={() => m.chordView()} color="oklch(0.80 0.12 180)" />
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Jeu" color={C} value={m.mode} options={[["off","Off"],["arp","Arpège"],["stab","Stabs"],["pad","Nappe"]] as const} onChange={(v: SynthMode) => { m.set("mode", v); bump(); }} />
        <JamSeg label="Son" color={C} value={m.patch} options={[["pluck","Pluck"],["supersaw","Supersaw"],["organ","Orgue"],["keys","Keys"],["brass","Cuivres"]] as const} onChange={(v: SynthPatch) => { m.setPatch(v); bump(); }} />
        <JamSeg label="Couleur" color={C} value={m.color} options={[["triad","Triade"],["seventh","7e"],["ninth","9e"]] as const} onChange={(v: ChordColor) => { m.set("color", v); bump(); }} />
        <JamSeg label="Forme" color={C} value={m.shape} options={[["up","Montant"],["down","Descendant"],["updown","Aller-retour"],["converge","Convergent"],["pinky","Pinky"],["random","Hasard"],["gate","Gate trance"]] as const} onChange={(v: ArpShape) => { m.set("shape", v); bump(); }} />
        <JamSeg label="Étendue" color={C} value={String(m.arpOctaves)} options={[["1","1 octave"],["2","2 octaves"]] as const} onChange={(v) => { m.set("arpOctaves", v === "2" ? 2 : 1); bump(); }} />
        <JamSeg label="Pas" color={C} value={String(m.rate)} options={[["0.5","1/8"],["0.25","1/16"]] as const} onChange={(v) => { m.set("rate", v === "0.5" ? 0.5 : 0.25); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-1","-1"],["0","0"],["1","+1"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
        <JamSeg label="Pompe" color={C} value={m.pumpOn ? "on" : "off"} options={[["off","Off"],["on","Sur les kicks"]] as const} onChange={(v) => { m.set("pumpOn", v === "on"); bump(); }} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap justify-around gap-2">
          <p className="w-full text-center text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">SON</p>
          <Knob label="NIVEAU" value={m.level} min={0} max={1.5} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
          <Knob label="TIMBRE" value={m.tone} min={0} max={1} defaultValue={0.55} color={C} size={46} led format={pct} onChange={(v) => { m.setTone(v); bump(); }} />
          <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
          <Knob label="BALAYAGE" value={m.sweepDepth} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSweep(v); bump(); }} />
        </div>
        <div className="flex flex-wrap justify-around gap-2">
          <p className="w-full text-center text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">JEU</p>
          <Knob label="GATE" value={m.gateLen} min={0.2} max={1} defaultValue={0.9} color={C} size={46} led format={pct} onChange={(v) => { m.set("gateLen", v); bump(); }} />
          <Knob label="ORIGINAL" value={m.otherLevel} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setOtherLevel(v); bump(); }} />
          <JamSeg label="Balayage" color={C} value={String(m.sweepDiv)} options={[["0.5","1/2 t"],["1","1 temps"],["2","2 temps"],["4","1 mesure"]] as const} onChange={(v) => { m.setSweep(m.sweepDepth, Number(v)); bump(); }} />
        </div>
      </div>
      <JamPads m={m} list={m.pads(names)} color={C} className="grid grid-cols-7 gap-1.5" keys={KEY_ROWS.synth} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { m.loopButton(); bump(); }} aria-pressed={m.loopState !== "off"} className="rounded-md px-3 py-1.5 text-[11px] font-black tracking-[0.15em]" style={m.loopState === "off" ? { background: "rgba(255,255,255,.06)", color: "var(--jam-text-2)" } : { background: m.loopState === "play" ? "color-mix(in srgb, var(--jam-synth) 35%, #111)" : "color-mix(in srgb, #f43f5e 35%, #111)", color: "#fff", boxShadow: `inset 0 0 0 1px ${m.loopState === "play" ? C : "#f43f5e"}` }}>
          {m.loopState === "off" ? "BOUCLE D'ACCORDS" : m.loopState === "armed" ? "PRÊT · MESURE SUIVANTE" : m.loopState === "rec" ? "ENREGISTRE" : "BOUCLE · ARRÊTER"}
        </button>
        <span className="flex gap-1">{m.loop.map((deg, b) => <span key={b} className="flex h-6 w-9 items-center justify-center rounded font-mono text-[10px] font-bold" style={{ background: m.loopBar() === b ? "color-mix(in srgb, var(--jam-synth) 40%, #111)" : "rgba(255,255,255,.05)", color: deg >= 0 ? "var(--jam-text)" : "var(--jam-text-3)" }}>{deg >= 0 ? names[deg] : "·"}</span>)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <p className="w-full text-center text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">PROGRESSIONS</p>
        {(["pop","dark","house","jazz","epic","dream"] as ProgressionName[]).map(id => <button key={id} type="button" onClick={() => { m.loadProgression(id); bump(); }} className="rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: "color-mix(in srgb, var(--jam-synth) 18%, transparent)", color: "var(--jam-text)" }}>{["Pop","Sombre","House","Jazz","Épique","Rêve"][["pop","dark","house","jazz","epic","dream"].indexOf(id)]}</button>)}
      </div>
      <p className="text-[10px] text-[var(--jam-text-3)]">Les accords de la tonalité du morceau : impossible de jouer faux. Sans accord tenu, le synthé suit les accords du morceau, chaque accord placé au plus près du précédent. 7e et 9e ajoutent de la couleur, ÉCHO une répétition à la croche pointée.</p>
    </JamShell>
  );
}
