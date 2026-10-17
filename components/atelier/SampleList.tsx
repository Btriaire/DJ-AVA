"use client";

import { WorkSample } from "@/lib/atelier/types";

export function SampleList({
  samples,
  curId,
  savedIds,
  color,
  onSelect,
  onRename,
  onRemove,
  onPlay,
  onSave,
  onKeys,
  onWav,
}: {
  samples: WorkSample[];
  curId: string | null;
  savedIds: Set<string>;
  color: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onPlay: (s: WorkSample, loop: boolean) => void;
  onSave: (s: WorkSample) => void;
  onKeys: (s: WorkSample) => void;
  onWav: (s: WorkSample) => void;
}) {
  if (samples.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500">
        Pas encore de sample : sélectionne un passage puis + SAMPLE, ou découpe automatiquement en mesures ou aux attaques.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {samples.map((s) => (
        <div
          key={s.id}
          className="hw-recess flex flex-col gap-1.5 p-2"
          style={{ boxShadow: curId === s.id ? `0 0 0 1px ${color}` : undefined }}
        >
          <input
            className="bg-transparent text-[12px] font-bold"
            value={s.name}
            onChange={(e) => onRename(s.id, e.target.value)}
          />
          <div className="text-[10px] text-neutral-400">
            {s.buf.duration.toFixed(2)} s
            {s.bpm > 0 ? ` • ${Math.round(s.bpm)} BPM` : ""}
            {s.key ? ` • ${s.key}` : ""}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              className="hw-btn px-1.5 py-1 text-[10px] font-bold"
              onClick={() => onPlay(s, false)}
              title="Écouter"
            >
              ▶
            </button>
            <button
              className="hw-btn px-1.5 py-1 text-[10px] font-bold"
              onClick={() => onPlay(s, true)}
              title="Écouter en boucle"
            >
              ⟳
            </button>
            <button
              className={`hw-btn px-1.5 py-1 text-[10px] font-bold ${curId === s.id ? "hw-btn-on" : ""}`}
              onClick={() => onSelect(s.id)}
              title="Séparer ce sample en stems"
            >
              STEMS
            </button>
            <button
              className={`hw-btn px-1.5 py-1 text-[10px] font-bold ${savedIds.has(s.id) ? "hw-btn-on" : ""}`}
              onClick={() => onSave(s)}
              disabled={savedIds.has(s.id)}
            >
              {savedIds.has(s.id) ? "SAUVÉ" : "SAUVER"}
            </button>
            <button
              className="hw-btn px-1.5 py-1 text-[10px] font-bold"
              onClick={() => onKeys(s)}
              title="Jouer ce sample au mini clavier"
            >
              CLAVIER
            </button>
            <button
              className="hw-btn px-1.5 py-1 text-[10px] font-bold"
              onClick={() => onWav(s)}
              title="Télécharger le WAV"
            >
              ⤓ WAV
            </button>
            <button
              className="hw-btn px-1.5 py-1 text-[10px] font-bold"
              onClick={() => onRemove(s.id)}
              title="Supprimer"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
