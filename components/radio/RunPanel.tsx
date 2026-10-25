"use client";
import { BpmChip, Cover, Icon, KeyChip } from "../prep/parts";
import type { RadioState } from "@/lib/radio";

export interface RunPanelProps {
  state: RadioState;
  onCancel: () => void;
}

export function RunPanel({ state, onCancel }: RunPanelProps) {
  if (state.phase === "idle") return null;

  const ready = state.items.filter(i => i.status === "ready").length;
  const failed = state.items.filter(i => i.status === "failed").length;
  const total = state.items.length;

  let progress = 0;
  if (state.phase === "search") {
    progress = 0.35; // indeterminate
  } else if (state.phase === "analyze" || state.phase === "done") {
    progress = total > 0 ? (ready + failed) / total : 0;
  }

  const title =
    state.phase === "search" ? "Recherche sur YouTube…" :
    state.phase === "analyze" ? "Analyse du tempo et de la tonalité…" :
    state.phase === "done" ? `Terminé : ${ready} titres prêts` :
    "Radio arrêtée";

  return (
    <section className="prep-card flex flex-col gap-3 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-neutral-100">{title}</h2>
        {(state.phase === "search" || state.phase === "analyze") && (
          <button
            type="button"
            className="prep-btn-ghost px-3 py-1.5 text-sm"
            onClick={onCancel}
          >
            <Icon name="x" size={16} className="mr-1" />
            Arrêter
          </button>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--prep-line)]">
        <div
          className="h-full bg-[var(--prep-accent)] transition-[width]"
          style={{
            width: `${progress * 100}%`,
            opacity: state.phase === "search" ? 0.35 : 1,
            animation: state.phase === "search" ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
          }}
        />
      </div>

      <p className="text-[11px] text-neutral-500">
        {ready}/{total} analysés{failed > 0 ? ` · ${failed} échec(s)` : ""}
      </p>

      <ul className="flex flex-col gap-3">
        {state.artists.map((a) => {
          const hue = Array.from(a.name).reduce((sum, c) => sum + c.charCodeAt(0), 0) * 7 % 360;
          const initials = a.name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
          const items = state.items.filter(i => i.artist === a.name);

          return (
            <li key={a.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-black text-[10px] text-white"
                  style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}
                >
                  {initials}
                </div>
                <span className="text-[12px] font-medium text-neutral-100">{a.name}</span>
                <span className="ml-auto text-[11px]">
                  {a.status === "wait" ? "En attente" :
                   a.status === "search" ? <span className="text-[var(--prep-accent)] animate-pulse">Recherche…</span> :
                   a.status === "done" ? `${a.found} titre(s)` :
                   a.status === "empty" ? <span className="text-amber-500">Rien trouvé</span> :
                   <span className="text-red-500">Erreur</span>}
                </span>
              </div>

              {items.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {items.map((i) => (
                    <li key={i.key} className="flex items-center gap-2 text-[11px]">
                      <Cover art={i.art} name={i.title} camelot={i.camelot} size={22} rounded={4} />
                      <span className="min-w-0 flex-1 truncate text-neutral-300" title={i.title}>
                        {i.title}
                      </span>
                      {i.status === "found" && <span className="text-neutral-500">en attente</span>}
                      {i.status === "analyzing" && <span className="text-[var(--prep-accent)] animate-pulse">analyse…</span>}
                      {i.status === "ready" && (
                        <>
                          <BpmChip bpm={i.bpm} estimated />
                          <KeyChip camelot={i.camelot} />
                        </>
                      )}
                      {i.status === "failed" && <span className="text-red-500" title="Analyse impossible : le titre sera ignoré">échec</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
