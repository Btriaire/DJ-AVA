"use client";
import { CALM_COLLECTIONS, COLLECTIONS, STYLES, ZEN_COLLECTIONS } from "@/lib/styles";
import { Icon } from "../prep/parts";
import type { Genre } from "@/lib/djForce";

export interface CatalogPanelProps {
  kind: "style" | "collection" | "zen" | "calm";
  chosen: string[]; // names of the artists / collections already in the radio
  locked: boolean;
  onToggleStyle: (artists: string[], on: boolean, genre: Genre) => void;
  onToggleCollection: (label: string, genre: Genre) => void;
}

const chip = (on: boolean) => ({
  borderColor: on ? "var(--prep-accent)" : "var(--prep-line)",
  backgroundColor: on ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent",
});

// Radio by style (a style brings its typical artists) or by collection (a named list of songs).
export function CatalogPanel({ kind, chosen, locked, onToggleStyle, onToggleCollection }: CatalogPanelProps) {
  const have = new Set(chosen.map((n) => n.toLowerCase()));
  return (
    <section className="prep-card flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">{kind === "style" ? "Styles de musique" : kind === "zen" ? "Ambiances zen" : kind === "calm" ? "Piano calme" : "Collections"}</h3>
        <p className="text-[12px] text-neutral-400">
          {kind === "style"
            ? "Touche un style : ses artistes typiques rejoignent ta liste (tu peux en retirer ou en ajouter). Touche-le encore pour les retirer."
            : kind === "zen"
              ? "Des titres ambient et méditatifs, enchaînés par de très longs fondus, presque sans effet DJ. « Autre » en propose d'autres."
              : kind === "calm"
                ? "Du piano calme et doux, enchaîné en douceur, avec seulement une réverb ou un écho léger. « Autre » en propose d'autres."
                : "Une collection est une liste de titres précis (hits d'une époque, soirée disco...). « Autre » et « Régénérer » en proposent d'autres."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "style"
          ? STYLES.map((st) => {
              const on = st.artists.every((a) => have.has(a.toLowerCase()));
              return (
                <button key={st.key} type="button" aria-pressed={on} disabled={locked} onClick={() => onToggleStyle(st.artists, !on, st.genre)} className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold" style={chip(on)} title={st.artists.join(", ")}>
                  {on && <Icon name="check" size={12} />}
                  {st.label}
                </button>
              );
            })
          : (kind === "zen" ? ZEN_COLLECTIONS : kind === "calm" ? CALM_COLLECTIONS : COLLECTIONS).map((c) => {
              const on = have.has(c.label.toLowerCase());
              return (
                <button key={c.key} type="button" aria-pressed={on} disabled={locked} onClick={() => onToggleCollection(c.label, c.genre)} className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold" style={chip(on)} title={`${c.songs.length} titres : ${c.songs.slice(0, 3).map((x) => x.title).join(", ")}...`}>
                  {on && <Icon name="check" size={12} />}
                  {c.label}
                  <span className="font-mono text-[10px]">{c.songs.length}</span>
                </button>
              );
            })}
      </div>
    </section>
  );
}
