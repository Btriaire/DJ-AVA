"use client";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { LibTrack, Playlist, TransitionType } from "@/lib/library";
import { arcTarget, buildSet, type SetArc } from "@/lib/setBuilder";
import { BpmChip, Cover, Icon, KeyChip, fmtDur, keyCompat } from "./parts";

export type SendDest = "relay" | "A" | "B" | "open";
export type SetSource = "checked" | "list" | "all";
export interface SetDraft { id?: string; name: string; trackIds: string[]; transitionType: TransitionType; transitionSec: number }
export interface SetStudioInitial { source: SetSource; listId?: string; autoBuild?: boolean }
export interface SetStudioProps {
  bac: LibTrack[]; // titles set aside (pool of "Tout le bac")
  allTracks: LibTrack[]; // whole library, to resolve the ids of a list
  checkedIds: ReadonlySet<string>; // ids ticked in the bac
  playlists: Playlist[];
  initial?: SetStudioInitial; // read once at mount: the parent remounts with a new key to change it
  isStemReady: (id: string) => boolean;
  onSave: (draft: SetDraft) => string; // creates (no id) or updates (id) the set as a playlist, returns its id
  onSend: (dest: SendDest, playlistId: string) => void;
  canSend: boolean;
}

const ARC_LABEL: Record<SetArc, string> = {
  flow: "Fluide",
  rise: "Montée",
  fall: "Descente",
  peak: "Pic",
  wave: "Vague",
};

const ARC_HINT: Record<SetArc, string> = {
  flow: "Enchaîne au plus compatible, sans courbe imposée",
  rise: "Le tempo monte du début à la fin",
  fall: "Le tempo descend",
  peak: "Monte jusqu'à un pic aux 2/3 puis redescend",
  wave: "Deux vagues : bas, haut, bas, haut, bas",
};

const DURATION_LABEL: Record<number, string> = {
  0: "Tous les titres",
  30: "30 min",
  45: "45 min",
  60: "1 h",
  90: "1 h 30",
  120: "2 h",
};

const DURATION_OPTS = [0, 30, 45, 60, 90, 120] as const;

const TRANSITION_LABEL: Record<TransitionType, string> = {
  smooth: "Doux",
  fade: "Fondu",
  filter: "Filtre",
  cut: "Coupe",
};

const TRANSITION_SECS = [4, 8, 12, 16] as const;

const resolveSource = (
  source: SetSource,
  listId: string,
  bac: LibTrack[],
  allTracks: LibTrack[],
  checkedIds: ReadonlySet<string>,
  playlists: Playlist[]
): LibTrack[] => {
  const trackMap = new Map(allTracks.map(t => [t.id, t]));
  if (source === "checked") return bac.filter(t => checkedIds.has(t.id));
  if (source === "all") return bac;
  if (source === "list") {
    const list = playlists.find(p => p.id === listId);
    if (!list) return [];
    return list.trackIds.map(id => trackMap.get(id)).filter((t): t is LibTrack => !!t);
  }
  return [];
};

const compute = (
  tracks: LibTrack[],
  arc: SetArc,
  durationMin: number,
  startId: string,
  seed: number | null
): string[] => {
  const prepared = tracks.map(t => ({
    id: t.id,
    bpm: t.bpm ?? 0,
    camelot: t.camelot ?? "",
    durationSec: t.durationSec ?? 0,
  }));
  return buildSet(prepared, {
    arc,
    targetMin: durationMin || undefined,
    startId: startId || undefined,
    seed: seed ?? undefined,
  });
};

const ArcGlyph = ({ arc }: { arc: SetArc }) => {
  const points = useMemo(() => {
    const samples = Array.from({ length: 24 }, (_, i) => i / 23);
    return samples.map(t => `${t * 100},${(1 - arcTarget(arc, t)) * 18}`).join(" ");
  }, [arc]);

  return (
    <svg width={44} height={18} viewBox="0 0 100 18" preserveAspectRatio="none">
      <polyline points={points} stroke="currentColor" fill="none" strokeWidth={1.8} />
    </svg>
  );
};

const Curve = ({ tracks, bpmMin, bpmMax }: { tracks: LibTrack[]; bpmMin: number; bpmMax: number }) => {
  const lines = useMemo(() => {
    if (tracks.length < 2) return null;
    const xStep = 100 / (tracks.length - 1);
    const yRange = Math.max(bpmMax - bpmMin, 1); // flat set: a horizontal line, not NaN
    const yOf = (bpm: number) => 5 + ((bpmMax - bpm) / yRange) * 30; // 5 units of padding top and bottom

    return tracks.slice(0, -1).map((a, i) => {
      const b = tracks[i + 1];
      if (!a.bpm || !b.bpm) return null;
      const x1 = i * xStep;
      const x2 = (i + 1) * xStep;
      const y1 = yOf(a.bpm);
      const y2 = yOf(b.bpm);
      const compat = keyCompat(a.camelot, b.camelot);

      return (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={compat.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }).filter(Boolean);
  }, [tracks, bpmMin, bpmMax]);

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full">
      <title>Courbe des BPM du set</title>
      {lines}
    </svg>
  );
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <span className="w-[72px] shrink-0 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
      {label}
    </span>
    {children}
  </div>
);

export function SetStudio({
  bac,
  allTracks,
  checkedIds,
  playlists,
  initial,
  isStemReady,
  onSave,
  onSend,
  canSend,
}: SetStudioProps) {
  const [source, setSource] = useState<SetSource>(initial?.source ?? (checkedIds.size >= 2 ? "checked" : "all"));
  const [listId, setListId] = useState<string>(initial?.listId ?? "");
  const [arc, setArc] = useState<SetArc>("flow");
  const [durationMin, setDurationMin] = useState<number>(0);
  const [startId, setStartId] = useState<string>("");
  const [seed, setSeed] = useState<number | null>(null);
  const [transitionType, setTransitionType] = useState<TransitionType>("smooth");
  const [transitionSec, setTransitionSec] = useState<number>(8);
  const [name, setName] = useState<string>("");
  const [order, setOrder] = useState<string[] | null>(() => {
    if (!initial?.autoBuild) return null;
    const tracks = resolveSource(source, listId, bac, allTracks, checkedIds, playlists);
    return compute(tracks, arc, durationMin, startId, seed);
  });
  const [draftKey, setDraftKey] = useState<string>(() =>
    initial?.autoBuild
      ? JSON.stringify([source, listId, arc, durationMin, "", null, resolveSource(source, listId, bac, allTracks, checkedIds, playlists).map(t => t.id)])
      : ""
  );
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string>("");

  const sourceTracks = useMemo(() => resolveSource(source, listId, bac, allTracks, checkedIds, playlists), [
    source,
    listId,
    bac,
    allTracks,
    checkedIds,
    playlists,
  ]);

  const { known, unknownCount, effectiveStart } = useMemo(() => {
    const known = sourceTracks.filter(t => (t.bpm ?? 0) > 0);
    const unknownCount = sourceTracks.length - known.length;
    const effectiveStart = known.some(t => t.id === startId) ? startId : "";
    return { known, unknownCount, effectiveStart };
  }, [sourceTracks, startId]);

  const srcStats = useMemo(() => {
    const bpms = known.map(t => t.bpm ?? 0);
    return {
      seconds: sourceTracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0),
      min: bpms.length ? Math.round(Math.min(...bpms)) : 0,
      max: bpms.length ? Math.round(Math.max(...bpms)) : 0,
    };
  }, [sourceTracks, known]);

  const defaultName = useMemo(() => {
    const arcLabel = ARC_LABEL[arc];
    const durationLabel = durationMin ? DURATION_LABEL[durationMin] : "";
    return `Set · ${arcLabel}${durationMin ? " · " + durationLabel : ""}`;
  }, [arc, durationMin]);

  const finalName = name.trim() || defaultName;

  const settingsKey = useMemo(() => JSON.stringify([
    source,
    listId,
    arc,
    durationMin,
    effectiveStart,
    seed,
    sourceTracks.map(t => t.id),
  ]), [source, listId, arc, durationMin, effectiveStart, seed, sourceTracks]);

  const draftTracks = useMemo(() => {
    if (!order) return [];
    const trackMap = new Map([...allTracks, ...bac].map(t => [t.id, t]));
    return order.map(id => trackMap.get(id)).filter((t): t is LibTrack => !!t);
  }, [order, allTracks, bac]);

  const { count, totalDuration, bpmMin, bpmMax, readyCount, transitionStats } = useMemo(() => {
    const count = draftTracks.length;
    const totalDuration = draftTracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
    const bpms = draftTracks.map(t => t.bpm ?? 0).filter(bpm => bpm > 0);
    const bpmMin = bpms.length > 0 ? Math.min(...bpms) : 0;
    const bpmMax = bpms.length > 0 ? Math.max(...bpms) : 0;

    const readyCount = draftTracks.filter(t => isStemReady(t.id)).length;

    const transitionStats = {
      smooth: 0,
      boost: 0,
      clash: 0,
      unknown: 0,
    };

    for (let i = 0; i < draftTracks.length - 1; i++) {
      const a = draftTracks[i];
      const b = draftTracks[i + 1];
      const compat = keyCompat(a.camelot, b.camelot);
      if (compat.level === "same" || compat.level === "good") transitionStats.smooth++;
      else if (compat.level === "boost") transitionStats.boost++;
      else if (compat.level === "clash") transitionStats.clash++;
      else transitionStats.unknown++;
    }

    return {
      count,
      totalDuration,
      bpmMin,
      bpmMax,
      readyCount,
      transitionStats,
    };
  }, [draftTracks, isStemReady]);

  const isStale = order !== null && draftKey !== settingsKey;

  const currentSaveKey = useMemo(() => JSON.stringify([
    finalName,
    order,
    transitionType,
    transitionSec,
  ]), [finalName, order, transitionType, transitionSec]);

  const isSaved = savedId !== null && savedKey === currentSaveKey;

  const create = () => {
    setSeed(null); // a fresh creation is the best set; "Autre version" brings variants
    setOrder(compute(sourceTracks, arc, durationMin, effectiveStart, null));
    setDraftKey(JSON.stringify([source, listId, arc, durationMin, effectiveStart, null, sourceTracks.map(t => t.id)]));
  };

  const another = () => {
    const newSeed = (seed ?? 0) + 1;
    setSeed(newSeed);
    const newOrder = compute(sourceTracks, arc, durationMin, effectiveStart, newSeed);
    setOrder(newOrder);
    setDraftKey(JSON.stringify([
      source,
      listId,
      arc,
      durationMin,
      effectiveStart,
      newSeed,
      sourceTracks.map(t => t.id),
    ]));
  };

  const move = (i: number, dir: -1 | 1) => {
    if (!order) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const newOrder = [...order];
    [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
    setOrder(newOrder);
  };

  const removeAt = (i: number) => {
    if (!order) return;
    const newOrder = [...order];
    newOrder.splice(i, 1);
    setOrder(newOrder.length > 0 ? newOrder : null);
  };

  const save = (): string | null => {
    if (!order || order.length === 0) return null;
    const id = onSave({
      id: savedId ?? undefined,
      name: finalName,
      trackIds: order,
      transitionType,
      transitionSec,
    });
    setSavedId(id);
    setSavedKey(currentSaveKey);
    return id;
  };

  const send = (dest: SendDest) => {
    const id = isSaved && savedId ? savedId : save();
    if (id) onSend(dest, id);
  };

  const isValid = sourceTracks.length >= 2 && known.length >= 2;
  const disableReason = source === "list" && !listId
    ? "Choisis une liste"
    : sourceTracks.length < 2
      ? "Il faut au moins 2 titres"
      : "Il faut au moins 2 titres avec un BPM";

  return (
    <div className="flex flex-col gap-3">
      <div className="prep-card flex flex-col gap-3 p-3">
        <Field label="Source">
          <div className="prep-seg">
            <button
              aria-pressed={source === "checked"}
              onClick={() => setSource("checked")}
            >
              Titres cochés ({bac.filter(t => checkedIds.has(t.id)).length})
            </button>
            <button
              aria-pressed={source === "list"}
              onClick={() => setSource("list")}
            >
              Une liste
            </button>
            <button
              aria-pressed={source === "all"}
              onClick={() => setSource("all")}
            >
              Tout le bac ({bac.length})
            </button>
          </div>
          {source === "list" && (
            <select
              aria-label="Liste source du set"
              className="prep-input px-2 py-1 text-xs"
              value={listId}
              onChange={e => setListId(e.target.value)}
            >
              <option value="">Choisir une liste…</option>
              {playlists.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.trackIds.length})
                </option>
              ))}
            </select>
          )}
          <div className="ml-4 flex items-center gap-2 text-[10px] text-neutral-500">
            <span>{sourceTracks.length} titre(s) · {fmtDur(srcStats.seconds)} · {srcStats.max ? `BPM ${srcStats.min}–${srcStats.max}` : "BPM inconnus"}</span>
            {unknownCount > 0 && (
              <span className="text-amber-500">{unknownCount} sans BPM (à analyser)</span>
            )}
          </div>
        </Field>

        <Field label="Forme">
          <div className="flex gap-2">
            {(["flow", "rise", "fall", "peak", "wave"] as const).map(a => (
              <button
                key={a}
                aria-pressed={arc === a}
                onClick={() => setArc(a)}
                title={ARC_HINT[a]}
                className="flex flex-col items-center gap-1 rounded-lg border px-2.5 py-1.5 transition-colors"
                style={
                  arc === a
                    ? { borderColor: "var(--prep-accent)", background: "color-mix(in srgb, var(--prep-accent) 12%, transparent)", color: "var(--prep-accent)" }
                    : { borderColor: "var(--prep-line)", color: "#9aa3b2" }
                }
              >
                <ArcGlyph arc={a} />
                <span className="text-[10px]">{ARC_LABEL[a]}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Durée">
          <select
            aria-label="Durée visée du set"
            className="prep-input px-2 py-1 text-xs"
            value={durationMin}
            onChange={e => setDurationMin(Number(e.target.value))}
          >
            {DURATION_OPTS.map(min => (
              <option key={min} value={min}>
                {DURATION_LABEL[min]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Départ">
          <select
            aria-label="Titre de départ"
            className="prep-input max-w-[220px] px-2 py-1 text-xs"
            value={startId}
            onChange={e => setStartId(e.target.value)}
          >
            <option value="">Auto</option>
            {known.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Transition">
          <div className="prep-seg">
            {(["smooth", "fade", "filter", "cut"] as const).map(t => (
              <button
                key={t}
                aria-pressed={transitionType === t}
                onClick={() => setTransitionType(t)}
              >
                {TRANSITION_LABEL[t]}
              </button>
            ))}
          </div>
          <select
            aria-label="Durée des transitions"
            className="prep-input px-2 py-1 text-xs"
            value={transitionSec}
            onChange={e => setTransitionSec(Number(e.target.value))}
            disabled={transitionType === "cut"}
          >
            {TRANSITION_SECS.map(s => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nom">
          <input
            aria-label="Nom du set"
            className="prep-input min-w-[200px] flex-1 px-2.5 py-1.5 text-xs"
            placeholder={defaultName}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            className="prep-btn-accent flex items-center gap-1.5 px-4 py-1.5 text-xs"
            onClick={create}
            disabled={!isValid}
          >
            <Icon name="bolt" size={12} />
            Créer le set
          </button>
          {!isValid && (
            <span className="ml-2 text-[10px] text-neutral-500">
              {disableReason}
            </span>
          )}
        </Field>
      </div>

      {order && (
        <div className="prep-card flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-bold">{finalName}</h3>
            <div className="flex items-center gap-4 text-[10px] text-neutral-500">
              <span>{count} titres · {fmtDur(totalDuration)} · {bpmMax ? `${Math.round(bpmMin)}–${Math.round(bpmMax)} BPM` : "BPM inconnus"}</span>
              <span className={readyCount === count ? "text-green-500" : ""}>
                stems prêts {readyCount}/{count}
              </span>
              <div className="flex items-center gap-2">
                {transitionStats.smooth > 0 && (
                  <span className="text-green-500">
                    {transitionStats.smooth} fluides
                  </span>
                )}
                {transitionStats.boost > 0 && (
                  <span className="text-amber-500">
                    {transitionStats.boost} montées
                  </span>
                )}
                {transitionStats.clash > 0 && (
                  <span className="text-red-500">
                    {transitionStats.clash} dissonantes
                  </span>
                )}
                {transitionStats.unknown > 0 && (
                  <span className="text-neutral-500">
                    à analyser
                  </span>
                )}
              </div>
            </div>
            {isStale && (
              <button
                className="prep-btn-ghost px-2.5 py-1 text-[11px] text-amber-400"
                onClick={create}
              >
                Réglages modifiés — Créer le set pour recalculer
              </button>
            )}
          </div>

          <Curve tracks={draftTracks} bpmMin={bpmMin} bpmMax={bpmMax} />

          <ol className="flex max-h-[52vh] flex-col overflow-y-auto">
            {draftTracks.map((t, i) => {
              const next = draftTracks[i + 1];
              const compat = next ? keyCompat(t.camelot, next.camelot) : null;
              const bpmDelta = next && t.bpm && next.bpm
                ? (next.bpm / t.bpm - 1) * 100
                : null;

              return (
                <Fragment key={t.id}>
                  <li className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[.03]">
                    <span className="font-mono text-[10px] text-neutral-600 w-5 text-right">
                      {i + 1}
                    </span>
                    <Cover
                      art={t.art}
                      name={t.name}
                      camelot={t.camelot}
                      size={28}
                      rounded={5}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] text-neutral-100"
                      title={t.name}
                    >
                      {t.name}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isStemReady(t.id) ? "bg-green-500" : "bg-neutral-500"
                      }`}
                      title={isStemReady(t.id) ? "Stems prêts" : "Stems non préparés"}
                    />
                    <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
                    <KeyChip camelot={t.camelot} />
                    <span className="font-mono text-[10px] text-neutral-500">
                      {fmtDur(t.durationSec)}
                    </span>
                    <button
                      aria-label="Monter"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-neutral-500 hover:text-white disabled:opacity-25"
                    >
                      <Icon name="up" size={12} />
                    </button>
                    <button
                      aria-label="Descendre"
                      onClick={() => move(i, 1)}
                      disabled={i === draftTracks.length - 1}
                      className="text-neutral-500 hover:text-white disabled:opacity-25"
                    >
                      <Icon name="chevron" size={12} />
                    </button>
                    <button
                      aria-label="Retirer du set"
                      className="text-neutral-500 hover:text-red-400"
                      onClick={() => removeAt(i)}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </li>
                  {next && (
                    <li aria-hidden className="flex items-center gap-2 pl-9 pr-2">
                      <div
                        className="h-3.5 w-0.5"
                        style={{ backgroundColor: compat?.color }}
                      />
                      <span
                        className={`font-mono text-[10px] ${
                          bpmDelta !== null
                            ? Math.abs(bpmDelta) <= 3
                              ? "text-green-500"
                              : Math.abs(bpmDelta) <= 6
                                ? "text-amber-500"
                                : "text-red-500"
                            : "text-neutral-500"
                        }`}
                      >
                        {bpmDelta !== null ? `${bpmDelta > 0 ? "+" : ""}${bpmDelta.toFixed(1)} %` : "? %"}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: compat?.color }}
                      >
                        {compat?.label}
                      </span>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={another}
            >
              <Icon name="refresh" size={12} />
              Autre version
            </button>
            <button
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={save}
              disabled={isSaved}
            >
              {isSaved ? (
                <>
                  <Icon name="check" size={12} />
                  Enregistré
                </>
              ) : (
                <>
                  <Icon name="save" size={12} />
                  Enregistrer
                </>
              )}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                className="prep-btn-accent flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                onClick={() => send("relay")}
                disabled={!canSend}
                title="Automix : les deux platines s'enchaînent toutes seules avec les transitions du set"
              >
                <Icon name="play" size={12} />
                Relais A→B→A
              </button>
              <button
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("A")}
                disabled={!canSend}
                title="Charge le set dans la file du Deck A"
              >
                Deck A
              </button>
              <button
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("B")}
                disabled={!canSend}
                title="Charge le set dans la file du Deck B"
              >
                Deck B
              </button>
              <button
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("open")}
                disabled={!canSend}
                title="Ouvre le set dans l'onglet Playlist sans le lancer"
              >
                <Icon name="send" size={12} />
                Ouvrir dans Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {order === null && isValid && (
        <div className="text-center text-[11px] text-neutral-500">
          Choisis la source et la forme, puis crée le set : tu pourras l&apos;ajuster, l&apos;enregistrer et l&apos;envoyer sur les platines.
        </div>
      )}
    </div>
  );
}
