"use client";
import { useEffect, useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { DjConsole, XF_CURVES, djConsole } from "@/lib/audio/djConsole";
import { Knob } from "./Knob";

// the club mixer around the crossfader: headphones (CUE), crossfader curve, microphone, set history
export function ConsolePanel({ engine }: { engine: DJEngine }) {
  const c = djConsole(engine);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [outs, setOuts] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    void DjConsole.outputs().then(setOuts);
    const t = setInterval(bump, 300); // talkover light and history count
    return () => clearInterval(t);
  }, []);
  const on = { background: "var(--console-on)", color: "#0a0a0a" };
  const off = { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" };
  const btn = "rounded px-2 py-1 text-[10px] font-bold";
  const label = "text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400";
  const exportHistory = () => {
    const blob = new Blob([`DJSynth — set du ${new Date().toLocaleString("fr-FR")}\n\n${c.historyText()}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `set-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="hw-recess flex w-full flex-col gap-2 p-2" style={{ ["--console-on" as string]: "oklch(0.82 0.12 230)" }}>
      <span className={label} title="Écoute un deck au casque avant de le lancer dans la salle">Casque</span>
      <div className="flex flex-wrap items-center gap-1">
        {(["A", "B"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={c.cue[s]} className={btn} style={c.cue[s] ? on : off} onClick={() => { c.setCue(s, !c.cue[s]); bump(); }} title={`Le deck ${s} dans le casque, avant son fader`}>
            CUE {s}
          </button>
        ))}
        <button type="button" aria-pressed={c.split} className={btn} style={c.split ? on : off} onClick={() => { c.setSplit(!c.split); bump(); }} title="Oreille gauche : le CUE · oreille droite : la salle">
          SPLIT
        </button>
      </div>
      <select
        aria-label="Sortie du casque"
        className="w-full rounded bg-neutral-900 px-1 py-1 text-[10px] text-neutral-200"
        value={c.device}
        onFocus={() => void DjConsole.outputs().then(setOuts)}
        onChange={(e) => { void c.setDevice(e.target.value).then(bump); }}
      >
        <option value="">Casque : choisir la sortie…</option>
        {outs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <div className="flex justify-around">
        <Knob label="CUE · SALLE" value={c.cueMix} min={0} max={1} defaultValue={0.3} size={40} color="oklch(0.82 0.12 230)" led format={(v) => (v < 0.05 ? "CUE" : v > 0.95 ? "SALLE" : `${Math.round(v * 100)} %`)} onChange={(v) => { c.setCueMix(v); bump(); }} />
        <Knob label="VOL. CASQUE" value={c.cueLevel} min={0} max={1.5} defaultValue={0.8} size={40} color="oklch(0.82 0.12 230)" led format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => { c.setCueLevel(v); bump(); }} />
      </div>

      <span className={label}>Courbe du crossfader</span>
      <div className="flex flex-wrap gap-1">
        {XF_CURVES.map(([id, name, title]) => (
          <button key={id} type="button" aria-pressed={engine.xfCurve === id} className={btn} style={engine.xfCurve === id ? on : off} onClick={() => { engine.setXfCurve(id); bump(); }} title={title}>
            {name}
          </button>
        ))}
      </div>

      <span className={label}>Micro</span>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={c.micOn} className={btn} style={c.micOn ? on : off} onClick={() => { void c.setMic(!c.micOn).then(bump); }} title="Ton micro dans la salle">
          MICRO
        </button>
        <button type="button" aria-pressed={c.talkover} className={btn} style={c.talkover ? on : off} onClick={() => { c.setTalkover(!c.talkover); bump(); }} title="La musique baisse de 10 dB quand tu parles, et revient quand tu te tais">
          TALKOVER
        </button>
        {c.talking && <span className="text-[10px] font-bold" style={{ color: "oklch(0.82 0.12 230)" }}>tu parles</span>}
      </div>
      {c.micOn && <Knob label="VOL. MICRO" value={c.micLevel} min={0} max={2} defaultValue={0.9} size={40} color="oklch(0.82 0.12 230)" led format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => { c.setMicLevel(v); bump(); }} />}
      {c.micError && <span className="text-[10px] text-amber-300">{c.micError}</span>}

      <span className={label}>Historique du set</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-neutral-300">{c.history.length} morceau{c.history.length > 1 ? "x" : ""} joué{c.history.length > 1 ? "s" : ""}</span>
        <button type="button" disabled={!c.history.length} className={`${btn} ml-auto disabled:opacity-40`} style={off} onClick={exportHistory} title="Télécharge la liste des morceaux joués, avec l'heure, le deck et le tempo">
          EXPORTER
        </button>
      </div>
    </div>
  );
}
