"use client";
import { searchTracks } from "@/lib/trackSearch";
import { Fragment, useMemo, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import type { LibTrack } from "@/lib/library";
import { BpmChip, Cover, Icon, KeyChip, StemPill, fmtDur } from "../prep/parts";
import { DECK_COLOR, DRAG_TYPE, type Side, type StemInfo, type TrackMark } from "./types";

export interface LibraryTab { key: string; label: string; color: string }
export interface LibraryPaneProps {
  tabs: LibraryTab[];
  tab: string;
  onTab: (key: string) => void;
  sources: ReactNode;
  maintenance: ReactNode;
  notice: string | null;
  tracks: LibTrack[];
  inSet: ReadonlySet<string>;
  activeSetName: string | null;
  marks: (id: string) => TrackMark;
  stemOf: (id: string) => StemInfo;
  busyKey: string | null;
  onAdd: (ids: string[]) => void;
  onLoad: (id: string, side: Side) => void;
  onFile: (id: string, side: Side | null) => void;
  onPrepareStems: (id: string) => void;
  onPrepareAllLater: () => void;
  onCaptureFx: (id: string, side: Side) => void;
  onApplyFx: (id: string, side: Side) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onSetField: (id: string, field: "theme" | "group", value: string) => void;
  onImport: () => void;
  onListFromIds: (ids: string[]) => void;
}

export function LibraryPane({
  tabs,
  tab,
  onTab,
  sources,
  maintenance,
  notice,
  tracks,
  inSet,
  activeSetName,
  marks,
  stemOf,
  busyKey,
  onAdd,
  onLoad,
  onFile,
  onPrepareStems,
  onPrepareAllLater,
  onCaptureFx,
  onApplyFx,
  onDelete,
  onDeleteAll,
  onSetField,
  onImport,
  onListFromIds,
}: LibraryPaneProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "bpm" | "key" | "theme" | "group">("recent");
  const [theme, setTheme] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);

  const camelotKey = (k?: string): number => {
    const m = /^(\d{1,2})([AB])$/i.exec(k ?? "");
    return m ? Number(m[1]) * 2 + (m[2].toUpperCase() === "B" ? 1 : 0) : Infinity; // no key: last
  };

  const visible = useMemo(() => {
    // tolerant search (accents, typos, "phrases", -words, bpm:120-130, key:8A...), best match first
    const filtered = searchTracks(tracks, query).filter(t =>
      (theme === "" || t.theme === theme) &&
      (group === "" || t.group === group)
    );

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "recent": return query.trim() ? 0 : b.addedAt - a.addedAt; // a search keeps the best match first (the sort is stable)
        case "title": return a.name.localeCompare(b.name);
        case "bpm": {
          const x = a.bpm && a.bpm > 0 ? a.bpm : Infinity; // unknown BPM last
          const y = b.bpm && b.bpm > 0 ? b.bpm : Infinity;
          return x === y ? 0 : x - y;
        }
        case "key": {
          const x = camelotKey(a.camelot);
          const y = camelotKey(b.camelot);
          return x === y ? 0 : x - y;
        }
        case "theme": return (a.theme ?? "").localeCompare(b.theme ?? "");
        case "group": return (a.group ?? "").localeCompare(b.group ?? "");
      }
    });
  }, [tracks, query, theme, group, sort]);

  const themes = useMemo(() => [...new Set(tracks.map(t => t.theme).filter((x): x is string => !!x))], [tracks]);
  const groups = useMemo(() => [...new Set(tracks.map(t => t.group).filter((x): x is string => !!x))], [tracks]);
  const laterCount = useMemo(() => tracks.filter(t => t.later).length, [tracks]);
  const filtering = query !== "" || theme !== "" || group !== "";

  const handleDragStart = (e: DragEvent, id: string) => {
    const ids = selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "copy";
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(t => t.id)));
  };

  const handleThemeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value);
    setSelected(new Set());
  };

  const handleGroupChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setGroup(e.target.value);
    setSelected(new Set());
  };

  const handleSortChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSort(e.target.value as typeof sort);
  };

  const resetFilters = () => {
    setQuery("");
    setTheme("");
    setGroup("");
    setSelected(new Set());
  };

  const handleDelete = (id: string) => {
    if (confirm === id) {
      onDelete(id);
      setConfirm(null);
    } else {
      setConfirm(id);
    }
  };

  const handleDeleteAll = () => {
    if (confirm === "__all") {
      onDeleteAll();
      setConfirm(null);
    } else {
      setConfirm("__all");
    }
  };

  const renderDeckMarks = (mark: TrackMark) => {
    const parts = [];
    if (mark.cur) parts.push(
      <span key="cur" className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: DECK_COLOR[mark.cur], background: `color-mix(in srgb, ${DECK_COLOR[mark.cur]} 14%, transparent)` }}>
        EN ANTENNE · {mark.cur}
      </span>
    );
    if (mark.next) parts.push(
      <span key="next" className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: DECK_COLOR[mark.next], background: `color-mix(in srgb, ${DECK_COLOR[mark.next]} 14%, transparent)` }}>
        SUIVANT · {mark.next}
      </span>
    );
    return parts;
  };

  return (
    <div className="prep-card flex min-w-0 flex-col overflow-hidden">
      {/* Where the titles come from */}
      <div className="pl-chips border-b border-[var(--prep-line)] p-2" role="group" aria-label="Source des titres">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            style={tab === t.key ? {
              color: t.color,
              borderColor: t.color,
              background: `color-mix(in srgb, ${t.color} 14%, transparent)`,
            } : undefined}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Notice */}
      {notice && (
        <div role="status" className="mx-2 mt-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          {notice}
        </div>
      )}

      {/* Online sources */}
      {tab !== "files" && (
        <div className="flex flex-col gap-2 p-3">
          {sources}
        </div>
      )}

      {/* Files tab */}
      {tab === "files" && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col gap-2 p-2">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                <input
                  type="text"
                  className="prep-input min-h-10 w-full pl-8 pr-2 text-xs"
                  placeholder="Chercher dans la bibliothèque…"
                  aria-label="Chercher dans la bibliothèque"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="prep-btn-accent flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-xs"
                onClick={onImport}
                title="Ajoute des fichiers audio à la bibliothèque"
              >
                <Icon name="upload" size={14} />
                Importer
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <select aria-label="Trier la bibliothèque" className="prep-input min-h-9 min-w-0 px-2 text-xs" value={sort} onChange={handleSortChange}>
                <option value="recent">Récents</option>
                <option value="title">Titre</option>
                <option value="bpm">BPM</option>
                <option value="key">Tonalité</option>
                <option value="theme">Thème</option>
                <option value="group">Groupe</option>
              </select>
              <select aria-label="Filtrer par thème" className="prep-input min-h-9 min-w-0 px-2 text-xs" value={theme} onChange={handleThemeChange}>
                <option value="">Tous thèmes</option>
                {themes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select aria-label="Filtrer par groupe" className="prep-input min-h-9 min-w-0 px-2 text-xs" value={group} onChange={handleGroupChange}>
                <option value="">Tous groupes</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {/* Where the + goes, and the bulk tools */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 text-[11px] text-neutral-500">
            <span className="min-w-0 flex-1 basis-[180px] truncate">
              {activeSetName === null ? "Ouvre un set pour y ajouter des titres." : <>Ajout dans : <strong className="font-bold text-neutral-200">{activeSetName}</strong></>}
            </span>
            {laterCount > 0 && (
              <button type="button" className="prep-btn-ghost min-h-9 px-2.5 text-[11px]" onClick={onPrepareAllLater} title={`Préparer les stems des ${laterCount} titres à jouer plus tard`}>
                Stems des {laterCount} titres « plus tard »
              </button>
            )}
            <button
              type="button"
              className="prep-btn-ghost min-h-9 px-2.5 text-[11px]"
              onClick={() => onListFromIds(visible.map(t => t.id))}
              disabled={visible.length === 0}
              title="Enregistre les titres affichés comme un nouveau set"
            >
              Liste depuis la vue
            </button>
            <button
              type="button"
              className="prep-btn-ghost min-h-9 px-2.5 text-[11px]"
              aria-expanded={showMaintenance}
              onClick={() => setShowMaintenance(!showMaintenance)}
            >
              Maintenance
            </button>
          </div>

          {/* Maintenance section */}
          {showMaintenance && (
            <div className="px-3 pb-2">
              {maintenance}
            </div>
          )}

          {/* Selection bar */}
          {selected.size > 0 && (
            <div className="mx-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "color-mix(in srgb, var(--prep-accent) 14%, transparent)" }}>
              <span className="text-xs text-neutral-200">{selected.size} coché(s)</span>
              <button
                type="button"
                className="prep-btn-accent min-h-9 px-3 text-xs"
                disabled={activeSetName === null}
                title={activeSetName === null ? "Ouvre d'abord un set" : undefined}
                onClick={() => {
                  onAdd([...selected]);
                  setSelected(new Set());
                }}
              >
                {activeSetName === null ? "Ajouter au set" : `Ajouter à « ${activeSetName} »`}
              </button>
              <button
                type="button"
                className="min-h-9 px-2 text-xs text-neutral-400 hover:text-white"
                onClick={() => setSelected(new Set())}
              >
                Tout décocher
              </button>
            </div>
          )}

          {/* List header */}
          <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-neutral-500">
            <label className="flex min-h-9 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.size === visible.length && visible.length > 0}
                onChange={toggleSelectAll}
                aria-label="Tout cocher"
              />
              <span>Tout cocher</span>
            </label>
            <span className="ml-auto">{visible.length} / {tracks.length} titres</span>
          </div>

          {/* List */}
          <ul className="flex flex-col gap-0.5 p-2 pt-0 lg:max-h-[62vh] lg:overflow-y-auto" aria-label="Titres de la bibliothèque">
            {tracks.length === 0 ? (
              <li className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--prep-line)] px-4 py-8 text-center text-neutral-500">
                <Icon name="crate" size={32} />
                <div className="text-[13px] font-bold text-neutral-100">Bibliothèque vide</div>
                <div className="text-[11px]">Importe des fichiers, ou enregistre des trouvailles YouTube / Audius depuis les autres sources.</div>
                <button type="button" className="prep-btn-accent mt-1 flex min-h-10 items-center gap-1.5 px-4 text-xs" onClick={onImport}>
                  <Icon name="upload" size={14} />
                  Importer des fichiers
                </button>
              </li>
            ) : visible.length === 0 ? (
              <li className="flex flex-col items-center gap-2 py-6 text-center text-[12px] text-neutral-500">
                Aucun titre ne correspond.
                {filtering && (
                  <button type="button" className="prep-btn-ghost min-h-9 px-3 text-xs" onClick={resetFilters}>
                    Effacer la recherche et les filtres
                  </button>
                )}
              </li>
            ) : (
              visible.map(t => (
                <li key={t.id}>
                  <div
                    className="pl-row prep-row flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5"
                    data-checked={selected.has(t.id)}
                    draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                  >
                    <label className="flex h-9 w-7 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        aria-label={`Sélectionner ${t.name}`}
                      />
                    </label>
                    <Cover art={t.art} name={t.name} camelot={t.camelot} size={38} />

                    <div className="min-w-0 flex-1 basis-[150px]">
                      <div className="truncate text-[13px] font-semibold text-neutral-100" title={t.name}>
                        {t.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
                        <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
                        <KeyChip camelot={t.camelot} />
                        <span className="font-mono tabular-nums">{fmtDur(t.durationSec)}</span>
                        <StemPill info={stemOf(t.id)} onPrepare={() => onPrepareStems(t.id)} />
                        {(t.theme || t.group) && (
                          <span className="max-w-[140px] truncate">{[t.theme, t.group].filter(Boolean).join(" · ")}</span>
                        )}
                        {renderDeckMarks(marks(t.id))}
                      </div>
                    </div>

                    <div className="pl-row-actions ml-auto flex items-center gap-1">
                      {activeSetName !== null && (
                        inSet.has(t.id) ? (
                          <span className="flex h-9 w-9 items-center justify-center text-green-500" title="Déjà dans le set">
                            <Icon name="check" size={16} />
                            <span className="sr-only">Déjà dans le set</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="prep-btn-ghost flex min-h-9 items-center gap-1 px-2.5 text-[11px]"
                            onClick={() => onAdd([t.id])}
                            aria-label={`Ajouter « ${t.name} » à « ${activeSetName} »`}
                            title={`Ajouter à « ${activeSetName} »`}
                          >
                            <Icon name="plus" size={11} />
                            Set
                          </button>
                        )
                      )}

                      {(["A", "B"] as const).map(side => (
                        <button
                          key={side}
                          type="button"
                          className="h-9 w-9 rounded-lg text-[12px] font-black disabled:opacity-40"
                          style={{
                            color: DECK_COLOR[side],
                            border: `1px solid color-mix(in srgb, ${DECK_COLOR[side]} 50%, transparent)`
                          }}
                          aria-label={`Charger « ${t.name} » sur le deck ${side}`}
                          title={`Charger sur le deck ${side}`}
                          disabled={busyKey === t.id + side}
                          onClick={() => onLoad(t.id, side)}
                        >
                          {busyKey === t.id + side ? "…" : side}
                        </button>
                      ))}

                      <button
                        type="button"
                        className="pl-icon-btn"
                        aria-expanded={openId === t.id}
                        aria-label={`Plus d'actions pour « ${t.name} »`}
                        title="Plus d'actions : classer pour un deck, effets, thème, groupe, supprimer"
                        onClick={() => setOpenId(openId === t.id ? null : t.id)}
                      >
                        <Icon name="chevron" className={openId === t.id ? "rotate-180" : ""} size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded tools */}
                  {openId === t.id && (
                    <div className="mb-1 grid gap-3 rounded-lg bg-black/20 p-3 sm:grid-cols-2">
                      {/* Classer pour le deck */}
                      <div>
                        <div className="pl-label mb-1">Classer pour le deck</div>
                        <div className="pl-chips">
                          {(["A", "B"] as const).map(side => (
                            <button
                              key={side}
                              type="button"
                              aria-pressed={t.deck === side}
                              onClick={() => onFile(t.id, t.deck === side ? null : side)}
                              title="Classe ce titre pour la boucle solo d'un deck (LIVE, sans set)"
                            >
                              {side}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Effets */}
                      <div>
                        <div className="pl-label mb-1">Effets</div>
                        <div className="flex flex-wrap gap-1">
                          {(["A", "B"] as const).map(side => (
                            <Fragment key={side}>
                              <button
                                type="button"
                                className="prep-btn-ghost min-h-9 px-2.5 text-[11px]"
                                onClick={() => onCaptureFx(t.id, side)}
                                title={`Enregistre les effets actuels du deck ${side} pour ce titre`}
                              >
                                Capturer {side}
                              </button>
                              <button
                                type="button"
                                className="prep-btn-ghost min-h-9 px-2.5 text-[11px] disabled:opacity-40"
                                onClick={() => onApplyFx(t.id, side)}
                                disabled={side === "A" ? !t.fxA : !t.fxB}
                                title={`Applique les effets enregistrés au deck ${side}`}
                              >
                                Appliquer {side}
                              </button>
                            </Fragment>
                          ))}
                        </div>
                      </div>

                      {/* Thème et Groupe */}
                      <div>
                        <label htmlFor={`pl-theme-${t.id}`} className="pl-label mb-1 block">Thème</label>
                        <input
                          id={`pl-theme-${t.id}`}
                          type="text"
                          className="prep-input min-h-9 w-full px-2 text-xs"
                          defaultValue={t.theme}
                          onBlur={e => onSetField(t.id, "theme", e.target.value)}
                          list="pl-themes"
                        />
                      </div>

                      <div>
                        <label htmlFor={`pl-group-${t.id}`} className="pl-label mb-1 block">Groupe</label>
                        <input
                          id={`pl-group-${t.id}`}
                          type="text"
                          className="prep-input min-h-9 w-full px-2 text-xs"
                          defaultValue={t.group}
                          onBlur={e => onSetField(t.id, "group", e.target.value)}
                          list="pl-groups"
                        />
                      </div>

                      {/* Supprimer */}
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          className={`flex min-h-9 w-full items-center justify-center gap-1.5 px-3 text-xs ${confirm === t.id ? "rounded-lg bg-red-500/20 text-red-300" : "prep-btn-ghost"}`}
                          onClick={() => handleDelete(t.id)}
                          onBlur={() => confirm === t.id && setConfirm(null)}
                        >
                          {confirm === t.id ? "Confirmer la suppression" : (
                            <>
                              <Icon name="trash" size={14} />
                              Supprimer de la bibliothèque
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--prep-line)] px-3 py-2">
            <span className="text-[10px] text-neutral-600">Glisse un titre (ou plusieurs cochés) sur un set ou dans le set ouvert.</span>
            <button
              type="button"
              className={`prep-btn-ghost min-h-9 shrink-0 px-3 text-xs disabled:opacity-40 ${confirm === "__all" ? "!bg-red-500/20 !text-red-300" : ""}`}
              onClick={handleDeleteAll}
              onBlur={() => confirm === "__all" && setConfirm(null)}
              disabled={tracks.length === 0}
              title="Supprime tous les titres de la bibliothèque"
            >
              {confirm === "__all" ? "Confirmer la suppression" : "Tout effacer"}
            </button>
          </div>

          {/* Datalists */}
          <datalist id="pl-themes">
            {themes.map(t => <option key={t} value={t} />)}
          </datalist>
          <datalist id="pl-groups">
            {groups.map(g => <option key={g} value={g} />)}
          </datalist>
        </>
      )}
    </div>
  );
}
