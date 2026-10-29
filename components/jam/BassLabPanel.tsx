"use client";
import { useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type BassLine } from "@/lib/audio/jamModules";
import { Knob } from "../Knob";
import { JamPad, JamSeg, JamShell, useJamRefresh } from "./JamKit";

const C = "#a78bfa";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// BASS LAB: a sub that doubles the song's own bass notes, sidechain on its kicks, wobble, drop and bass swap
export function BassLabPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).bass;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [wobble, setWobble] = useState(0);
  const [div, setDiv] = useState(0.25);
  const [held, setHeld] = useState<Record<string, boolean>>({});
  const hold = (k: string, on: boolean, act: (on: boolean) => void) => { setHeld((h) => ({ ...h, [k]: on })); act(on); };
  const applyWobble = (v: number, d: number) => m.fx("wobble", v > 0.02, d, v);

  return (
    <JamShell title="Bass Lab" tag="sur le stem basse" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="SUB" value={m.subLevel} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSub(v); bump(); }} />
        <Knob label="LIGNE" value={m.lineLevel} min={0} max={1.2} defaultValue={0.8} color={C} size={46} led format={pct} onChange={(v) => { m.setLineLevel(v); bump(); }} />
        <Knob label="DRIVE" value={m.drive} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setDrive(v); bump(); }} />
        <Knob label="TONE" value={m.tone} min={-1} max={1} defaultValue={0} color={C} size={46} led format={(v) => (v < -0.05 ? "LP" : v > 0.05 ? "HP" : "—")} onChange={(v) => { m.setTone(v); bump(); }} />
        <Knob label="WOBBLE" value={wobble} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { setWobble(v); applyWobble(v, div); }} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Wobble" color={C} value={String(div)} options={[["0.5", "1/2"], ["0.25", "1/4"], ["0.125", "1/8"], ["0.0625", "1/16"]] as const} onChange={(v) => { const d = Number(v); setDiv(d); applyWobble(wobble, d); }} />
        <JamSeg label="Ligne de basse" color={C} value={m.line} options={[["off", "Off"], ["root", "Racine"], ["offbeat", "Contretemps"], ["octaves", "Octaves"], ["bounce", "Rebond"]] as const} onChange={(v: BassLine) => { m.set("line", v); bump(); }} />
        <JamSeg label="Sub" color={C} value={String(m.subOctave)} options={[["-12", "octave -1"], ["0", "unisson"]] as const} onChange={(v) => { m.set("subOctave", v === "0" ? 0 : -12); bump(); }} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <JamPad label="PUMP" sub="sur les kicks" color={C} mode="toggle" active={m.pump} onChange={(on) => { m.set("pump", on); bump(); }} />
        <JamPad label="SWAP" sub="basse coupée" color={C} mode="toggle" active={m.muted} onChange={() => { m.toggleMute(); bump(); }} />
        <JamPad label="DROP" sub="plongée" color={C} mode="hold" active={!!held.drop} onChange={(on) => hold("drop", on, (o) => m.drop(o))} />
        <JamPad label="ROLL" sub="1/8" color={C} mode="hold" active={!!held.r8} onChange={(on) => hold("r8", on, (o) => m.fx("roll", o, 0.125, 1))} />
        <JamPad label="ROLL" sub="1/16" color={C} mode="hold" active={!!held.r16} onChange={(on) => hold("r16", on, (o) => m.fx("roll", o, 0.0625, 1))} />
        <JamPad label="WOB MAX" sub="1/8" color={C} mode="hold" active={!!held.wob} onChange={(on) => hold("wob", on, (o) => (o ? m.fx("wobble", true, 0.125, 1) : applyWobble(wobble, div)))} />
      </div>
      <p className="text-[10px] text-neutral-500">SUB double les vraies notes de basse du morceau. LIGNE joue une basse tirée de ses accords : avec SWAP, elle remplace la basse d&apos;origine. PUMP fait respirer la basse sur chaque kick.</p>
    </JamShell>
  );
}
