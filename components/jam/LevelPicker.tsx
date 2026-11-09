"use client";

export function LevelPicker({ label, names, index, onChange, color }: { label: string; names: string[]; index: number; onChange: (i: number) => void; color: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="text-[10px] text-[var(--jam-text-3)]">{label}</div>
      <div className="flex gap-[2px]">
        {names.map((name, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === index}
            onClick={() => onChange(i)}
            className="flex items-center justify-center min-h-[28px] px-2 rounded-[6px] border text-[11px] font-black uppercase tracking-[0.15em]"
            style={{
              borderColor: "oklch(0.32 0.015 260)",
              color: i === index ? "#0a0a0a" : "oklch(0.92 0.01 260)",
              background: i === index ? `color-mix(in oklab, ${color} 80%, black)` : "oklch(0.21 0.012 260)",
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
