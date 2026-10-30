"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { dx7Lab, FM_PATCHES, STAB_RHYTHMS, type FmPatchId, type StabRhythm } from "@/lib/audio/dx7Lab";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh, JamSwap } from "./JamKit";
const C = "var(--jam-dx7)";
const pct = (v: number) => `${Math.round(v * 100)} %`;
export function Dx7LabPanel({ engine }: { engine: DJEngine }) {
  const m = dx7Lab(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  return (
    <JamShell title="DX7" tag="synthé FM sur les accords du morceau" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <p className="text-[11px] text-[var(--jam-text-2)]">Choisis ce que joue le DX7 : des stabs en rythme sur les accords du morceau, les accords tenus, ou la basse du morceau doublée. Les pads jouent les accords de la tonalité à la main, en rythme, tant que tu les tiens.</p>
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-4 gap-2 sm:grid-cols-7" />
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.5} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="BRILLANCE" value={m.bright} min={0} max={2} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.set("bright", v); bump(); }} />
        <Knob label="DURÉE" value={m.gate} min={0.1} max={1} defaultValue={0.5} color={C} size={46} led format={pct} onChange={(v) => { m.set("gate", v); bump(); }} />
        <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
      </div>
      <div className="flex flex-wrap gap-3">
        <JamSeg label="Joue" color={C} value={m.mode} options={[["off","Rien"],["stabs","Stabs"],["accords","Accords tenus"],["basse","Double la basse"]] as const} onChange={(v) => { m.set("mode", v); bump(); }} />
        <JamSeg label="Rythme des stabs" color={C} value={m.rhythm} options={(Object.keys(STAB_RHYTHMS) as StabRhythm[]).map((r) => [r, STAB_RHYTHMS[r].label] as const)} onChange={(v) => { m.set("rhythm", v); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-1","-1"],["0","0"],["1","+1"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-3)]">SON</label>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(FM_PATCHES) as FmPatchId[]).map((id) => (
            <button key={id} aria-pressed={m.patch === id} className="rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: m.patch === id ? `color-mix(in srgb, ${C} 35%, #111)` : "rgba(255,255,255,.06)", color: m.patch === id ? "#fff" : "var(--jam-text-2)", boxShadow: m.patch === id ? `inset 0 0 0 1px ${C}` : "none" }} onClick={() => { m.set("patch", id); bump(); }}>{FM_PATCHES[id].label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <JamSwap m={m} color={C} what="la partie" onChange={bump} />
        <span className="text-[10px] text-[var(--jam-text-3)]">REMPLACER : le DX7 prend la place du stem « autre », ou de la basse en mode Double la basse</span>
      </div>
    </JamShell>
  );
}
