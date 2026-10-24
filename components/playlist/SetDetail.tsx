"use client";
import { Fragment, useState, type DragEvent, type KeyboardEvent } from "react";
import type { LibTrack, Playlist, TransitionType } from "@/lib/library";
import type { SetArc } from "@/lib/setBuilder";
import { BpmChip, Cover, Icon, KeyChip, StemPill, fmtDur, keyCompat } from "../prep/parts";
import { DECK_COLOR, DRAG_TYPE, type SendDest, type StemInfo, type TrackMark } from "./types";

const ROW_DRAG = "application/x-djsynth-setrow";

export interface SetDetailProps {
  playlist: Playlist | null;
  tracks: LibTrack[];
  marks: (trackId: string) => TrackMark;
  stemOf: (trackId: string) => StemInfo;
  driving: { A: boolean; B: boolean; relay: boolean };
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onClear: () => void;
  onDelete: () => void;
  onTransitionSec: (sec: number) => void;
  onTransitionType: (type: TransitionType) => void;
  onPreload: (sec: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (trackId: string) => void;
  onAddTracks: (ids: string[], at?: number) => void;
  onPlay: (dest: SendDest, startIdx?: number) => void;
  onOptimize: (arc: SetArc) => void;
  onPrepareStems: (ids: string[]) => void;
}

export function SetDetail(props: SetDetailProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"clear" | "delete" | null>(null);
  const [showTransition, setShowTransition] = useState(true);
  const [showOptimize, setShowOptimize] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  if (props.playlist === null) {
    return (
      <div className="prep-card flex flex-col items-center gap-2 px-6 py-14 text-center">
        <Icon name="crate" size={44} className="text-[var(--prep-accent)] opacity-70" />
        <div className="font-bold">Aucun set sélectionné</div>
        <div className="text-[11px] text-neutral-500">
          Choisis un set dans la liste, ou crée-en un : les titres de la bibliothèque se glissent dedans.
        </div>
      </div>
    );
  }

  const byId = new Map(props.tracks.map(t => [t.id, t]));
  const list = props.playlist.trackIds
    .map(id => byId.get(id))
    .filter((t): t is LibTrack => t !== undefined);

  const totalSec = list.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const bpms = list.map(t => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const min = bpms.length ? Math.min(...bpms) : 0;
  const max = bpms.length ? Math.max(...bpms) : 0;
  const bpmRange = bpms.length > 0 ? `${Math.round(min)}–${Math.round(max)}` : "—";
  const yOf = (bpm: number) => 5 + ((max - bpm) / Math.max(max - min, 1)) * 30; // curve height, 5 units of padding
  const ready = list.filter(t => props.stemOf(t.id).state === "done").length;

  const transitions = list.slice(1).map((t, i) => {
    const prev = list[i];
    return keyCompat(prev.camelot, t.camelot).level;
  });
  const smooth = transitions.filter(t => t === "same" || t === "good").length;
  const boost = transitions.filter(t => t === "boost").length;
  const clash = transitions.filter(t => t === "clash").length;

  const handleRename = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== props.playlist!.name) {
      props.onRename(trimmed);
    }
    setEditing(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleRename(e.currentTarget.value);
    if (e.key === "Escape") setEditing(null);
  };

  const handleConfirm = (action: "clear" | "delete") => {
    if (confirm === action) {
      if (action === "clear") props.onClear();
      if (action === "delete") props.onDelete();
      setConfirm(null);
    } else {
      setConfirm(action);
    }
  };

  const handleBlur = () => {
    if (editing !== null) handleRename(editing);
    setConfirm(null);
  };

  const dragKind = (e: DragEvent) =>
    e.dataTransfer.types.includes(ROW_DRAG) ? "row" : e.dataTransfer.types.includes(DRAG_TYPE) ? "lib" : null;

  // `fixed` = the insertion index is known (connector between two rows, end zone): no half-row maths
  const handleDragOver = (e: DragEvent, i: number, fixed?: number) => {
    const kind = dragKind(e);
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation(); // a row handles its own events: the list must not overwrite the index
    e.dataTransfer.dropEffect = kind === "row" ? "move" : "copy";
    if (fixed !== undefined) {
      setOverIdx(fixed);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOverIdx(e.clientY < rect.top + rect.height / 2 ? i : i + 1);
  };

  const handleDrop = (e: DragEvent, i: number, fixed?: number) => {
    const kind = dragKind(e);
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation();
    const to = fixed ?? overIdx ?? i;
    if (kind === "row") {
      const from = parseInt(e.dataTransfer.getData(ROW_DRAG), 10);
      if (!isNaN(from) && from !== to && from + 1 !== to) props.onMove(from, from < to ? to - 1 : to);
    } else {
      try {
        const ids: unknown = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]");
        if (Array.isArray(ids)) {
          const strings = ids.filter((id): id is string => typeof id === "string");
          if (strings.length > 0) props.onAddTracks(strings, to);
        }
      } catch {
        // not one of our drags: ignore it
      }
    }
    setDragFrom(null);
    setOverIdx(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="prep-card flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          {editing === null ? (
            <button
              className="group flex min-w-0 items-center gap-2 text-left"
              onClick={() => setEditing(props.playlist!.name)}
              title="Renommer le set"
            >
              <div className="truncate text-base font-black text-neutral-100">
                {props.playlist!.name}
              </div>
              <Icon name="edit" size={13} className="text-neutral-600 group-hover:text-neutral-200" />
            </button>
          ) : (
            <input
              className="prep-input min-w-0 flex-1 px-2.5 py-1 text-sm font-bold"
              value={editing}
              onChange={e => setEditing(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              autoFocus
              aria-label="Nom du set"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
          <span>{list.length} titre(s)</span>
          <span>{fmtDur(totalSec)}</span>
          <span>{bpmRange} BPM</span>
          <span style={{ color: ready === list.length && list.length > 0 ? "#34d399" : undefined }}>
            stems prêts {ready}/{list.length}
          </span>
          {smooth > 0 && <span style={{ color: "#34d399" }}>{smooth} fluides</span>}
          {boost > 0 && <span style={{ color: "#f59e0b" }}>{boost} montées</span>}
          {clash > 0 && <span style={{ color: "#dc2626" }}>{clash} dissonantes</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="prep-btn-accent flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
            onClick={() => props.onPlay("relay")}
            disabled={list.length < 2}
            aria-pressed={props.driving.relay}
            title="Automix : les deux decks s'enchaînent seuls avec les transitions de ce set"
          >
            <Icon name="play" size={14} />
            {props.driving.relay ? "Relais en cours" : "Relais A→B→A"}
          </button>

          {(["A", "B"] as const).map(side => (
            <button
              key={side}
              className="prep-btn-ghost px-3 py-1 text-xs"
              onClick={() => props.onPlay(side)}
              disabled={list.length < 2}
              aria-pressed={props.driving[side] && !props.driving.relay}
              style={props.driving[side] && !props.driving.relay ? { borderColor: DECK_COLOR[side] } : undefined}
              title={`Met le set en file sur le deck ${side}, en boucle`}
            >
              <span style={{ color: DECK_COLOR[side] }}>Deck {side}</span>
              {props.driving[side] && !props.driving.relay && " · en file"}
            </button>
          ))}

          <button
            className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs disabled:opacity-40"
            onClick={() => props.onPrepareStems(list.map(t => t.id))}
            disabled={ready === list.length || list.length === 0}
            title="Prépare les stems de tous les titres du set"
          >
            <Icon name="stems" size={14} />
            Stems
          </button>

          <button
            className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs"
            onClick={() => setShowOptimize(!showOptimize)}
            aria-pressed={showOptimize}
            title="Réordonner automatiquement : tempos proches, tonalités compatibles"
          >
            <Icon name="bolt" size={14} />
            Réordonner
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs"
              onClick={props.onDuplicate}
            >
              <Icon name="copy" size={14} />
              Dupliquer
            </button>

            <button
              className="prep-btn-ghost px-3 py-1 text-xs"
              onClick={() => handleConfirm("clear")}
              onBlur={handleBlur}
              style={confirm === "clear" ? { background: "#dc2626", color: "#fff" } : undefined}
            >
              {confirm === "clear" ? "Confirmer ?" : "Vider"}
            </button>

            <button
              className="prep-btn-ghost px-3 py-1 text-xs"
              onClick={() => handleConfirm("delete")}
              onBlur={handleBlur}
              style={confirm === "delete" ? { background: "#dc2626", color: "#fff" } : undefined}
            >
              {confirm === "delete" ? "Confirmer ?" : "Supprimer"}
            </button>
          </div>
        </div>

        {showOptimize && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Forme</div>
            <div className="prep-seg flex">
              {(["flow", "rise", "fall", "peak", "wave"] as const).map(arc => (
                <button
                  key={arc}
                  className="flex-1 px-2 py-1 text-[11px]"
                  onClick={() => props.onOptimize(arc)}
                  aria-pressed={false}
                >
                  {arc === "flow" && "Fluide"}
                  {arc === "rise" && "Montée"}
                  {arc === "fall" && "Descente"}
                  {arc === "peak" && "Pic"}
                  {arc === "wave" && "Vague"}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-neutral-500">
              Change l&apos;ordre des titres, pas leur contenu.
            </div>
          </div>
        )}
      </div>

      <div className="prep-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">
            Transitions
          </div>
          <button
            className="p-1"
            onClick={() => setShowTransition(!showTransition)}
            aria-expanded={showTransition}
          >
            <Icon
              name="chevron"
              size={14}
              className={showTransition ? "rotate-180" : ""}
            />
          </button>
        </div>

        {showTransition && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Style</div>
              <div className="prep-seg flex">
                {(["smooth", "fade", "filter", "cut"] as const).map(type => (
                  <button
                    key={type}
                    className="flex-1 px-2 py-1 text-[11px]"
                    onClick={() => props.onTransitionType(type)}
                    aria-pressed={props.playlist!.transitionType === type}
                    title={
                      type === "smooth" ? "Courbe en S, imperceptible" :
                      type === "fade" ? "Fondu enchaîné linéaire" :
                      type === "filter" ? "Ferme le filtre du titre sortant pendant le fondu" :
                      "Bascule instantanée"
                    }
                  >
                    {type === "smooth" && "Doux"}
                    {type === "fade" && "Fondu"}
                    {type === "filter" && "Filtre"}
                    {type === "cut" && "Coupe"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Durée</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={props.playlist!.transitionSec ?? 12}
                  onChange={e => props.onTransitionSec(parseInt(e.target.value))}
                  className="w-full accent-[var(--prep-accent)]"
                  disabled={props.playlist!.transitionType === "cut"}
                />
                <div className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums">
                  {props.playlist!.transitionSec ?? 12} s
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Préchargement</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={props.playlist!.preloadSec ?? 5}
                  onChange={e => props.onPreload(parseInt(e.target.value))}
                  className="w-full accent-[var(--prep-accent)]"
                  title="Charge le titre suivant N secondes avant la fin pour éviter tout blanc"
                />
                <div className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums">
                  {props.playlist!.preloadSec ?? 5} s
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {bpms.length >= 2 && (
        <div className="prep-card px-3 py-2">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full">
            <title>Courbe des BPM du set</title>
            {list.slice(1).map((t, i) => {
              const prev = list[i];
              if (!prev.bpm || !t.bpm) return null; // a track without tempo leaves a gap
              const { color } = keyCompat(prev.camelot, t.camelot);
              const x1 = (i / (list.length - 1)) * 100;
              const x2 = ((i + 1) / (list.length - 1)) * 100;
              return (
                <line key={t.id} x1={x1} y1={yOf(prev.bpm)} x2={x2} y2={yOf(t.bpm)} stroke={color} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              );
            })}
            {list.map((t, i) => {
              if (!t.bpm) return null;
              const onAir = props.marks(t.id).cur !== null;
              return (
                <circle
                  key={t.id}
                  cx={(i / Math.max(list.length - 1, 1)) * 100}
                  cy={yOf(t.bpm)}
                  r={onAir ? 2.2 : 1.4}
                  fill={onAir ? "#fff" : keyCompat(i > 0 ? list[i - 1].camelot : t.camelot, t.camelot).color}
                />
              );
            })}
          </svg>
        </div>
      )}

      <div className="prep-card flex flex-col p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">
            Titres
          </div>
          <div className="hidden text-[10px] text-neutral-500 sm:block">
            Glisse les titres pour les réordonner, ou dépose ici des titres de la bibliothèque.
          </div>
        </div>

        <ol
          className="flex max-h-[60vh] flex-col overflow-y-auto"
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIdx(null);
          }}
        >
          {list.length === 0 && (
            <li
              className="rounded-xl border border-dashed border-[var(--prep-line)] px-4 py-8 text-center text-[11px] text-neutral-500"
              onDragOver={e => handleDragOver(e, 0, 0)}
              onDrop={e => handleDrop(e, 0, 0)}
            >
              Set vide — glisse des titres ici
            </li>
          )}

          {list.map((t, i) => {
            const m = props.marks(t.id);
            const cur = m.cur;
            const next = m.next;
            const stem = props.stemOf(t.id);
            const nextTrack = i < list.length - 1 ? list[i + 1] : null;

            return (
              <Fragment key={t.id}>
                {overIdx === i && !(dragFrom !== null && (dragFrom === i || dragFrom + 1 === i)) && (
                  <li aria-hidden className="h-0.5 shrink-0 rounded bg-[var(--prep-accent)]" />
                )}

                <li
                  draggable
                  data-checked={cur !== null}
                  className="prep-row flex items-center gap-2 px-2 py-1.5 cursor-grab active:cursor-grabbing"
                  onDragStart={e => {
                    e.dataTransfer.setData(ROW_DRAG, String(i));
                    e.dataTransfer.effectAllowed = "move";
                    setDragFrom(i);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setOverIdx(null);
                  }}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={e => handleDrop(e, i)}
                >
                  <Icon name="grip" size={14} className="text-neutral-600 shrink-0" />
                  <div className="w-5 text-right font-mono text-[11px] text-neutral-500">
                    {i + 1}
                  </div>
                  <Cover
                    art={t.art}
                    name={t.name}
                    camelot={t.camelot}
                    size={38}
                    rounded={6}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-neutral-100" title={t.name}>
                      {t.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {cur && (
                        <div
                          className="text-[9px] font-black"
                          style={{ color: DECK_COLOR[cur] }}
                        >
                          EN ANTENNE · {cur}
                        </div>
                      )}
                      {next && (
                        <div
                          className="text-[9px] font-black"
                          style={{ color: DECK_COLOR[next] }}
                        >
                          SUIVANT · {next}
                        </div>
                      )}
                      <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
                      <KeyChip camelot={t.camelot} />
                      <div className="font-mono text-[11px] text-neutral-500">
                        {fmtDur(t.durationSec)}
                      </div>
                      <span>
                        <StemPill
                          info={stem}
                          onPrepare={() => props.onPrepareStems([t.id])}
                        />
                      </span>
                    </div>
                  </div>

                  <div className="prep-row-actions flex items-center gap-0.5">
                    <button
                      className="p-1 text-neutral-500 hover:text-white"
                      onClick={() => props.onPlay("relay", i)}
                      disabled={list.length < 2}
                      aria-label="Lancer le set à partir d'ici"
                      title="Relais A→B→A à partir de ce titre"
                    >
                      <Icon name="play" size={14} />
                    </button>
                    <button
                      className="p-1 text-neutral-500 hover:text-white"
                      onClick={() => props.onMove(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Monter"
                    >
                      <Icon name="up" size={14} />
                    </button>
                    <button
                      className="p-1 text-neutral-500 hover:text-white"
                      onClick={() => props.onMove(i, i + 1)}
                      disabled={i === list.length - 1}
                      aria-label="Descendre"
                    >
                      <Icon name="chevron" size={14} />
                    </button>
                    <button
                      className="p-1 text-neutral-500 hover:text-red-500"
                      onClick={() => props.onRemove(t.id)}
                      aria-label="Retirer du set"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </li>

                {nextTrack && (() => {
                  const compat = keyCompat(t.camelot, nextTrack.camelot);
                  const pct = t.bpm && nextTrack.bpm ? (nextTrack.bpm / t.bpm - 1) * 100 : null;
                  const tempoColor = pct === null ? "#6b7280" : Math.abs(pct) <= 3 ? "#34d399" : Math.abs(pct) <= 6 ? "#f59e0b" : "#f87171";
                  return (
                    <li
                      aria-hidden
                      className="flex items-center gap-2 py-0.5 pl-14 pr-2"
                      onDragOver={e => handleDragOver(e, i, i + 1)}
                      onDrop={e => handleDrop(e, i, i + 1)}
                    >
                      <div className="h-3 w-0.5 rounded" style={{ background: compat.color }} />
                      <div className="font-mono text-[10px]" style={{ color: tempoColor }}>
                        {pct === null ? "? %" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)} %`}
                      </div>
                      <div className="text-[10px]" style={{ color: compat.color }}>{compat.label}</div>
                    </li>
                  );
                })()}
              </Fragment>
            );
          })}

          {list.length > 0 && (
            <li
              aria-hidden
              className="flex min-h-8 flex-col justify-start"
              onDragOver={e => handleDragOver(e, list.length, list.length)}
              onDrop={e => handleDrop(e, list.length, list.length)}
            >
              {overIdx === list.length && <div className="h-0.5 rounded bg-[var(--prep-accent)]" />}
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
