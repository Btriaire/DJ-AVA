"use client";
import { useMemo, useState } from "react";
import type { LibTrack, Playlist, TransitionType } from "@/lib/library";
import type { SetArc } from "@/lib/setBuilder";
import { arcTarget } from "@/lib/setBuilder";
import { setHealth } from "@/lib/setHealth";
import { ARC_HINT, ARC_LABEL, ARC_ORDER, DURATIONS, computeOrder, durationLabel, estimateCount, needsAnalysis, resolveSource, type WizardSource } from "@/lib/setWizard";
import { Icon, fmtDur } from "../prep/parts";
import { OrderPreview } from "./OrderPreview";

export type WizardDest = "relay" | "A" | "B" | "open";
export interface SetDraft { id?: string; name: string; trackIds: string[]; transitionType: TransitionType; transitionSec: number }
export interface WizardInitial { source: WizardSource; listId?: string; autoBuild?: boolean }
export interface SetWizardProps {
  bac: LibTrack[];
  allTracks: LibTrack[];
  checkedIds: ReadonlySet<string>;
  playlists: Playlist[];
  initial?: WizardInitial;
  poolLabel: string;
  isStemReady: (id: string) => boolean;
  analyzing: ReadonlySet<string>;
  onAnalyze: (ids: string[]) => void;
  onPrepareStems: (ids: string[]) => void;
  onSave: (draft: SetDraft) => string;
  onSend: (dest: WizardDest, playlistId: string) => void;
  canSend: boolean;
  onClose?: () => void;
}

export function SetWizard({
  bac,
  allTracks,
  checkedIds,
  playlists,
  initial,
  poolLabel,
  isStemReady,
  analyzing,
  onAnalyze,
  onPrepareStems,
  onSave,
  onSend,
  canSend,
  onClose,
}: SetWizardProps) {
  const [step, setStep] = useState(() => initial?.autoBuild ? 3 : initial ? 2 : 1);
  const [reached, setReached] = useState(() => initial?.autoBuild ? 3 : initial ? 2 : 1);
  const [source, setSource] = useState<WizardSource>(() => initial?.source ?? (checkedIds.size >= 2 ? "checked" : "all"));
  const [listId, setListId] = useState<string>(() => initial?.listId ?? "");
  const [arc, setArc] = useState<SetArc>("flow");
  const [durationMin, setDurationMin] = useState<number>(0);
  const [startId, setStartId] = useState<string>("");
  const [seed, setSeed] = useState<number | null>(null);
  const [transitionType, setTransitionType] = useState<TransitionType>("smooth");
  const [transitionSec, setTransitionSec] = useState<number>(8);
  const [name, setName] = useState<string>("");
  const [order, setOrder] = useState<string[] | null>(() => initial?.autoBuild ? computeOrder(
    resolveSource(initial.source, initial.listId ?? "", bac, allTracks, checkedIds, playlists),
    "flow",
    0,
    "",
    null
  ) : null);
  const [draftKey, setDraftKey] = useState<string>(() => JSON.stringify([
    initial?.source ?? (checkedIds.size >= 2 ? "checked" : "all"),
    initial?.listId ?? "",
    "flow",
    0,
    "",
    null,
    resolveSource(initial?.source ?? (checkedIds.size >= 2 ? "checked" : "all"), initial?.listId ?? "", bac, allTracks, checkedIds, playlists).map(t => t.id)
  ]));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string>("");

  const sourceTracks = useMemo(() => resolveSource(source, listId, bac, allTracks, checkedIds, playlists), [source, listId, bac, allTracks, checkedIds, playlists]);
  const known = useMemo(() => sourceTracks.filter(t => t.bpm && t.bpm > 0), [sourceTracks]);
  const toAnalyze = useMemo(() => needsAnalysis(sourceTracks), [sourceTracks]);
  const analyzingNow = useMemo(() => toAnalyze.filter(t => analyzing.has(t.id)).length, [toAnalyze, analyzing]);
  const effectiveStart = useMemo(() => known.some(t => t.id === startId) ? startId : "", [known, startId]);
  const defaultName = useMemo(() => "Set · " + ARC_LABEL[arc] + (durationMin ? " · " + durationLabel(durationMin) : ""), [arc, durationMin]);
  const finalName = useMemo(() => name.trim() || defaultName, [name, defaultName]);
  const settingsKey = useMemo(() => JSON.stringify([source, listId, arc, durationMin, effectiveStart, seed, sourceTracks.map(t => t.id)]), [source, listId, arc, durationMin, effectiveStart, seed, sourceTracks]);
  const isStale = useMemo(() => order !== null && draftKey !== settingsKey, [order, draftKey, settingsKey]);
  const byId = useMemo(() => new Map([...allTracks, ...bac].map(t => [t.id, t])), [allTracks, bac]);
  const draftTracks = useMemo(() => order ? order.map(id => byId.get(id)).filter((t): t is LibTrack => !!t) : [], [order, byId]);
  const health = useMemo(() => setHealth(order ?? [], byId, isStemReady), [order, byId, isStemReady]);
  const saveKey = useMemo(() => JSON.stringify([finalName, order, transitionType, transitionSec]), [finalName, order, transitionType, transitionSec]);
  const isSaved = useMemo(() => savedId !== null && savedKey === saveKey, [savedId, savedKey, saveKey]);

  const build = (nextSeed: number | null) => {
    setSeed(nextSeed);
    setOrder(computeOrder(sourceTracks, arc, durationMin, effectiveStart, nextSeed));
    setDraftKey(JSON.stringify([source, listId, arc, durationMin, effectiveStart, nextSeed, sourceTracks.map(t => t.id)]));
  };

  const goTo = (n: number) => {
    if (n <= reached) setStep(n);
  };

  const next = () => {
    if (step === 2 && (order === null || isStale)) build(null);
    setStep(step + 1);
    setReached(Math.max(reached, step + 1));
  };

  const back = () => {
    if (step > 1) setStep(step - 1);
  };

  const move = (i: number, dir: number) => {
    if (!order) return;
    const newOrder = [...order];
    const j = i + dir;
    if (j >= 0 && j < newOrder.length) {
      [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
      setOrder(newOrder);
    }
  };

  const removeAt = (i: number) => {
    if (!order) return;
    const newOrder = [...order];
    newOrder.splice(i, 1);
    if (newOrder.length < 2) {
      setOrder(null);
      setStep(2);
    } else {
      setOrder(newOrder);
    }
  };

  const save = () => {
    const id = onSave({
      id: savedId ?? undefined,
      name: finalName,
      trackIds: order ?? [],
      transitionType,
      transitionSec
    });
    setSavedId(id);
    setSavedKey(saveKey);
    return id;
  };

  const send = (dest: WizardDest) => {
    const id = isSaved && savedId ? savedId : save();
    if (id) onSend(dest, id);
  };

  const restart = () => {
    setStep(1);
    setReached(1);
    setOrder(null);
    setSeed(null);
    setName("");
    setSavedId(null);
    setSavedKey("");
  };

  const blockReason =
    step === 1 ? (source === "list" && !listId ? "Choisis un set" : known.length < 2 ? "Il faut au moins 2 titres avec un tempo" : "")
    : step === 2 ? (known.length < 2 ? "Il faut au moins 2 titres avec un tempo" : "")
    : step === 3 ? (order === null ? "Rien à envoyer : reviens à la forme" : "")
    : "";

  const stepTitles = ["Titres", "Forme", "Ordre", "Envoi"];
  const stepSummaries = [
    sourceTracks.length ? `${sourceTracks.length} titre(s) · ${fmtDur(sourceTracks.reduce((sum, t) => sum + (t.durationSec || 0), 0))}` : "à choisir",
    `${ARC_LABEL[arc]} · ${durationLabel(durationMin)}`,
    order ? `${health.count} titres · ${fmtDur(health.seconds)}` : "à calculer",
    savedId ? finalName : "à enregistrer"
  ];

  const transitionLabels: Record<TransitionType, string> = {
    smooth: "Courbe en S, presque imperceptible.",
    fade: "Fondu enchaîné linéaire, classique.",
    filter: "Le titre sortant se ferme au filtre pendant le fondu.",
    cut: "Bascule instantanée, sans fondu."
  };

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Étapes de création du set" className="prep-card flex flex-wrap items-stretch gap-2 p-2">
        {stepTitles.map((title, i) => (
          <button
            key={i}
            type="button"
            disabled={i + 1 > reached}
            aria-current={step === i + 1 ? "step" : undefined}
            onClick={() => goTo(i + 1)}
            className={`flex min-w-[130px] flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
              step === i + 1 ? "border border-[var(--prep-accent)] bg-[color-mix(in_srgb,_var(--prep-accent)_14%,_transparent)]" : ""
            }`}
            style={step === i + 1 ? { color: "var(--prep-accent)" } : {}}
          >
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              step === i + 1 ? "bg-[var(--prep-accent)] text-[#05070a]" :
              i + 1 < step ? "bg-green-500 text-[#05070a]" :
              "border border-[var(--prep-line)] text-neutral-500"
            }`}>
              {i + 1 < step ? <Icon name="check" size={14} /> : i + 1}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold">{title}</div>
              <div className="truncate text-[10px] text-neutral-500">{stepSummaries[i]}</div>
            </div>
          </button>
        ))}
        {onClose && (
          <button
            type="button"
            aria-label="Fermer l'assistant"
            onClick={onClose}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--prep-line)] text-neutral-500 hover:bg-white/[.03]"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </nav>

      <section className="prep-card flex flex-col gap-4 p-4">
        {step === 1 && (
          <>
            <div>
              <h3 className="text-sm font-black text-neutral-100">Quels titres veux-tu enchaîner ?</h3>
              <p className="text-[12px] text-neutral-400">Choisis d&apos;où viennent les titres du set. Tu peux en retirer ensuite.</p>
            </div>

            <div className="prep-seg">
              <button
                type="button"
                aria-pressed={source === "checked"}
                onClick={() => setSource("checked")}
              >
                Titres cochés ({bac.filter(t => checkedIds.has(t.id)).length})
              </button>
              <button
                type="button"
                aria-pressed={source === "list"}
                onClick={() => setSource("list")}
              >
                Un set existant
              </button>
              <button
                type="button"
                aria-pressed={source === "all"}
                onClick={() => setSource("all")}
              >
                Tout {poolLabel} ({bac.length})
              </button>
            </div>

            {source === "list" && (
              <select
                className="prep-input px-2 py-1.5 text-xs"
                aria-label="Set source"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
              >
                <option value="">Choisir un set…</option>
                {playlists.map(pl => (
                  <option key={pl.id} value={pl.id}>{pl.name} ({pl.trackIds.length})</option>
                ))}
              </select>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Titres</div>
                <div className="text-[12px] font-semibold text-neutral-100">{sourceTracks.length}</div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Durée</div>
                <div className="text-[12px] font-semibold text-neutral-100">{fmtDur(sourceTracks.reduce((sum, t) => sum + (t.durationSec || 0), 0))}</div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Tempos</div>
                <div className="text-[12px] font-semibold text-neutral-100">
                  {known.length > 0 ? `${Math.min(...known.map(t => t.bpm!))}–${Math.max(...known.map(t => t.bpm!))}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Stems prêts</div>
                <div className="text-[12px] font-semibold text-neutral-100">
                  {sourceTracks.filter(t => isStemReady(t.id)).length}/{sourceTracks.length}
                </div>
              </div>
            </div>

            {toAnalyze.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                {`${toAnalyze.length} titre(s) sans tempo ou sans tonalité : l'ordre et les transitions seront moins bons.`}
              </div>
            )}

            {toAnalyze.length > 0 && (
              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 self-start px-3 py-1.5 text-xs"
                onClick={() => onAnalyze(toAnalyze.map(t => t.id))}
                disabled={analyzingNow > 0}
              >
                {analyzingNow > 0 ? `Analyse en cours : ${analyzingNow}/${toAnalyze.length}` : "Analyser"}
              </button>
            )}

            {sourceTracks.some(t => !isStemReady(t.id)) && (
              <>
                <div className="text-[12px] text-neutral-400">
                  {sourceTracks.filter(t => !isStemReady(t.id)).length} titre(s) sans stems préparés
                </div>
                <button
                  type="button"
                  className="prep-btn-ghost flex items-center gap-1.5 self-start px-3 py-1.5 text-xs"
                  onClick={() => onPrepareStems(sourceTracks.filter(t => !isStemReady(t.id)).map(t => t.id))}
                >
                  Préparer les stems
                </button>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h3 className="text-sm font-black text-neutral-100">Quelle forme pour ton set ?</h3>
              <p className="text-[12px] text-neutral-400">La forme décide comment l&apos;énergie évolue : le tempo suit la courbe, les tonalités restent compatibles.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ARC_ORDER.map(a => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={arc === a}
                  onClick={() => setArc(a)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs ${
                    arc === a ? "border-[var(--prep-accent)] bg-[color-mix(in_srgb,_var(--prep-accent)_14%,_transparent)]" : "border-[var(--prep-line)]"
                  }`}
                >
                  <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
                    <polyline
                      points={Array.from({length: 24}, (_, i) => `${(i * 100) / 23},${22 - arcTarget(a, i / 23) * 20}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="text-[10px] font-semibold">{ARC_LABEL[a]}</div>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-neutral-300">{ARC_HINT[arc]}</div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="duration" className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Durée</label>
                <select
                  id="duration"
                  className="prep-input px-2 py-1.5 text-xs"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                >
                  {DURATIONS.map(d => (
                    <option key={d} value={d}>{durationLabel(d)}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="start" className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Départ</label>
                <select
                  id="start"
                  className="prep-input max-w-[240px] px-2 py-1.5 text-xs"
                  value={startId}
                  onChange={(e) => setStartId(e.target.value)}
                >
                  <option value="">Auto</option>
                  {known.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {durationMin > 0 && (
                <div className="text-[11px] text-neutral-400">≈ {estimateCount(sourceTracks, durationMin)} titres pour {durationLabel(durationMin)}</div>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h3 className="text-sm font-black text-neutral-100">Voici l&apos;ordre proposé.</h3>
              <p className="text-[12px] text-neutral-400">Glisse-le à ta main : monte, descends ou retire des titres. L&apos;écart de tempo et la compatibilité sont indiqués entre chaque titre.</p>
            </div>

            {order === null ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-neutral-500">Rien à afficher : reviens à la forme.</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{health.count}</span> titres
                  </div>
                  <div className="font-mono">{fmtDur(health.seconds)}</div>
                  <div className="font-mono">{health.bpmMin}–{health.bpmMax} BPM</div>
                  {health.smooth > 0 && (
                    <div className="flex items-center gap-1 text-green-400">
                      <span className="font-mono">{health.smooth}</span> fluides
                    </div>
                  )}
                  {health.boost > 0 && (
                    <div className="flex items-center gap-1 text-amber-400">
                      <span className="font-mono">{health.boost}</span> montées
                    </div>
                  )}
                  {health.clash > 0 && (
                    <div className="flex items-center gap-1 text-red-400">
                      <span className="font-mono">{health.clash}</span> dissonantes
                    </div>
                  )}
                </div>

                <OrderPreview tracks={draftTracks} onMove={(i, dir) => move(i, dir)} onRemove={removeAt} />

                {isStale && (
                  <button
                    type="button"
                    className="prep-btn-ghost flex items-center gap-1.5 self-start px-3 py-1.5 text-xs"
                    onClick={() => build(null)}
                  >
                    Réglages modifiés : recalculer
                  </button>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h3 className="text-sm font-black text-neutral-100">Comment s&apos;enchaînent-ils, et où l&apos;envoyer ?</h3>
              <p className="text-[12px] text-neutral-400">Donne un nom au set, règle la transition entre deux titres, puis enregistre-le ou lance-le tout de suite.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="set-name" className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Nom</label>
              <input
                id="set-name"
                className="prep-input w-full px-3 py-2 text-sm"
                placeholder={defaultName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Nom du set"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Transition</div>
              <div className="prep-seg">
                <button
                  type="button"
                  aria-pressed={transitionType === "smooth"}
                  onClick={() => setTransitionType("smooth")}
                >
                  Doux
                </button>
                <button
                  type="button"
                  aria-pressed={transitionType === "fade"}
                  onClick={() => setTransitionType("fade")}
                >
                  Fondu
                </button>
                <button
                  type="button"
                  aria-pressed={transitionType === "filter"}
                  onClick={() => setTransitionType("filter")}
                >
                  Filtre
                </button>
                <button
                  type="button"
                  aria-pressed={transitionType === "cut"}
                  onClick={() => setTransitionType("cut")}
                >
                  Coupe
                </button>
              </div>
              <div className="text-[11px] text-neutral-400">{transitionLabels[transitionType]}</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={transitionSec}
                  onChange={(e) => setTransitionSec(Number(e.target.value))}
                  disabled={transitionType === "cut"}
                  className="flex-1"
                />
                <div className="font-mono text-[11px] text-neutral-300">{transitionSec} s</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Titres</div>
                <div className="text-[12px] font-semibold text-neutral-100">{health.count}</div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Durée</div>
                <div className="text-[12px] font-semibold text-neutral-100">{fmtDur(health.seconds)}</div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Tempos</div>
                <div className="text-[12px] font-semibold text-neutral-100">{health.bpmMin}–{health.bpmMax}</div>
              </div>
              <div className="rounded-lg border border-[var(--prep-line)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Stems prêts</div>
                <div className="flex items-center gap-1 text-[12px] font-semibold text-neutral-100">
                  <span>{health.stemsReady}/{health.count}</span>
                  {health.stemsReady < health.count && (
                    <button
                      type="button"
                      aria-label="Préparer les stems"
                      onClick={() => onPrepareStems(draftTracks.filter(t => !isStemReady(t.id)).map(t => t.id))}
                      className="ml-auto flex h-5 w-5 items-center justify-center rounded-full border border-[var(--prep-line)] text-neutral-500 hover:bg-white/[.03]"
                    >
                      <Icon name="stems" size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {health.smooth > 0 && (
                <div className="flex items-center gap-1 text-green-400">
                  <span className="font-mono">{health.smooth}</span> fluides
                </div>
              )}
              {health.boost > 0 && (
                <div className="flex items-center gap-1 text-amber-400">
                  <span className="font-mono">{health.boost}</span> montées
                </div>
              )}
              {health.clash > 0 && (
                <div className="flex items-center gap-1 text-red-400">
                  <span className="font-mono">{health.clash}</span> dissonantes
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs ${isSaved ? "text-green-400" : ""}`}
                onClick={save}
                disabled={isSaved}
              >
                {isSaved ? (
                  <>
                    <Icon name="check" size={14} />
                    Enregistré
                  </>
                ) : (
                  <>
                    <Icon name="save" size={14} />
                    Enregistrer
                  </>
                )}
              </button>

              <button
                type="button"
                className="prep-btn-accent flex items-center gap-1.5 px-4 py-2 text-xs"
                onClick={() => send("relay")}
                disabled={!canSend}
              >
                <Icon name="play" size={14} />
                Relais A→B→A
              </button>

              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("A")}
                disabled={!canSend}
              >
                Deck A
              </button>

              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("B")}
                disabled={!canSend}
              >
                Deck B
              </button>

              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={() => send("open")}
                disabled={!canSend}
              >
                <Icon name="send" size={14} />
                Ouvrir dans Playlist
              </button>
            </div>

            {savedId && (
              <div className="flex items-center gap-2 text-[12px] text-green-400">
                <Icon name="check" size={14} />
                <span>Set enregistré dans ta bibliothèque.</span>
                <button
                  type="button"
                  className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  onClick={restart}
                >
                  Créer un autre set
                </button>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--prep-line)] pt-3">
          {step > 1 && (
            <button
              type="button"
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={back}
            >
              <Icon name="chevron" size={14} className="rotate-90" />
              Retour
            </button>
          )}

          {step === 3 && order !== null && (
            <button
              type="button"
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={() => build((seed ?? 0) + 1)}
            >
              <Icon name="refresh" size={14} />
              Autre version
            </button>
          )}

          {step < 4 && blockReason && <span className="ml-auto text-[11px] text-neutral-500">{blockReason}</span>}
          {step < 4 && (
            <button
              type="button"
              className={`prep-btn-accent ${blockReason ? "" : "ml-auto"} flex items-center gap-1.5 px-4 py-2 text-xs`}
              onClick={next}
              disabled={blockReason !== ""}
            >
              {step === 1 ? "Suivant : la forme" :
               step === 2 ? "Calculer l'ordre" :
               "Suivant : transitions et envoi"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
