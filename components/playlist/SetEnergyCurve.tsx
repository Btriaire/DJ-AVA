"use client";
import { useEffect, useState } from "react";
import type { SetArc } from "@/lib/setBuilder";
import { arcFit, arcLine, energyJumps, trackEnergy, type EnergyTrack } from "@/lib/setEnergy";

const ARCS: [SetArc, string][] = [["flow","Égal"],["rise","Montée"],["peak","Pic"],["fall","Descente"],["wave","Vagues"]];

export function SetEnergyCurve({ tracks, names }: { tracks: EnergyTrack[]; names: string[] }) {
  const [arc, setArc] = useState<SetArc>("rise");
  const energy = tracks.map(trackEnergy);
  const known = energy.filter((e): e is number => e !== null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const line = arcLine(arc, tracks.length, lo, hi);
  const fit = arcFit(energy, arc);
  const jumps = energyJumps(tracks);

  if (known.length < 2) {
    return <p className="text-[11px] text-neutral-400">Il faut le tempo d’au moins deux morceaux pour tracer l’énergie.</p>;
  }

  const x = (i: number) => tracks.length > 1 ? 2 + i * 96 / (tracks.length - 1) : 50;
  const y = (v: number) => 36 - v * 32;

  return (
    <div className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Énergie du set</span>
        {ARCS.map(([a, label]) => (
          <button
            key={a}
            className="rounded px-2 py-0.5 text-[10px] font-bold"
            style={a === arc ? { background: "oklch(0.82 0.12 230)", color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            onClick={() => setArc(a)}
            aria-pressed={a === arc}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-bold" style={{ color: fit >= 75 ? "#34d399" : fit >= 50 ? "#fbbf24" : "#f87171" }}>
          {fit} % fidèle à l’arc
        </span>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Courbe d’énergie du set comparée à l’arc choisi">
        <polyline
          points={line.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          stroke="oklch(0.7 0.05 230)"
          strokeDasharray="2 2"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
        <polyline
          points={energy.map((e, i) => e !== null ? `${x(i)},${y(e)}` : null).filter((p): p is string => p !== null).join(" ")}
          stroke="oklch(0.85 0.14 75)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
        {jumps.map((j) => (
          <line
            key={j.i}
            x1={(x(j.i - 1) + x(j.i)) / 2}
            x2={(x(j.i - 1) + x(j.i)) / 2}
            y1="2"
            y2="38"
            stroke="#f87171"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${names[j.i - 1]} → ${names[j.i]} : ${j.why}`}</title>
          </line>
        ))}
        {energy.map((e, i) => e !== null && (
          <circle
            key={i}
            cx={x(i)}
            cy={y(e)}
            r="1.2"
            fill="oklch(0.85 0.14 75)"
          >
            <title>{`${i + 1}. ${names[i]} — énergie ${Math.round(e * 100)} %`}</title>
          </circle>
        ))}
      </svg>
      <p className="text-[10px] text-neutral-400">trait plein : ton set · pointillé : l’arc visé · rouge : saut trop brusque</p>
      {jumps.length > 0 && (
        <ul className="text-[11px] text-neutral-200">
          {jumps.slice(0, 6).map((j) => (
            <li key={j.i}>{`${j.i}→${j.i + 1} : ${names[j.i - 1]} → ${names[j.i]} (${j.why})`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// the curve for a list of library songs: the real loudness of each prepared song is read from its analyses
export function SetEnergyPanel({ list }: { list: { id: string; name: string; bpm?: number; camelot?: string; stemHash?: string }[] }) {
  const [lufs, setLufs] = useState<Record<string, number>>({});
  const hashes = list.map((t) => t.stemHash).filter((h): h is string => !!h).join(",");
  useEffect(() => {
    let live = true;
    for (const h of hashes ? hashes.split(",") : []) {
      fetch(`/api/stems/fx?read=1&hash=${h}&model=htdemucs`)
        .then((r) => r.json() as Promise<{ fx: { lufs: number } | null }>)
        .then((j) => { if (live && j.fx) setLufs((m) => ({ ...m, [h]: j.fx!.lufs })); })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [hashes]);
  return <SetEnergyCurve tracks={list.map((t) => ({ bpm: t.bpm, camelot: t.camelot, lufs: t.stemHash ? lufs[t.stemHash] : undefined }))} names={list.map((t) => t.name)} />;
}
