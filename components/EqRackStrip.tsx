"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { RACK_MODULES, EQ_FREQS } from "@/lib/audio/Rack";
import { Fader } from "./Fader";
import { levelColor, DigitalVU } from "./EqVisuals";

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

// ---- real-time EQ response graph + spectrum behind it ----
const EQ_AX_LO = 20, EQ_AX_HI = 20000, EQ_RANGE = 18;

function EqGraph({ deck, color }: { deck: Deck; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const xAtF = (f: number, w: number) => (w * Math.log(f / EQ_AX_LO)) / Math.log(EQ_AX_HI / EQ_AX_LO);
  const yAtDb = (db: number, h: number) => (h * (1 - db / EQ_RANGE)) / 2;
  const eqDef = RACK_MODULES.find((m) => m.id === "eq")!;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    const rack = deck.rack;
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const bins = rack.spectrumBins;
      if (!buf.current || buf.current.length !== bins) buf.current = new Uint8Array(bins);
      rack.getSpectrum(buf.current);
      ctx.clearRect(0, 0, w, h);
      // spectrum bars
      const barW = 3;
      for (let x = 0; x < w; x += barW) {
        const f = EQ_AX_LO * Math.pow(EQ_AX_HI / EQ_AX_LO, x / w);
        const bin = Math.min(bins - 1, Math.max(0, Math.round((f / 22050) * bins)));
        const t = buf.current[bin] / 255;
        if (t <= 0.01) continue;
        ctx.fillStyle = levelColor(t);
        ctx.globalAlpha = 0.42;
        ctx.fillRect(x, h - t * h, barW - 1, t * h);
      }
      ctx.globalAlpha = 1;
      // grid
      ctx.strokeStyle = "#ffffff14"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      [100, 1000, 10000].forEach((f) => {
        const x = xAtF(f, w);
        ctx.beginPath(); ctx.strokeStyle = "#ffffff10";
        ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      });
      // EQ response curve
      const gains = eqDef.params.map((p) => rack.getParam("eq", p.key));
      const resp = (f: number) => {
        let db = 0;
        for (let i = 0; i < EQ_FREQS.length; i++) {
          const oct = Math.log2(f / EQ_FREQS[i]);
          db += gains[i] / (1 + Math.pow(oct * 1.4, 2));
        }
        return db;
      };
      ctx.beginPath();
      for (let px = 0; px <= w; px++) {
        const f = EQ_AX_LO * Math.pow(EQ_AX_HI / EQ_AX_LO, px / w);
        const db = Math.max(-EQ_RANGE, Math.min(EQ_RANGE, resp(f)));
        const y = yAtDb(db, h);
        if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  return (
    <canvas ref={ref} width={520} height={88}
      className="h-[88px] w-full rounded bg-neutral-950 ring-1 ring-neutral-800"
      title="Spectre en temps réel + courbe de réponse EQ 15 bandes"
    />
  );
}

// ---- main exported component ----
export function EqRackStrip({ deck, color }: { deck: Deck; color: string }) {
  const rack = deck.rack;
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [eqPresets, setEqPresets] = useState<(EqPreset | null)[]>(() => Array(EQ_SLOTS).fill(null));
  const [eqSaveMode, setEqSaveMode] = useState(false);
  const [eqActivePreset, setEqActivePreset] = useState<number | null>(null);
  const [lcd, setLcd] = useState<string | null>(null);
  const lcdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setEqPresets(loadEqPresets()); }, []);
  useEffect(() => () => { if (lcdTimer.current) clearTimeout(lcdTimer.current); }, []);

  const flashLcd = (txt: string) => {
    setLcd(txt);
    if (lcdTimer.current) clearTimeout(lcdTimer.current);
    lcdTimer.current = setTimeout(() => setLcd(null), 1400);
  };

  const eqOn = rack.isOn("eq");
  const eqDef = RACK_MODULES.find((m) => m.id === "eq")!;

  const saveEqSlot = (n: number) => {
    const g = eqDef.params.map((p) => rack.getParam("eq", p.key));
    const next = eqPresets.slice(); next[n] = { g };
    setEqPresets(next); saveEqPresets(next);
    setEqSaveMode(false); setEqActivePreset(n);
    flashLcd(`EQ PRESET ${n + 1} SAVED`);
  };
  const recallEqSlot = (n: number) => {
    const p = eqPresets[n]; if (!p) return;
    eqDef.params.forEach((def, i) => {
      if (typeof p.g[i] === "number") rack.setParam("eq", def.key, p.g[i]);
    });
    setEqActivePreset(n); flashLcd(`EQ PRESET ${n + 1}`); rerender();
  };
  const resetEq = () => {
    eqDef.params.forEach((p) => rack.setParam("eq", p.key, 0));
    setEqActivePreset(null); flashLcd("EQ RESET"); rerender();
  };

  const eqMix = rack.getMix("eq");
  // rows: MIX fader + 15 band faders
  const rows: { key: string; label: string; min: number; max: number; step: number; value: number; disp: string; set: (v: number) => void }[] = [
    {
      key: "mix", label: "MIX", min: 0, max: 1, step: 0.01, value: eqMix,
      disp: `${Math.round(eqMix * 100)}%`,
      set: (v) => { rack.setMix("eq", v); flashLcd(`EQ MIX ${Math.round(v * 100)}%`); rerender(); },
    },
    ...eqDef.params.map((p) => {
      const val = rack.getParam("eq", p.key);
      return {
        key: p.key, label: p.label, min: p.min, max: p.max, step: (p.max - p.min) / 240,
        value: val, disp: `${val > 0 ? "+" : ""}${Math.round(val)}`,
        set: (v: number) => { rack.setParam("eq", p.key, v); flashLcd(`EQ ${p.label} ${v > 0 ? "+" : ""}${Math.round(v)}dB`); rerender(); },
      };
    }),
  ];

  return (
    <div
      className="hw-recess flex w-full flex-col gap-2 rounded p-3"
      style={{ opacity: eqOn ? 1 : 0.75 }}
    >
      {/* ── header row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={eqOn} color={color} onClick={() => { rack.setEnabled("eq", !eqOn); rerender(); }} />
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: eqOn ? color : "#6b6b6b" }}>
          Égaliseur
        </span>
        <span className="text-[8px] text-neutral-500">15 bandes · 2/3 oct</span>

        {/* live digital VU bar (input level to the EQ) */}
        <div className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-1">
          <span className="text-[7px] uppercase text-neutral-600">IN</span>
          <DigitalVU level={deck.getLevel()} />
        </div>

        {/* LCD readout */}
        <Lcd text={lcd ?? (eqOn ? "EQ ACTIF" : "EQ BYPASS")} color={color} />

        {/* preset shortcuts 1-5 + SAVE + RESET */}
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
          <button
            onClick={resetEq}
            className="hw-btn px-1.5 py-0.5 text-[8px] font-black"
            style={{ ["--led" as string]: "#6b6b6b", color: "#9b9b9b" }}
            title="Remet toutes les bandes à 0 dB"
          >FLAT</button>
        </div>
      </div>

      {/* ── response graph ── */}
      <EqGraph deck={deck} color={color} />

      {/* ── faders + digital VU per band ── */}
      <div className="flex items-start justify-around gap-0.5 overflow-x-auto pt-1">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col items-center gap-1">
            {/* mini digital VU above each fader — lights up for BOOST only (more
                energy added = more LEDs, like a real spectrum display); a CUT
                shows no LEDs instead of being conflated with a boost of the
                same magnitude */}
            <DigitalVU
              level={r.key === "mix" ? r.value : Math.max(0, r.value) / 18}
              vertical
            />
            <span
              className="rounded px-0.5 py-0.5 text-center font-mono text-[8px] font-bold tracking-tight"
              style={{ width: 36, color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
            >{r.disp}</span>
            <Fader
              value={r.value} min={r.min} max={r.max} step={r.step}
              vertical onChange={r.set} className="!h-[140px]"
            />
            <span className="text-center text-[8px] font-bold uppercase leading-none"
              style={{ color: eqOn ? color : "#6b6b6b" }}
            >{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
