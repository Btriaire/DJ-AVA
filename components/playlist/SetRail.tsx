"use client";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { LibTrack, Playlist } from "@/lib/library";
import { Icon, Mosaic, fmtDur } from "../prep/parts";
import { STATUS_LABEL, setHealth } from "@/lib/setHealth";
import { STATUS_COLOR } from "./NextStep";
import { DECK_COLOR, DRAG_TYPE, type SendDest } from "./types";
import { TRANSITION_LABEL } from "@/lib/transitions";

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
  trash: { at: number; count: number; names: string }[]; // earlier lists of sets, to bring back
  onRestore: (index: number) => void;
}

function Badge({ color, title, children }: { color: string; title?: string; children: ReactNode }) {
  return (
    <span
      className="rounded-full px-1.5 py-px text-[10px] font-black"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
      title={title}
    >
      {children}
    </span>
  );
}

export function SetRail(props: SetRailProps) {
  const [newName, setNewName] = useState("");
  const [overId, setOverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showTrash, setShowTrash] = useState(false);

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
    return type === "cut" ? "Coupe" : `${TRANSITION_LABEL[type]} ${sec} s`;
  };

  const q = query.trim().toLowerCase();
  const shown = props.playlists.filter(p => !q || p.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Sets</h2>
        <span className="rounded-full bg-white/5 px-2 py-px font-mono text-[10px] text-neutral-400">
          {props.playlists.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-col xl:items-stretch">
        <button
          type="button"
          className="prep-btn-accent flex min-h-10 items-center justify-center gap-1.5 px-3 text-xs"
          onClick={props.onWizard}
          title="Assistant en 4 étapes : titres, forme, ordre, envoi"
        >
          <Icon name="plus" />
          Créer un set pas à pas
        </button>

        <div className="flex min-w-0 gap-2 sm:flex-1 sm:basis-[260px]">
          <input
            className="prep-input min-h-10 min-w-0 flex-1 px-2.5 text-xs"
            placeholder="Nom d'un set vide…"
            aria-label="Nom du nouveau set"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="prep-btn-ghost flex min-h-10 items-center gap-1 px-3 text-xs"
            onClick={handleCreate}
            title="Crée un set vide, à remplir depuis la bibliothèque"
          >
            <Icon name="plus" />
            Créer
          </button>
        </div>
      </div>

      {props.playlists.length > 4 && (
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            className="prep-input min-h-10 w-full pl-8 pr-2.5 text-xs"
            placeholder="Chercher un set…"
            aria-label="Chercher un set"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {props.playlists.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[var(--prep-line)] px-3 py-6 text-center">
          <Icon name="crate" size={28} className="text-neutral-600" />
          <div className="text-[12px] font-bold text-neutral-200">Aucun set pour l&apos;instant</div>
          <div className="text-[11px] text-neutral-500">Crée-en un avec l&apos;assistant, ou envoie-en un depuis Préparation.</div>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-neutral-500">Aucun set ne correspond à « {query.trim()} ».</p>
      ) : (
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1 xl:max-h-[68vh] xl:snap-none xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
          {shown.map((p) => {
            const i = props.playlists.indexOf(p);
            const active = props.activeId === p.id;
            const driving = props.driving(p.id);
            const health = setHealth(p.trackIds, trackMap, props.stemReady);
            const tracks = p.trackIds.map(id => trackMap.get(id)).filter(Boolean) as LibTrack[];
            const totalSec = tracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);
            const bpms = tracks.map(t => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
            const minBpm = bpms.length > 0 ? Math.round(Math.min(...bpms)) : null;
            const maxBpm = bpms.length > 0 ? Math.round(Math.max(...bpms)) : null;

            return (
              <li
                key={p.id}
                className="pl-set prep-drop prep-card relative flex min-w-[260px] shrink-0 snap-start items-center gap-1 p-1.5 xl:min-w-0 xl:shrink"
                data-active={active}
                data-over={overId === p.id}
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
                <button
                  type="button"
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left"
                  aria-pressed={active}
                  onClick={() => props.onSelect(p.id)}
                >
                  <Mosaic tracks={tracks.slice(0, 4)} size={44} accent={LIST_ACCENTS[i % 6]} />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-neutral-100" title={p.name}>
                      {p.name}
                    </span>
                    <span className="block truncate text-[10px] text-neutral-500">
                      {tracks.length} titre(s) · {fmtDur(totalSec)}
                      {minBpm && maxBpm ? ` · ${minBpm}–${maxBpm} BPM` : ""}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge color={STATUS_COLOR[health.status]} title={health.next.detail}>
                        {STATUS_LABEL[health.status]}
                      </Badge>
                      <span className="rounded-full bg-white/5 px-1.5 py-px text-[10px] text-neutral-400">{transitionLabel(p)}</span>
                      {driving.A && <Badge color={DECK_COLOR.A} title="Ce set joue sur le deck A">A</Badge>}
                      {driving.B && <Badge color={DECK_COLOR.B} title="Ce set joue sur le deck B">B</Badge>}
                      {driving.relay && <Badge color="var(--prep-accent)" title="Ce set joue en relais A→B→A">Relais</Badge>}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className="pl-icon-btn"
                  data-lg
                  aria-label={`Lancer « ${p.name} » en relais A→B→A`}
                  title={tracks.length < 2 ? "Il faut au moins 2 titres pour lancer le relais" : "Lancer en relais A→B→A"}
                  disabled={tracks.length < 2}
                  onClick={() => props.onPlay("relay", p.id)}
                >
                  <Icon name="play" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {props.trash.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="min-h-9 self-start text-[11px] text-neutral-400 underline decoration-dotted hover:text-white"
            onClick={() => setShowTrash(!showTrash)}
            aria-expanded={showTrash}
          >
            {`Récupérer des sets supprimés (${props.trash.length})`}
          </button>
          {showTrash && (
            <ul className="flex flex-col gap-1">
              {props.trash.map((t, i) => (
                <li key={t.at} className="prep-card flex items-center gap-2 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-neutral-200">{`${new Date(t.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${t.count} set(s)`}</div>
                    <div className="truncate text-[10px] text-neutral-500" title={t.names}>{t.names}</div>
                  </div>
                  <button
                    type="button"
                    className="prep-btn-ghost min-h-9 px-3 text-[11px]"
                    onClick={() => props.onRestore(i)}
                    title="Remet ces sets dans ta bibliothèque (ceux qui existent déjà ne sont pas dupliqués)"
                  >
                    Restaurer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
