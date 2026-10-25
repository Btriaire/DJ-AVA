"use client";
import { useState, type KeyboardEvent } from "react";
import type { LibTrack, Playlist } from "@/lib/library";
import { Icon, Mosaic, fmtDur } from "../prep/parts";
import { STATUS_LABEL, setHealth } from "@/lib/setHealth";
import { STATUS_COLOR } from "./NextStep";
import { DECK_COLOR, DRAG_TYPE, type SendDest } from "./types";

const LIST_ACCENTS = ["#22d3ee", "#34d399", "#ffcc00", "#a78bfa", "#f97316", "#f472b6"];

export interface SetRailProps {
  tracks: LibTrack[];
  playlists: Playlist[];
  activeId: string | null;
  driving: (id: string) => { A: boolean; B: boolean; relay: boolean };
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDropTracks: (playlistId: string, ids: string[]) => void;
  onPlay: (dest: SendDest, id: string) => void;
  stemReady: (trackId: string) => boolean;
  onWizard: () => void;
}

export function SetRail(props: SetRailProps) {
  const [newName, setNewName] = useState("");
  const [overId, setOverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const trackMap = new Map(props.tracks.map(t => [t.id, t]));

  const handleCreate = () => {
    const name = newName.trim() || `Set ${props.playlists.length + 1}`;
    props.onCreate(name);
    setNewName("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleCreate();
  };

  const transitionLabel = (p: Playlist) => {
    const type = p.transitionType ?? "fade";
    const sec = p.transitionSec ?? 12;
    switch (type) {
      case "smooth": return `Doux ${sec} s`;
      case "fade": return `Fondu ${sec} s`;
      case "filter": return `Filtre ${sec} s`;
      case "cut": return "Coupe";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Sets</h2>
        <span className="rounded-full bg-white/5 px-2 py-px font-mono text-[10px] text-neutral-400">
          {props.playlists.length}
        </span>
      </div>

      <button type="button" className="prep-btn-accent flex items-center justify-center gap-1.5 px-3 py-2 text-xs" onClick={props.onWizard} title="Assistant en 4 étapes : titres, forme, ordre, envoi">
        <Icon name="plus" />
        Créer un set pas à pas
      </button>

      <div className="flex gap-2">
        <input
          className="prep-input min-w-0 flex-1 px-2.5 py-1.5 text-xs"
          placeholder="Set vide…"
          aria-label="Nom du nouveau set"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="prep-btn-accent flex items-center gap-1 px-3 py-1.5 text-xs"
          onClick={handleCreate}
        >
          <Icon name="plus" />
          Créer
        </button>
      </div>

      {props.playlists.length > 4 && (
        <input className="prep-input px-2.5 py-1.5 text-xs" placeholder="Chercher un set…" aria-label="Chercher un set" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
        {props.playlists.length === 0 ? (
          <p className="text-[11px] text-neutral-500">
            Aucun set pour l&apos;instant : crée-en un, ou envoie-en un depuis Préparation.
          </p>
        ) : (
          props.playlists.filter(p => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())).map((p, i) => {
            const active = props.activeId === p.id;
            const driving = props.driving(p.id);
            const health = setHealth(p.trackIds, trackMap, props.stemReady);
            const tracks = p.trackIds.map(id => trackMap.get(id)).filter(Boolean) as LibTrack[];
            const totalSec = tracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);
            const bpms = tracks.map(t => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
            const minBpm = bpms.length > 0 ? Math.round(Math.min(...bpms)) : null;
            const maxBpm = bpms.length > 0 ? Math.round(Math.max(...bpms)) : null;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                className="prep-drop prep-card relative flex min-w-[240px] cursor-pointer items-center gap-3 p-2.5 text-left xl:min-w-0"
                data-over={overId === p.id}
                style={{
                  boxShadow: `inset 3px 0 0 ${active ? "var(--prep-accent)" : "transparent"}`,
                  background: active ? "color-mix(in srgb, var(--prep-accent) 8%, var(--prep-surface))" : undefined,
                }}
                onClick={() => props.onSelect(p.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    props.onSelect(p.id);
                  }
                }}
                aria-pressed={active}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setOverId(p.id);
                  }
                }}
                onDragLeave={() => setOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverId(null);
                  try {
                    const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]");
                    if (Array.isArray(ids) && ids.every(id => typeof id === "string")) {
                      props.onDropTracks(p.id, ids);
                    }
                  } catch {}
                }}
              >
                <Mosaic
                  tracks={tracks.slice(0, 4)}
                  size={48}
                  accent={LIST_ACCENTS[i % 6]}
                />

                <div className="min-w-0 flex-1">
                  <h3
                    className="truncate text-[13px] font-bold text-neutral-100"
                    title={p.name}
                  >
                    {p.name}
                  </h3>

                  <div className="text-[10px] text-neutral-500">
                    {tracks.length} titre(s) · {fmtDur(totalSec)}
                    {minBpm && maxBpm ? ` · ${minBpm}–${maxBpm} BPM` : ""}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1">
                    <span
                      className="rounded-full px-1.5 py-px text-[9px] font-black"
                      style={{ background: `color-mix(in srgb, ${STATUS_COLOR[health.status]} 18%, transparent)`, color: STATUS_COLOR[health.status] }}
                      title={health.next.detail}
                    >
                      {STATUS_LABEL[health.status]}
                    </span>
                    <span className="rounded-full bg-white/5 px-1.5 py-px text-[9px] text-neutral-400">
                      {transitionLabel(p)}
                    </span>

                    {driving.A && (
                      <span
                        className="rounded-full px-1.5 py-px text-[9px] font-black"
                        style={{
                          background: `color-mix(in srgb, ${DECK_COLOR.A} 20%, transparent)`,
                          color: DECK_COLOR.A,
                        }}
                        title="Ce set joue sur le deck A"
                      >
                        A
                      </span>
                    )}

                    {driving.B && (
                      <span
                        className="rounded-full px-1.5 py-px text-[9px] font-black"
                        style={{
                          background: `color-mix(in srgb, ${DECK_COLOR.B} 20%, transparent)`,
                          color: DECK_COLOR.B,
                        }}
                        title="Ce set joue sur le deck B"
                      >
                        B
                      </span>
                    )}

                    {driving.relay && (
                      <span
                        className="rounded-full px-1.5 py-px text-[9px] font-black"
                        style={{
                          background: `color-mix(in srgb, var(--prep-accent) 20%, transparent)`,
                          color: "var(--prep-accent)",
                        }}
                        title="Ce set joue en relais A→B→A"
                      >
                        Relais
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="prep-btn-ghost shrink-0 p-2"
                  aria-label={`Lancer « ${p.name} » en relais A→B→A`}
                  title="Lancer en relais A→B→A"
                  disabled={tracks.length < 2}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onPlay("relay", p.id);
                  }}
                >
                  <Icon name="play" size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
