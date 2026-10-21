"use client";
import { useState } from "react";
import { YouTubeSearch } from "./YouTubeSearch";
import { loadLibrary, idbGetBlob, type LibTrack } from "@/lib/library";
import type { DJEngine } from "@/lib/audio/engine";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SourcePanel({ engine, color, busy, onOpenBytes, onOpenBuffer, bank, open = true, onToggle }: {
  engine: DJEngine;
  color: string;
  busy: boolean;
  onOpenBytes: (name: string, bytes: ArrayBuffer, info?: { label: string; value: string }[]) => Promise<void>;
  onOpenBuffer: (name: string, buf: AudioBuffer, bpm: number) => Promise<void>;
  bank: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem("djsynth.atelier.tab") || "youtube";
    } catch {
      return "youtube";
    }
  });
  const [library] = useState(() => loadLibrary().tracks);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [fileDrag, setFileDrag] = useState(false);

  const handleTabChange = (tab: string) => {
    if (busy) return;
    setActiveTab(tab);
    try {
      localStorage.setItem("djsynth.atelier.tab", tab);
    } catch {}
  };

  const openFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const bytes = await file.arrayBuffer();
        const name = file.name.replace(/\.[^/.]+$/, "");
        await onOpenBytes(name, bytes);
      } catch {
        setLibraryError(`Erreur pour ${file.name}`);
      }
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setFileDrag(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("audio/") ||
      /\.(mp3|wav|flac|aiff?|m4a|ogg|opus|aac)$/i.test(f.name)
    );
    if (files.length === 0) return;
    await openFiles(files);
  };

  const openLibraryTrack = async (track: LibTrack) => {
    if (busy) return;
    try {
      if (track.source === "local") {
        const blob = await idbGetBlob(track.id);
        if (!blob) throw new Error("Morceau local introuvable");
        const bytes = await blob.arrayBuffer();
        await onOpenBytes(track.name, bytes);
      } else {
        const res = await fetch(`/api/${track.source}/stream?id=${encodeURIComponent(track.url ?? "")}`);
        if (!res.ok) throw new Error("Téléchargement impossible");
        const bytes = await res.arrayBuffer();
        await onOpenBytes(track.name, bytes);
      }
    } catch {
      setLibraryError("Erreur lors de l'ouverture du fichier");
    }
  };

  const filteredLibrary = library.filter(t =>
    t.name.toLowerCase().includes(libraryFilter.toLowerCase())
  );

  return (
    <div className="hw-panel flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          1 · SOURCE
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="hw-btn px-2 py-1 text-[11px] font-bold"
          >
            {open ? "▴ replier" : "▾ déplier"}
          </button>
        )}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleTabChange("youtube")}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${activeTab === "youtube" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
          >
            YOUTUBE
          </button>
          <button
            onClick={() => handleTabChange("library")}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${activeTab === "library" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
          >
            BIBLIOTHÈQUE
          </button>
          <button
            onClick={() => handleTabChange("file")}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${activeTab === "file" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
          >
            FICHIER
          </button>
          <button
            onClick={() => handleTabChange("decks")}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${activeTab === "decks" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
          >
            PLATINES
          </button>
          <button
            onClick={() => handleTabChange("bank")}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${activeTab === "bank" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
          >
            BANQUE
          </button>
        </div>
      </div>

      {open !== false && (
        <>
      {activeTab === "youtube" && (
        <YouTubeSearch
          ctx={engine.ctx}
          color={color}
          busy={busy}
          onOpen={onOpenBytes}
        />
      )}

      {activeTab === "library" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Filtrer…"
            value={libraryFilter}
            onChange={(e) => setLibraryFilter(e.target.value)}
            className="hw-btn px-2 py-1 text-[11px] bg-transparent"
          />
          {libraryError && <div className="text-[11px] text-red-400">{libraryError}</div>}
          {filteredLibrary.length === 0 ? (
            <div className="text-[10px] text-neutral-400">
              La bibliothèque est vide.
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto flex flex-col gap-1">
              {filteredLibrary.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openLibraryTrack(t)}
                  className="hw-strip flex items-center gap-2 p-1.5 text-left"
                >
                  {t.art && (
                    <div className="hw-cover shrink-0" style={{ width: 32, height: 32 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.art}
                        alt=""
                        className="object-cover h-full w-full"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-[11px] font-bold">{t.name}</div>
                    <div className="text-[10px] text-neutral-400">
                      {t.source}
                      {t.durationSec ? ` · ${fmt(t.durationSec)}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "file" && (
        <div
          className="hw-well flex flex-col items-center justify-center gap-2 p-6 text-[11px] text-neutral-400"
          style={fileDrag ? { outline: `2px dashed ${color}` } : {}}
          onDragOver={(e) => {
            e.preventDefault();
            setFileDrag(true);
          }}
          onDragLeave={() => setFileDrag(false)}
          onDrop={handleFileDrop}
        >
          Glisse un ou plusieurs fichiers audio ici
          <label className="hw-btn px-2 py-1 text-[11px] font-bold cursor-pointer">
            PARCOURIR…
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                if (e.target.files) {
                  await openFiles(Array.from(e.target.files));
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      )}

      {activeTab === "decks" && (
        <div className="flex flex-col gap-2">
          <div className="hw-recess p-2 flex items-center gap-2">
            <div className="text-[11px] font-bold" style={{ color: "#38bdf8" }}>
              PLATINE A
            </div>
            <div className="text-[11px]">
              {engine.deckA.audioBuffer ? engine.deckA.name : "vide"}
            </div>
            {engine.deckA.audioBuffer && (
              <>
                <div className="text-[11px] text-neutral-400">
                  {engine.deckA.bpm.toFixed(1)} BPM
                </div>
                <button
                  onClick={() => onOpenBuffer(engine.deckA.name, engine.deckA.audioBuffer!, engine.deckA.bpm)}
                  className="hw-btn px-2 py-1 text-[11px] font-bold ml-auto"
                >
                  OUVRIR
                </button>
              </>
            )}
          </div>
          <div className="hw-recess p-2 flex items-center gap-2">
            <div className="text-[11px] font-bold" style={{ color: "#f59e0b" }}>
              PLATINE B
            </div>
            <div className="text-[11px]">
              {engine.deckB.audioBuffer ? engine.deckB.name : "vide"}
            </div>
            {engine.deckB.audioBuffer && (
              <>
                <div className="text-[11px] text-neutral-400">
                  {engine.deckB.bpm.toFixed(1)} BPM
                </div>
                <button
                  onClick={() => onOpenBuffer(engine.deckB.name, engine.deckB.audioBuffer!, engine.deckB.bpm)}
                  className="hw-btn px-2 py-1 text-[11px] font-bold ml-auto"
                >
                  OUVRIR
                </button>
              </>
            )}
          </div>
        </div>
      )}

              {activeTab === "bank" && bank}
            </>
          )}
          {open === false && (
            <div className="text-[11px] text-neutral-400">
              Source repliée : clique sur « déplier » pour chercher un autre son.
            </div>
          )}
        </div>
  );
}
