"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Deck } from "@/lib/audio/Deck";
import { subscribeAutomation, getAutomationVersion } from "@/lib/audio/deckAutomation";
import { Rack, RACK_MODULES, RackModuleId, RackPreset, XY_TARGETS, XY_FILTER_TYPES } from "@/lib/audio/Rack";
import { levelColor } from "./EqVisuals";
import { Knob } from "./Knob";
import { XyPad } from "./XyPad";

const LS_KEY = "djsynth.rackpresets.v1";

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

function Lcd({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="hw-recess inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider"
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
        <span
          style={{
            width: 2,
            height: 7,
            borderRadius: 1,
            background: on ? color : "#5a5a5a",
            boxShadow: on ? `0 0 5px ${color}` : "none",
          }}
        />
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
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cssW = entry.contentRect.width;
        const cssH = entry.contentRect.height;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }
    });
    observer.observe(canvas);
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      rack.getSpectrum(data);
      ctx.clearRect(0, 0, w, h);
      const gap = 1;
      const bw = w / BARS;
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 0.5);
      ctx.lineTo(w, h - 0.5);
      ctx.stroke();
      for (let i = 0; i < BARS; i++) {
        if (i % 8 === 0) {
          ctx.strokeStyle = "#ffffff0d";
          ctx.beginPath();
          ctx.moveTo(i * bw, 0);
          ctx.lineTo(i * bw, h);
          ctx.stroke();
        }
        const frac = Math.pow(i / BARS, 1.6);
        const bin = Math.min(data.length - 1, Math.floor(frac * data.length * 0.75));
        const mag = data[bin] / 255;
        const bh = Math.max(1, mag * h);
        const barColor = levelColor(mag);
        const grad = ctx.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, barColor + "22");
        grad.addColorStop(1, barColor);
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw, h - bh, bw - gap, bh);
      }
    };
    const dpr0 = window.devicePixelRatio || 1;
    const rect0 = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect0.width * dpr0);
    canvas.height = Math.round(rect0.height * dpr0);
    ctx.setTransform(dpr0, 0, 0, dpr0, 0, 0);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [rack, color]);
  return <canvas ref={canvasRef} className="block w-full h-10 rounded bg-neutral-950 ring-1 ring-neutral-800" />;
}

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
      const thr = (p.thresh ?? -24) / 60 + 1;
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
  const sig = JSON.stringify(params);
  useEffect(() => {
    const canvas = canvasRef.current;
    const fn = curveFor(id, params);
    if (!canvas || !fn) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cssW = entry.contentRect.width;
        const cssH = entry.contentRect.height;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }
    });
    observer.observe(canvas);
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#ffffff14";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 + 0.5);
      ctx.lineTo(w, h / 2 + 0.5);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff14";
      ctx.beginPath();
      ctx.moveTo(0, h / 4 + 0.5);
      ctx.lineTo(w, h / 4 + 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (3 * h) / 4 + 0.5);
      ctx.lineTo(w, (3 * h) / 4 + 0.5);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#ffffff22';
      ctx.beginPath();
      ctx.moveTo(0, h - 3);
      ctx.lineTo(w, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.shadowBlur = 6;
      ctx.shadowColor = color;
      ctx.beginPath();
      for (let i = 0; i <= w; i++) {
        const x = (i / w) * 2 - 1;
        const y = Math.max(-1, Math.min(1, fn(x)));
        const py = h / 2 - y * (h / 2 - 3);
        if (i === 0) ctx.moveTo(i, py);
        else ctx.lineTo(i, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0.5, h / 2 - fn(0) * (h / 2 - 3), 3, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `${color}40`);
      grad.addColorStop(1, `${color}00`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let i = 0; i <= w; i++) {
        const x = (i / w) * 2 - 1;
        const y = Math.max(-1, Math.min(1, fn(x)));
        const py = h / 2 - y * (h / 2 - 3);
        if (i === 0) ctx.lineTo(i, py);
        else ctx.lineTo(i, py);
      }
      ctx.lineTo(w, h / 2);
      ctx.closePath();
      ctx.fill();
    };
    const dpr0 = window.devicePixelRatio || 1;
    const rect0 = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect0.width * dpr0);
    canvas.height = Math.round(rect0.height * dpr0);
    ctx.setTransform(dpr0, 0, 0, dpr0, 0, 0);
    draw();
    return () => observer.disconnect();
  }, [sig, color, id]);
  if (!curveFor(id, params)) return null;
  return <canvas ref={canvasRef} className="block w-full h-[44px] rounded bg-neutral-950/70 ring-1 ring-neutral-800" />;
}

function SlotVU({ rack, on, color }: { rack: Rack; on: boolean; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const SEGS = 10;
    const paint = (level: number) => {
      const lit = Math.round(Math.min(1, level * 2.5) * SEGS);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < SEGS; i++) {
        const isLit = i < lit;
        const segColor = i >= 9 ? "#ff3b30" : i >= 7 ? "#ffd23d" : color;
        ctx2d.fillStyle = isLit ? segColor : "#1c1c1c";
        ctx2d.shadowBlur = isLit ? 3 : 0;
        ctx2d.shadowColor = isLit ? segColor : "transparent";
        ctx2d.fillRect(i * 5, 0, 4, 8);
      }
    };
    if (!on) {
      paint(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const step = (ts: number) => {
      if (ts - last >= 50) {
        last = ts;
        paint(rack.getLevel());
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rack, on, color]);
  return <canvas ref={canvasRef} width={50} height={8} className="shrink-0 rounded-sm" />;
}

function syncButtons(id: RackModuleId): boolean {
  return id === "delay" || id === "glitch" || id === "gate";
}

function RackModuleDetail({
  rack,
  deck,
  id,
  color,
  armed,
  flashLcd,
  onChanged,
  pos,
  count,
  onMove,
}: {
  rack: Rack;
  deck: Deck;
  id: RackModuleId;
  color: string;
  armed: number | null;
  flashLcd: (txt: string) => void;
  onChanged: () => void;
  pos: number;
  count: number;
  onMove: (id: RackModuleId, dir: -1 | 1) => void;
}) {
  const def = RACK_MODULES.find((m) => m.id === id)!;
  const on = rack.isOn(id);
  const isXyMatrix = id === "xymatrix";
  const xTarget = isXyMatrix ? Math.round(rack.getParam(id, "xTarget")) : 0;
  const yTarget = isXyMatrix ? Math.round(rack.getParam(id, "yTarget")) : 0;
  const FILTER_ABBR = ["LP", "HP", "BP", "CB"];

  const syncValue = (id: RackModuleId, frac: number): [string, number] => {
    const beat = deck.bpm > 0 ? 60 / deck.bpm : 0.5;
    const t = beat * frac;
    if (id === "gate") return ["rate", Math.min(16, 1 / t)];
    return ["time", Math.min(id === "glitch" ? 0.5 : 1.2, t)];
  };

  return (
    <div className="hw-recess flex flex-col gap-2 p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2">
        <Toggle
          on={on}
          color={color}
          onClick={() => {
            rack.setEnabled(id, !on);
            onChanged();
          }}
        />
        <span className="text-[10px] font-black uppercase" style={{ color: on ? color : "#6b6b6b" }}>{def.label}</span>
        <span className="text-[9px] font-bold tracking-wider" style={{ color: on ? color : "#6b6b6b" }}>{on ? "ACTIF" : "BYPASS"}</span>
        <span className="text-[10px] text-neutral-400">{def.title}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="mr-2 text-[10px] font-bold text-neutral-400 hover:text-neutral-100"
            title="Remet les paramètres de ce module à leurs valeurs par défaut"
            onClick={() => {
              def.params.forEach((p) => rack.setParam(id, p.key, p.def));
              rack.setMix(id, 1);
              flashLcd(`${def.label} RÉINITIALISÉ`);
              onChanged();
            }}
          >
            RÉINIT.
          </button>
          <button
            className="text-[10px] leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
            onClick={() => onMove(id, -1)}
            disabled={pos <= 1}
            title="Déplacer à gauche"
          >
            ◀
          </button>
          <span className="text-[9px] text-neutral-600">{pos + 1}</span>
          <button
            className="text-[10px] leading-none text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
            onClick={() => onMove(id, 1)}
            disabled={pos === count - 1}
            title="Déplacer à droite"
          >
            ▶
          </button>
        </div>
      </div>

      {!isXyMatrix && (
        <MiniCurve
          id={id}
          params={{ mix: rack.getMix(id), ...Object.fromEntries(def.params.map((p) => [p.key, rack.getParam(id, p.key)])) }}
          color={color}
        />
      )}

      <div className="flex flex-wrap items-end gap-3 min-w-0">
        <Knob
          label="Dosage"
          value={rack.getMix(id)}
          min={0}
          max={1}
          defaultValue={1}
          size={52}
          color={color}
          led
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => {
            rack.setMix(id, v);
            flashLcd(`${def.label} DOSAGE ${Math.round(v * 100)}%`);
            onChanged();
          }}
        />

        {def.params.filter((p) => !isXyMatrix || !["x", "y", "xTarget", "yTarget", "xFilterType", "yFilterType"].includes(p.key)).map((p) => {
          const isTarget = armed !== null && rack.isMacroTarget(armed, { id, key: p.key });
          return (
            <div
              key={p.key}
              onClickCapture={(e) => {
                if (armed === null) return;
                e.stopPropagation();
                rack.toggleMacroTarget(armed, { id, key: p.key });
                onChanged();
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
                size={48}
                color={color}
                led
                format={p.fmt}
                onChange={(v) => {
                  rack.setParam(id, p.key, v);
                  flashLcd(`${def.label} ${p.label.toUpperCase()} ${p.fmt ? p.fmt(v) : v.toFixed(2)}`);
                  onChanged();
                }}
              />
            </div>
          );
        })}
      </div>

      {(def.flags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(def.flags ?? []).map((f) => (
            <button
              key={f.key}
              onClick={() => {
                rack.setFlag(id, f.key, !rack.getFlag(id, f.key));
                onChanged();
              }}
              className="hw-btn px-2 py-1 text-[10px] font-bold"
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
                onChanged();
              }}
              className="hw-btn px-2 py-1 text-[9px] font-bold"
              style={{ ["--led" as string]: color, color }}
              title={`Cale sur ${lbl} de noire (${deck.bpm.toFixed(0)} BPM)`}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}

      {isXyMatrix && (() => {
        const xFilterType = Math.round(rack.getParam(id, "xFilterType"));
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase text-neutral-500">Effet Y</span>
                {XY_TARGETS.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => {
                      rack.setParam(id, "yTarget", i);
                      flashLcd(`XY MATRIX — Y = ${t}`);
                      onChanged();
                    }}
                    className={`hw-btn px-2 py-1 text-[10px] font-bold ${yTarget === i ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: color }}
                  >
                    {t}
                  </button>
                ))}
                <span className="mt-1 text-[9px] font-bold uppercase" style={{ color: yTarget === 0 ? "#9a9a9a" : "#4a4a4a" }}>
                  Type Y
                </span>
                <div className="flex gap-0.5">
                  {XY_FILTER_TYPES.map((t, i) => (
                    <button
                      key={t}
                      title={t}
                      disabled={yTarget !== 0}
                      onClick={() => {
                        rack.setParam(id, "yFilterType", i);
                        flashLcd(`XY MATRIX — Filtre Y = ${t}`);
                        onChanged();
                      }}
                      className={`hw-btn px-1.5 py-1 text-[10px] font-bold ${xFilterType === i ? "hw-btn-on" : ""}`}
                      style={{ ["--led" as string]: color }}
                    >
                      {FILTER_ABBR[i]}
                    </button>
                  ))}
                </div>
              </div>
              <XyPad
                size={240}
                color={color}
                x={rack.getParam(id, "x")}
                y={rack.getParam(id, "y")}
                xLabel={XY_TARGETS[xTarget]}
                yLabel={XY_TARGETS[yTarget]}
                onChange={(nx, ny) => {
                  rack.setParam(id, "x", nx);
                  rack.setParam(id, "y", ny);
                  flashLcd(`XY MATRIX ${Math.round(nx * 100)}/${Math.round(ny * 100)}`);
                  onChanged();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pr-1">
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[9px] font-bold uppercase text-neutral-500">Effet X</span>
                {XY_TARGETS.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => {
                      rack.setParam(id, "xTarget", i);
                      flashLcd(`XY MATRIX — X = ${t}`);
                      onChanged();
                    }}
                    className={`hw-btn px-2 py-1 text-[10px] font-bold ${xTarget === i ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: color }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold uppercase" style={{ color: xTarget === 0 ? "#9a9a9a" : "#4a4a4a" }}>
                  Type X
                </span>
                {XY_FILTER_TYPES.map((t, i) => (
                  <button
                    key={t}
                    title={t}
                    disabled={xTarget !== 0}
                    onClick={() => {
                      rack.setParam(id, "xFilterType", i);
                      flashLcd(`XY MATRIX — Filtre X = ${t}`);
                      onChanged();
                    }}
                    className={`hw-btn px-1.5 py-1 text-[10px] font-bold ${xFilterType === i ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: color }}
                  >
                    {FILTER_ABBR[i]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function RackPanel({
  deck,
  color,
  activeModules,
}: {
  deck: Deck;
  color: string;
  activeModules?: Record<string, boolean>;
}) {
  const rack = deck.rack;
  const [, setV] = useState(0);
  useSyncExternalStore(subscribeAutomation, getAutomationVersion, getAutomationVersion); // redraw when a REC replay changes the deck
  const force = () => setV((n) => n + 1);
  const [store, setStore] = useState<Record<string, RackPreset>>({});
  const [armed, setArmed] = useState<number | null>(null);
  const [selected, setSelected] = useState<RackModuleId | null>(null);
  const [presetName, setPresetName] = useState("INIT");
  const [lcd, setLcd] = useState<string | null>(null);
  const lcdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setStore(loadStore()), 0);
    return () => clearTimeout(t0);
  }, []);

  useEffect(() => () => {
    if (lcdTimer.current) clearTimeout(lcdTimer.current);
  }, []);

  const flashLcd = (txt: string) => {
    setLcd(txt);
    if (lcdTimer.current) clearTimeout(lcdTimer.current);
    lcdTimer.current = setTimeout(() => setLcd(null), 1400);
  };

  const activeCount = rack.order.filter((id) => rack.isOn(id)).length;
  const lcdText = armed !== null ? `ASSIGN M${armed + 1}…` : lcd ?? `${presetName.toUpperCase()} · ${activeCount} ON`;

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

  const allOff = () => {
    for (const id of rack.order) {
      if (id !== "eq") rack.setEnabled(id, false);
    }
    flashLcd("TOUS LES EFFETS OFF");
    force();
  };

  const visible = rack.order.filter((id) => {
    if (id === "eq") return false;
    if (activeModules && id in activeModules) return activeModules[id];
    return true;
  });

  const current = selected ?? visible[0];

  return (
    <div className="flex flex-col gap-2 min-w-0 [contain:inline-size]">
      <div className="hw-recess flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">RACK DSP</span>
          <Lcd text={lcdText} color={color} />
          <button
            onClick={allOff}
            className="hw-btn px-2 py-1 text-[10px] font-bold text-red-400"
            style={{ ["--led" as string]: "#ef4444" }}
            title="Coupe tous les effets d'un coup (l'EQ reste actif — toujours inline comme du vrai matériel)"
          >
            ⏻ TOUT OFF
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {FACTORY.map((f) => (
              <button
                key={f.name}
                onClick={() => {
                  f.apply(rack);
                  setPresetName(f.name);
                  force();
                }}
                className="hw-btn px-2 py-1 text-[10px] font-bold"
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
                    force();
                  }}
                  className="px-2 py-1 text-[10px] font-bold text-neutral-200"
                  title={`Charger le preset « ${n} »`}
                >
                  {n}
                </button>
                <button
                  onClick={() => deletePreset(n)}
                  className="px-1 py-1 text-[10px] text-neutral-500 hover:text-red-400"
                  title="Supprimer ce preset"
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              onClick={savePreset}
              className="hw-btn px-2 py-1 text-[10px] font-bold"
              style={{ ["--led" as string]: color, color }}
              title="Sauvegarder l'état du rack comme preset"
            >
              SAUVER
            </button>
            <button
              onClick={() => {
                rack.import({ order: [...rack.order], modules: {}, macros: [] });
                setPresetName("INIT");
                force();
              }}
              className="hw-btn px-2 py-1 text-[10px] font-bold"
              style={{ ["--led" as string]: color, color }}
              title="Réinitialiser tous les modules à leurs valeurs par défaut"
            >
              RESET
            </button>
          </div>
        </div>

        <RackSpectrum rack={rack} color={color} />

        <div className="hw-recess flex flex-wrap items-end gap-3 p-2 min-w-0" title="Une macro pilote plusieurs paramètres d'un coup : clique LIER, puis clique les paramètres à lier">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Macros</span>
          <span className="text-[9px] text-neutral-500">un bouton, plusieurs paramètres</span>
          {rack.macros.map((m, i) => (
            <div key={i} className="flex flex-col items-center">
              <Knob
                label={`M${i + 1}`}
                value={m.value}
                min={0}
                max={1}
                defaultValue={0}
                size={44}
                color={color}
                led
                onChange={(v) => {
                  rack.setMacro(i, v);
                  flashLcd(`MACRO M${i + 1} ${Math.round(v * 100)}%`);
                  force();
                }}
              />
              <button
                onClick={() => setArmed(armed === i ? null : i)}
                className="hw-btn px-2 py-0.5 text-[9px] font-bold"
                style={{ ["--led" as string]: color, color: armed === i ? "#0a0a0a" : color, background: armed === i ? color : "transparent" }}
                title="Mode assignation : clique ensuite un paramètre pour le lier/délier à cette macro"
              >
                {m.targets.length ? `${m.targets.length} lié${m.targets.length > 1 ? "s" : ""}` : "LIER"}
              </button>
            </div>
          ))}
          {armed !== null && (
            <span className="text-[9px] text-amber-300">
              Assignation M{armed + 1} : clique un paramètre ci-dessous
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 min-w-0">
          {visible.map((id, pos) => {
            const def = RACK_MODULES.find((m) => m.id === id)!;
            const on = rack.isOn(id);
            const isSelected = id === current;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                className={`hw-pad ${on ? "hw-pad-loaded" : ""}`}
                style={{
                  ["--rgb" as string]: color,
                  height: 56,
                  opacity: on ? 1 : 0.6,
                  border: isSelected ? `2px solid ${color}` : "none",
                }}
              >
                <div className="flex h-full flex-col items-center justify-between p-1">
                  <span className="text-[9px] opacity-70">{pos + 1}</span>
                  <span className="text-[10px] font-bold uppercase truncate">{def.label}</span>
                  <SlotVU rack={rack} on={on} color={color} />
                  <span
                    role="switch"
                    aria-checked={on}
                    onClick={(e) => {
                      e.stopPropagation();
                      rack.setEnabled(id, !on);
                      force();
                    }}
                    title={on ? "Activé : clic pour désactiver" : "Désactivé : clic pour activer"}
                    className="rounded px-1 text-[8px] font-black leading-tight"
                    style={{
                      color: on ? "#0a0a0a" : "#8a8a8a",
                      background: on ? color : "#2a2a2a",
                      boxShadow: on ? `0 0 3px ${color}` : "none",
                    }}
                  >
                    {on ? "ON" : "OFF"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {current && (
          <RackModuleDetail
            rack={rack}
            deck={deck}
            id={current}
            color={color}
            armed={armed}
            flashLcd={flashLcd}
            onChanged={force}
            pos={rack.order.indexOf(current)}
            count={visible.length}
            onMove={(id, dir) => {
              rack.move(id, dir);
              force();
            }}
          />
        )}

        <span className="text-[9px] leading-tight text-neutral-600">
          Clique un module pour le régler. Pastille ON/OFF = activer ou couper. ◀ ▶ = changer l&apos;ordre de la chaîne. Dosage = part de l&apos;effet dans le son. Réglages sauvés par morceau.
        </span>
      </div>
    </div>
  );
}

