"use client";
// Répétition des appuis : un pad maintenu se répète sur la grille ; le voyant s'allume quand c'est actif
export function RepeatSwitch({ on, onChange, color, label = "Répéter" }: { on: boolean; onChange: (v: boolean) => void; color: string; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title="Un pad maintenu se répète sur la grille tant qu'on le tient"
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.15em]"
      style={{ borderColor: on ? color : "oklch(0.32 0.015 260)", color: on ? color : "oklch(0.78 0.01 260)", background: "oklch(0.18 0.012 260)" }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: on ? color : "oklch(0.38 0.01 260)", boxShadow: on ? `0 0 8px ${color}` : "none" }} />
      {label}
    </button>
  );
}
