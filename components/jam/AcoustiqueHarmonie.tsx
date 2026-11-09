"use client";
import { useState, useEffect } from "react";
import { HARMONY_STYLES, type ChordHarmony } from "@/lib/audio/chordHarmony";
import type { HarmonyColor } from "@/lib/audio/chordHarmony";
import { Knob } from "../Knob";

export function AcoustiqueHarmonie({ m, bump, color }: { m: ChordHarmony; bump: () => void; color: string }) {
  const [info, setInfo] = useState<{ line: string[]; status: string | null }>({ line: [], status: null });
  const formatPercent = (v: number) => `${Math.round(v * 100)} %`;

  useEffect(() => {
    const interval = setInterval(() => {
      setInfo({ line: m.chordLine(), status: m.loading() ?? m.warning() });
    }, 500);
    return () => clearInterval(interval);
  }, [m]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Style d&apos;harmonie</div>
        <div role="group" aria-label="Style d'harmonie" className="flex flex-wrap gap-1.5">
          <button
            key="off"
            type="button"
            aria-pressed={m.style === null}
            onClick={() => { m.setStyle(null); bump(); }}
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            style={m.style === null ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
          >
            Arrêt
          </button>
          {HARMONY_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={m.style === s.id}
              onClick={() => { m.setStyle(s.id); bump(); }}
              className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
              style={m.style === s.id ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Couleur</div>
        <div role="group" aria-label="Couleur des accords" className="flex flex-wrap gap-1.5">
          {["auto", "triad", "seventh", "ninth"].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={m.color === id}
              onClick={() => { m.setColor(id as HarmonyColor); bump(); }}
              className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
              style={m.color === id ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
            >
              {id === "auto" ? "Auto" : id === "triad" ? "Triade" : id === "seventh" ? "7e" : "9e"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Début de mesure</div>
        <div role="group" aria-label="Début de mesure" className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={m.shift === i - 1}
              onClick={() => { m.setShift(i - 1); bump(); }}
              className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
              style={m.shift === i - 1 ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
            >
              Temps {i}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Changements d&apos;accord</div>
        <div role="group" aria-label="Changements d'accord" className="flex flex-wrap gap-1.5">
          <button
            key="1"
            type="button"
            aria-pressed={m.changes === 1}
            onClick={() => { m.setChanges(1); bump(); }}
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            style={m.changes === 1 ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
          >
            1 par mesure
          </button>
          <button
            key="2"
            type="button"
            aria-pressed={m.changes === 2}
            onClick={() => { m.setChanges(2); bump(); }}
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            style={m.changes === 2 ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
          >
            2 par mesure
          </button>
        </div>
      </div>
      <div className="text-[10px] text-[var(--jam-text-3)]">Si les accords tombent à côté, décale le début de mesure.</div>
      <div className="flex items-center gap-4">
        <Knob label="VOLUME" value={m.level} min={0} max={1.5} defaultValue={0.8} onChange={(v) => { m.setLevel(v); bump(); }} color={color} size={46} format={formatPercent} led />
      </div>
      {m.style !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12px] text-[var(--jam-text)]">Accord : {info.line[0] ?? "à la lecture"}</span>
            <span className="text-[10px] text-[var(--jam-text-3)]">{HARMONY_STYLES.find((s) => s.id === m.style)?.hint}</span>
          </div>
          {info.line.length > 1 && (
            <div className="text-[10px] text-[var(--jam-text-3)]">Ensuite : {info.line.slice(1).join(" · ")}</div>
          )}
          <div role="status" className="text-[10px] text-[var(--jam-text-3)]">{info.status}</div>
        </div>
      )}
    </div>
  );
}
