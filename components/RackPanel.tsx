"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { Rack, RACK_MODULES, RackModuleId, RackPreset } from "@/lib/audio/Rack";
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


// ---------- per-slot digital VU meter (10 LED segments, reads rack output level) ----------
function SlotVU({ rack, on, color }: { rack: Rack; on: boolean; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const SEGS = 10;
    let raf = 0;
    const draw = () => {
      const level = on ? rack.getLevel() : 0;
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
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rack, on, color]);
  return <canvas ref={canvasRef} width={50} height={8} className="shrink-0 rounded-sm" />;
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
  useEffect(() => setStore(loadStore()), []);
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

  return (
    <div className="flex flex-col gap-2">
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

          // header is shared by both states: toggle + label + VU meter (click label = fold)
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
              <SlotVU rack={rack} on={on} color={color} />
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
