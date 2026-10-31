"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Deck } from "@/lib/audio/Deck";
import { subscribeAutomation, getAutomationVersion } from "@/lib/audio/deckAutomation";
import { EQ_FREQS } from "@/lib/audio/Rack";
import { EQ_PRESETS, presetGains } from "@/lib/audio/eqPresets";
import { Fader } from "./Fader";
import { Knob } from "./Knob";
import { EqGraph } from "./EqGraph";
import { EqLabControls } from "./EqLabControls";
import { eqLabFor, linkedMove, measure, otherDeckOf } from "@/lib/audio/eqLab";
import { stemLabel } from "./RackGuideBlock";
import { DigitalVU } from "./EqVisuals";

// ---- persistent EQ presets (5 numbered slots, like a hardware EQ) ----
const EQ_LS_KEY = "djsynth.eqpresets.v1";
type EqPreset = { name?: string; g: number[] }; // g[0..14] = 15 band gains
const EQ_SLOTS = 5;
function loadEqPresets(): (EqPreset | null)[] {
  const empty: (EqPreset | null)[] = Array(EQ_SLOTS).fill(null);
  if (typeof window === "undefined") return empty;
  try {
    const arr = JSON.parse(localStorage.getItem(EQ_LS_KEY) || "[]");
    if (Array.isArray(arr)) for (let i = 0; i < EQ_SLOTS; i++) empty[i] = arr[i] ?? null;
  } catch { /* corrupt */ }
  return empty;
}
function saveEqPresets(arr: (EqPreset | null)[]) {
  try { localStorage.setItem(EQ_LS_KEY, JSON.stringify(arr)); } catch { /**/ }
}

// ---- LCD readout ----
function Lcd({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider"
      style={{
        color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`,
        minWidth: 110, letterSpacing: "0.12em", whiteSpace: "nowrap", overflow: "hidden",
        boxShadow: "inset 0 0 0 1px #1a2a1a",
      }}
    >{text}</span>
  );
}

// ---- on/off rocker bypass switch ----
function Toggle({ on, color, onClick }: { on: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative shrink-0 select-none"
      style={{ width: 20, height: 28, borderRadius: 4, padding: 2,
        background: "linear-gradient(180deg,#2a2a2a,#070707)",
        boxShadow: "inset 0 0 0 1px #000, 0 1px 2px rgba(0,0,0,.7)" }}
      title={on ? "ON — clic pour bypass" : "BYPASS — clic pour activer"}
    >
      <span className="absolute inset-[2px] flex flex-col items-center justify-between rounded-[3px] py-[3px]"
        style={{
          background: on
            ? "linear-gradient(180deg,#040404 0%,#141414 48%,#2e2e2e 100%)"
            : "linear-gradient(180deg,#2e2e2e 0%,#141414 52%,#040404 100%)",
          boxShadow: on
            ? "inset 0 3px 4px rgba(0,0,0,.85), inset 0 -1px 1px rgba(255,255,255,.10)"
            : "inset 0 -3px 4px rgba(0,0,0,.85), inset 0 1px 1px rgba(255,255,255,.10)",
        }}
      >
        <span style={{ width: 2, height: 7, borderRadius: 1, background: on ? color : "#5a5a5a", boxShadow: on ? `0 0 5px ${color}` : "none" }} />
        <span style={{ width: 7, height: 7, borderRadius: "50%", border: `1.5px solid ${on ? "#3a3a3a" : "#9a9a9a"}` }} />
      </span>
    </button>
  );
}

// ---- main exported component ----
export function EqRackStrip({ deck, color }: { deck: Deck; color: string }) {
  const rack = deck.rack;
  const [, force] = useState(0);
  useSyncExternalStore(subscribeAutomation, getAutomationVersion, getAutomationVersion); // redraw when a REC replay changes the deck
  const rerender = () => force((n) => n + 1);
  const [eqPresets, setEqPresets] = useState<(EqPreset | null)[]>(() => Array(EQ_SLOTS).fill(null));
  const [eqSaveMode, setEqSaveMode] = useState(false);
  const [eqActivePreset, setEqActivePreset] = useState<number | null>(null);
  const [lcd, setLcd] = useState<string | null>(null);
  const [ab, setAb] = useState<"A" | "B">("A");
  const [fadersOpen, setFadersOpen] = useState(false);
  const [curve, setCurve] = useState(-1); // -1 = the whole deck, i = stem i
  const [linked, setLinked] = useState<Set<number>>(() => new Set());
  const [linking, setLinking] = useState(false);
  const lab = eqLabFor(deck);
  const view = rack.eqView(curve);
  const other = otherDeckOf(deck);
  const lcdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abMem = useRef<{ A: number[] | null; B: number[] | null }>({ A: null, B: null });

  useEffect(() => {
    const t0 = setTimeout(() => {
      setEqPresets(loadEqPresets());
      try {
        const saved = localStorage.getItem("djsynth.eq.faders");
        if (saved) setFadersOpen(JSON.parse(saved));
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t0);
  }, []);

  useEffect(() => {
    const interval = setInterval(rerender, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => { if (lcdTimer.current) clearTimeout(lcdTimer.current); }, []);

  const flashLcd = (txt: string) => {
    setLcd(txt);
    if (lcdTimer.current) clearTimeout(lcdTimer.current);
    lcdTimer.current = setTimeout(() => setLcd(null), 1400);
  };

  const eqOn = rack.isOn("eq");

  const saveEqSlot = (n: number) => {
    const g = EQ_FREQS.map((_, i) => view.getGain(i));
    const next = eqPresets.slice(); next[n] = { g };
    setEqPresets(next); saveEqPresets(next);
    setEqSaveMode(false); setEqActivePreset(n);
    flashLcd(`EQ PRESET ${n + 1} SAVED`);
  };

  const recallEqSlot = (n: number) => {
    const p = eqPresets[n]; if (!p) return;
    EQ_FREQS.forEach((_, i) => view.setGain(i, p.g[i]));
    setEqActivePreset(n); flashLcd(`EQ PRESET ${n + 1}`); rerender();
  };

  const resetEq = () => {
    EQ_FREQS.forEach((_, i) => view.setGain(i, 0));
    setEqActivePreset(null); flashLcd("EQ RESET"); rerender();
  };

  const applyPreset = (preset: [number, number][]) => {
    const gains = presetGains(preset, EQ_FREQS);
    EQ_FREQS.forEach((_, i) => view.setGain(i, gains[i]));
    setEqActivePreset(null); rerender();
  };

  const toggleAb = () => {
    const currentGains = EQ_FREQS.map((_, i) => view.getGain(i));
    const currentQ = rack.getParam("eq", "q");
    abMem.current[ab] = [...currentGains, currentQ];
    const nextAb = ab === "A" ? "B" : "A";
    setAb(nextAb);
    const otherMem = abMem.current[nextAb];
    if (otherMem) {
      EQ_FREQS.forEach((_, i) => view.setGain(i, otherMem[i]));
      rack.setParam("eq", "q", otherMem[15]);
    }
    flashLcd(`COMPARAISON ${nextAb}`);
    rerender();
  };

  const toggleFaders = () => {
    const newState = !fadersOpen;
    setFadersOpen(newState);
    try { localStorage.setItem("djsynth.eq.faders", JSON.stringify(newState)); } catch { /* ignore */ }
  };

  const currentGains = EQ_FREQS.map((_, i) => view.getGain(i));
  const currentQ = rack.getParam("eq", "q");
  const currentMix = rack.getMix("eq");

  const isPresetActive = (preset: [number, number][]) => {
    const gains = presetGains(preset, EQ_FREQS);
    return gains.every((g, i) => Math.abs(g - currentGains[i]) < 0.5);
  };

  const freqLabels = EQ_FREQS.map(f => {
    if (f >= 1000) return `${f / 1000}k`;
    return f.toString();
  });

  return (
    <div
      className="hw-recess flex w-full flex-col gap-2 rounded p-3"
      style={{ opacity: eqOn ? 1 : 0.75 }}
    >
      {/* ── header row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={eqOn} color={color} onClick={() => { rack.setEnabled("eq", !eqOn); rerender(); }} />
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: eqOn ? color : "#6b6b6b" }}>
          Égaliseur 15 bandes
        </span>
        <span className="text-[8px] text-neutral-500">2/3 d&apos;octave</span>

        {/* live digital VU bar (input level to the EQ) */}
        <div className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-1">
          <span className="text-[7px] uppercase text-neutral-600">IN</span>
          <DigitalVU level={deck.getLevel()} />
        </div>

        {/* LCD readout */}
        <Lcd text={lcd ?? (eqOn ? "EQ ACTIF" : "EQ BYPASS")} color={color} />

        {/* A/B button */}
        <button
          onClick={toggleAb}
          className={`hw-btn px-1.5 py-0.5 text-[8px] font-black ${ab === "A" ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          title="Comparaison A/B"
        >{ab}</button>

        {/* AUTO GAIN button */}
        <button
          onClick={() => { rack.setFlag("eq", "auto", !rack.getFlag("eq", "auto")); rerender(); }}
          className={`hw-btn px-1.5 py-0.5 text-[8px] font-black ${rack.getFlag("eq", "auto") ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          title="Compense automatiquement le niveau quand tu renforces ou creuses beaucoup"
        >AUTO GAIN</button>

        {/* FLAT button */}
        <button
          onClick={resetEq}
          className="hw-btn px-1.5 py-0.5 text-[8px] font-black"
          style={{ ["--led" as string]: "#6b6b6b", color: "#9b9b9b" }}
          title="Remet toutes les bandes à 0 dB"
        >FLAT</button>
      </div>

      {/* ── response graph ── */}
      <EqGraph
        eq={view}
        color={color}
        sampleRate={deck.ctx.sampleRate}
        active={() => deck.playing}
        onEdit={(i, db, finished) => {
          if (linked.has(i)) lab.apply(curve, linkedMove(lab.read(curve), i, db, linked));
          else view.setGain(i, db);
          setEqActivePreset(null);
          if (finished) flashLcd(`EQ ${freqLabels[i]} ${db > 0 ? "+" : ""}${db.toFixed(1)} dB`);
          rerender();
        }}
      />

      {/* ── which curve: the whole deck or one stem (each stem keeps its own EQ) ── */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Sur quoi</span>
        {[-1, ...deck.stemNames.map((_, i) => i)].map((c) => (
          <button
            key={c}
            aria-pressed={curve === c}
            onClick={() => { setCurve(c); flashLcd(c < 0 ? "EQ TOUT LE MORCEAU" : `EQ ${stemLabel(deck.stemNames[c]).toUpperCase()}`); }}
            className="rounded px-2 py-1 text-[10px] font-bold"
            style={curve === c ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            title={c < 0 ? "La courbe de tout le deck" : "La courbe de ce stem seul : chaque stem garde la sienne"}
          >
            {c < 0 ? "Tout le morceau" : stemLabel(deck.stemNames[c])}
            {c >= 0 && rack.stemEqUsed(c) && <span className="ml-1" aria-hidden>·</span>}
          </button>
        ))}
        {curve >= 0 && !deck.stemsActive && <span className="text-[10px] text-amber-300">Active les stems pour entendre cette courbe.</span>}
        {deck.stemNames.length === 0 && <span className="text-[10px] text-neutral-400">Prépare les stems pour une courbe par stem.</span>}
        <button
          onClick={() => { setLinking((v) => !v); flashLcd(linking ? "LIEN FINI" : "CLIQUE LES BANDES À LIER"); }}
          className="ml-auto rounded px-2 py-1 text-[10px] font-bold"
          style={linking || linked.size > 1 ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          title="Lie plusieurs bandes : en bouger une bouge les autres du même nombre de dB. Clique LIER puis les noms des bandes sous les faders"
        >
          LIER{linked.size > 1 ? ` (${linked.size})` : ""}
        </button>
        {linked.size > 0 && (
          <button onClick={() => setLinked(new Set())} className="rounded px-2 py-1 text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}>
            DÉLIER
          </button>
        )}
      </div>

      <EqLabControls
        lab={lab}
        curve={curve}
        otherView={other && other.name ? other.rack.eqView(-1) : null}
        prepared={!!deck.fxMap}
        spectra={async (cs) => {
          // the prepared spectra of the whole song when every one asked for exists, else 1.5 s of listening for all (same scale)
          const prep = (c: number | "other") => {
            const d = c === "other" ? other : deck;
            const n = c === "other" || c < 0 ? "mix" : deck.stemNames[c];
            return d?.fxMap?.spectra[n] ?? null;
          };
          const ready = cs.map(prep);
          if (ready.every((x) => x)) return ready as number[][];
          return Promise.all(cs.map((c) => measure(c === "other" ? other!.rack.eqView(-1) : rack.eqView(c), deck.ctx.sampleRate, 1500)));
        }}
        stemNames={deck.stemNames}
        color={color}
        flashLcd={flashLcd}
        onChanged={rerender}
      />

      {/* ── factory presets ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [contain:inline-size]">
        {EQ_PRESETS.map((preset) => {
          const g = presetGains(preset.pts, EQ_FREQS);
          return (
            <button
              key={preset.id}
              onClick={() => { applyPreset(preset.pts); flashLcd(`PRESET ${preset.name}`); }}
              className={`hw-btn flex w-16 flex-col items-center justify-center gap-0.5 p-1 ${isPresetActive(preset.pts) ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, height: 44 }}
              title={preset.title}
            >
              <svg viewBox="0 0 56 20" width={56} height={20}>
                <path
                  d={g.map((v, k) => {
                    const x = 2 + k * (52 / 14);
                    const y = 10 - (v / 18) * 8;
                    return `${k === 0 ? "M" : "L"} ${x} ${y}`;
                  }).join(" ")}
                  stroke={color}
                  strokeWidth={1.5}
                  fill="none"
                />
                <line x1={0} y1={10} x2={56} y2={10} stroke="#ffffff22" strokeWidth={0.5} />
              </svg>
              <span className="text-[10px] font-bold">{preset.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── settings ── */}
      <div className="flex flex-wrap items-end gap-3">
        <Knob
          label="Largeur"
          value={currentQ}
          min={0}
          max={1}
          defaultValue={0.62}
          onChange={(v) => { rack.setParam("eq", "q", v); rerender(); }}
          color={color}
          size={48}
          led
          format={(v) => `${((2 / Math.LN2) * Math.asinh(1 / (2 * 0.7 * Math.pow(6, v)))).toFixed(2)} oct`}
        />
        <Knob
          label="Mix"
          value={currentMix}
          min={0}
          max={1}
          defaultValue={1}
          onChange={(v) => { rack.setMix("eq", v); rerender(); }}
          color={color}
          size={48}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />

        {/* preset shortcuts 1-5 + SAVE */}
        <div className="ml-auto flex items-center gap-1">
          {eqPresets.map((p, n) => {
            const filled = !!p;
            const active = eqActivePreset === n;
            return (
              <button key={n}
                onClick={() => (eqSaveMode ? saveEqSlot(n) : recallEqSlot(n))}
                disabled={!eqSaveMode && !filled}
                title={eqSaveMode ? `Enregistrer dans ${n + 1}` : filled ? `Rappeler preset ${n + 1}` : "Vide"}
                className="hw-btn flex h-6 w-6 items-center justify-center text-[10px] font-black"
                style={{
                  ["--led" as string]: color,
                  color: filled ? color : "#5b5b5b",
                  outline: active ? `1px solid ${color}` : undefined,
                  boxShadow: filled ? `0 0 5px ${color}55` : undefined,
                  opacity: !eqSaveMode && !filled ? 0.45 : 1,
                }}
              >{n + 1}</button>
            );
          })}
          <button
            onClick={() => setEqSaveMode((s) => !s)}
            className="hw-btn px-1.5 py-0.5 text-[8px] font-black"
            title="Mode sauvegarde preset"
            style={eqSaveMode
              ? { ["--led" as string]: "#ff5252", color: "#ff5252", boxShadow: "0 0 6px #ff525288" }
              : { ["--led" as string]: color, color }}
          >{eqSaveMode ? "CHOISIR…" : "SAVE"}</button>
        </div>
      </div>

      {/* ── compact faders ── */}
      <div className="flex flex-col gap-1">
        <button
          onClick={toggleFaders}
          className="hw-btn w-full text-[9px] font-bold"
          style={{ ["--led" as string]: color }}
        >
          FADERS {fadersOpen ? "▴" : "▾"}
        </button>

        {(fadersOpen || linking) && (
          <div className="flex gap-1 overflow-x-auto [contain:inline-size]">
            {EQ_FREQS.map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="font-mono text-[10px]" style={{ color }}>
                  {currentGains[i] > 0 ? "+" : ""}{currentGains[i].toFixed(1)} dB
                </span>
                <Fader
                  value={currentGains[i]}
                  min={-18}
                  max={18}
                  step={0.1}
                  vertical
                  onChange={(v) => {
                    if (linked.has(i)) lab.apply(curve, linkedMove(lab.read(curve), i, v, linked));
                    else view.setGain(i, v);
                    flashLcd(`EQ ${freqLabels[i]} ${v > 0 ? "+" : ""}${v.toFixed(1)} dB`);
                    rerender();
                  }}
                  className="!h-[90px]"
                />
                <button
                  type="button"
                  aria-pressed={linked.has(i)}
                  disabled={!linking}
                  onClick={() => setLinked((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                  className="rounded px-0.5 text-[8px] font-bold uppercase"
                  style={linked.has(i) ? { background: color, color: "#0a0a0a" } : { color: eqOn ? color : "#6b6b6b" }}
                  title={linking ? "Clique pour lier ou délier cette bande" : "Clique LIER pour lier des bandes"}
                >
                  {freqLabels[i]}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
