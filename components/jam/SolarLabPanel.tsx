"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { solarLab, type DroneWave } from "@/lib/audio/solarLab";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh, JamSwap } from "./JamKit";
const C = "var(--jam-solar)";
const pct = (v: number) => `${Math.round(v * 100)} %`;
const NAMES = ["Do","Do#","Ré","Ré#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];
export function SolarLabPanel({ engine }: { engine: DJEngine }) {
  const m = solarLab(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  return (
    <JamShell title="Solar 42F" tag="nappe dans la tonalité du morceau" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <p className="text-[11px] text-[var(--jam-text-2)]">Appuie sur JOUE : une nappe tenue dans la tonalité du morceau, qui change d&apos;accord avec lui et s&apos;efface quand la voix chante. GEL fige quelques secondes d&apos;un stem en nappe ; MONTÉE et DROP préparent les retours.</p>
      {m.playing && <p aria-live="polite" className="text-[11px] font-bold" style={{ color: C }}>Joue : {m.drone.notes.map((n: number) => NAMES[((n % 12) + 12) % 12]).join(" · ")}</p>}
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-3 gap-2 sm:grid-cols-5" />
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="NAPPE" value={m.level} min={0} max={1.4} defaultValue={0.8} color={C} size={46} led format={pct} onChange={(v) => { m.set("level", v); bump(); }} />
        <Knob label="OUVERTURE" value={m.open} min={0} max={1} defaultValue={0.45} color={C} size={46} led format={pct} onChange={(v) => { m.set("open", v); bump(); }} />
        <Knob label="ESPACE" value={m.space} min={0} max={1} defaultValue={0.6} color={C} size={46} led format={pct} onChange={(v) => { m.set("space", v); bump(); }} />
        <Knob label="MOUVEMENT" value={m.motion} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("motion", v); bump(); }} />
        <Knob label="BRILLANCE" value={m.shine} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("shine", v); bump(); }} />
        <Knob label="SOUS LA VOIX" value={m.duck} min={0} max={1} defaultValue={0.5} color={C} size={46} led format={pct} onChange={(v) => { m.set("duck", v); bump(); }} />
        <Knob label="LARGEUR" value={m.spread} min={0} max={40} defaultValue={12} color={C} size={46} led format={(v) => `${Math.round(v)} ct`} onChange={(v) => { m.set("spread", v); bump(); }} />
      </div>
      <div className="flex flex-wrap gap-3">
        <JamSeg label="Suit" color={C} value={m.follow} options={[["accords","Les accords"],["tonique","La tonique"]] as const} onChange={(v) => { m.set("follow", v); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-1","-1"],["0","0"],["1","+1"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
        <JamSeg label="Son" color={C} value={m.wave} options={[["pur","Pur"],["chaud","Chaud"],["riche","Riche"]] as const} onChange={(v: DroneWave) => { m.set("wave", v); bump(); }} />
        <JamSeg label="Mouvement" color={C} value={String(m.motionDiv)} options={[["1","1 temps"],["2","2 temps"],["4","1 mesure"],["8","2 mesures"]] as const} onChange={(v) => { m.set("motionDiv", Number(v)); m.set("motion", m.motion); bump(); }} />
        <JamSeg label="GEL de" color={C} value={m.gelSource} options={[["vocals","Voix"],["other","Autre"],["mix","Mix"]] as const} onChange={(v) => { m.set("gelSource", v); bump(); }} />
        <JamSeg label="Montée" color={C} value={String(m.riserBars)} options={[["4","4 mesures"],["8","8 mesures"]] as const} onChange={(v) => { m.set("riserBars", v === "4" ? 4 : 8); bump(); }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <JamSwap m={m} color={C} what="les nappes" onChange={bump} />
        <span className="text-[10px] text-[var(--jam-text-3)]">REMPLACER : la nappe prend la place du stem « autre »</span>
      </div>
    </JamShell>
  );
}
