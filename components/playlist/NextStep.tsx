"use client";
import type { SetHealth } from "@/lib/setHealth";
import { STATUS_LABEL } from "@/lib/setHealth";
import { Icon } from "../prep/parts";

export const STATUS_COLOR = { empty: "#7b8494", draft: "#f59e0b", ready: "#38bdf8", perfect: "#34d399" } as const;

// "Where is this set at, and what should I do now?": a checklist and one primary action.
// flat = no card around it (inside another card); hidePlay = the launch button is already on screen next to it.
export function NextStepBar({ health, busy, onAction, flat = false, hidePlay = false }: { health: SetHealth; busy: boolean; onAction: (id: SetHealth["next"]["id"]) => void; flat?: boolean; hidePlay?: boolean }) {
  const h = health;
  const checks = [
    { ok: h.count >= 2, label: "2 titres ou plus" },
    { ok: h.count > 0 && h.bpmMissing === 0, label: "tempos" },
    { ok: h.count > 0 && h.keyMissing === 0, label: "tonalités" },
    { ok: h.count > 1 && h.clash / Math.max(h.count - 1, 1) <= 0.34, label: "ordre" },
    { ok: h.count > 0 && h.stemsReady === h.count, label: `stems ${h.stemsReady}/${h.count}` },
  ];
  const color = STATUS_COLOR[h.status];
  const showButton = h.next.id !== "add" && !(hidePlay && h.next.id === "play");
  return (
    <div className={`flex flex-col gap-2 ${flat ? "" : "prep-card p-3"}`} style={flat ? undefined : { boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-full px-2 py-px text-[10px] font-black uppercase tracking-wider" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          {STATUS_LABEL[h.status]}
        </span>
        <span className="min-w-0 flex-1 basis-[200px] text-[12px] text-neutral-300">{h.next.detail}</span>
        {h.next.id === "add" ? (
          <span className="text-[11px] font-bold" style={{ color }}>{h.next.label} : glisse-les depuis la bibliothèque</span>
        ) : (
          showButton && (
            <button type="button" onClick={() => onAction(h.next.id)} disabled={busy} className="prep-btn-accent flex min-h-9 items-center gap-1.5 px-3 text-xs">
              {busy ? "Analyse en cours…" : h.next.label}
            </button>
          )
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" aria-label="Contrôles du set">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-1" style={{ color: c.ok ? "#34d399" : "#8b93a1" }}>
            {c.ok ? <Icon name="check" size={12} /> : <span className="inline-block h-2.5 w-2.5 rounded-full border border-current" aria-hidden />}
            {c.label}
            <span className="sr-only">{c.ok ? " : bon" : " : à régler"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
