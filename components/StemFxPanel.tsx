"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Deck } from "../lib/audio/Deck";
import { Knob } from "./Knob";
import { FxUnit } from "./FxUnit";
import { STEM_FX } from "@/lib/audio/FXRack";

interface Props {
  deck: Deck;
  i: number;
  label: string;
  color: string;
  rerender: () => void;
  onClose: () => void;
}

const PRESETS: { name: string; title: string; filter: number; drive: number; verb: number; delay: number; hue: string }[] = [
  { name: "Étouffé", title: "Passe-bas : le stem passe derrière un mur", filter: -0.7, drive: 0, verb: 0, delay: 0, hue: "#38bdf8" },
  { name: "Radio", title: "Passe-haut + grain : son de poste de radio", filter: 0.55, drive: 0.35, verb: 0, delay: 0, hue: "#facc15" },
  { name: "Sale", title: "Grosse saturation", filter: 0, drive: 0.85, verb: 0, delay: 0, hue: "#f87171" },
  { name: "Espace", title: "Grande reverb et écho", filter: 0, drive: 0, verb: 0.6, delay: 0.4, hue: "#a78bfa" },
];

const PAD_W = 288;
const PAD_H = 150;

// Gain of the DJ-style filter at normalised frequency f (0..1): x<0 low-pass, x>0 high-pass.
function filterGain(x: number, f: number): number {
  if (x === 0) return 1;
  const cutoff = Math.pow(Math.abs(x), 0.8);
  const c = x < 0 ? 1 - cutoff : cutoff;
  const d = x < 0 ? Math.max(0, f - c) : Math.max(0, c - f);
  return 1 / (1 + Math.pow(d * 9, 2));
}

// Horizontal live level meter (LED segments), driven by the stem's own analyser.
function LevelBar({ deck, i, color }: { deck: Deck; i: number; color: string }) {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLvl(deck.stemLevel(i));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deck, i]);
  const lit = Math.round(Math.min(1, lvl * 1.6) * 20);
  return (
    <div className="flex flex-1 items-center gap-[2px]" aria-hidden>
      {Array.from({ length: 20 }, (_, k) => (
        <span
          key={k}
          className="h-2 flex-1 rounded-[1px]"
          style={{
            background: k < lit ? (k > 16 ? "#ef4444" : k > 12 ? "#facc15" : color) : "rgba(255,255,255,0.07)",
            boxShadow: k < lit ? `0 0 5px ${k > 16 ? "#ef4444" : color}88` : undefined,
          }}
        />
      ))}
    </div>
  );
}

// XY pad: horizontal = filter sweep (-1 low-pass .. +1 high-pass), vertical = drive.
// The filter's frequency response is drawn inside the pad and glows with the drive.
function XyPad({
  filter,
  drive,
  color,
  onChange,
}: {
  filter: number;
  drive: number;
  color: string;
  onChange: (filter: number, drive: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFromEvent(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const f = nx * 2 - 1;
    onChange(Math.abs(f) < 0.04 ? 0 : f, 1 - ny);
  }

  const pts: string[] = [];
  for (let k = 0; k <= 90; k++) {
    const f = k / 90;
    pts.push(`${(f * PAD_W).toFixed(1)},${(PAD_H - 14 - filterGain(filter, f) * (PAD_H - 34)).toFixed(1)}`);
  }
  const line = pts.join(" ");
  const px = ((filter + 1) / 2) * PAD_W;
  const py = (1 - drive) * PAD_H;
  const active = filter !== 0 || drive > 0.005;

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-lg"
      style={{
        width: "100%",
        aspectRatio: `${PAD_W} / ${PAD_H}`,
        background: "radial-gradient(120% 120% at 50% 0%, #0b1420 0%, #04070c 75%)",
        boxShadow: `inset 0 0 22px rgba(0,0,0,0.9), inset 0 0 0 1px ${active ? color + "55" : "#1b2a3a"}`,
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && setFromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onDoubleClick={() => onChange(0, 0)}
      title="Glisse : gauche/droite = filtre, haut/bas = drive. Double-clic : remise à zéro"
    >
      <svg viewBox={`0 0 ${PAD_W} ${PAD_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={"v" + g} x1={g * PAD_W} y1="0" x2={g * PAD_W} y2={PAD_H} stroke="#13202e" strokeWidth="1" />
        ))}
        {[0.33, 0.66].map((g) => (
          <line key={"h" + g} x1="0" y1={g * PAD_H} x2={PAD_W} y2={g * PAD_H} stroke="#13202e" strokeWidth="1" />
        ))}
        <line x1={PAD_W / 2} y1="0" x2={PAD_W / 2} y2={PAD_H} stroke="#243a50" strokeWidth="1" strokeDasharray="3 4" />
        <polygon points={`0,${PAD_H} ${line} ${PAD_W},${PAD_H}`} fill={color} opacity={active ? 0.16 : 0.05} />
        <polyline
          points={line}
          fill="none"
          stroke={active ? color : "#4a5a6a"}
          strokeWidth={1.6 + drive * 2.4}
          strokeLinejoin="round"
          style={{ filter: active ? `drop-shadow(0 0 ${3 + drive * 8}px ${color})` : undefined }}
        />
      </svg>
      <span className="pointer-events-none absolute bottom-1 left-2 text-[9px] font-bold text-sky-300/60">PASSE-BAS</span>
      <span className="pointer-events-none absolute bottom-1 right-2 text-[9px] font-bold text-amber-300/60">PASSE-HAUT</span>
      <span className="pointer-events-none absolute left-2 top-1 text-[9px] font-bold text-red-300/60">DRIVE ↑</span>
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${(px / PAD_W) * 100}%`,
          top: `${(py / PAD_H) * 100}%`,
          background: `radial-gradient(circle at 35% 30%, #fff, ${color} 55%, ${color}88)`,
          boxShadow: `0 0 10px ${color}, 0 0 22px ${color}99, 0 0 0 2px #000`,
        }}
      />
    </div>
  );
}

export function StemFxPanel({ deck, i, label, color, rerender, onClose }: Props) {
  const [djRack] = useState(() => deck.stemFxRack(i));
  const filter = deck.stemFilterX[i] ?? 0;
  const drive = deck.stemDriveAmt[i] ?? 0;
  const verb = deck.stemReverbSend[i] ?? 0;
  const delay = deck.stemDelaySend[i] ?? 0;
  const fxVol = deck.stemFxVol[i] ?? 0.4;

  function apply(f: number, d: number, v: number, dl: number) {
    deck.setStemFilter(i, f);
    deck.setStemDrive(i, d);
    deck.setStemReverbSend(i, v);
    deck.setStemDelaySend(i, dl);
    rerender();
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const filterLabel = Math.abs(filter) < 0.01 ? "OFF" : filter < 0 ? `LP ${pct(-filter)}` : `HP ${pct(filter)}`;

  // Portal to <body>: the stem strip is overflow-x-auto, which would clip a tall popover.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-black/60" onClick={onClose} />
      <div
        className="hw-panel fixed left-1/2 top-1/2 z-[100] flex max-h-[94vh] w-[min(420px,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto p-3"
        style={{ borderColor: `${color}66`, boxShadow: `0 14px 34px rgba(0,0,0,0.8), 0 0 22px ${color}33, inset 0 1px 0 rgba(255,255,255,0.07)` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color, textShadow: `0 0 8px ${color}88` }}>
            FX · {label}
          </span>
          <LevelBar deck={deck} i={i} color={color} />
          <button className="hw-btn px-2 py-1 text-[10px] font-bold text-neutral-300" onClick={() => apply(0, 0, 0, 0)} title="Remet les quatre effets de ce stem à zéro">
            RESET
          </button>
          <button className="hw-btn px-2 py-1 text-[11px] font-bold text-neutral-400" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="hw-btn px-2.5 py-1 text-[11px] font-bold"
              style={{ ["--led" as string]: p.hue, color: p.hue }}
              title={p.title}
              onClick={() => apply(p.filter, p.drive, p.verb, p.delay)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="hw-recess flex flex-col gap-1.5 p-2">
          <XyPad
            filter={filter}
            drive={drive}
            color={color}
            onChange={(f, d) => {
              deck.setStemFilter(i, f);
              deck.setStemDrive(i, d);
              rerender();
            }}
          />
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span style={{ color: filter !== 0 ? color : "#6b7280" }}>FILTRE {filterLabel}</span>
            <span style={{ color: drive > 0.005 ? color : "#6b7280" }}>DRIVE {pct(drive)}</span>
          </div>
        </div>

        <div className="hw-recess flex items-center justify-around p-2">
          <Knob
            label="VOL FX"
            value={fxVol}
            min={0}
            max={1}
            defaultValue={0.4}
            color={color}
            size={58}
            led
            format={pct}
            onChange={(v) => {
              deck.setStemFxVol(i, v);
              rerender();
            }}
          />
          <Knob
            label="Reverb"
            value={verb}
            min={0}
            max={1}
            defaultValue={0}
            color={color}
            size={58}
            led
            format={pct}
            onChange={(v) => {
              deck.setStemReverbSend(i, v);
              rerender();
            }}
          />
          <Knob
            label="Delay"
            value={delay}
            min={0}
            max={1}
            defaultValue={0}
            color={color}
            size={58}
            led
            format={pct}
            onChange={(v) => {
              deck.setStemDelaySend(i, v);
              rerender();
            }}
          />
        </div>
        <span className="text-[10px] text-neutral-500">Pad : glisse pour doser filtre et drive · double-clic : zéro</span>
        {djRack && (
          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Effets DJ — {label} seul</span>
            <FxUnit rack={djRack} ids={STEM_FX} color={color} />
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
