"use client";
import { useState } from "react";
import { BpmChip, Cover, Icon, KeyChip } from "../prep/parts";
import type { RadioState } from "@/lib/radio";

export interface RunPanelProps {
  state: RadioState;
  onCancel: () => void;
  onRegenerate?: (artistId: string) => void; // a new list of songs for one artist
  onMore?: (artistId: string) => void; // more songs by the same artist, the current ones are kept
  canExtend?: (artistId: string) => boolean; // offered as soon as the first songs of the artist are analysed
  onAnalyze?: () => void; // after a radio built without analysis: analyse tempo and key, then order the sets properly
}

const hueOf = (name: string) => (Array.from(name).reduce((sum, c) => sum + c.charCodeAt(0), 0) * 7) % 360;
const fmtEta = (s: number) => (s < 60 ? `${Math.max(s, 1)} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);

// Progress of the search and analysis. Detailed while it runs, one line once it is over (the list is a click away).
export function RunPanel({ state, onCancel, onRegenerate, onMore, canExtend, onAnalyze }: RunPanelProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  if (state.phase === "idle") return null;

  const running = state.phase === "search" || state.phase === "analyze";
  const open = userOpen ?? running;
  // reserve songs that were never needed do not count
  const items = state.items.filter((i) => !(i.spare && i.status === "found"));
  const ready = items.filter((i) => i.status === "ready").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const searching = state.artists.some((a) => a.status === "wait" || a.status === "search");
  const share = items.length > 0 ? (ready + failed) / items.length : 0;

  const title = running
    ? searching
      ? "Recherche sur YouTube et analyse…"
      : "Analyse du tempo et de la tonalité…"
    : state.phase === "done"
      ? `Terminé : ${ready} titres prêts${failed ? `, ${failed} ignoré(s)` : ""}`
      : "Radio arrêtée";

  return (
    <section className="prep-card flex flex-col gap-3 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black text-neutral-100">{title}</h2>
        {running && state.etaSec !== null && <span className="font-mono text-[11px] text-neutral-500">environ {fmtEta(state.etaSec)} restantes</span>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="prep-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-[11px]" onClick={() => setUserOpen(!open)} aria-expanded={open}>
            {open ? "Masquer le détail" : "Voir le détail"}
            <Icon name="chevron" size={12} className={open ? "rotate-180" : ""} />
          </button>
          {running && (
            <button type="button" className="prep-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-[11px]" onClick={onCancel} title="Arrête la radio : les sets sont composés avec les titres déjà analysés">
              <Icon name="x" size={12} />
              Arrêter
            </button>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--prep-line)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className={`h-full bg-[var(--prep-accent)] transition-[width] duration-500 ${running && items.length === 0 ? "animate-pulse" : ""}`} style={{ width: items.length === 0 && running ? "35%" : `${share * 100}%` }} />
      </div>
      <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-neutral-500">
        {state.prefs?.analysis === "none" ? `${items.length} titres, sans analyse du tempo ni de la tonalité` : `${ready}/${items.length} analysés${failed > 0 ? ` · ${failed} échec(s)` : ""}`}
        {state.prefs?.analysis === "none" && !running && onAnalyze && (
          <button type="button" className="prep-btn-ghost px-2 py-0.5 font-sans text-[10px]" onClick={onAnalyze} title="Mesure le tempo et la tonalité des titres puis recompose les sets avec un meilleur ordre">
            Analyser et réordonner
          </button>
        )}
      </p>

      {open && (
        <ul className="flex flex-col gap-3">
          {state.artists.map((a) => {
            const mine = items.filter((i) => i.artist === a.name);
            return (
              <li key={a.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: `hsl(${hueOf(a.name)} 55% 38%)` }}>
                    {a.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase() ?? "")
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-100">{a.name}</span>
                  {canExtend?.(a.id) && onMore && (
                    <button type="button" className="prep-btn-ghost flex items-center gap-1 px-2 py-0.5 text-[10px]" onClick={() => onMore(a.id)} title={`Plus de titres de ${a.name} : ceux de la liste sont gardés`}>
                      <Icon name="plus" size={11} />
                      Autre
                    </button>
                  )}
                  {canExtend?.(a.id) && onRegenerate && (
                    <button type="button" className="prep-btn-ghost flex items-center gap-1 px-2 py-0.5 text-[10px]" onClick={() => onRegenerate(a.id)} title={`Refaire la liste de ${a.name} avec d'autres titres`}>
                      <Icon name="refresh" size={11} />
                      Refaire la liste
                    </button>
                  )}
                  <span className="text-[11px]">
                    {a.status === "wait" ? (
                      <span className="text-neutral-500">En attente</span>
                    ) : a.status === "search" ? (
                      <span className="animate-pulse text-[var(--prep-accent)]">Recherche…</span>
                    ) : a.status === "done" ? (
                      <span className="text-neutral-400">{`${mine.filter((i) => i.status === "ready").length}/${mine.length} titres`}</span>
                    ) : a.status === "empty" ? (
                      <span className="text-amber-500" title="Aucun titre correct trouvé : essaie l'orthographe exacte du nom">
                        Rien trouvé
                      </span>
                    ) : (
                      <span className="text-red-500">Erreur</span>
                    )}
                  </span>
                </div>
                {mine.length > 0 && (
                  <ul className="flex flex-col gap-1 pl-8">
                    {mine.map((i) => (
                      <li key={i.key} className="flex items-center gap-2 text-[11px]">
                        <Cover art={i.art} name={i.title} camelot={i.camelot} size={20} rounded={4} />
                        <span className="min-w-0 flex-1 truncate text-neutral-300" title={i.title}>
                          {i.title}
                        </span>
                        {i.status === "found" && <span className="text-neutral-600">en attente</span>}
                        {i.status === "analyzing" && <span className="animate-pulse text-[var(--prep-accent)]">analyse…</span>}
                        {i.status === "ready" && (
                          <>
                            <BpmChip bpm={i.bpm} estimated />
                            <KeyChip camelot={i.camelot} />
                          </>
                        )}
                        {i.status === "failed" && (
                          <span className="text-red-500" title="Analyse impossible : le titre est ignoré">
                            échec
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
