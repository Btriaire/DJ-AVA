"use client";
import { RELEASES, type ReleaseSec } from "@/lib/audio/padRelease";

// RELEASE: how long a pad keeps sounding after it ends or is let go (the note's own tail, fading out)
export function ReleasePicker({ value, color, onChange }: { value: number; color: string; onChange: (v: ReleaseSec) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Release" title="RELEASE : le son continue et s'éteint doucement quand le pad se termine ou est relâché, au lieu de couper net">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--jam-text-2,#a3a3a3)]">Release</span>
      {RELEASES.map((r) => (
        <button
          key={r.label}
          type="button"
          role="radio"
          aria-checked={value === r.sec}
          onClick={() => onChange(r.sec)}
          className="rounded px-2 py-1 text-[11px] font-bold"
          style={value === r.sec ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          title={r.sec ? `${r.label} : ${r.sec} s de queue` : "Coupe net, comme avant"}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
