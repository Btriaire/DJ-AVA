"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type BassLine } from "@/lib/audio/jamModules";
import type { BassCharacter } from "@/lib/audio/jamVoices";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { NoteLane } from "./NoteLane";
import { KEY_ROWS } from "./jamKeys";
import { JamSlots } from "./JamSlots";

const C = "var(--jam-bass)";
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function BassLabPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).bass;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell title="Bass Lab" tag="sur le stem basse" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><NoteLane data={() => m.laneData()} color="oklch(0.74 0.15 300)" accent="oklch(0.88 0.12 85)" label="Notes de basse autour de la tête de lecture" /></div>
        <JamSlots m={m} color={C} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Caractère" color={C} value={m.character} options={[["acid","Acid"],["reese","Reese"],["808","808"],["funk","Funk"],["moog","Moog"]]} onChange={(v: BassCharacter) => { m.setCharacter(v); bump(); }} />
        <JamSeg label="Wobble" color={C} value={String(m.wobbleDiv)} options={[["0.5", "1/2"], ["0.25", "1/4"], ["0.125", "1/8"], ["0.0625", "1/16"]] as const} onChange={(v) => { m.setWobble(m.wobble, Number(v)); bump(); }} />
        <JamSeg label="Ligne de basse" color={C} value={m.line} options={[["off", "Off"], ["follow", "Reprise"], ["root", "Racine"], ["offbeat", "Contretemps"], ["octaves", "Octaves"], ["bounce", "Rebond"], ["gallop", "Galop"], ["acid", "Acid"]] as const} onChange={(v: BassLine) => { m.set("line", v); bump(); }} />
        <JamSeg label="Relance" color={C} value={String(m.fillEvery)} options={[["0","Off"],["4","Toutes les 4 mes."],["8","Toutes les 8 mes."]]} onChange={(v) => { m.set("fillEvery", v === "4" ? 4 : v === "8" ? 8 : 0); bump(); }} />
        <JamSeg label="Sub" color={C} value={String(m.subOctave)} options={[["-12", "octave -1"], ["0", "unisson"]] as const} onChange={(v) => { m.set("subOctave", v === "0" ? 0 : -12); bump(); }} />
      </div>
      <div className="mt-4">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">LIGNE</div>
        <div className="flex flex-wrap gap-3 mt-2">
          <Knob label="LIGNE" value={m.lineLevel} min={0} max={1.2} defaultValue={0.8} color={C} size={42} led format={pct} onChange={(v) => { m.setLineLevel(v); bump(); }} />
          <Knob label="TIMBRE" value={m.lineTone} min={0} max={1} defaultValue={0.3} color={C} size={42} led format={pct} onChange={(v) => { m.setLineTone(v); bump(); }} />
          <Knob label="ENV" value={m.lineEnv} min={0} max={1} defaultValue={0.5} color={C} size={42} led format={pct} onChange={(v) => { m.setLineEnv(v); bump(); }} />
        </div>
      </div>
      <div className="mt-4">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">STEM</div>
        <div className="flex flex-wrap gap-3 mt-2">
          <Knob label="SUB" value={m.subLevel} min={0} max={1} defaultValue={0} color={C} size={42} led format={pct} onChange={(v) => { m.setSub(v); bump(); }} />
          <Knob label="DRIVE" value={m.drive} min={0} max={1} defaultValue={0} color={C} size={42} led format={pct} onChange={(v) => { m.setDrive(v); bump(); }} />
          <Knob label="TONE" value={m.tone} min={-1} max={1} defaultValue={0} color={C} size={42} led format={(v) => (v < -0.05 ? "LP" : v > 0.05 ? "HP" : "—")} onChange={(v) => { m.setTone(v); bump(); }} />
          <Knob label="WOBBLE" value={m.wobble} min={0} max={1} defaultValue={0} color={C} size={42} led format={pct} onChange={(v) => { m.setWobble(v); bump(); }} />
          <Knob label="POMPE" value={m.pumpDepth} min={0.2} max={0.97} defaultValue={0.8} color={C} size={42} led format={pct} onChange={(v) => { m.set("pumpDepth", v); bump(); }} />
        </div>
      </div>
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-3 gap-2 sm:grid-cols-6" keys={KEY_ROWS.bass} />
      <p className="text-[10px] text-[var(--jam-text-3)]">SUB double les vraies notes de basse du morceau. REPRISE rejoue sa partie de basse sur le synthé de basse ; les autres lignes sont tirées de ses accords (Acid glisse et accentue comme une 303). Avec SWAP, la ligne remplace la basse d&apos;origine. PUMP fait respirer la basse sur chaque kick. RELANCE joue un petit motif sur le dernier temps de la 4e ou 8e mesure. SCÈNES garde tout le module en un clic.</p>
    </JamShell>
  );
}
