"use client";
import { Fragment, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { LibTrack, Playlist, TransitionType } from "@/lib/library";
import type { SetArc } from "@/lib/setBuilder";
import { BpmChip, Cover, Icon, KeyChip, StemPill, fmtDur, keyCompat } from "../prep/parts";
import { setHealth } from "@/lib/setHealth";
import type { PrepProgress } from "@/lib/setPrep";
import type { DjOptions } from "@/lib/mixPlan";
import { DEFAULT_DJ } from "@/lib/mixPlan";
import { DjForceControl } from "../DjForceControl";
import { NextStepBar, STATUS_COLOR } from "./NextStep";
import { TRANSITIONS, TRANSITION_HINT } from "@/lib/transitions";
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
  prep?: PrepProgress; // audio / voice preparation of this set (done from any view)
  onPrepare: () => void;
  analyzing: ReadonlySet<string>;
  onAnalyze: (ids: string[]) => void;
  onMixPlan: (on: boolean) => void; // (re)computes the DJ plan of the set / switches it off
  onDj: (next: DjOptions) => void; // changes the DJ options of the set (force, length of the blends...) and plans again
  onWizard?: () => void; // opens the set assistant (empty states)
  onOpenLibrary?: () => void; // small screens: shows the library (empty states)
}

type TabKey = "tracks" | "links" | "dj" | "prep";
const TAB_KEYS: TabKey[] = ["tracks", "links", "dj", "prep"];

const ARCS: { key: SetArc; label: string }[] = [
  { key: "flow", label: "Fluide" },
  { key: "rise", label: "Montée" },
  { key: "fall", label: "Descente" },
  { key: "peak", label: "Pic" },
  { key: "wave", label: "Vague" },
];

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="pl-label">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-neutral-100">{children}</div>
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }} />
    </div>
  );
}

function PrepRow({ title, text, status, bar, children }: { title: string; text: string; status: string; bar?: number; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--prep-line)] p-3">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-semibold text-neutral-100">{title}</span>
          <span className="font-mono text-[11px] text-neutral-400">{status}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-500">{text}</p>
        {bar !== undefined && (
          <div className="mt-2">
            <Bar value={bar} color="#34d399" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function SetDetail(props: SetDetailProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"clear" | "delete" | null>(null);
  const [tab, setTab] = useState<TabKey>("tracks");
  const [showOptimize, setShowOptimize] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const pl = props.playlist;
  if (pl === null) {
    return (
      <div className="prep-card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Icon name="crate" size={44} className="text-[var(--prep-accent)] opacity-70" />
        <div className="font-bold">Aucun set ouvert</div>
        <div className="max-w-sm text-[12px] text-neutral-400">
          Choisis un set dans la liste, ou crée-en un : les titres de la bibliothèque se glissent dedans, puis tu règles les enchaînements et tu lances le relais.
        </div>
        {props.onWizard && (
          <button type="button" className="prep-btn-accent flex min-h-10 items-center gap-1.5 px-4 text-xs" onClick={props.onWizard}>
            <Icon name="plus" />
            Créer un set pas à pas
          </button>
        )}
      </div>
    );
  }

  const byId = new Map(props.tracks.map(t => [t.id, t]));
  const list = pl.trackIds
    .map(id => byId.get(id))
    .filter((t): t is LibTrack => t !== undefined);

  const totalSec = list.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const bpms = list.map(t => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const min = bpms.length ? Math.min(...bpms) : 0;
  const max = bpms.length ? Math.max(...bpms) : 0;
  const bpmRange = bpms.length > 0 ? `${Math.round(min)}–${Math.round(max)}` : "—";
  const yOf = (bpm: number) => 5 + ((max - bpm) / Math.max(max - min, 1)) * 30; // curve height, 5 units of padding
  const ready = list.filter(t => props.stemOf(t.id).state === "done").length;
  const allReady = ready === list.length && list.length > 0;

  const transitions = list.slice(1).map((t, i) => {
    const prev = list[i];
    return keyCompat(prev.camelot, t.camelot).level;
  });
  const smooth = transitions.filter(t => t === "same" || t === "good").length;
  const boost = transitions.filter(t => t === "boost").length;
  const clash = transitions.filter(t => t === "clash").length;

  const health = setHealth(pl.trackIds, byId, (id) => props.stemOf(id).state === "done");
  const unanalyzed = list.filter(t => !t.bpm || !t.camelot).map(t => t.id);
  const analyzingNow = unanalyzed.some(id => props.analyzing.has(id));
  const planOn = !!pl.mixPlan && pl.dj?.auto !== false;
  const canPlay = list.length >= 2;
  const doNext = (id: string) => {
    if (id === "analyze") props.onAnalyze(unanalyzed);
    else if (id === "order") props.onOptimize("flow");
    else if (id === "stems") props.onPrepareStems(list.filter(t => props.stemOf(t.id).state !== "done").map(t => t.id));
    else if (id === "play") props.onPlay("relay");
  };

  const handleRename = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== pl.name) {
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

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TAB_KEYS[(TAB_KEYS.indexOf(tab) + step + TAB_KEYS.length) % TAB_KEYS.length];
    setTab(next);
    document.getElementById(`pl-tab-${next}`)?.focus();
  };

  const tabs: { key: TabKey; label: string; badge: ReactNode }[] = [
    { key: "tracks", label: "Titres", badge: <span className="pl-tab-count">{list.length}</span> },
    {
      key: "links",
      label: "Enchaînements",
      badge: clash > 0 ? <span className="pl-tab-count" style={{ color: "#f87171" }} title={`${clash} enchaînement(s) dissonant(s)`}>{clash}</span> : null,
    },
    { key: "dj", label: "DJ", badge: planOn ? <span className="pl-tab-count" style={{ color: "var(--prep-accent)" }}>actif</span> : null },
    {
      key: "prep",
      label: "Préparation",
      badge: <span className="pl-tab-count" style={allReady ? { color: "#34d399" } : undefined}>{ready}/{list.length}</span>,
    },
  ];

  const transitionType = pl.transitionType ?? "fade";
  const transitionSec = pl.transitionSec ?? 12;
  const preloadSec = pl.preloadSec ?? 5;

  return (
    <div className="flex flex-col gap-3">
      {/* Header: name, key figures, the launch buttons, what to do next */}
      <div className="prep-card overflow-hidden" style={{ boxShadow: `inset 3px 0 0 ${STATUS_COLOR[health.status]}` }}>
        <div className="flex flex-col gap-3 p-3 pl-4">
          <div className="flex items-center gap-2">
            {editing === null ? (
              <button
                type="button"
                className="group flex min-h-9 min-w-0 items-center gap-2 text-left"
                onClick={() => setEditing(pl.name)}
                title="Renommer le set"
                aria-label={`Renommer le set « ${pl.name} »`}
              >
                <h2 className="truncate text-base font-black text-neutral-100">{pl.name}</h2>
                <Icon name="edit" size={13} className="text-neutral-500 group-hover:text-neutral-200" />
              </button>
            ) : (
              <input
                className="prep-input min-h-9 min-w-0 flex-1 px-2.5 py-1 text-sm font-bold"
                value={editing}
                onChange={e => setEditing(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                autoFocus
                aria-label="Nom du set"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Titres">{list.length}</Metric>
            <Metric label="Durée">{fmtDur(totalSec)}</Metric>
            <Metric label="Tempos">{bpmRange} <span className="text-[9px] font-normal text-neutral-500">BPM</span></Metric>
            <Metric label="Stems prêts">
              <span style={{ color: allReady ? "#34d399" : undefined }}>{ready}/{list.length}</span>
            </Metric>
            <Metric label="Enchaînements">
              {transitions.length === 0 ? (
                <span className="text-neutral-600">—</span>
              ) : (
                <span className="flex flex-wrap gap-x-2 text-[12px]">
                  {smooth > 0 && <span style={{ color: "#34d399" }} title="Tonalités compatibles">{smooth} fluides</span>}
                  {boost > 0 && <span style={{ color: "#f59e0b" }} title="Montée d'énergie">{boost} montées</span>}
                  {clash > 0 && <span style={{ color: "#f87171" }} title="Tonalités dissonantes">{clash} dissonantes</span>}
                  {smooth + boost + clash === 0 && <span className="text-neutral-500">tonalités ?</span>}
                </span>
              )}
            </Metric>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="prep-btn-accent flex min-h-10 items-center gap-2 px-5 text-sm"
              onClick={() => props.onPlay("relay")}
              disabled={!canPlay}
              aria-pressed={props.driving.relay}
              aria-describedby={canPlay ? undefined : "pl-play-hint"}
              title="Automix : les deux decks s'enchaînent seuls avec les enchaînements de ce set (relais A→B→A)"
            >
              <Icon name="play" size={16} />
              {props.driving.relay ? "Relais en cours" : "Lancer le relais"}
            </button>

            {(["A", "B"] as const).map(side => (
              <button
                type="button"
                key={side}
                className="prep-btn-ghost min-h-10 px-3 text-xs"
                onClick={() => props.onPlay(side)}
                disabled={!canPlay}
                aria-pressed={props.driving[side] && !props.driving.relay}
                style={props.driving[side] && !props.driving.relay ? { borderColor: DECK_COLOR[side] } : undefined}
                title={`Met le set en file sur le deck ${side}, en boucle`}
              >
                <span style={{ color: DECK_COLOR[side] }}>Deck {side}</span>
                {props.driving[side] && !props.driving.relay && " · en file"}
              </button>
            ))}

            {!canPlay && (
              <span id="pl-play-hint" className="text-[11px] text-neutral-500">
                Il faut au moins 2 titres pour lancer.
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" className="prep-btn-ghost flex min-h-9 items-center gap-1.5 px-3 text-xs" onClick={props.onDuplicate}>
                <Icon name="copy" size={14} />
                Dupliquer
              </button>
              <button
                type="button"
                className="prep-btn-ghost min-h-9 px-3 text-xs"
                onClick={() => handleConfirm("clear")}
                onBlur={handleBlur}
                title="Retire tous les titres du set (le set reste)"
                style={confirm === "clear" ? { background: "#dc2626", color: "#fff" } : undefined}
              >
                {confirm === "clear" ? "Confirmer ?" : "Vider"}
              </button>
              <button
                type="button"
                className="prep-btn-ghost min-h-9 px-3 text-xs"
                onClick={() => handleConfirm("delete")}
                onBlur={handleBlur}
                title="Supprime le set (récupérable depuis la liste des sets)"
                style={confirm === "delete" ? { background: "#dc2626", color: "#fff" } : undefined}
              >
                {confirm === "delete" ? "Confirmer ?" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--prep-line)] bg-black/15 p-3 pl-4">
          <NextStepBar flat hidePlay health={health} busy={analyzingNow} onAction={doNext} />
        </div>
      </div>

      {/* Work area: one tab per job */}
      <div className="prep-card overflow-hidden">
        <div className="pl-tabs" role="tablist" aria-label="Réglages du set" onKeyDown={onTabKey}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`pl-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`pl-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className="pl-tab"
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.badge}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`pl-panel-${tab}`} aria-labelledby={`pl-tab-${tab}`} className="p-3">
          {tab === "tracks" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 basis-[220px] text-[11px] text-neutral-400">
                  Glisse les titres pour les réordonner, ou dépose ici des titres de la bibliothèque.
                </p>
                <button
                  type="button"
                  className="prep-btn-ghost flex min-h-9 items-center gap-1.5 px-3 text-xs"
                  onClick={() => setShowOptimize(!showOptimize)}
                  aria-pressed={showOptimize}
                  title="Réordonner automatiquement : tempos proches, tonalités compatibles"
                >
                  <Icon name="bolt" size={14} />
                  Réordonner
                </button>
              </div>

              {showOptimize && (
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--prep-line)] p-3">
                  <div className="pl-label">Forme du set</div>
                  <div className="pl-chips" role="group" aria-label="Forme du set">
                    {ARCS.map(arc => (
                      <button type="button" key={arc.key} onClick={() => props.onOptimize(arc.key)} aria-pressed={false}>
                        {arc.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-neutral-500">Change l&apos;ordre des titres, pas leur contenu.</p>
                </div>
              )}

              {bpms.length >= 2 && (
                <figure className="rounded-lg bg-black/20 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[9px] text-neutral-500">
                      <span>{Math.round(max)}</span>
                      <span>{Math.round(min)}</span>
                    </div>
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
                  <figcaption className="mt-1 text-[10px] text-neutral-500">Courbe des BPM · la couleur du trait indique la compatibilité des tonalités.</figcaption>
                </figure>
              )}

              <ol
                className="flex flex-col lg:max-h-[62vh] lg:overflow-y-auto"
                aria-label="Titres du set"
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIdx(null);
                }}
              >
                {list.length === 0 && (
                  <li
                    className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--prep-line)] px-4 py-10 text-center"
                    onDragOver={e => handleDragOver(e, 0, 0)}
                    onDrop={e => handleDrop(e, 0, 0)}
                  >
                    <Icon name="crate" size={32} className="text-neutral-600" />
                    <div className="text-[13px] font-bold text-neutral-200">Ce set est vide</div>
                    <p className="max-w-xs text-[11px] text-neutral-500">
                      Glisse des titres de la bibliothèque ici, ou clique sur « Set » à côté d&apos;un titre. Il en faut au moins 2 pour enchaîner.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {props.onOpenLibrary && (
                        <button type="button" className="prep-btn-accent flex min-h-10 items-center gap-1.5 px-4 text-xs lg:hidden" onClick={props.onOpenLibrary}>
                          <Icon name="search" />
                          Choisir dans la bibliothèque
                        </button>
                      )}
                      {props.onWizard && (
                        <button type="button" className="prep-btn-ghost flex min-h-10 items-center gap-1.5 px-4 text-xs" onClick={props.onWizard}>
                          <Icon name="plus" />
                          Créer pas à pas
                        </button>
                      )}
                    </div>
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
                        <li aria-hidden className="pl-drop-line" />
                      )}

                      <li
                        draggable
                        data-checked={cur !== null}
                        className="pl-row prep-row flex cursor-grab flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 active:cursor-grabbing"
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
                        <Icon name="grip" size={14} className="hidden text-neutral-600 sm:block" />
                        <div className="w-5 shrink-0 text-right font-mono text-[11px] text-neutral-500">{i + 1}</div>
                        <Cover art={t.art} name={t.name} camelot={t.camelot} size={38} rounded={6} />
                        <div className="min-w-0 flex-1 basis-[150px]">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-neutral-100" title={t.name}>
                              {t.name}
                            </span>
                            {cur && (
                              <span className="shrink-0 rounded px-1 text-[9px] font-black" style={{ color: DECK_COLOR[cur], background: `color-mix(in srgb, ${DECK_COLOR[cur]} 16%, transparent)` }}>
                                EN ANTENNE · {cur}
                              </span>
                            )}
                            {next && (
                              <span className="shrink-0 rounded px-1 text-[9px] font-black" style={{ color: DECK_COLOR[next], background: `color-mix(in srgb, ${DECK_COLOR[next]} 16%, transparent)` }}>
                                SUIVANT · {next}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
                            <KeyChip camelot={t.camelot} />
                            <span className="font-mono text-[11px] tabular-nums text-neutral-500">{fmtDur(t.durationSec)}</span>
                            <StemPill info={stem} onPrepare={() => props.onPrepareStems([t.id])} />
                          </div>
                        </div>

                        <div className="pl-row-actions ml-auto flex items-center">
                          <button
                            type="button"
                            className="pl-icon-btn"
                            onClick={() => props.onPlay("relay", i)}
                            disabled={!canPlay}
                            aria-label={`Lancer le set à partir de « ${t.name} »`}
                            title="Relais A→B→A à partir de ce titre"
                          >
                            <Icon name="play" size={14} />
                          </button>
                          <button
                            type="button"
                            className="pl-icon-btn"
                            onClick={() => props.onMove(i, i - 1)}
                            disabled={i === 0}
                            aria-label={`Monter « ${t.name} »`}
                            title="Monter"
                          >
                            <Icon name="up" size={14} />
                          </button>
                          <button
                            type="button"
                            className="pl-icon-btn"
                            onClick={() => props.onMove(i, i + 1)}
                            disabled={i === list.length - 1}
                            aria-label={`Descendre « ${t.name} »`}
                            title="Descendre"
                          >
                            <Icon name="chevron" size={14} />
                          </button>
                          <button
                            type="button"
                            className="pl-icon-btn"
                            data-danger
                            onClick={() => props.onRemove(t.id)}
                            aria-label={`Retirer « ${t.name} » du set`}
                            title="Retirer du set"
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
                            className="flex items-center gap-2 py-0.5 pl-10 pr-2 sm:pl-14"
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
                    className="flex min-h-10 flex-col justify-start"
                    onDragOver={e => handleDragOver(e, list.length, list.length)}
                    onDrop={e => handleDrop(e, list.length, list.length)}
                  >
                    {overIdx === list.length && <div className="pl-drop-line" />}
                  </li>
                )}
              </ol>
            </div>
          )}

          {tab === "links" && (
            <div className="flex flex-col gap-4">
              {planOn && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-neutral-300" style={{ background: "color-mix(in srgb, var(--prep-accent) 10%, transparent)" }}>
                  <span className="min-w-0 flex-1 basis-[220px]">
                    Le plan DJ est actif : il choisit un style et une durée pour chaque enchaînement. Les réglages ci-dessous restent le réglage de base du set.
                  </span>
                  <button type="button" className="prep-btn-ghost min-h-9 px-3 text-xs" onClick={() => setTab("dj")}>
                    Régler le DJ
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="pl-label" id="pl-style-label">Style de l&apos;enchaînement</div>
                <div className="pl-chips" role="group" aria-labelledby="pl-style-label">
                  {TRANSITIONS.map(t => (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => props.onTransitionType(t.key)}
                      aria-pressed={transitionType === t.key}
                      title={t.hint}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400">{TRANSITION_HINT[transitionType]}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="pl-trans-sec" className="pl-label">Durée</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pl-trans-sec"
                      type="range"
                      min={2}
                      max={20}
                      step={1}
                      value={transitionSec}
                      onChange={e => props.onTransitionSec(parseInt(e.target.value))}
                      className="h-9 w-full accent-[var(--prep-accent)]"
                      disabled={transitionType === "cut"}
                    />
                    <div className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums">
                      {transitionType === "cut" ? "net" : `${transitionSec} s`}
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-500">Temps pendant lequel les deux titres se mélangent.</p>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="pl-preload" className="pl-label">Préchargement</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pl-preload"
                      type="range"
                      min={2}
                      max={10}
                      step={1}
                      value={preloadSec}
                      onChange={e => props.onPreload(parseInt(e.target.value))}
                      className="h-9 w-full accent-[var(--prep-accent)]"
                      title="Charge le titre suivant N secondes avant la fin pour éviter tout blanc"
                    />
                    <div className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums">{preloadSec} s</div>
                  </div>
                  <p className="text-[11px] text-neutral-500">Charge le titre suivant quelques secondes avant la fin pour éviter tout blanc.</p>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-t border-[var(--prep-line)] pt-3">
                <div className="pl-label">Compatibilité des tonalités</div>
                {transitions.length === 0 ? (
                  <p className="text-[11px] text-neutral-500">Ajoute au moins 2 titres pour voir comment ils s&apos;enchaînent.</p>
                ) : (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                    <span style={{ color: "#34d399" }}>{smooth} fluide(s)</span>
                    <span style={{ color: "#f59e0b" }}>{boost} montée(s)</span>
                    <span style={{ color: clash > 0 ? "#f87171" : "#8b93a1" }}>{clash} dissonante(s)</span>
                    {clash > 0 && (
                      <button type="button" className="text-[11px] text-neutral-300 underline decoration-dotted hover:text-white" onClick={() => { setTab("tracks"); setShowOptimize(true); }}>
                        Réordonner le set
                      </button>
                    )}
                  </p>
                )}
                <p className="text-[11px] text-neutral-500">L&apos;écart de tempo et la compatibilité de chaque enchaînement sont indiqués entre les titres, dans l&apos;onglet Titres.</p>
              </div>
            </div>
          )}

          {tab === "dj" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--prep-line)] p-3">
                <div className="min-w-0 flex-1 basis-[240px]">
                  <div className="text-[13px] font-bold text-neutral-100" id="pl-djplan-label">Plan DJ</div>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    DJ intelligent : un style, une durée et un calage choisis pour chaque enchaînement, d&apos;après les tempos et les tonalités. Le relais les suit.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={planOn}
                  aria-labelledby="pl-djplan-label"
                  className="prep-btn-ghost flex min-h-10 items-center gap-2 px-3 text-xs disabled:opacity-40"
                  onClick={() => props.onMixPlan(!planOn)}
                  disabled={!canPlay}
                  title="DJ intelligent : un style, une durée et un calage choisis pour chaque enchaînement, d'après les tempos et les tonalités. Le relais les suit."
                  style={planOn ? { borderColor: "var(--prep-accent)", color: "var(--prep-accent)" } : undefined}
                >
                  <Icon name="swap" size={14} />
                  {planOn ? "Plan DJ actif" : "Plan DJ"}
                  <span
                    aria-hidden
                    className="relative h-4 w-7 rounded-full transition-colors"
                    style={{ background: planOn ? "var(--prep-accent)" : "#2a303b" }}
                  >
                    <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]" style={{ left: planOn ? 14 : 2 }} />
                  </span>
                </button>
              </div>
              {!canPlay && <p className="text-[11px] text-neutral-500">Il faut au moins 2 titres pour activer le plan DJ.</p>}

              {planOn ? (
                <DjForceControl dj={{ ...DEFAULT_DJ, ...pl.dj }} onChange={props.onDj} />
              ) : (
                canPlay && (
                  <p className="text-[11px] text-neutral-500">
                    Le plan DJ est éteint : le relais utilise le style et la durée uniques réglés dans l&apos;onglet Enchaînements. Active-le pour régler la force du DJ, son style, ses interventions et ses règles.
                  </p>
                )
              )}
            </div>
          )}

          {tab === "prep" && (
            <div className="flex flex-col gap-3">
              <PrepRow
                title="Stems"
                status={`${ready}/${list.length} prêts`}
                text="Les stems séparent les voix et les instruments de chaque titre : le DJ s'en sert pour ses enchaînements quand ils sont prêts."
                bar={list.length ? ready / list.length : 0}
              >
                <button
                  type="button"
                  className="prep-btn-ghost flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40"
                  onClick={() => props.onPrepareStems(list.map(t => t.id))}
                  disabled={allReady || list.length === 0}
                  title="Prépare les stems de tous les titres du set"
                >
                  <Icon name="stems" size={14} />
                  {allReady ? "Stems prêts" : "Préparer les stems"}
                </button>
              </PrepRow>

              <PrepRow
                title="Audio et voix du DJ"
                status={props.prep ? (props.prep.state === "running" ? `audio ${props.prep.warmed}/${props.prep.total}${props.prep.voiceTotal ? ` · voix ${props.prep.voiced}/${props.prep.voiceTotal}` : ""}` : "préparé") : "à préparer"}
                text="Télécharge les titres dans le cache de l'appli (démarrage sans attente) et fabrique les annonces de la voix du DJ si le set en a."
                bar={props.prep ? (props.prep.total ? props.prep.warmed / props.prep.total : props.prep.state === "done" ? 1 : 0) : 0}
              >
                <button
                  type="button"
                  className="prep-btn-ghost flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40"
                  onClick={props.onPrepare}
                  disabled={!canPlay || props.prep?.state === "running"}
                  title="Télécharge les titres dans le cache de l'appli (démarrage sans attente) et fabrique les annonces de la voix du DJ si le set en a"
                >
                  <Icon name="bolt" size={14} />
                  {props.prep?.state === "running"
                    ? `Audio ${props.prep.warmed}/${props.prep.total}${props.prep.voiceTotal ? ` · Voix ${props.prep.voiced}/${props.prep.voiceTotal}` : ""}`
                    : props.prep?.state === "done"
                      ? "Préparé"
                      : "Préparer"}
                </button>
              </PrepRow>
              {props.prep?.voiceFailed && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">Le serveur de voix n&apos;a pas répondu : le set jouera sans annonces.</p>
              )}

              {unanalyzed.length > 0 && (
                <PrepRow
                  title="Tempos et tonalités"
                  status={`${unanalyzed.length} à analyser`}
                  text="Sans tempo ni tonalité, l'ordre et les enchaînements ne peuvent pas être jugés."
                >
                  <button
                    type="button"
                    className="prep-btn-ghost flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:opacity-40"
                    onClick={() => props.onAnalyze(unanalyzed)}
                    disabled={analyzingNow}
                  >
                    {analyzingNow ? "Analyse en cours…" : "Analyser"}
                  </button>
                </PrepRow>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
