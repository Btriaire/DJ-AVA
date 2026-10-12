"use client";
import { createPortal } from "react-dom";
import type { Deck } from "../lib/audio/Deck";
import { Knob } from "./Knob";

interface Props {
  deck: Deck;
  i: number;
  label: string;
  color: string;
  rerender: () => void;
  onClose: () => void;
}

const PRESETS: { name: string; title: string; filter: number; drive: number; verb: number; delay: number }[] = [
  { name: "Étouffé", title: "Passe-bas : le stem passe derrière un mur", filter: -0.7, drive: 0, verb: 0, delay: 0 },
  { name: "Radio", title: "Passe-haut + grain : son de poste de radio", filter: 0.55, drive: 0.35, verb: 0, delay: 0 },
  { name: "Sale", title: "Grosse saturation", filter: 0, drive: 0.85, verb: 0, delay: 0 },
  { name: "Espace", title: "Grande reverb et écho", filter: 0, drive: 0, verb: 0.6, delay: 0.4 },
];

// Response of the DJ-style filter: x<0 low-pass sweep, x>0 high-pass sweep, 0 = flat.
function FilterCurve({ x, color }: { x: number; color: string }) {
  const W = 120;
  const H = 36;
  const cutoff = x === 0 ? null : Math.pow(Math.abs(x), 0.8);
  const pts: string[] = [];
  for (let k = 0; k <= 60; k++) {
    const f = k / 60;
    let g = 1;
    if (cutoff !== null) {
      const c = x < 0 ? 1 - cutoff : cutoff;
      const d = x < 0 ? Math.max(0, f - c) : Math.max(0, c - f);
      g = 1 / (1 + Math.pow(d * 9, 2));
    }
    pts.push(`${(f * W).toFixed(1)},${(H - 3 - g * (H - 8)).toFixed(1)}`);
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 rounded bg-black/50" aria-hidden>
      <line x1="0" y1={H - 3} x2={W} y2={H - 3} stroke="#2a2a2e" />
      <polyline points={pts.join(" ")} fill="none" stroke={x === 0 ? "#555" : color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// Soft-clip transfer curve (tanh), steeper with more drive.
function DriveCurve({ amt, color }: { amt: number; color: string }) {
  const W = 36;
  const H = 36;
  const k = 1 + amt * 8;
  const pts: string[] = [];
  for (let n = 0; n <= 36; n++) {
    const xin = (n / 36) * 2 - 1;
    const y = Math.tanh(xin * k) / Math.tanh(k);
    pts.push(`${(n).toFixed(1)},${(H / 2 - y * (H / 2 - 3)).toFixed(1)}`);
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 rounded bg-black/50" aria-hidden>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#2a2a2e" />
      <polyline points={pts.join(" ")} fill="none" stroke={amt < 0.01 ? "#555" : color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function StemFxPanel({ deck, i, label, color, rerender, onClose }: Props) {
  const filter = deck.stemFilterX[i] ?? 0;
  const drive = deck.stemDriveAmt[i] ?? 0;
  const verb = deck.stemReverbSend[i] ?? 0;
  const delay = deck.stemDelaySend[i] ?? 0;

  function apply(f: number, d: number, v: number, dl: number) {
    deck.setStemFilter(i, f);
    deck.setStemDrive(i, d);
    deck.setStemReverbSend(i, v);
    deck.setStemDelaySend(i, dl);
    rerender();
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const filterLabel = (v: number) => (Math.abs(v) < 0.01 ? "OFF" : v < 0 ? `LP ${pct(-v)}` : `HP ${pct(v)}`);

  // Portal to <body>: the stem strip is overflow-x-auto, which would clip a tall popover.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-black/55" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-[100] flex max-h-[92vh] w-[min(320px,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto rounded-xl p-3"
        style={{
          background: "linear-gradient(180deg,#1f1f22,#0d0d0f)",
          border: `1px solid ${color}55`,
          boxShadow: `0 12px 28px rgba(0,0,0,0.75), 0 0 16px ${color}22, inset 0 1px 0 rgba(255,255,255,0.07)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest" style={{ color }}>
            FX · {label}
          </span>
          <button
            className="hw-btn ml-auto px-2 py-1 text-[10px] font-bold text-neutral-300"
            onClick={() => apply(0, 0, 0, 0)}
            title="Remet les quatre effets de ce stem à zéro"
          >
            RESET
          </button>
          <button className="hw-btn px-2 py-1 text-[11px] font-bold text-neutral-400" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="hw-btn px-2 py-1 text-[10px] font-bold text-neutral-200"
              title={p.title}
              onClick={() => apply(p.filter, p.drive, p.verb, p.delay)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-black/30 p-2">
          <div className="flex flex-col items-center gap-1">
            <Knob
              label="Filtre"
              value={filter}
              min={-1}
              max={1}
              defaultValue={0}
              color={color}
              size={52}
              led
              format={filterLabel}
              onChange={(v) => {
                deck.setStemFilter(i, Math.abs(v) < 0.03 ? 0 : v);
                rerender();
              }}
            />
          </div>
          <FilterCurve x={filter} color={color} />
          <span className="text-[10px] leading-tight text-neutral-500">
            Gauche : étouffe
            <br />
            Droite : amincit
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-black/30 p-2">
          <Knob
            label="Drive"
            value={drive}
            min={0}
            max={1}
            defaultValue={0}
            color={color}
            size={52}
            led
            format={pct}
            onChange={(v) => {
              deck.setStemDrive(i, v);
              rerender();
            }}
          />
          <DriveCurve amt={drive} color={color} />
          <span className="text-[10px] leading-tight text-neutral-500">Saturation douce : chaleur et grain</span>
        </div>

        <div className="flex items-center justify-around rounded-lg bg-black/30 p-2">
          <Knob
            label="Reverb"
            value={verb}
            min={0}
            max={1}
            defaultValue={0}
            color={color}
            size={52}
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
            size={52}
            led
            format={pct}
            onChange={(v) => {
              deck.setStemDelaySend(i, v);
              rerender();
            }}
          />
        </div>
        <span className="text-[10px] text-neutral-600">Double-clic sur un potard : retour à zéro</span>
      </div>
    </>,
    document.body
  );
}
