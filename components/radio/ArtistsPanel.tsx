"use client";
import { useState } from "react";
import { Icon } from "../prep/parts";
import type { RadioArtist } from "@/lib/radio";

export interface ArtistsPanelProps {
  artists: RadioArtist[];
  suggestions: { name: string; count: number }[];
  locked: boolean;
  onAdd: (names: string[]) => void;
  onRemove: (id: string) => void;
  onLove: (id: string, love: 1 | 2 | 3) => void;
  onClear: () => void;
}

export function ArtistsPanel({ artists, suggestions, locked, onAdd, onRemove, onLove, onClear }: ArtistsPanelProps) {
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    if (!draft.trim() || locked) return;
    const names = draft.split(/[,;\n]/).map(n => n.trim()).filter(n => n);
    onAdd(names);
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <section className="prep-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Tes artistes</h2>
        <div className="flex items-center gap-2">
          {artists.length > 0 && !locked && (
            <button
              type="button"
              className="text-[11px] text-neutral-400 hover:text-white"
              onClick={onClear}
            >
              Tout retirer
            </button>
          )}
          <span className="rounded-full bg-[var(--prep-line)] px-2 py-0.5 text-[10px] font-mono tabular-nums text-neutral-300">
            {artists.length}
          </span>
        </div>
      </div>
      <p className="text-[12px] text-neutral-400">
        Chanteurs ou groupes que tu aimes. Plus la priorité est haute, plus la radio en prend.
      </p>

      <div className="flex gap-2">
        <input
          className="prep-input min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder="Un chanteur ou un groupe : Daft Punk, Indochine…"
          aria-label="Ajouter un artiste"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={locked}
        />
        <button
          type="button"
          className="prep-btn-accent flex items-center gap-1.5 px-3 py-2 text-sm"
          onClick={handleAdd}
          disabled={!draft.trim() || locked}
        >
          <Icon name="plus" size={16} />
          Ajouter
        </button>
      </div>

      {artists.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--prep-line)] px-4 py-8 text-center">
          <span className="mx-auto mb-2 block w-fit opacity-70" style={{ color: "var(--prep-accent)" }}><Icon name="disc" size={36} /></span>
          <p className="font-bold">Commence par 3 ou 4 artistes que tu adores</p>
          <p className="text-neutral-400">Tape leur nom ci-dessus : la radio cherche leurs titres sur YouTube.</p>
          {!locked && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Pour essayer</span>
              {["Daft Punk", "Justice", "Stromae", "Indochine", "Depeche Mode"].map((n) => (
                <button key={n} type="button" onClick={() => onAdd([n])} className="rounded-full border border-dashed border-[var(--prep-line)] px-2.5 py-1 text-[11px] text-neutral-300 hover:border-[var(--prep-accent)] hover:text-white">
                  {`+ ${n}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {artists.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {artists.map((a) => {
            const hue = Array.from(a.name).reduce((sum, c) => sum + c.charCodeAt(0), 0) * 7 % 360;
            const initials = a.name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");

            return (
              <li key={a.id} className="prep-row flex items-center gap-2.5 border-[var(--prep-line)] px-2.5 py-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black text-[11px] text-white"
                  style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}
                >
                  {initials}
                </div>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-100" title={a.name}>
                  {a.name}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-300 hover:bg-[var(--prep-line)]"
                  onClick={() => onLove(a.id, a.love === 3 ? 1 : (a.love + 1) as 1 | 2 | 3)}
                  disabled={locked}
                  aria-label={`Priorité ${a.love} sur 3 : plus de titres de cet artiste`}
                  title={`Priorité ${a.love} sur 3 : plus de titres de cet artiste`}
                >
                  <span className="flex h-3 w-3 items-center justify-center">
                    <span className="h-1.5 w-0.75" style={{ backgroundColor: a.love >= 1 ? "var(--prep-accent)" : "var(--prep-line)" }} />
                  </span>
                  <span className="flex h-3 w-3 items-center justify-center">
                    <span className="h-2.5 w-0.75" style={{ backgroundColor: a.love >= 2 ? "var(--prep-accent)" : "var(--prep-line)" }} />
                  </span>
                  <span className="flex h-3 w-3 items-center justify-center">
                    <span className="h-3.5 w-0.75" style={{ backgroundColor: a.love >= 3 ? "var(--prep-accent)" : "var(--prep-line)" }} />
                  </span>
                </button>
                <button
                  type="button"
                  className="p-1 text-neutral-500 hover:text-white"
                  onClick={() => onRemove(a.id)}
                  disabled={locked}
                  aria-label={`Retirer ${a.name}`}
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {suggestions.length > 0 && !locked && (
        <div className="flex flex-wrap gap-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Dans ta bibliothèque</p>
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className="rounded-full border border-dashed border-[var(--prep-line)] px-2.5 py-1 text-[11px] text-neutral-300 hover:border-[var(--prep-accent)] hover:text-white"
              onClick={() => onAdd([s.name])}
              title={`Ajouter ${s.name} à ta radio`}
            >
              + {s.name} <span className="font-mono tabular-nums">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
