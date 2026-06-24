"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { Rack, RACK_MODULES, RackModuleId, RackPreset, EQ_FREQS } from "@/lib/audio/Rack";
import { Knob } from "./Knob";
import { Fader } from "./Fader";

const LS_KEY = "djsynth.rackpresets.v1";

// quick factory presets — applied imperatively onto the live rack
const FACTORY: { name: string; apply: (r: Rack) => void }[] = [
  {
    name: "Shimmer Pad",
    apply: (r) => {
      r.setEnabled("shimmer", true);
      r.setParam("shimmer", "decay", 5);
      r.setParam("shimmer", "shimmer", 0.6);
      r.setMix("shimmer", 0.4);
      r.setEnabled("reverb", true);
      r.setParam("reverb", "decay", 3.5);
      r.setMix("reverb", 0.25);
    },
  },
  {
    name: "Robot",
    apply: (r) => {
      r.setEnabled("robot", true);
      r.setParam("robot", "carrier", 0);
      r.setParam("robot", "grit", 4);
      r.setParam("robot", "tone", 1200);
      r.setMix("robot", 1);
    },
  },
  {
    name: "Glitch",
    apply: (r) => {
      r.setEnabled("glitch", true);
      r.setParam("glitch", "time", 0.12);
      r.setParam("glitch", "fb", 0.5);
      r.setMix("glitch", 0.6);
      r.setEnabled("delay", true);
      r.setMix("delay", 0.3);
    },
  },
  {
    name: "Voix Iso",
    apply: (r) => {
      r.setEnabled("isolator", true);
      r.setParam("isolator", "focus", 0.85);
      r.setMix("isolator", 1);
    },
  },
  {
    name: "Acid Wah",
    apply: (r) => {
      r.setEnabled("autowah", true);
      r.setParam("autowah", "base", 120);
      r.setParam("autowah", "sens", -18);
      r.setParam("autowah", "q", 5);
      r.setEnabled("drive", true);
      r.setParam("drive", "drive", 0.4);
      r.setMix("autowah", 0.8);
    },
  },
  {
    name: "Voyelles",
    apply: (r) => {
      r.setEnabled("voyelle", true);
      r.setParam("voyelle", "morph", 0.3);
      r.setParam("voyelle", "reso", 10);
      r.setEnabled("gate", true);
      r.setParam("gate", "rate", 8);
      r.setMix("voyelle", 0.7);
    },
  },
];

function loadStore(): Record<string, RackPreset> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStore(s: Record<string, RackPreset>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

// ---- graphic-EQ shortcut presets (numbered 1-5, like a hardware EQ) ----
const EQ_LS_KEY = "djsynth.eqpresets.v1";
type EqPreset = { name?: string; g: number[] }; // g = 10 band gains g0..g9
const EQ_SLOTS = 5;
function loadEqPresets(): (EqPreset | null)[] {
  const empty: (EqPreset | null)[] = Array(EQ_SLOTS).fill(null);
  if (typeof window === "undefined") return empty;
  try {
    const arr = JSON.parse(localStorage.getItem(EQ_LS_KEY) || "[]");
    if (Array.isArray(arr)) for (let i = 0; i < EQ_SLOTS; i++) empty[i] = arr[i] ?? null;
  } catch {
    /* corrupt — keep empties */
  }
  return empty;
}
function saveEqPresets(arr: (EqPreset | null)[]) {
  try {
    localStorage.setItem(EQ_LS_KEY, JSON.stringify(arr));
  } catch {
    /* quota / private mode — ignore */
  }
}

// ---------- small dot-matrix LCD ----------
function Lcd({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="hw-recess inline-flex items-center rounded px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider"
      style={{
        color,
        background: "#0a0d0a",
        textShadow: `0 0 5px ${color}`,
        minWidth: 130,
        letterSpacing: "0.12em",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {text}
    </span>
  );
}

// ---------- on/off rocker switch (module bypass) — real appliance I/O rocker ----------
function Toggle({ on, color, onClick }: { on: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative shrink-0 select-none"
      style={{
        width: 20,
        height: 28,
        borderRadius: 4,
        padding: 2,
        background: "linear-gradient(180deg,#2a2a2a,#070707)",
        boxShadow: "inset 0 0 0 1px #000, 0 1px 2px rgba(0,0,0,.7)",
      }}
      title={on ? "ON (I) — clic pour bypass (O)" : "BYPASS (O) — clic pour activer (I)"}
    >
      {/* the tilting black paddle: I-side (top) pressed in = ON, O-side (bottom) = OFF */}
      <span
        className="absolute inset-[2px] flex flex-col items-center justify-between rounded-[3px] py-[3px]"
        style={{
          background: on
            ? "linear-gradient(180deg,#040404 0%,#141414 48%,#2e2e2e 100%)"
            : "linear-gradient(180deg,#2e2e2e 0%,#141414 52%,#040404 100%)",
          boxShadow: on
            ? "inset 0 3px 4px rgba(0,0,0,.85), inset 0 -1px 1px rgba(255,255,255,.10)"
            : "inset 0 -3px 4px rgba(0,0,0,.85), inset 0 1px 1px rgba(255,255,255,.10)",
        }}
      >
        {/* I (on) */}
        <span
          style={{
            width: 2,
            height: 7,
            borderRadius: 1,
            background: on ? color : "#5a5a5a",
            boxShadow: on ? `0 0 5px ${color}` : "none",
          }}
        />
        {/* O (off) */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            border: `1.5px solid ${on ? "#3a3a3a" : "#9a9a9a"}`,
          }}
        />
      </span>
    </button>
  );
}

// ---------- live spectrum of the rack output ----------
function RackSpectrum({ rack, color }: { rack: Rack; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(rack.spectrumBins);
    const BARS = 56;
    let raf = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      rack.getSpectrum(data);
      ctx.clearRect(0, 0, w, h);
      const gap = 1;
      const bw = w / BARS;
      for (let i = 0; i < BARS; i++) {
        const frac = Math.pow(i / BARS, 1.6);
        const bin = Math.min(data.length - 1, Math.floor(frac * data.length * 0.75));
        const mag = data[bin] / 255;
        const bh = Math.max(1, mag * h);
        const grad = ctx.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, color + "22");
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw, h - bh, bw - gap, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rack, color]);
  return <canvas ref={canvasRef} width={420} height={40} className="h-10 w-full rounded bg-neutral-950 ring-1 ring-neutral-800" />;
}

// ---------- per-module transfer-curve thumbnail ----------
function curveFor(id: RackModuleId, p: Record<string, number>): ((x: number) => number) | null {
  switch (id) {
    case "drive": {
      const k = 1 + (p.drive ?? 0.4) * 60;
      return (x) => Math.tanh(k * x) / Math.tanh(k);
    }
    case "wavefold": {
      const o = 1 + (p.fold ?? 0.4) * 6;
      return (x) => Math.sin(x * Math.PI * o);
    }
    case "crush": {
      const step = Math.pow(2, Math.max(1, p.bits ?? 4));
      return (x) => Math.round(x * step) / step;
    }
    case "comp": {
      const thr = (p.thresh ?? -24) / 60 + 1; // 0..1 normalized threshold
      const ratio = p.ratio ?? 4;
      return (x) => {
        const a = Math.abs(x);
        if (a <= thr) return x;
        const over = a - thr;
        const out = thr + over / ratio;
        return Math.sign(x) * out;
      };
    }
    case "limiter": {
      const ceil = Math.pow(10, (p.ceil ?? -1) / 20);
      return (x) => Math.max(-ceil, Math.min(ceil, x));
    }
    case "ringmod": {
      const f = 1 + Math.abs(p.freq ?? 200) / 200;
      return (x) => Math.sin(x * Math.PI * f);
    }
    default:
      return null;
  }
}

function MiniCurve({ id, params, color }: { id: RackModuleId; params: Record<string, number>; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fn = curveFor(id, params);
  const sig = JSON.stringify(params);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fn) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // grid baseline
    ctx.strokeStyle = "#ffffff14";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const x = (i / w) * 2 - 1;
      const y = Math.max(-1, Math.min(1, fn(x)));
      const py = h / 2 - (y * h) / 2;
      if (i === 0) ctx.moveTo(i, py);
      else ctx.lineTo(i, py);
    }
    ctx.stroke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, color, id]);
  if (!fn) return null;
  return <canvas ref={canvasRef} width={120} height={34} className="rounded bg-neutral-950/70 ring-1 ring-neutral-800" />;
}

// ---------- live 10-band EQ graph: spectrum analyzer + response curve ----------
const EQ_AX_LO = 20;
const EQ_AX_HI = 20000;
const EQ_RANGE = 18; // ±dB shown on the graph
// colour a vertical bar by level (green -> yellow -> orange -> red)
function levelColor(t: number): string {
  if (t < 0.5) return "#39ff6a";
  if (t < 0.7) return "#d8ff32";
  if (t < 0.85) return "#ffae24";
  return "#ff3b30";
}
function EqGraph({ rack, color }: { rack: Rack; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const xAtF = (f: number, w: number) => (w * Math.log(f / EQ_AX_LO)) / Math.log(EQ_AX_HI / EQ_AX_LO);
  const yAtDb = (db: number, h: number) => (h * (1 - db / EQ_RANGE)) / 2;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    const sr = 44100; // analyser sample rate (approx) for bin->Hz mapping
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const bins = rack.spectrumBins;
      if (!buf.current || buf.current.length !== bins) buf.current = new Uint8Array(bins);
      const arr = buf.current;
      rack.getSpectrum(arr);
      ctx.clearRect(0, 0, w, h);
      // spectrum bars, log-frequency mapped, coloured by level
      const nyq = sr / 2;
      const barW = 3;
      for (let x = 0; x < w; x += barW) {
        const f = EQ_AX_LO * Math.pow(EQ_AX_HI / EQ_AX_LO, x / w);
        const bin = Math.min(bins - 1, Math.max(0, Math.round((f / nyq) * bins)));
        const t = arr[bin] / 255;
        if (t <= 0.01) continue;
        const bh = t * h;
        ctx.fillStyle = levelColor(t);
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x, h - bh, barW - 1, bh);
      }
      ctx.globalAlpha = 1;
      // 0 dB centre line + frequency gridlines
      ctx.strokeStyle = "#ffffff14";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      [100, 1000, 10000].forEach((f) => {
        const x = xAtF(f, w);
        ctx.beginPath();
        ctx.strokeStyle = "#ffffff10";
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      });
      // EQ response curve from the 10 band gains (sum of peaking bumps)
      const gains = EQ_FREQS.map((_, i) => rack.getParam("eq", `g${i}`));
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
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  return (
    <canvas
      ref={ref}
      width={520}
      height={96}
      className="h-[96px] w-full rounded bg-neutral-950 ring-1 ring-neutral-800"
      title="Spectre en temps réel (vert→rouge) + courbe de réponse de l'EQ 10 bandes"
    />
  );
}

// ---------- BPM sync presets per module ----------
function syncButtons(id: RackModuleId): boolean {
  return id === "delay" || id === "glitch" || id === "gate";
}

export function RackPanel({ deck, color }: { deck: Deck; color: string }) {
  const rack = deck.rack;
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [store, setStore] = useState<Record<string, RackPreset>>({});
  const [armed, setArmed] = useState<number | null>(null); // macro index in "assign" mode
  const [collapsed, setCollapsed] = useState<Set<RackModuleId>>(new Set());
  const [presetName, setPresetName] = useState("INIT");
  const [lcd, setLcd] = useState<string | null>(null);
  const lcdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eqPresets, setEqPresets] = useState<(EqPreset | null)[]>(() => Array(EQ_SLOTS).fill(null));
  const [eqSaveMode, setEqSaveMode] = useState(false); // SAVE armed: next slot click stores
  const [eqActivePreset, setEqActivePreset] = useState<number | null>(null);

  useEffect(() => setStore(loadStore()), []);
  useEffect(() => setEqPresets(loadEqPresets()), []);
  useEffect(() => () => { if (lcdTimer.current) clearTimeout(lcdTimer.current); }, []);

  // flash a "PARAM value" line on the LCD, then fade back to idle
  const flashLcd = (txt: string) => {
    setLcd(txt);
    if (lcdTimer.current) clearTimeout(lcdTimer.current);
    lcdTimer.current = setTimeout(() => setLcd(null), 1400);
  };

  const activeCount = rack.order.filter((id) => rack.isOn(id)).length;
  const lcdText =
    armed !== null ? `ASSIGN M${armed + 1}…` : lcd ?? `${presetName.toUpperCase()} · ${activeCount} ON`;

  const savePreset = () => {
    const name = window.prompt("Nom du preset de rack ?");
    if (!name) return;
    const next = { ...store, [name]: rack.export() };
    setStore(next);
    saveStore(next);
    setPresetName(name);
  };
  const deletePreset = (name: string) => {
    const next = { ...store };
    delete next[name];
    setStore(next);
    saveStore(next);
  };

  const toggleCollapse = (id: RackModuleId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allCollapsed = collapsed.size >= rack.order.length;
  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(rack.order));
  };

  // BPM-synced value for a sync button (returns param key + value)
  const syncValue = (id: RackModuleId, frac: number): [string, number] => {
    const beat = deck.bpm > 0 ? 60 / deck.bpm : 0.5; // seconds per quarter
    const t = beat * frac;
    if (id === "gate") return ["rate", Math.min(16, 1 / t)]; // Hz
    return ["time", Math.min(id === "glitch" ? 0.5 : 1.2, t)];
  };

  // ---- always-visible graphic EQ, pinned ABOVE the DSP pedalboard ----
  const eqDef = RACK_MODULES.find((m) => m.id === "eq")!;
  const eqOn = rack.isOn("eq");
  const eqMix = rack.getMix("eq");
  const eqRows: {
    key: string; label: string; min: number; max: number; step: number;
    value: number; disp: string; set: (v: number) => void; macro: boolean;
  }[] = [
    {
      key: "mix", label: "MIX", min: 0, max: 1, step: 0.01, value: eqMix,
      disp: `${Math.round(eqMix * 100)}%`, macro: false,
      set: (v) => { rack.setMix("eq", v); flashLcd(`EQ MIX ${Math.round(v * 100)}%`); rerender(); },
    },
    ...eqDef.params.map((p) => {
      const val = rack.getParam("eq", p.key);
      return {
        key: p.key, label: p.label, min: p.min, max: p.max, step: (p.max - p.min) / 240,
        value: val, disp: p.fmt ? p.fmt(val) : val.toFixed(2), macro: true,
        set: (v: number) => { rack.setParam("eq", p.key, v); flashLcd(`EQ ${p.label.toUpperCase()} ${p.fmt ? p.fmt(v) : v.toFixed(2)}`); rerender(); },
      };
    }),
  ];
  // store the current 10 band gains into slot n (0-based)
  const saveEqSlot = (n: number) => {
    const g = eqDef.params.map((p) => rack.getParam("eq", p.key));
    const next = eqPresets.slice();
    next[n] = { g };
    setEqPresets(next);
    saveEqPresets(next);
    setEqSaveMode(false);
    setEqActivePreset(n);
    flashLcd(`EQ PRESET ${n + 1} SAVED`);
  };
  // apply slot n onto the live EQ (only if filled)
  const recallEqSlot = (n: number) => {
    const p = eqPresets[n];
    if (!p) return;
    eqDef.params.forEach((def, i) => {
      if (typeof p.g[i] === "number") rack.setParam("eq", def.key, p.g[i]);
    });
    setEqActivePreset(n);
    flashLcd(`EQ PRESET ${n + 1}`);
    rerender();
  };
  const eqStrip = (
    <div className="hw-recess flex w-full flex-col gap-2 rounded p-3" style={{ opacity: eqOn ? 1 : 0.7 }}>
      <div className="flex items-center gap-2">
        <Toggle on={eqOn} color={color} onClick={() => { rack.setEnabled("eq", !eqOn); rerender(); }} />
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: eqOn ? color : "#6b6b6b" }}>
          Égaliseur
        </span>
        <span className="text-[8px] text-neutral-500">10 bandes</span>
        {/* preset shortcuts 1-5 + SAVE toggle */}
        <div className="ml-auto flex items-center gap-1">
          {eqPresets.map((p, n) => {
            const filled = !!p;
            const active = eqActivePreset === n;
            return (
              <button
                key={n}
                onClick={() => (eqSaveMode ? saveEqSlot(n) : recallEqSlot(n))}
                disabled={!eqSaveMode && !filled}
                title={eqSaveMode ? `Enregistrer dans ${n + 1}` : filled ? `Rappeler ${n + 1}` : `Vide`}
                className="hw-btn flex h-6 w-6 items-center justify-center text-[10px] font-black"
                style={{
                  ["--led" as string]: color,
                  color: filled ? color : "#5b5b5b",
                  outline: active ? `1px solid ${color}` : undefined,
                  boxShadow: filled ? `0 0 5px ${color}55` : undefined,
                  opacity: !eqSaveMode && !filled ? 0.45 : 1,
                }}
              >
                {n + 1}
              </button>
            );
          })}
          <button
            onClick={() => setEqSaveMode((s) => !s)}
            title="Mode sauvegarde : choisis ensuite un emplacement 1-5"
            className="hw-btn px-1.5 py-0.5 text-[8px] font-black"
            style={eqSaveMode ? { ["--led" as string]: "#ff5252", color: "#ff5252", boxShadow: "0 0 6px #ff525288" } : undefined}
          >
            {eqSaveMode ? "CHOISIR…" : "SAVE"}
          </button>
        </div>
      </div>
      <EqGraph rack={rack} color={color} />
      {/* graphic-EQ console: vertical faders, long LCD readout above each */}
      <div className="flex items-start justify-around gap-0.5 overflow-x-auto pt-1">
        {eqRows.map((r) => {
          const isTarget = r.macro && armed !== null && rack.isMacroTarget(armed, { id: "eq", key: r.key });
          return (
            <div
              key={r.key}
              onClickCapture={(e) => {
                if (!r.macro || armed === null) return;
                e.stopPropagation();
                rack.toggleMacroTarget(armed, { id: "eq", key: r.key });
                rerender();
              }}
              className="flex flex-col items-center gap-1"
              style={{
                borderRadius: 4,
                padding: 2,
                cursor: armed !== null && r.macro ? "pointer" : undefined,
                outline: isTarget ? `2px solid ${color}` : armed !== null && r.macro ? "1px dashed #555" : "none",
              }}
            >
              <span
                className="rounded px-0.5 py-0.5 text-center font-mono text-[8px] font-bold tracking-tight"
                style={{ width: 40, color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
              >
                {r.disp}
              </span>
              <Fader value={r.value} min={r.min} max={r.max} step={r.step} vertical onChange={r.set} className="!h-[150px]" />
              <span className="text-center text-[8px] font-bold uppercase leading-none" style={{ color: eqOn ? color : "#6b6b6b" }}>
                {r.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* graphic EQ — pinned outside the reorderable DSP rack, always visible */}
      {eqStrip}
      <div className="hw-recess flex flex-col gap-2 p-3">
      {/* header: title + LCD + global collapse + presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
          Rack DSP
        </span>
        <Lcd text={lcdText} color={color} />
        <button
          onClick={toggleAll}
          className="hw-btn px-1.5 py-0.5 text-[8px] font-bold"
          style={{ ["--led" as string]: color, color }}
          title="Tout replier / déplier"
        >
          {allCollapsed ? "⊕ DÉPLIER" : "⊖ REPLIER"}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {FACTORY.map((f) => (
            <button
              key={f.name}
              onClick={() => {
                f.apply(rack);
                setPresetName(f.name);
                rerender();
              }}
              className="hw-btn px-1.5 py-0.5 text-[8px] font-bold"
              style={{ ["--led" as string]: color, color }}
              title={`Preset d'usine : ${f.name}`}
            >
              {f.name}
            </button>
          ))}
          {Object.keys(store).map((n) => (
            <span key={n} className="flex items-center rounded ring-1 ring-neutral-700">
              <button
                onClick={() => {
                  rack.import(store[n]);
                  setPresetName(n);
                  rerender();
                }}
                className="px-1.5 py-0.5 text-[8px] font-bold text-neutral-200"
                title={`Charger le preset « ${n} »`}
              >
                {n}
              </button>
              <button
                onClick={() => deletePreset(n)}
                className="px-1 py-0.5 text-[8px] text-neutral-500 hover:text-red-400"
                title="Supprimer ce preset"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            onClick={savePreset}
            className="hw-btn px-1.5 py-0.5 text-[8px] font-bold"
            style={{ ["--led" as string]: color, color }}
            title="Sauvegarder l'état du rack comme preset"
          >
            💾 SAVE
          </button>
        </div>
      </div>

      {/* live spectrum of the rack output */}
      <RackSpectrum rack={rack} color={color} />

      {/* macros */}
      <div className="flex items-center gap-3 rounded bg-black/20 p-2">
        <span className="text-[8px] uppercase text-neutral-500">Macros</span>
        {rack.macros.map((m, i) => (
          <div key={i} className="flex flex-col items-center">
            <Knob
              label={`M${i + 1}`}
              value={m.value}
              min={0}
              max={1}
              defaultValue={0}
              size={34}
              color={color}
              onChange={(v) => {
                rack.setMacro(i, v);
                flashLcd(`MACRO M${i + 1} ${Math.round(v * 100)}%`);
                rerender();
              }}
            />
            <button
              onClick={() => setArmed(armed === i ? null : i)}
              className="text-[7px] font-bold uppercase"
              style={{ color: armed === i ? "#0a0a0a" : color, background: armed === i ? color : "transparent", borderRadius: 3, padding: "0 3px" }}
              title="Mode assignation : clique ensuite un paramètre pour le lier/délier à cette macro"
            >
              {m.targets.length ? `lié ${m.targets.length}` : "assign"}
            </button>
          </div>
        ))}
        {armed !== null && (
          <span className="text-[8px] text-amber-300">
            Assignation M{armed + 1} : clique un paramètre ci-dessous
          </span>
        )}
      </div>

      {/* pedalboard — wraps onto rows so it never widens the page. `items-start` so a
          collapsed card keeps its small height (no stretching to taller neighbours) →
          replier un module fait bien remonter ce qui est en dessous. */}
      <div className="flex w-full min-w-0 flex-wrap items-start content-start gap-1.5">
        {rack.order.map((id, pos) => {
          if (id === "eq") return null; // EQ is pinned above as an always-visible panel
          const def = RACK_MODULES.find((m) => m.id === id)!;
          const on = rack.isOn(id);
          const isCollapsed = collapsed.has(id);

          // header is shared by both states: toggle + label (click label = fold)
          const header = (
            <div className="flex items-center gap-1.5">
              <Toggle
                on={on}
                color={color}
                onClick={() => {
                  rack.setEnabled(id, !on);
                  rerender();
                }}
              />
              <button
                onClick={() => toggleCollapse(id)}
                className="flex-1 truncate text-left text-[10px] font-black uppercase"
                style={{ color: on ? color : "#6b6b6b" }}
                title={`${def.title} — clic pour ${isCollapsed ? "déplier" : "replier"}`}
              >
                {def.label}
              </button>
              <span className="text-[9px] leading-none text-neutral-600">{isCollapsed ? "▸" : "▾"}</span>
            </div>
          );

          if (isCollapsed) {
            return (
              <div
                key={id}
                className="hw-recess flex w-[124px] flex-col rounded px-2 py-1.5"
                style={{ opacity: on ? 1 : 0.62 }}
              >
                {header}
              </div>
            );
          }

          return (
            <div
              key={id}
              className="hw-recess flex w-[172px] flex-col gap-1.5 rounded p-2"
              style={{ opacity: on ? 1 : 0.62 }}
            >
              {header}

              {/* transfer-curve thumbnail (where meaningful) */}
              <MiniCurve id={id} params={{ mix: rack.getMix(id), ...Object.fromEntries(def.params.map((p) => [p.key, rack.getParam(id, p.key)])) }} color={color} />

              {/* FX intensity (MIX) — long vertical fader for fine latitude + params */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="rounded px-0.5 py-0.5 text-center font-mono text-[8px] font-bold tracking-tight"
                    style={{ width: 36, color, background: "#0a0d0a", textShadow: `0 0 5px ${color}`, boxShadow: "inset 0 0 0 1px #1a1a1a" }}
                  >
                    {Math.round(rack.getMix(id) * 100)}%
                  </span>
                  <Fader
                    value={rack.getMix(id)}
                    min={0}
                    max={1}
                    step={0.005}
                    vertical
                    onChange={(v) => {
                      rack.setMix(id, v);
                      flashLcd(`${def.label} INTENSITÉ ${Math.round(v * 100)}%`);
                      rerender();
                    }}
                    className="!h-[160px]"
                  />
                  <span className="text-[8px] font-bold uppercase leading-none" style={{ color: on ? color : "#6b6b6b" }}>INT</span>
                </div>
                <div className="flex flex-1 flex-wrap items-start gap-1.5">
                {def.params.map((p) => {
                  const isTarget = armed !== null && rack.isMacroTarget(armed, { id, key: p.key });
                  return (
                    <div
                      key={p.key}
                      onClickCapture={(e) => {
                        if (armed === null) return;
                        e.stopPropagation();
                        rack.toggleMacroTarget(armed, { id, key: p.key });
                        rerender();
                      }}
                      style={{
                        borderRadius: 6,
                        padding: 1,
                        cursor: armed !== null ? "pointer" : undefined,
                        outline: isTarget ? `2px solid ${color}` : armed !== null ? "1px dashed #555" : "none",
                      }}
                    >
                      <Knob
                        label={p.label}
                        value={rack.getParam(id, p.key)}
                        min={p.min}
                        max={p.max}
                        defaultValue={p.def}
                        size={30}
                        color={color}
                        format={p.fmt}
                        onChange={(v) => {
                          rack.setParam(id, p.key, v);
                          flashLcd(`${def.label} ${p.label.toUpperCase()} ${p.fmt ? p.fmt(v) : v.toFixed(2)}`);
                          rerender();
                        }}
                      />
                    </div>
                  );
                })}
                </div>
              </div>

              {/* flags */}
              {(def.flags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(def.flags ?? []).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => {
                        rack.setFlag(id, f.key, !rack.getFlag(id, f.key));
                        rerender();
                      }}
                      className="hw-btn px-1.5 py-1 text-[8px] font-bold"
                      style={{
                        ["--led" as string]: color,
                        color: rack.getFlag(id, f.key) ? "#0a0a0a" : color,
                        background: rack.getFlag(id, f.key) ? color : "transparent",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* BPM sync (delay / glitch / gate) */}
              {syncButtons(id) && deck.bpm > 0 && (
                <div className="flex items-center gap-0.5">
                  {([
                    ["¼", 1],
                    ["⅛", 0.5],
                    ["1/16", 0.25],
                  ] as const).map(([lbl, frac]) => (
                    <button
                      key={lbl}
                      onClick={() => {
                        const [key, val] = syncValue(id, frac);
                        rack.setParam(id, key, val);
                        flashLcd(`${def.label} SYNC ${lbl}`);
                        rerender();
                      }}
                      className="rounded px-1 py-0.5 text-[8px] font-bold ring-1 ring-neutral-700"
                      style={{ color }}
                      title={`Cale sur ${lbl} de noire (${deck.bpm.toFixed(0)} BPM)`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              {/* reorder ◀ ▶ */}
              <div className="mt-auto flex items-center justify-between pt-1">
                <button
                  className="text-[10px] leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                  onClick={() => {
                    rack.move(id, -1);
                    rerender();
                  }}
                  disabled={pos <= 1}
                  title="Déplacer à gauche"
                >
                  ◀
                </button>
                <span className="text-[7px] text-neutral-600">{pos + 1}</span>
                <button
                  className="text-[10px] leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                  onClick={() => {
                    rack.move(id, 1);
                    rerender();
                  }}
                  disabled={pos === rack.order.length - 1}
                  title="Déplacer à droite"
                >
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <span className="text-[8px] leading-tight text-neutral-600">
        Pédalier série gauche→droite. Clic titre = replier · pastille = bypass · ◀▶ = réordonner · MIX = dosage. Sauvé par morceau.
      </span>
      </div>
    </div>
  );
}
