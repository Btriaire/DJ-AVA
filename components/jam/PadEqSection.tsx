"use client";
import { useState } from "react";
import { PAD_EQ_BANDS } from "@/lib/audio/padFx";

export function PadEqSection({ gains, color, onGain, onAuto, onReset }: { gains: number[]; color: string; onGain: (i: number, db: number) => void; onAuto: () => Promise<number[] | null>; onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1 rounded p-1 ring-1 ring-white/10">
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-300">Mini-EQ</span>
        <button
          type="button"
          title="Écoute la rangée 1,5 s pendant qu'elle joue, puis corrige vers un son équilibré avec ce que ce stem demande"
          disabled={busy}
          style={{ background: color, color: "#0a0a0a" }}
          className="rounded px-1.5 py-0.5 text-[9px] font-black disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const g = await onAuto();
              setNote(g ? `Corrigé ${g.map((x) => (x > 0 ? "+" : "") + x).join(" / ")} dB` : "Lance un pad de cette rangée, puis AUTO");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "AUTO"}
        </button>
        <button
          type="button"
          title="Remet le mini-EQ à plat"
          onClick={onReset}
          className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold"
          style={{ background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
        >
          0
        </button>
      </div>
      {PAD_EQ_BANDS.map((band, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-14 truncate text-[9px] text-neutral-300">{band.label}</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={gains[i] ?? 0}
            onChange={(e) => onGain(i, Number(e.target.value))}
            aria-label={`${band.label} en dB`}
            className="h-1 min-w-0 flex-1"
            style={{ accentColor: color }}
          />
          <span className="w-10 text-right font-mono text-[9px] text-neutral-200">
            {(gains[i] ?? 0) > 0 ? "+" : ""}{gains[i] ?? 0} dB
          </span>
        </div>
      ))}
      {note && <p className="text-[9px] leading-tight text-neutral-300" aria-live="polite">{note}</p>}
    </div>
  );
}
