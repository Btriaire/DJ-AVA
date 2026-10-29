"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type ArpShape, type SynthMode } from "@/lib/audio/jamModules";
import { degreeNames } from "@/lib/audio/stemJam";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";

const C = "#38bdf8";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// SYNTH: an in-key synth on the "other" stem: arpeggio, offbeat stabs or pads on the song's chords, or the 7 chord pads
export function HarmoSynthPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).synth;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const names = degreeNames(m.deck());

  return (
    <JamShell title="Synth" tag="dans la tonalité · stem autre" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Jeu" color={C} value={m.mode} options={[["off", "Off"], ["arp", "Arpège"], ["stab", "Stabs"], ["pad", "Nappe"]] as const} onChange={(v: SynthMode) => { m.set("mode", v); bump(); }} />
        <JamSeg label="Forme" color={C} value={m.shape} options={[["up", "Montant"], ["down", "Descendant"], ["updown", "Aller-retour"], ["random", "Hasard"], ["gate", "Gate trance"]] as const} onChange={(v: ArpShape) => { m.set("shape", v); bump(); }} />
        <JamSeg label="Pas" color={C} value={String(m.rate)} options={[["0.5", "1/8"], ["0.25", "1/16"]] as const} onChange={(v) => { m.set("rate", v === "0.5" ? 0.5 : 0.25); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-1", "-1"], ["0", "0"], ["1", "+1"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
      </div>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.5} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="TIMBRE" value={m.tone} min={0} max={1} defaultValue={0.55} color={C} size={46} led format={pct} onChange={(v) => { m.setTone(v); bump(); }} />
        <Knob label="ORIGINAL" value={m.otherLevel} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setOtherLevel(v); bump(); }} />
      </div>
      <JamPads m={m} list={m.pads(names)} color={C} className="grid grid-cols-7 gap-1.5" keys={KEY_ROWS.synth} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { m.loopButton(); bump(); }}
          aria-pressed={m.loopState !== "off"}
          className="rounded-md px-3 py-1.5 text-[11px] font-black tracking-[0.15em]"
          style={m.loopState === "off" ? { background: "rgba(255,255,255,.06)", color: "#d4d4d8" } : { background: m.loopState === "play" ? "color-mix(in srgb, #38bdf8 35%, #111)" : "color-mix(in srgb, #f43f5e 35%, #111)", color: "#fff", boxShadow: `inset 0 0 0 1px ${m.loopState === "play" ? C : "#f43f5e"}` }}
          title="Enregistre les accords joués pendant 4 mesures, puis les rejoue en boucle"
        >
          {m.loopState === "off" ? "BOUCLE D'ACCORDS" : m.loopState === "armed" ? "PRÊT · MESURE SUIVANTE" : m.loopState === "rec" ? "ENREGISTRE" : "BOUCLE · ARRÊTER"}
        </button>
        {/* the 4 bars of the loop: recorded chord, and the bar playing now */}
        <span className="flex gap-1">
          {m.loop.map((deg, b) => (
            <span key={b} className="flex h-6 w-9 items-center justify-center rounded font-mono text-[10px] font-bold" style={{ background: m.loopBar() === b ? "color-mix(in srgb, #38bdf8 40%, #111)" : "rgba(255,255,255,.05)", color: deg >= 0 ? "#e5e5e5" : "#525252" }}>
              {deg >= 0 ? names[deg] : "·"}
            </span>
          ))}
        </span>
      </div>
      <p className="text-[10px] text-neutral-500">Les accords de la tonalité du morceau : impossible de jouer faux. Sans accord tenu, le synthé suit les accords du morceau.</p>
    </JamShell>
  );
}
