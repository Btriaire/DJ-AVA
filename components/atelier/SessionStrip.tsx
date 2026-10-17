"use client";

import { useState, useEffect, useRef } from "react";
import { KIND_FR, type WorkSample } from "@/lib/atelier/types";

export function SessionStrip({
  sounds,
  curId,
  savedIds,
  color,
  onSelect,
  onRemove,
  onPlay,
  onClear,
}: {
  sounds: WorkSample[];
  curId: string | null;
  savedIds: Set<string>;
  color: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onPlay: (s: WorkSample) => void;
  onClear: () => void;
}) {
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const handleClear = () => {
    if (clearConfirm) {
      onClear();
      setClearConfirm(false);
    } else {
      setClearConfirm(true);
      clearTimer.current = setTimeout(() => {
        setClearConfirm(false);
      }, 3000);
    }
  };

  const formatDuration = (buf: AudioBuffer) => {
    const duration = buf.duration;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="hw-panel flex flex-col gap-1.5 p-2">
      <div className="flex items-center gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          SESSION
        </div>
        <div className="text-[10px] text-neutral-400">
          {sounds.length} sons
        </div>
        <div className="text-[10px] text-neutral-500 ml-auto">
          Tout est un son : clique pour l&apos;ouvrir dans l&apos;éditeur.
        </div>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${clearConfirm ? "text-red-500" : ""}`}
          onClick={handleClear}
          disabled={sounds.length === 0}
        >
          {clearConfirm ? "SÛR ?" : "VIDER"}
        </button>
      </div>

      {sounds.length === 0 ? (
        <div className="text-[11px] text-neutral-500">
          La session est vide : ouvre un son depuis une source.
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {sounds.map((s) => (
            <div
              key={s.id}
              className="hw-strip shrink-0 flex flex-col gap-0.5 px-2 py-1 min-w-[150px] max-w-[220px] cursor-pointer"
              style={{
                boxShadow:
                  s.id === curId
                    ? `0 0 0 1px ${color}, 0 0 10px ${color}55`
                    : undefined,
              }}
              onClick={() => onSelect(s.id)}
            >
              <div className="text-[11px] font-bold truncate" style={{ color: s.id === curId ? color : undefined }}>
                {s.name}
              </div>
              <div className="text-[9px] text-neutral-400">
                {KIND_FR[s.kind]}
                {" · "}
                {formatDuration(s.buf)}
                {s.stems && s.stems.length > 0 ? (
                  <>
                    {" · "}
                    {s.stems.length} STEMS
                  </>
                ) : null}
                {savedIds.has(s.id) ? (
                  <span className="text-emerald-400"> · SAUVÉ</span>
                ) : null}
              </div>
              <div className="flex gap-1 mt-auto">
                <button
                  className="hw-btn px-1.5 py-0.5 text-[10px] font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(s);
                  }}
                  title="Écouter"
                >
                  ▶
                </button>
                <button
                  className="hw-btn px-1.5 py-0.5 text-[10px] font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(s.id);
                  }}
                  title="Retirer de la session"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
