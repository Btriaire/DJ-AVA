"use client";
import { useState } from "react";
import { Knob } from "../Knob";
import { PAD_EQ_BANDS } from "@/lib/audio/padFx";

export function PadEqSection({ gains, color, onGain, onAuto, onReset }: { gains: number[]; color: string; onGain: (i: number, db: number) => void; onAuto: () => Promise<number[] | null>; onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5 rounded p-1.5 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-200">Mini-EQ</span>
        <button
          title="Écoute la rangée 1,5 s pendant qu'elle joue, puis corrige à moitié vers un son équilibré, avec ce que ce stem demande (voix devant, basse ronde, batterie qui claque…)"
          disabled={busy}
          style={{ background: color, color: "#0a0a0a" }}
          className="rounded px-2 py-0.5 text-[10px] font-black disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            const g = await onAuto();
            setBusy(false);
            setNote(g ? `Corrigé : ${g.map((x) => (x > 0 ? "+" : "") + x).join(" / ")} dB` : "Lance un pad de cette rangée, puis AUTO");
          }}
        >
          {busy ? "J'écoute…" : "AUTO"}
        </button>
        <button
          title="Remet le mini-EQ à plat"
          onClick={onReset}
          className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
        >
          0
        </button>
      </div>
      <div className="flex justify-between">
        {PAD_EQ_BANDS.map((band, i) => (
          <Knob
            key={i}
            label={band.label}
            value={gains[i] ?? 0}
            min={-12}
            max={12}
            defaultValue={0}
            size={34}
            led
            color={color}
            format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`}
            onChange={(v) => onGain(i, v)}
          />
        ))}
      </div>
      {note && <p className="text-[10px] leading-tight text-neutral-300" aria-live="polite">{note}</p>}
    </div>
  );
}
