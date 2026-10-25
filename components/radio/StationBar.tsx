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
  locked: boolean; // the radio is running: nothing changes
  onSelect: (id: string) => void;
  onCreate: () => void; // a new empty station (the parent names it)
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void; // the parent never deletes the last station
}

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
    <nav aria-label="Mes radios" className="prep-card flex flex-wrap items-center gap-2 p-2">
      <span className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Mes radios</span>
      {stations.map(({ id, name, artistCount }) => {
        const current = id === currentId;
        if (editing === id) {
          return (
            <input
              key={id}
              className="prep-input w-44 px-2.5 py-1.5 text-xs font-bold"
              aria-label="Nom de la radio"
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
            />
          );
        }
        return (
          <div key={id} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={current}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold ${current
                ? "border-[var(--prep-accent)] bg-[color-mix(in_srgb,_var(--prep-accent)_14%,_transparent)] text-white"
                : "border-[var(--prep-line)] text-neutral-300"}`}
              onClick={() => {
                handleCancelDelete();
                if (!current) onSelect(id);
              }}
              disabled={locked && !current}
              title={`${name} : ${artistCount} artiste(s)`}
            >
              <span className="max-w-[160px] truncate">{name}</span>
              <span className="rounded-full bg-white/5 px-1.5 text-[10px] font-mono">{artistCount}</span>
            </button>
            {current && (
              <>
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
              </>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
        onClick={() => {
          onCreate();
          handleCancelDelete();
        }}
        disabled={locked}
        title="Une autre liste d'artistes avec ses propres réglages"
      >
        <Icon name="plus" size={14} />
        Nouvelle radio
      </button>
    </nav>
  );
}
