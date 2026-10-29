"use client";
import { useState } from "react";
import { Icon } from "../prep/parts";

export interface StationInfo {
  id: string;
  name: string;
  artistCount: number;
}

export interface StationBarProps {
  stations: StationInfo[];
  currentId: string;
  locked: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const TILE = ["#22d3ee", "#a78bfa", "#34d399", "#ffcc00", "#f97316", "#60a5fa"];

export function StationBar({ stations, currentId, locked, onSelect, onCreate, onRename, onDuplicate, onDelete }: StationBarProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleRename = (id: string) => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== stations.find(s => s.id === id)?.name) {
      onRename(id, trimmed);
    }
    setEditing(null);
    setDraft("");
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  return (
    <nav aria-label="Mes radios" className="prep-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Mes radios</span>
        <span className="text-[10px] font-mono text-neutral-500">{stations.length}</span>
      </div>

      <div className="flex gap-3 overflow-x-auto p-1 -m-1 pb-1 snap-x">
        {stations.map(({ id, name, artistCount }, index) => {
          const current = id === currentId;
          const tileColor = TILE[index % 6];
          const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

          return (
            <div key={id} className="shrink-0 snap-start">
              {editing === id ? (
                <div
                  className={`w-28 rounded-lg p-2.5 bg-[color-mix(in_srgb,_var(--prep-surface)_70%,_#000)] hover:bg-[color-mix(in_srgb,_var(--prep-surface-2)_70%,_#000)] transition-colors ${current ? 'ring-2 ring-[var(--prep-accent)]' : ''}`}
                >
                  <div className="relative mb-2">
                    <div
                      className="aspect-square w-full rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                      style={{ background: `color-mix(in srgb, ${tileColor} 26%, #0b0b0f)` }}
                    >
                      <div
                        className="flex h-full items-center justify-center text-2xl font-black"
                        style={{ color: `${tileColor}` }}
                      >
                        {initials}
                      </div>
                    </div>
                    {current && (
                      <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--prep-accent)]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M5 12l5 5L20 7" stroke="#050505" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <input
                      className="prep-input w-full px-1.5 py-1 text-xs font-bold"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(id);
                        if (e.key === "Escape") {
                          setEditing(null);
                          setDraft("");
                        }
                      }}
                      onBlur={() => handleRename(id)}
                      autoFocus
                      aria-label="Nom de la radio"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-pressed={current}
                  className={`w-28 rounded-lg p-2.5 bg-[color-mix(in_srgb,_var(--prep-surface)_70%,_#000)] hover:bg-[color-mix(in_srgb,_var(--prep-surface-2)_70%,_#000)] transition-colors ${current ? 'ring-2 ring-[var(--prep-accent)]' : ''}`}
                  onClick={() => {
                    handleCancelDelete();
                    if (!current) onSelect(id);
                  }}
                  disabled={locked && !current}
                  aria-label={`${name} : ${artistCount} artiste(s)`}
                >
                  <div className="relative mb-2">
                    <div
                      className="aspect-square w-full rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                      style={{ background: `color-mix(in srgb, ${tileColor} 26%, #0b0b0f)` }}
                    >
                      <div
                        className="flex h-full items-center justify-center text-2xl font-black"
                        style={{ color: `${tileColor}` }}
                      >
                        {initials}
                      </div>
                    </div>
                    {current && (
                      <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--prep-accent)]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M5 12l5 5L20 7" stroke="#050505" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold truncate">{name}</div>
                    <div className="text-[11px] text-neutral-500">{artistCount} artiste(s)</div>
                  </div>
                </button>
              )}

              {current && (
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"
                    onClick={() => {
                      setEditing(id);
                      setDraft(name);
                      handleCancelDelete();
                    }}
                    disabled={locked}
                    aria-label="Renommer la radio"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"
                    onClick={() => {
                      if (stations.length > 1) handleDelete(id);
                    }}
                    disabled={locked || stations.length < 2}
                    aria-label={confirmDelete === id ? "Confirmer la suppression" : "Supprimer la radio"}
                  >
                    {confirmDelete === id ? (
                      <span className="text-[11px] font-bold text-red-400">Supprimer ?</span>
                    ) : (
                      <Icon name="trash" size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"
                    onClick={() => {
                      onDuplicate(id);
                      handleCancelDelete();
                    }}
                    disabled={locked}
                    aria-label="Dupliquer la radio"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="flex shrink-0 snap-start self-stretch min-h-[148px] w-28 items-center justify-center rounded-lg border border-dashed border-[var(--prep-line)] bg-[color-mix(in_srgb,_var(--prep-surface)_70%,_#000)] hover:bg-[color-mix(in_srgb,_var(--prep-surface-2)_70%,_#000)] transition-colors disabled:opacity-30"
          onClick={() => {
            onCreate();
            handleCancelDelete();
          }}
          disabled={locked}
          aria-label="Nouvelle radio"
        >
          <div className="flex flex-col items-center gap-1">
            <Icon name="plus" size={22} />
            <span className="text-xs">Nouvelle radio</span>
          </div>
        </button>
      </div>
    </nav>
  );
}
