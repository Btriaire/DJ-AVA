"use client";
import { useRef } from "react";
import { SEQ_ROWS, type BeatLab, type SEQ_PRESETS, type SeqRow } from "@/lib/audio/jamModules";

const PRESETS: [keyof typeof SEQ_PRESETS, string][] = [["four", "4/4"], ["house", "House"], ["techno", "Techno"], ["disco", "Disco"], ["funk", "Funk"], ["break", "Break"], ["boombap", "Boom bap"], ["trap", "Trap"], ["garage", "Garage"], ["dnb", "Drum & bass"], ["reggaeton", "Reggaeton"], ["dubstep", "Dubstep"], ["electro", "Électro"], ["rock", "Rock"], ["bossa", "Bossa"], ["clear", "Effacer"]];
const ROW_LABEL: Record<SeqRow, string> = { kick: "KICK", snare: "SNARE", clap: "CLAP", hat: "CH", open: "OH", tom: "TOM", perc: "PERC" };
import { useTick } from "../ticker";

export function StepGrid({ beat, color }: { beat: BeatLab; color: string }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useTick(() => {
    const step = beat.currentStep();
    if (overlayRef.current) {
      const bars = overlayRef.current.children;
      for (let i = 0; i < bars.length; i++) {
        (bars[i] as HTMLElement).style.background = i === step ? color : "rgba(255,255,255,.08)";
      }
    }
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <button
          aria-pressed={beat.seq}
          onClick={() => beat.set("seq", !beat.seq)}
          className="px-3 py-1.5 text-xs font-bold rounded"
          style={beat.seq ? { background: `color-mix(in srgb, ${color} 35%, #111)`, color: "#fff", boxShadow: `inset 0 0 0 1px ${color}` } : { background: "rgba(255,255,255,.05)", color: "var(--jam-text-3)" }}
        >
          SÉQUENCEUR
        </button>
        {PRESETS.map(([name, label]) => (
          <button
            key={name}
            type="button"
            onClick={() => beat.setPreset(name)}
            className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold text-[var(--jam-text-3)] hover:bg-white/10"
          >
            {label}
          </button>
        ))}
      </div>
      {SEQ_ROWS.map((row) => (
        <div key={row} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[9px] font-black tracking-[0.15em] text-[var(--jam-text-2)]">{ROW_LABEL[row]}</span>
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
            {beat.pattern[row].map((on, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`${ROW_LABEL[row]} pas ${i + 1}`}
                onClick={() => beat.toggleStep(row, i)}
                className="h-6 rounded-sm"
                style={{ background: on ? color : i % 4 === 0 ? "rgba(255,255,255,.11)" : "rgba(255,255,255,.06)", boxShadow: on ? `0 0 6px ${color}` : "none" }}
              />
            ))}
          </div>
        </div>
      ))}
      {/* the step playing now, moved by the ticker without re-rendering */}
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0" />
        <div ref={overlayRef} className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
          {Array.from({ length: 16 }, (_, i) => <div key={i} className="h-1 rounded-full" style={{ background: "rgba(255,255,255,.08)" }} />)}
        </div>
      </div>
    </div>
  );
}
