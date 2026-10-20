"use client";

import { useState, useRef, useMemo, useSyncExternalStore } from "react";
import { loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { enqueuePrep, getPrepState, subscribePrep, forgetPrep } from "@/lib/stemPrep";
import { queueAnalysis } from "@/lib/analyze";
import { qualityFromKbps, kbpsFromSize, QUALITY_LABEL, QUALITY_HINT } from "@/lib/quality";
import type { LibTrack, LibraryData, Playlist } from "@/lib/library";
import type { AudiusTrack } from "@/lib/audius";
import type { PrepReady } from "@/lib/stemPrep";
import type { QualityLevel } from "@/lib/quality";

type SortOption = "recent" | "title" | "bpm" | "camelot" | "theme" | "group";
type DurationFilterKey = "all" | "1" | "3" | "5" | "8" | "15" | "15+";
type QualityFilter = "all" | "HQ" | "STD" | "LQ" | "unknown";

const DUR_FILTERS: { key: DurationFilterKey; label: string; min: number; max: number }[] = [
  { key: "all", label: "Toutes", min: 0, max: 0 },
  { key: "1", label: "<1min", min: 0, max: 60 },
  { key: "3", label: "<3min", min: 0, max: 180 },
  { key: "5", label: "<5min", min: 0, max: 300 },
  { key: "8", label: "<8min", min: 0, max: 480 },
  { key: "15", label: "<15min", min: 0, max: 900 },
  { key: "15+", label: ">15min", min: 900, max: 0 }
];

const SRC_BADGE: Record<string, { label: string; color: string }> = {
  local: { label: "FICHIER", color: "#9ca3af" },
  audius: { label: "AUDIUS", color: "#ffcc00" },
  youtube: { label: "YT", color: "#ef4444" },
  soundcloud: { label: "SC", color: "#ff7700" },
  deezer: { label: "DEEZER", color: "#a238ff" }
};

const QUALITY_COLORS: Record<QualityLevel | "unknown", string> = {
  HQ: "#34d399",
  STD: "#ffcc00",
  LQ: "#ef4444",
  unknown: "#9ca3af"
};

type TrackRow = {
  id: string;
  name: string;
  art?: string;
  source: string;
  url?: string;
  duration?: number;
  bpm?: number | string;
  bpmEstimated?: boolean;
  camelot?: string;
  quality?: QualityLevel;
  abr?: number;
  theme?: string;
  group?: string;
  addedAt?: number;
};

const toRow = (track: LibTrack | AudiusTrack): TrackRow => {
  if (!('title' in track)) {
    return {
      id: track.id,
      name: track.name,
      art: track.art,
      source: track.source,
      url: track.url,
      duration: track.durationSec,
      bpm: track.bpm,
      bpmEstimated: track.bpmEstimated,
      camelot: track.camelot,
      quality: track.quality,
      abr: track.abr,
      theme: track.theme,
      group: track.group,
      addedAt: track.addedAt
    };
  } else {
    return {
      id: track.id,
      name: track.title,
      art: track.artwork ?? undefined,
      source: "youtube",
      url: track.id,
      duration: track.duration,
      bpm: track.bpm ?? undefined,
      camelot: undefined
    };
  }
};

export default function PrepView() {
  const [lib, setLib] = useState(() => loadLibrary());
  const libRef = useRef(lib);
  const prepState = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [checkingQualityIds, setCheckingQualityIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [durationFilter, setDurationFilter] = useState<DurationFilterKey>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");

  const persist = (fn: (d: LibraryData) => LibraryData) => {
    const next = fn(libRef.current);
    if (saveLibrary(next)) {
      libRef.current = next;
      setLib(next);
    }
  };

  const laterTracks = useMemo((): LibTrack[] => lib.tracks.filter(t => t.later), [lib.tracks]);
  const themes = useMemo(() => [...new Set(lib.tracks.map(t => t.theme ?? undefined).filter(Boolean))], [lib.tracks]);
  const groups = useMemo(() => [...new Set(lib.tracks.map(t => t.group ?? undefined).filter(Boolean))], [lib.tracks]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AudiusTrack[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterTheme, setFilterTheme] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError("");
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}&n=40&min=0&max=100000`);
      const data = await res.json();
      setSearchResults(data.tracks.map((track: any) => ({
        ...track,
        bpm: track.bpm ? Number(track.bpm) || undefined : undefined
      })));
    } catch (err) {
      setSearchError("Échec de la recherche");
    } finally {
      setIsSearching(false);
    }
  };

  const addLaterTrack = (track: AudiusTrack) => {
    persist(data => {
      const exists = data.tracks.some(t => t.source === "youtube" && t.url === track.id && t.later);
      if (exists) return data;

      const newTrack: LibTrack = {
        id: uid(),
        name: track.title,
        source: "youtube",
        url: track.id,
        deck: null,
        art: track.artwork ?? undefined,
        durationSec: track.duration,
        bpm: track.bpm ?? undefined,
        later: true,
        addedAt: Date.now()
      };
      return { ...data, tracks: [...data.tracks, newTrack] };
    });
  };

  const updateTrackField = (id: string, field: "theme" | "group", value: string) => {
    persist(data => ({
      ...data,
      tracks: data.tracks.map(t => t.id === id ? { ...t, [field]: value || undefined } : t)
    }));
  };

  const analyzeTrack = async (track: LibTrack) => {
    if (!track.id) return;

    setAnalyzingIds(prev => new Set(prev).add(track.id));
    setFailedIds(prev => new Set([...prev].filter(id => id !== track.id)));

    try {
      const blob = track.source === "local"
        ? await idbGetBlob(track.id)
        : await fetch(`/api/${track.source}/stream?id=${encodeURIComponent(track.url ?? "")}`).then(r => r.blob());

      if (!blob) throw new Error("Blob introuvable");

      if (track.source === "local" && track.durationSec) {
        const abr = kbpsFromSize(blob.size, track.durationSec);
        const quality = qualityFromKbps(abr);
        persist(data => ({
          ...data,
          tracks: data.tracks.map(t => t.id === track.id ? { ...t, abr, quality } : t)
        }));
      }

      queueAnalysis(blob, (result) => {
        setAnalyzingIds(prev => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });

        if (!result) {
          setFailedIds(prev => new Set(prev).add(track.id));
          return;
        }

        persist(data => ({
          ...data,
          tracks: data.tracks.map(t => t.id === track.id ? {
            ...t,
            bpm: result.bpm,
            bpmEstimated: true,
            bpmConfidence: result.bpmConfidence,
            camelot: result.camelot
          } : t)
        }));
      });
    } catch (err) {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
      setFailedIds(prev => new Set(prev).add(track.id));
    }
  };

  const analyzeAllBPM = async () => {
    const tracksToAnalyze = laterTracks.filter(t =>
      t.bpm === undefined &&
      !analyzingIds.has(t.id) &&
      !failedIds.has(t.id)
    );

    for (const track of tracksToAnalyze) {
      await analyzeTrack(track);
    }
  };

  const checkQuality = async (track: LibTrack) => {
    if (!track.id || track.source === "local") return;

    setCheckingQualityIds(prev => new Set(prev).add(track.id));

    try {
      const res = await fetch(`/api/youtube/quality?id=${encodeURIComponent(track.url ?? "")}`);
      const q: { abr?: number | null } = await res.json();
      const abr = q.abr ?? undefined;

      persist(lib => ({
        ...lib,
        tracks: lib.tracks.map(t => t.id === track.id ? {
          ...t,
          abr,
          quality: qualityFromKbps(abr)
        } : t)
      }));
    } catch (err) {
      persist(data => ({
        ...data,
        tracks: data.tracks.map(t => t.id === track.id ? {
          ...t,
          quality: undefined
        } : t)
      }));
    } finally {
      setCheckingQualityIds(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const checkAllQuality = async () => {
    const tracksToCheck = laterTracks.filter(t =>
      t.source !== "local" &&
      !t.quality &&
      !checkingQualityIds.has(t.id)
    );

    for (const track of tracksToCheck) {
      await checkQuality(track);
    }
  };

  const removeLaterTrack = (id: string) => {
    persist(data => ({
      ...data,
      tracks: data.tracks.map(t => t.id === id ? { ...t, later: false } : t)
    }));
  };

  const createPlaylist = () => {
    const name = window.prompt("Nom de la nouvelle liste :");
    if (!name?.trim()) return;

    persist(data => {
      const newPlaylist: Playlist = {
        id: uid(),
        name,
        trackIds: laterTracks.map(t => t.id)
      };
      return { ...data, playlists: [...data.playlists, newPlaylist] };
    });
  };

  const deletePlaylist = (id: string) => {
    if (!window.confirm("Supprimer cette liste ?")) return;

    persist(data => ({
      ...data,
      playlists: data.playlists.filter(p => p.id !== id)
    }));
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const formatBPM = (bpm?: number | string, estimated?: boolean) => {
    if (typeof bpm === "string") return bpm;
    if (!bpm) return "—";
    return estimated ? `≈ ${bpm}` : `${bpm}`;
  };

  const getStemStatus = (trackId: string) => {
    const job = prepState.jobs.find(j => j.trackId === trackId);
    if (!job) return prepState.ready.some(r => r.trackId === trackId) ? "done" : "queued";
    return job.status === "error" ? "error" : job.status === "running" ? `running ${job.progress}%` : job.status;
  };

  const getQualityLabel = (quality?: QualityLevel) => {
    if (!quality) return "?";
    return QUALITY_LABEL[quality];
  };

  const filteredTracks = useMemo((): LibTrack[] => {
    let result = [...laterTracks];

    if (filterTheme) {
      result = result.filter(t => t.theme === filterTheme);
    }

    if (filterGroup) {
      result = result.filter(t => t.group === filterGroup);
    }

    if (durationFilter !== "all") {
      const filter = DUR_FILTERS.find(f => f.key === durationFilter);
      if (filter) {
        result = result.filter(t => {
          if (!t.durationSec) return false;
          if (filter.max === 0) return t.durationSec >= filter.min;
          if (filter.min === 0) return t.durationSec <= filter.max;
          return t.durationSec >= filter.min && t.durationSec <= filter.max;
        });
      }
    }

    if (qualityFilter !== "all") {
      result = result.filter(t => {
        if (qualityFilter === "unknown") return !t.quality;
        return t.quality === qualityFilter;
      });
    }

    switch (sortBy) {
      case "title":
        return result.sort((a, b) => a.name.localeCompare(b.name));
      case "bpm":
        return result.sort((a, b) => {
          const aBpm = typeof a.bpm === "number" ? a.bpm : Infinity;
          const bBpm = typeof b.bpm === "number" ? b.bpm : Infinity;
          return aBpm - bBpm;
        });
      case "camelot":
        return result.sort((a, b) => {
          if (!a.camelot) return 1;
          if (!b.camelot) return -1;
          return a.camelot.localeCompare(b.camelot);
        });
      case "theme":
        return result.sort((a, b) => {
          if (!a.theme) return 1;
          if (!b.theme) return -1;
          return a.theme.localeCompare(b.theme);
        });
      case "group":
        return result.sort((a, b) => {
          if (!a.group) return 1;
          if (!b.group) return -1;
          return a.group.localeCompare(b.group);
        });
      case "recent":
      default:
        return result.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
  }, [laterTracks, sortBy, filterTheme, filterGroup, durationFilter, qualityFilter]);

  const filteredSearchResults = useMemo(() => {
    if (durationFilter === "all") return searchResults;

    const filter = DUR_FILTERS.find(f => f.key === durationFilter);
    if (!filter) return searchResults;

    return searchResults.filter(t => {
      if (!t.duration) return false;
      if (filter.max === 0) return t.duration >= filter.min;
      if (filter.min === 0) return t.duration <= filter.max;
      return t.duration >= filter.min && t.duration <= filter.max;
    });
  }, [searchResults, durationFilter]);

  const renderTrackCard = (track: TrackRow, isLater: boolean) => {
    const stemStatus = isLater ? getStemStatus(track.id) : undefined;
    const isAnalyzing = isLater ? analyzingIds.has(track.id) : false;
    const isFailed = isLater ? failedIds.has(track.id) : false;
    const isCheckingQuality = isLater ? checkingQualityIds.has(track.id) : false;
    const quality = isLater ? track.quality : undefined;
    const abr = isLater ? track.abr : undefined;
    const source = isLater ? track.source : "youtube";
    const duration = isLater ? track.duration : undefined;

    const badge = SRC_BADGE[source] || { label: source.toUpperCase(), color: "#9ca3af" };
    const qualityColor = quality ? QUALITY_COLORS[quality] : QUALITY_COLORS.unknown;

    return (
      <div className="hw-strip flex flex-wrap items-center gap-2 px-2 py-1.5">
        {track.art && (
          <img
            src={track.art}
            alt=""
            className="w-10 h-10 object-cover rounded"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {!track.art && (
          <div className="hw-vinyl w-10 h-10 flex items-center justify-center text-xs font-bold">
            {track.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{track.name}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400">
            {isLater && track.theme && (
              <span>Thème: {track.theme}</span>
            )}
            {isLater && track.group && (
              <span>Groupe: {track.group}</span>
            )}
            <span>
              {formatBPM(track.bpm, track.bpmEstimated)} BPM
            </span>
            {track.camelot && (
              <span>Camelot: {track.camelot}</span>
            )}
            {duration && <span>{fmt(duration)}</span>}
            {abr && <span>{abr} kbps</span>}
            <span
              className="text-[9px] font-black"
              style={{ color: qualityColor }}
            >
              {getQualityLabel(quality)}
            </span>
            {stemStatus && (
              <span>
                Stems: {stemStatus === "queued" ? "en attente" :
                        stemStatus === "done" ? "prêt" :
                        stemStatus === "error" ? "erreur" :
                        stemStatus.startsWith("running") ? `en cours ${stemStatus.split(" ")[1]}` : "—"}
              </span>
            )}
            <span
              className="text-[9px] font-black"
              style={{ color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {isLater && (
            <>
              <button
                onClick={() => enqueuePrep([lib.tracks.find(t => t.id === track.id)!])}
                className="hw-btn px-2 py-1 text-xs"
                style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
              >
                Stems
              </button>
              <button
                onClick={() => analyzeTrack(lib.tracks.find(t => t.id === track.id)!)}
                disabled={isAnalyzing}
                className={`hw-btn px-2 py-1 text-xs ${isAnalyzing ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
              >
                {isAnalyzing ? "Analyse..." : "Analyser"}
              </button>
              {source !== "local" && (
                <button
                  onClick={() => checkQuality(lib.tracks.find(t => t.id === track.id)!)}
                  disabled={isCheckingQuality}
                  className={`hw-btn px-2 py-1 text-xs ${isCheckingQuality ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                >
                  {isCheckingQuality ? "Vérif..." : "Qualité"}
                </button>
              )}
              <button
                onClick={() => removeLaterTrack(track.id)}
                className="hw-btn px-2 py-1 text-xs"
                style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
              >
                Retirer
              </button>
            </>
          )}
          {!isLater && (
            <button
              onClick={() => addLaterTrack(searchResults.find(t => t.id === track.id)!)}
              className="hw-btn px-2 py-1 text-xs"
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              {lib.tracks.some(t => t.source === "youtube" && t.url === track.id && t.later)
                ? "Déjà en préparation"
                : "Mettre de côté"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-300">♫ Préparation</h1>
        <span className="text-[10px] text-neutral-600">{filteredTracks.length} morceaux</span>
      </div>

      {/* Recherche YouTube */}
      <div className="hw-well p-2">
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher sur YouTube..."
            className="hw-well bg-transparent px-2 py-1 text-xs text-neutral-200 outline-none flex-1 min-w-[200px]"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className={`hw-btn px-2 py-1 text-xs ${isSearching ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            {isSearching ? "Recherche..." : "Rechercher"}
          </button>
        </div>
        {searchError && <p className="text-[10px] text-red-500 mb-2">{searchError}</p>}
        <div className="flex flex-wrap gap-1 mb-2">
          {DUR_FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => setDurationFilter(filter.key)}
              className={`hw-btn px-2 py-1 text-xs ${durationFilter === filter.key ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {filteredSearchResults.map((track) => (
            <div key={track.id}>
              {renderTrackCard(toRow(track), false)}
            </div>
          ))}
        </div>
      </div>

      {/* Listes sauvegardées */}
      <div className="hw-well p-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-400">Listes sauvegardées</h2>
          <button
            onClick={createPlaylist}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
          >
            Créer une liste
          </button>
        </div>
        <div className="space-y-1">
          {lib.playlists.map((playlist) => (
            <div key={playlist.id} className="hw-strip flex items-center justify-between px-2 py-1.5">
              <div>
                <p className="text-xs font-medium">{playlist.name}</p>
                <p className="text-[10px] text-neutral-400">{playlist.trackIds.length} morceaux</p>
              </div>
              <button
                onClick={() => deletePlaylist(playlist.id)}
                className="hw-btn px-2 py-1 text-xs"
                style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* À préparer */}
      <div className="hw-well p-2 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={`hw-btn px-2 py-1 text-xs ${viewMode === "list" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Liste
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`hw-btn px-2 py-1 text-xs ${viewMode === "grid" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Grille
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {DUR_FILTERS.map(filter => (
              <button
                key={filter.key}
                onClick={() => setDurationFilter(filter.key)}
                className={`hw-btn px-2 py-1 text-xs ${durationFilter === filter.key ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setQualityFilter("all")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "all" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Toutes qualités
            </button>
            <button
              onClick={() => setQualityFilter("HQ")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "HQ" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
            >
              HQ
            </button>
            <button
              onClick={() => setQualityFilter("STD")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "STD" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Standard
            </button>
            <button
              onClick={() => setQualityFilter("LQ")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "LQ" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
            >
              Basse
            </button>
            <button
              onClick={() => setQualityFilter("unknown")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "unknown" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#9ca3af", color: "#9ca3af" }}
            >
              Inconnue
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <div className="hw-well px-2 py-1 text-xs">
            <label className="text-[9px] text-neutral-400">Trier par</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="hw-well bg-transparent text-xs text-neutral-200 outline-none"
            >
              <option value="recent">Récents</option>
              <option value="title">Titre A-Z</option>
              <option value="bpm">BPM croissant</option>
              <option value="camelot">Tonalité Camelot</option>
              <option value="theme">Thème</option>
              <option value="group">Groupe</option>
            </select>
          </div>
          <div className="hw-well px-2 py-1 text-xs">
            <label className="text-[9px] text-neutral-400">Thème</label>
            <select
              value={filterTheme}
              onChange={(e) => setFilterTheme(e.target.value)}
              className="hw-well bg-transparent text-xs text-neutral-200 outline-none"
            >
              <option value="">Tous</option>
              {themes.map(theme => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
            </select>
          </div>
          <div className="hw-well px-2 py-1 text-xs">
            <label className="text-[9px] text-neutral-400">Groupe</label>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="hw-well bg-transparent text-xs text-neutral-200 outline-none"
            >
              <option value="">Tous</option>
              {groups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={() => enqueuePrep(laterTracks)}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            Préparer tous les stems
          </button>
          <button
            onClick={analyzeAllBPM}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            Analyser tous les BPM
          </button>
          <button
            onClick={checkAllQuality}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            Vérifier la qualité de tous
          </button>
        </div>

        {viewMode === "list" && (
          <div className="space-y-1 flex-1 overflow-y-auto">
            {filteredTracks.map((track) => (
              <div key={track.id}>
                {renderTrackCard(toRow(track), true)}
              </div>
            ))}
          </div>
        )}

        {viewMode === "grid" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 flex-1 overflow-y-auto">
            {filteredTracks.map((track) => (
              <div key={track.id} className="hw-strip p-2">
                <div className="relative mb-2">
                  {track.art && (
                    <img
                      src={track.art}
                      alt=""
                      className="w-full aspect-square object-cover rounded"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {!track.art && (
                    <div className="hw-vinyl w-full aspect-square flex items-center justify-center text-xs font-bold">
                      {track.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="mb-2">
                  <p className="text-xs font-medium truncate">{track.name}</p>
                  <div className="flex flex-wrap gap-1 text-[9px] text-neutral-400">
                    {track.theme && <span>Thème: {track.theme}</span>}
                    {track.group && <span>Groupe: {track.group}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[9px] mb-2">
                  <span>{formatBPM(track.bpm, track.bpmEstimated)} BPM</span>
                  {track.camelot && <span>Camelot: {track.camelot}</span>}
                  {track.durationSec && <span>{fmt(track.durationSec)}</span>}
                  {track.abr && <span>{track.abr} kbps</span>}
                  <span
                    className="font-black"
                    style={{ color: track.quality ? QUALITY_COLORS[track.quality] : QUALITY_COLORS.unknown }}
                  >
                    {getQualityLabel(track.quality)}
                  </span>
                  <span
                    className="font-black"
                    style={{ color: SRC_BADGE[track.source]?.color || "#9ca3af" }}
                  >
                    {SRC_BADGE[track.source]?.label || track.source.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => enqueuePrep([track])}
                    className="hw-btn px-2 py-1 text-xs"
                    style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                  >
                    Stems
                  </button>
                  <button
                    onClick={() => analyzeTrack(track)}
                    disabled={analyzingIds.has(track.id)}
                    className={`hw-btn px-2 py-1 text-xs ${analyzingIds.has(track.id) ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                  >
                    {analyzingIds.has(track.id) ? "Analyse..." : "Analyser"}
                  </button>
                  {track.source !== "local" && (
                    <button
                      onClick={() => checkQuality(track)}
                      disabled={checkingQualityIds.has(track.id)}
                      className={`hw-btn px-2 py-1 text-xs ${checkingQualityIds.has(track.id) ? "hw-btn-on" : ""}`}
                      style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                    >
                      {checkingQualityIds.has(track.id) ? "Vérif..." : "Qualité"}
                    </button>
                  )}
                  <button
                    onClick={() => removeLaterTrack(track.id)}
                    className="hw-btn px-2 py-1 text-xs"
                    style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
