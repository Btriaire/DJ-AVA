"use client";

import { useState, useRef, useMemo, useSyncExternalStore, useEffect } from "react";
import { loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { enqueuePrep, getPrepState, subscribePrep, forgetPrep, cancelPrep } from "@/lib/stemPrep";
import { queueAnalysis } from "@/lib/analyze";
import { qualityFromKbps, kbpsFromSize, QUALITY_LABEL, QUALITY_HINT, QUALITY_RANK } from "@/lib/quality";
import { buildSmartSet } from "@/lib/setBuilder";
import { pickNext } from "@/lib/setPicker";
import { getCachedQuality, probeQualities } from "@/lib/ytQuality";
import { VIDEO_LABEL, VIDEO_RANK, videoLevelFromHeight, effectiveVideoLevel } from "@/lib/videoQuality";
import type { LibTrack, LibraryData, Playlist } from "@/lib/library";
import type { AudiusTrack } from "@/lib/audius";
import type { PrepReady } from "@/lib/stemPrep";
import type { QualityLevel } from "@/lib/quality";
import type { VideoLevel } from "@/lib/videoQuality";
import type { Cue } from "@/lib/setPicker";
import type { VideoMeta } from "@/lib/videoMeta";

type SortOption = "recent" | "title" | "bpm" | "camelot" | "theme" | "group";
type DurationFilterKey = "all" | "1" | "3" | "5" | "8" | "15" | "15+";
type QualityFilter = "all" | "HR" | "HQ" | "STD" | "LQ" | "unknown";
type ResultQualityFilter = "all" | "HQ" | "HR";
type VideoFilter = "all" | "HD" | "FHD" | "4K";

const LONG_TRACK_SEC = 1200; // 20 minutes

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
  HR: "#a78bfa",
  HQ: "#34d399",
  STD: "#ffcc00",
  LQ: "#ef4444",
  unknown: "#9ca3af"
};

const VIDEO_COLORS: Record<VideoLevel | "unknown", string> = {
  "4K": "#a78bfa",
  FHD: "#34d399",
  HD: "#ffcc00",
  SD: "#ef4444",
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
  height?: number;
  theme?: string;
  group?: string;
  addedAt?: number;
  meta?: VideoMeta;
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
      height: track.height,
      theme: track.theme,
      group: track.group,
      addedAt: track.addedAt,
      meta: track.meta
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

// grid card widths: small / medium / large covers
const COVER_CLASS = { S: "w-8 h-8", M: "w-14 h-14", L: "w-20 h-20" }; // list-view cover sizes, follow the S/M/L toggle
const GRID_CLASS = {
  S: "grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 flex-1 overflow-y-auto",
  M: "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 flex-1 overflow-y-auto",
  L: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 flex-1 overflow-y-auto"
};

export default function PrepView({ onLaunchSet }: { onLaunchSet?: (side: "A" | "B", playlistId: string) => void } = {}) {
  const [lib, setLib] = useState(() => loadLibrary());
  const [newListName, setNewListName] = useState<string | null>(null); // null = formulaire fermé
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null); // première pression sur Supprimer
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const openPlaylist = lib.playlists.find(p => p.id === openPlaylistId) ?? null;
  const openPlaylistTracks = openPlaylist
    ? openPlaylist.trackIds.map(id => lib.tracks.find(t => t.id === id)).filter((t): t is LibTrack => !!t)
    : [];
  const playlistStats = (trackIds: string[]) => {
    const tracks = trackIds.map(id => lib.tracks.find(t => t.id === id)).filter((t): t is LibTrack => !!t);
    const seconds = tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
    const bpms = tracks.map(t => t.bpm).filter((b): b is number => !!b && b > 0);
    return {
      count: trackIds.length,
      seconds,
      bpmRange: bpms.length ? (Math.min(...bpms) === Math.max(...bpms) ? `${Math.round(bpms[0])}` : `${Math.round(Math.min(...bpms))}–${Math.round(Math.max(...bpms))}`) : "—",
    };
  };
  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    persist(data => ({
      ...data,
      playlists: data.playlists.map(p => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) } : p),
    }));
  };
  const addCheckedToPlaylist = (playlistId: string) => {
    persist(data => ({
      ...data,
      playlists: data.playlists.map(p => {
        if (p.id !== playlistId) return p;
        const merged = [...p.trackIds, ...[...selectedLaterIds].filter(id => !p.trackIds.includes(id))];
        return { ...p, trackIds: merged };
      }),
    }));
    setSelectedLaterIds(new Set());
  };
  const formatDuration = (s: number) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
  };

  const [selectedLaterIds, setSelectedLaterIds] = useState<Set<string>>(new Set());
  // search box: results panel open after a search, filters folded by default
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const toggleLaterSelected = (id: string) => {
    setSelectedLaterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const libRef = useRef(lib);
  const prepState = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [checkingQualityIds, setCheckingQualityIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [gridSize, setGridSize] = useState<"S" | "M" | "L">("L");
  const [durationFilter, setDurationFilter] = useState<DurationFilterKey>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [videoFilter, setVideoFilter] = useState<VideoFilter>("all");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [setOrder, setSetOrder] = useState<string[]>([]);
  const [resultQualityMin, setResultQualityMin] = useState<ResultQualityFilter>("all");
  const [probed, setProbed] = useState<Record<string, { abr?: number; quality?: QualityLevel; height?: number; meta?: VideoMeta } | null>>({});
  const [checking, setChecking] = useState(false);
  const [openDetailsIds, setOpenDetailsIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [showTrayFilters, setShowTrayFilters] = useState(false);
  const trayFiltersOn = durationFilter !== "all" || qualityFilter !== "all" || videoFilter !== "all" || sortBy !== "recent" || filterTheme !== "" || filterGroup !== "";

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  const queueStems = (tracks: LibTrack[]) => {
    const longTracks = tracks.filter(t => t.durationSec && t.durationSec > LONG_TRACK_SEC);

    if (longTracks.length > 0) {
      const duration = Math.floor(longTracks[0].durationSec! / 60);
      const minutes = duration % 60;
      const hours = Math.floor(duration / 60);

      const message = longTracks.length === 1
        ? `« ${longTracks[0].name} » dure ${hours > 0 ? `${hours}h` : ''}${minutes}min. Le téléchargement et la séparation peuvent prendre plusieurs heures. Continuer ?`
        : `${longTracks.length} morceaux dépassent 20 minutes (téléchargement et séparation très longs). Continuer ?`;

      if (!window.confirm(message)) {
        return;
      }
    }

    const count = enqueuePrep(tracks);
    if (count > 0) {
      const message = tracks.length === 1
        ? `Préparation lancée : ${tracks[0].name}`
        : `Préparation lancée : ${tracks.length} morceaux`;

      setNotice(message);
      noticeTimeoutRef.current = setTimeout(() => {
        setNotice(null);
      }, 6000);
    } else {
      setNotice("Déjà en préparation ou déjà prêt");
      noticeTimeoutRef.current = setTimeout(() => {
        setNotice(null);
      }, 6000);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchOpen(true);
    setShowSearchFilters(false);
    setSearchError("");
    setProbed({});
    setChecking(false);

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}&n=40&min=0&max=100000`);
      const data = await res.json();
      const results = data.tracks.map((track: AudiusTrack) => ({
        ...track,
        bpm: track.bpm ? Number(track.bpm) || undefined : undefined
      }));
      setSearchResults(results);

      // Start quality probing
      setChecking(true);
      const ids = results.map((t: AudiusTrack) => t.id);
      probeQualities(ids, (id, result) => {
        setProbed(prev => ({ ...prev, [id]: result }));
      }, 3).finally(() => setChecking(false));
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

      const probeResult = probed[track.id];
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
        addedAt: Date.now(),
        abr: probeResult?.abr,
        quality: probeResult?.quality,
        height: probeResult?.height,
        meta: probeResult?.meta
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
      const q: { abr?: number | null; quality?: QualityLevel | null; height?: number | null; meta?: VideoMeta | null } = await res.json();
      const abr = q.abr ?? undefined;
      const quality = q.quality ?? undefined;
      const height = q.height ?? undefined;
      const meta = q.meta && Object.keys(q.meta).length > 0 ? q.meta : undefined;

      persist(lib => ({
        ...lib,
        tracks: lib.tracks.map(t => t.id === track.id ? {
          ...t,
          abr,
          quality,
          height,
          meta
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

  const deletePlaylist = (id: string) => {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id); // first press: ask for confirmation in the button itself
      return;
    }
    setPendingDeleteId(null);
    persist(data => ({
      ...data,
      playlists: data.playlists.filter(p => p.id !== id)
    }));
  };

  const createSetForGroup = () => {
    if (!selectedGroup) return;

    const groupTracks = lib.tracks.filter(t => t.group === selectedGroup && t.later);
    if (groupTracks.length < 2) return;

    const cues: Cue[] = groupTracks.map(t => ({
      id: t.id,
      bpm: t.bpm ?? 0,
      camelot: t.camelot ?? ""
    }));

    const setOrder = buildSmartSet(cues);
    setSetOrder(setOrder);

    // Create or update playlist
    const playlistName = `Set · ${selectedGroup}`;
    persist(data => {
      const existingPlaylist = data.playlists.find(p => p.name === playlistName);
      if (existingPlaylist) {
        return {
          ...data,
          playlists: data.playlists.map(p =>
            p.id === existingPlaylist.id
              ? { ...p, trackIds: setOrder, transitionType: "smooth", transitionSec: 8, preloadSec: 15 }
              : p
          )
        };
      } else {
        const newPlaylist: Playlist = {
          id: uid(),
          name: playlistName,
          trackIds: setOrder,
          transitionType: "smooth",
          transitionSec: 8,
          preloadSec: 15
        };
        return { ...data, playlists: [...data.playlists, newPlaylist] };
      }
    });
  };

  const launchSet = (side: "A" | "B") => {
    if (!selectedGroup || !onLaunchSet) return;

    const playlistName = `Set · ${selectedGroup}`;
    const playlist = lib.playlists.find(p => p.name === playlistName);

    if (!playlist) {
      createSetForGroup();
      const newPlaylist = lib.playlists.find(p => p.name === playlistName);
      if (newPlaylist) {
        onLaunchSet(side, newPlaylist.id);
      }
    } else {
      onLaunchSet(side, playlist.id);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const formatBPM = (bpm?: number | string | null, estimated?: boolean) => {
    if (typeof bpm === "string") return bpm;
    if (!bpm) return "—";
    return estimated ? `≈ ${bpm}` : `${bpm}`;
  };

  const getStemStatus = (trackId: string) => {
    const job = prepState.jobs.find(j => j.trackId === trackId);
    if (!job) return prepState.ready.some(r => r.trackId === trackId) ? "done" : "none";

    if (job.status === "error") return "error";
    if (job.status === "running") {
      if (job.phase === "download") return "download";
      if (job.phase === "separate") return `separate ${Math.round(job.progress)}`;
      return `running ${Math.round(job.progress)}`;
    }
    return job.status;
  };

  const getQualityLabel = (quality?: QualityLevel) => {
    if (!quality) return "?";
    return QUALITY_LABEL[quality];
  };

  const getVideoLabel = (height?: number) => {
    const level = videoLevelFromHeight(height);
    return level ? VIDEO_LABEL[level] : "?";
  };

  const getTempoRelation = (current: LibTrack, next: LibTrack): string => {
    if (!current.bpm || !next.bpm) return "tempo inconnu";
    const percent = ((next.bpm / current.bpm - 1) * 100).toFixed(1);
    return `${percent}%`;
  };

  const getKeyRelation = (current: LibTrack, next: LibTrack): string => {
    if (!current.camelot || !next.camelot) return "clé inconnue";

    const currentNum = parseInt(current.camelot);
    const nextNum = parseInt(next.camelot);

    if (currentNum === nextNum) return "même clé";
    if (Math.abs(currentNum - nextNum) === 1) return "clé voisine";
    if (Math.abs(currentNum - nextNum) <= 6) return "clé différente";

    return "clé différente";
  };

  const toggleDetails = (id: string) => {
    setOpenDetailsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderMetaDetails = (meta: VideoMeta) => {
    const fields: { label: string; value: string }[] = [];

    if (meta.label) fields.push({ label: "Label", value: meta.label });
    if (meta.format) fields.push({ label: "Format", value: meta.format });
    if (meta.country) fields.push({ label: "Pays", value: meta.country });
    if (meta.released) fields.push({ label: "Sortie", value: meta.released });
    if (meta.genre) fields.push({ label: "Genre", value: meta.genre });
    if (meta.style) fields.push({ label: "Style", value: meta.style });
    if (meta.artist) fields.push({ label: "Artiste", value: meta.artist });
    if (meta.album) fields.push({ label: "Album", value: meta.album });
    if (meta.track) fields.push({ label: "Titre", value: meta.track });
    if (meta.channel) fields.push({ label: "Chaîne", value: meta.channel });
    if (meta.uploadDate) fields.push({ label: "Envoyée le", value: meta.uploadDate });

    if (meta.tags && meta.tags.length > 0) {
      fields.push({ label: "Tags", value: meta.tags.join(", ") });
    }

    return (
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        {fields.map((field, index) => (
          <div key={index} className="flex">
            <span className="font-bold mr-1">{field.label}:</span>
            <span>{field.value}</span>
          </div>
        ))}
        {meta.tracklist && meta.tracklist.length > 0 && (
          <div className="col-span-2 mt-1">
            <span className="font-bold">Liste des titres:</span>
            <ol className="list-decimal list-inside pl-2 text-[9px]">
              {meta.tracklist.map((track, i) => (
                <li key={i}>{track}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
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

    if (videoFilter !== "all") {
      result = result.filter(t => {
        const level = videoLevelFromHeight(t.height);
        if (!level) return false;

        const rank = VIDEO_RANK[level];
        const minRank = videoFilter === "HD" ? 1 : videoFilter === "FHD" ? 2 : 3;
        return rank >= minRank;
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
  }, [laterTracks, sortBy, filterTheme, filterGroup, durationFilter, qualityFilter, videoFilter]);

  const createPlaylist = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    // the list takes the tracks currently shown (filters applied), or every "later" track when no filter is active
    // the list takes the set-aside titles that are checked, nothing else
    const source = laterTracks.filter(t => selectedLaterIds.has(t.id));
    if (source.length === 0) return;
    persist(data => ({
      ...data,
      playlists: [...data.playlists, { id: uid(), name, trackIds: source.map(t => t.id) }]
    }));
    setNewListName(null);
    setSelectedLaterIds(new Set());
  };

  const filteredSearchResults = useMemo(() => {
    if (durationFilter === "all" && resultQualityMin === "all" && videoFilter === "all") return searchResults;

    return searchResults.filter(t => {
      const durationOk = durationFilter === "all" || (() => {
        const filter = DUR_FILTERS.find(f => f.key === durationFilter);
        if (!filter || !t.duration) return false;
        if (filter.max === 0) return t.duration >= filter.min;
        if (filter.min === 0) return t.duration <= filter.max;
        return t.duration >= filter.min && t.duration <= filter.max;
      })();

      const qualityOk = resultQualityMin === "all" || (() => {
        const probeResult = probed[t.id];
        if (!probeResult) return false;
        const rank = probeResult.quality ? QUALITY_RANK[probeResult.quality] : -1;
        return rank >= (resultQualityMin === "HQ" ? 2 : 3);
      })();

      const videoOk = videoFilter === "all" || (() => {
        const probeResult = probed[t.id];
        if (!probeResult?.height) return false;

        const level = videoLevelFromHeight(probeResult.height);
        if (!level) return false;

        const rank = VIDEO_RANK[level];
        const minRank = videoFilter === "HD" ? 1 : videoFilter === "FHD" ? 2 : 3;
        return rank >= minRank;
      })();

      return durationOk && qualityOk && videoOk;
    });
  }, [searchResults, durationFilter, resultQualityMin, videoFilter, probed]);

  const groupInfo = useMemo(() => {
    if (!selectedGroup) return { count: 0, duration: 0 };

    const groupTracks = lib.tracks.filter(t => t.group === selectedGroup && t.later);
    const count = groupTracks.length;
    const duration = groupTracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);

    return { count, duration };
  }, [lib.tracks, selectedGroup]);

  // compact row for the set-aside tray: checkbox, name, key facts, stems state
  const renderTrayRow = (track: LibTrack) => {
    const checked = selectedLaterIds.has(track.id);
    const stem = getStemStatus(track.id);
    const stemLabel = stem === "done" ? "prêt" : stem === "none" ? "à préparer" : stem === "error" ? "erreur" : stem === "queued" ? "en attente" : "en cours";
    const stemColor = stem === "done" ? "#34d399" : stem === "error" ? "#ef4444" : stem === "none" ? "#7b8494" : "#ffcc00";
    return (
      <div
        key={track.id}
        className="flex items-center gap-2 rounded border px-2 py-1"
        style={{ borderColor: checked ? "#22d3ee" : "#232831", background: checked ? "rgba(34,211,238,0.08)" : "transparent" }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleLaterSelected(track.id)}
          className="h-3.5 w-3.5 shrink-0 accent-[#22d3ee]"
          aria-label={`Sélectionner ${track.name}`}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-100" title={track.name}>{track.name}</span>
        <span className="hidden shrink-0 text-[10px] tabular-nums text-neutral-500 sm:inline">
          {track.bpm ? Math.round(track.bpm) : "—"} · {track.camelot ?? "—"} · {formatDuration(track.durationSec ?? 0)}
        </span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stemColor }} title={`Stems : ${stemLabel}`} />
        {(stem === "none" || stem === "error") && (
          <button onClick={() => queueStems([track])} className="shrink-0 text-[10px] text-emerald-400 hover:underline">Stems</button>
        )}
        <button onClick={() => removeLaterTrack(track.id)} className="shrink-0 text-[10px] text-neutral-500 hover:text-red-400">Retirer</button>
      </div>
    );
  };

  const renderTrackCard = (track: TrackRow, isLater: boolean) => {
    const stemStatus = isLater ? getStemStatus(track.id) : undefined;
    const isAnalyzing = isLater ? analyzingIds.has(track.id) : false;
    const isFailed = isLater ? failedIds.has(track.id) : false;
    const isCheckingQuality = isLater ? checkingQualityIds.has(track.id) : false;
    const quality = isLater ? track.quality : undefined;
    const abr = isLater ? track.abr : undefined;
    const height = isLater ? track.height : undefined;
    const source = isLater ? track.source : "youtube";
    const duration = isLater ? track.duration : undefined;
    const meta = isLater ? track.meta : undefined;

    const badge = SRC_BADGE[source] || { label: source.toUpperCase(), color: "#9ca3af" };
    const qualityColor = quality ? QUALITY_COLORS[quality] : QUALITY_COLORS.unknown;
    const videoLevel = videoLevelFromHeight(height);
    const videoColor = videoLevel ? VIDEO_COLORS[videoLevel] : VIDEO_COLORS.unknown;
    const hasMeta = meta && Object.keys(meta).length > 0;

    return (
      <div className="hw-strip flex flex-wrap items-center gap-2 px-2 py-1.5">
        {isLater && (
          <input
            type="checkbox"
            checked={selectedLaterIds.has(track.id)}
            onChange={() => toggleLaterSelected(track.id)}
            className="h-4 w-4 shrink-0 accent-[#22d3ee]"
            aria-label={`Sélectionner ${track.name}`}
          />
        )}
        {track.art && (
          <img
            src={track.art}
            alt=""
            className={`${COVER_CLASS[gridSize]} object-cover rounded`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {!track.art && (
          <div className={`hw-vinyl ${COVER_CLASS[gridSize]} flex items-center justify-center text-xs font-bold`}>
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
            {abr && <span>{Math.round(abr)} kbps</span>}
            <span
              className="text-[9px] font-black"
              style={{ color: qualityColor }}
            >
              {getQualityLabel(quality)}
            </span>
            {videoLevel && (
              <span
                className="text-[9px] font-black"
                style={{ color: videoColor }}
              >
                {VIDEO_LABEL[videoLevel]}
              </span>
            )}
            {stemStatus && (
              <span>
                Stems: {stemStatus === "none" ? "à préparer" : stemStatus === "queued" ? "en attente" :
                        stemStatus === "done" ? "prêt" :
                        stemStatus === "error" ? <span style={{ color: "#ef4444" }}>erreur : {prepState.jobs.find(j => j.trackId === track.id)?.error?.substring(0, 80) ?? "inconnue"}</span> :
                        stemStatus === "download" ? <span className="animate-pulse">téléchargement…</span> :
                        stemStatus.startsWith("separate") ? `séparation ${stemStatus.split(" ")[1]}%` :
                        stemStatus.startsWith("running") ? `en cours ${stemStatus.split(" ")[1]}%` : "—"}
              </span>
            )}
            <span
              className="text-[9px] font-black"
              style={{ color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
          {stemStatus && stemStatus.startsWith("separate") && (
            <div className="hw-well mt-1 h-1.5">
              <div
                className="h-full bg-[#ffcc00]"
                style={{ width: `${stemStatus.split(" ")[1]}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {isLater && (
            <>
              <button
                onClick={() => queueStems([lib.tracks.find(t => t.id === track.id)!])}
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
              {(hasMeta || isLater) && (
                <button
                  onClick={() => toggleDetails(track.id)}
                  className={`hw-btn px-2 py-1 text-xs ${openDetailsIds.has(track.id) ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
                >
                  {openDetailsIds.has(track.id) ? "Masquer" : "Détails"}
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
        {isLater && openDetailsIds.has(track.id) && (
          <div className="w-full mt-2 flex flex-col gap-2">
            {hasMeta && renderMetaDetails(meta!)}
            <div className="hw-well flex flex-wrap items-center gap-2 p-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Stems</span>
              <span
                className="text-[11px] font-bold"
                style={{ color: stemStatus === "done" ? "#34d399" : stemStatus === "none" ? "#a78bfa" : stemStatus === "error" ? "#ef4444" : "#ffcc00" }}
              >
                {stemStatus === "done" ? "Prêts · 4 pistes" : stemStatus === "none" ? "À préparer" : stemStatus === "error" ? "Erreur" : "En cours"}
              </span>
              {(stemStatus === "none" || stemStatus === "error") && (
                <button
                  onClick={() => queueStems([lib.tracks.find(t => t.id === track.id)!])}
                  className="hw-btn px-2 py-1 text-xs"
                  style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
                >
                  Préparer les stems
                </button>
              )}
              {stemStatus !== "done" && stemStatus !== "none" && stemStatus !== "error" && (
                <button
                  onClick={() => cancelPrep(track.id)}
                  className="hw-btn px-2 py-1 text-xs"
                  style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderResultQualityBadge = (track: AudiusTrack) => {
    const probeResult = probed[track.id];
    const quality = probeResult?.quality;
    const abr = probeResult?.abr;
    const height = probeResult?.height;

    if (checking && !probeResult) {
      return (
        <span className="text-[9px] font-black" style={{ color: QUALITY_COLORS.unknown }}>
          vérification…
        </span>
      );
    }

    if (!probeResult) {
      return (
        <span className="text-[9px] font-black" style={{ color: QUALITY_COLORS.unknown }}>
          qualité inconnue
        </span>
      );
    }

    const qualityColor = quality ? QUALITY_COLORS[quality] : QUALITY_COLORS.unknown;
    const qualityLabel = quality ? QUALITY_LABEL[quality] : "?";

    const videoInfo = effectiveVideoLevel(height, track.title);
    const videoLabel = videoInfo ? VIDEO_LABEL[videoInfo.level] : "?";
    const videoColor = videoInfo ? VIDEO_COLORS[videoInfo.level] : VIDEO_COLORS.unknown;

    return (
      <>
        <span className="text-[9px] font-black" style={{ color: qualityColor }}>
          {qualityLabel}
        </span>
        {abr && <span className="text-[9px]">{Math.round(abr)} kbps</span>}
        <span
          className={`text-[9px] font-black ${videoInfo?.fromTitle ? "opacity-60" : ""}`}
          style={{ color: videoColor }}
        >
          {videoLabel}
          {videoInfo?.fromTitle && " (d'après le titre)"}
        </span>
      </>
    );
  };

  const renderSearchResultCard = (track: AudiusTrack) => {
    const probeResult = probed[track.id];
    const quality = probeResult?.quality;
    const abr = probeResult?.abr;
    const height = probeResult?.height;
    const meta = probeResult?.meta;
    const hasMeta = meta && Object.keys(meta).length > 0;

    const videoInfo = effectiveVideoLevel(height, track.title);
    const videoLabel = videoInfo ? VIDEO_LABEL[videoInfo.level] : "?";
    const videoColor = videoInfo ? VIDEO_COLORS[videoInfo.level] : VIDEO_COLORS.unknown;

    return (
      <div className="hw-strip flex flex-wrap items-center gap-2 px-2 py-1.5">
        {track.artwork && (
          <img
            src={track.artwork}
            alt=""
            className="w-10 h-10 object-cover rounded"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {!track.artwork && (
          <div className="hw-vinyl w-10 h-10 flex items-center justify-center text-xs font-bold">
            {track.title.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{track.title}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-neutral-400">
            <span>
              {formatBPM(track.bpm)} BPM
            </span>
            {track.duration && <span>{fmt(track.duration)}</span>}
            {renderResultQualityBadge(track)}
            <span
              className="text-[9px] font-black"
              style={{ color: SRC_BADGE.youtube.color }}
            >
              {SRC_BADGE.youtube.label}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {hasMeta && (
            <button
              onClick={() => toggleDetails(track.id)}
              className={`hw-btn px-2 py-1 text-xs ${openDetailsIds.has(track.id) ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
            >
              {openDetailsIds.has(track.id) ? "Masquer" : "Détails"}
            </button>
          )}
          <button
            onClick={() => addLaterTrack(track)}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            {lib.tracks.some(t => t.source === "youtube" && t.url === track.id && t.later)
              ? "Déjà en préparation"
              : "Mettre de côté"}
          </button>
        </div>
        {hasMeta && openDetailsIds.has(track.id) && (
          <div className="w-full mt-2">
            {renderMetaDetails(meta!)}
          </div>
        )}
      </div>
    );
  };

  const resultCount = useMemo(() => {
    const total = searchResults.length;
    const verified = Object.values(probed).filter(r => r !== undefined).length;
    return { total, verified };
  }, [searchResults, probed]);

  const visibleResultsCount = useMemo(() => {
    const visible = filteredSearchResults.length;
    return { visible, total: searchResults.length };
  }, [filteredSearchResults, searchResults]);

  return (
    <div className="hw-screwed hw-panel flex flex-1 flex-col gap-3 p-4">
      {notice && (
        <div className="hw-well p-2 text-xs text-[#ffcc00]">
          {notice}
        </div>
      )}
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
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
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
          <button
            onClick={() => setShowSearchFilters(v => !v)}
            className={`hw-btn px-2 py-1 text-xs ${showSearchFilters ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            aria-expanded={showSearchFilters}
          >
            Filtres{durationFilter !== "all" || resultQualityMin !== "all" || videoFilter !== "all" ? " ●" : ""}
          </button>
          {!searchOpen && searchResults.length > 0 && (
            <button onClick={() => setSearchOpen(true)} className="hw-btn px-2 py-1 text-xs">
              Résultats ({searchResults.length})
            </button>
          )}
        </div>
        {searchError && <p className="text-[10px] text-red-500 mb-2">{searchError}</p>}
        {showSearchFilters && (<>
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="text-[9px] text-neutral-400 mr-2">Durée :</span>
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
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <div className="flex flex-wrap gap-1">
            <span className="text-[9px] text-neutral-400 mr-2">Audio :</span>
            <button
              onClick={() => setResultQualityMin("all")}
              className={`hw-btn px-2 py-1 text-xs ${resultQualityMin === "all" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Toutes
            </button>
            <button
              onClick={() => setResultQualityMin("HQ")}
              className={`hw-btn px-2 py-1 text-xs ${resultQualityMin === "HQ" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
            >
              HQ et plus
            </button>
            <button
              onClick={() => setResultQualityMin("HR")}
              className={`hw-btn px-2 py-1 text-xs ${resultQualityMin === "HR" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
            >
              HiRes
            </button>
          </div>
          <div className="flex flex-wrap gap-1 ml-4">
            <span className="text-[9px] text-neutral-400 mr-2">Vidéo :</span>
            <button
              onClick={() => setVideoFilter("all")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "all" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Toutes
            </button>
            <button
              onClick={() => setVideoFilter("HD")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "HD" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              HD et plus
            </button>
            <button
              onClick={() => setVideoFilter("FHD")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "FHD" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
            >
              Full HD et plus
            </button>
            <button
              onClick={() => setVideoFilter("4K")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "4K" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
            >
              4K
            </button>
          </div>
        </div>
        </>)}
        {searchOpen && (isSearching || searchResults.length > 0) && (<>
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <span className="text-[10px] text-neutral-400">
            {isSearching ? "Recherche en cours…" : `${visibleResultsCount.visible} sur ${visibleResultsCount.total} résultats`}
          </span>
          <button
            onClick={() => setSearchOpen(false)}
            className="hw-btn ml-auto px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
            title="Replier les résultats (le bouton « Résultats » les rouvre)"
          >
            Terminé
          </button>
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {filteredSearchResults.map((track) => (
            <div key={track.id}>
              {renderSearchResultCard(track)}
            </div>
          ))}
        </div>
        </>)}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* À préparer : tiroir de sélection */}
      <div className="hw-well p-2 flex flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={filteredTracks.length > 0 && filteredTracks.every(t => selectedLaterIds.has(t.id))}
            onChange={(e) => setSelectedLaterIds(e.target.checked ? new Set(filteredTracks.map(t => t.id)) : new Set())}
            className="h-3.5 w-3.5 accent-[#22d3ee]"
            aria-label="Tout cocher"
          />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Mis de côté ({laterTracks.length})</h2>
          <span className="text-[10px] text-neutral-500">
            {selectedLaterIds.size > 0 ? `${selectedLaterIds.size} coché(s) → crée une liste ou ajoute-les à une liste à droite` : "coche des titres pour en faire une liste"}
          </span>
        </div>
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
            {(
              <>
                <button
                  onClick={() => setGridSize("S")}
                  className={`hw-btn px-2 py-1 text-xs ${gridSize === "S" ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                  title="Pochettes petites"
                >
                  S
                </button>
                <button
                  onClick={() => setGridSize("M")}
                  className={`hw-btn px-2 py-1 text-xs ${gridSize === "M" ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                  title="Pochettes moyennes"
                >
                  M
                </button>
                <button
                  onClick={() => setGridSize("L")}
                  className={`hw-btn px-2 py-1 text-xs ${gridSize === "L" ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
                  title="Pochettes grandes"
                >
                  L
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setShowTrayFilters(v => !v)}
            className={`hw-btn px-2 py-1 text-xs ${showTrayFilters ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            aria-expanded={showTrayFilters}
          >
            Filtres{trayFiltersOn ? " ●" : ""}
          </button>
        </div>

        {showTrayFilters && (
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="text-[9px] text-neutral-400 mr-2">Durée :</span>
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
        )}

        {showTrayFilters && (
        <div className="flex flex-wrap gap-2 mb-2">
          <div className="flex flex-wrap gap-1">
            <span className="text-[9px] text-neutral-400 mr-2">Audio :</span>
            <button
              onClick={() => setQualityFilter("all")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "all" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Toutes qualités
            </button>
            <button
              onClick={() => setQualityFilter("HR")}
              className={`hw-btn px-2 py-1 text-xs ${qualityFilter === "HR" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
            >
              HiRes
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
          <div className="flex flex-wrap gap-1 ml-4">
            <span className="text-[9px] text-neutral-400 mr-2">Vidéo :</span>
            <button
              onClick={() => setVideoFilter("all")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "all" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              Toutes
            </button>
            <button
              onClick={() => setVideoFilter("HD")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "HD" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
            >
              HD et plus
            </button>
            <button
              onClick={() => setVideoFilter("FHD")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "FHD" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#34d399", color: "#34d399" }}
            >
              Full HD et plus
            </button>
            <button
              onClick={() => setVideoFilter("4K")}
              className={`hw-btn px-2 py-1 text-xs ${videoFilter === "4K" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
            >
              4K
            </button>
          </div>
        </div>
        )}

        {showTrayFilters && (
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
        )}

        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={() => queueStems(laterTracks)}
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
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
            {filteredTracks.map((track) => renderTrayRow(track))}
          </div>
        )}

        {viewMode === "grid" && (
          <div className={GRID_CLASS[gridSize]}>
            {filteredTracks.map((track) => (
              <div key={track.id} className="hw-strip p-2" style={selectedLaterIds.has(track.id) ? { outline: "1px solid #22d3ee" } : undefined}>
                <div className="relative mb-2">
                  <input
                    type="checkbox"
                    checked={selectedLaterIds.has(track.id)}
                    onChange={() => toggleLaterSelected(track.id)}
                    className="absolute left-1 top-1 z-10 h-4 w-4 accent-[#22d3ee]"
                    aria-label={`Sélectionner ${track.name}`}
                  />
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
                  {track.abr && <span>{Math.round(track.abr)} kbps</span>}
                  <span
                    className="font-black"
                    style={{ color: track.quality ? QUALITY_COLORS[track.quality] : QUALITY_COLORS.unknown }}
                  >
                    {getQualityLabel(track.quality)}
                  </span>
                  {track.height && (
                    <span
                      className="font-black"
                      style={{ color: VIDEO_COLORS[videoLevelFromHeight(track.height) || "unknown"] }}
                    >
                      {getVideoLabel(track.height)}
                    </span>
                  )}
                  <span
                    className="font-black"
                    style={{ color: SRC_BADGE[track.source]?.color || "#9ca3af" }}
                  >
                    {SRC_BADGE[track.source]?.label || track.source.toUpperCase()}
                  </span>
                </div>
                <div className="text-[9px] mb-2">
                  Stems: {getStemStatus(track.id) === "none" ? "à préparer" : getStemStatus(track.id) === "queued" ? "en attente" :
                          getStemStatus(track.id) === "done" ? "prêt" :
                          getStemStatus(track.id) === "error" ? <span style={{ color: "#ef4444" }}>erreur : {prepState.jobs.find(j => j.trackId === track.id)?.error?.substring(0, 80) ?? "inconnue"}</span> :
                          getStemStatus(track.id) === "download" ? <span className="animate-pulse">téléchargement…</span> :
                          getStemStatus(track.id).startsWith("separate") ? `séparation ${getStemStatus(track.id).split(" ")[1]}%` :
                          getStemStatus(track.id).startsWith("running") ? `en cours ${getStemStatus(track.id).split(" ")[1]}%` : "—"}
                </div>
                {getStemStatus(track.id).startsWith("separate") && (
                  <div className="hw-well mt-1 h-1.5 mb-2">
                    <div
                      className="h-full bg-[#ffcc00]"
                      style={{ width: `${getStemStatus(track.id).split(" ")[1]}%` }}
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => queueStems([track])}
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
                  {track.meta && Object.keys(track.meta).length > 0 && (
                    <button
                      onClick={() => toggleDetails(track.id)}
                      className={`hw-btn px-2 py-1 text-xs ${openDetailsIds.has(track.id) ? "hw-btn-on" : ""}`}
                      style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
                    >
                      {openDetailsIds.has(track.id) ? "Masquer" : "Détails"}
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
                {track.meta && Object.keys(track.meta).length > 0 && openDetailsIds.has(track.id) && (
                  <div className="mt-2">
                    {renderMetaDetails(track.meta)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Listes : création à partir des titres cochés, puis cartes */}
      <div className="hw-well p-3 flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[85vh] lg:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Listes</h2>
          <span className="text-[10px] text-neutral-500">{lib.playlists.length} liste(s)</span>
        </div>
        <div className="hw-strip flex flex-wrap items-center gap-2 p-2">
          <input
            value={newListName ?? ""}
            onChange={(e) => setNewListName(e.target.value)}
            onFocus={() => { if (newListName === null) setNewListName(""); }}
            placeholder="Nom de la nouvelle liste…"
            className="hw-well flex-1 min-w-[180px] bg-transparent px-2 py-1 text-xs text-neutral-200 outline-none"
          />
          <button
            onClick={() => createPlaylist(newListName ?? "")}
            disabled={selectedLaterIds.size === 0 || !(newListName ?? "").trim()}
            className="hw-btn px-3 py-1 text-xs disabled:opacity-40"
            style={{ ["--led" as string]: "#22d3ee", color: "#22d3ee" }}
          >
            Créer la liste
          </button>
          <span className="w-full text-[10px] text-neutral-500">
            {selectedLaterIds.size === 0 ? "Coche des titres dans « Mis de côté » pour créer une liste." : `${selectedLaterIds.size} titre(s) coché(s) seront dans la liste.`}
          </span>
        </div>
        {lib.playlists.length === 0 && (
          <p className="text-[11px] text-neutral-500">Aucune liste pour l&apos;instant.</p>
        )}
        <div className="flex flex-col gap-2">
          {lib.playlists.map((playlist, index) => {
            const stats = playlistStats(playlist.trackIds);
            const isOpen = openPlaylistId === playlist.id;
            const color = ["#22d3ee", "#34d399", "#ffcc00", "#a78bfa", "#f97316", "#ef4444"][index % 6];
            return (
              <div key={playlist.id} className="hw-strip flex flex-col gap-2 p-3" style={{ borderLeft: `3px solid ${isOpen ? color : "#2e3540"}` }}>
                <button onClick={() => setOpenPlaylistId(isOpen ? null : playlist.id)} className="text-left" aria-expanded={isOpen}>
                  <p className="truncate text-xs font-medium text-neutral-100">{playlist.name}</p>
                  <p className="text-[10px] text-neutral-400">{stats.count} titre(s) · {formatDuration(stats.seconds)} · BPM {stats.bpmRange}</p>
                </button>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => addCheckedToPlaylist(playlist.id)}
                    disabled={selectedLaterIds.size === 0}
                    className="hw-btn px-2 py-1 text-[11px] disabled:opacity-40"
                    style={{ ["--led" as string]: color, color }}
                    title={selectedLaterIds.size === 0 ? "Coche d'abord des titres dans « Mis de côté »" : "Ajouter les titres cochés à cette liste"}
                  >
                    + {selectedLaterIds.size} coché(s)
                  </button>
                  <button onClick={() => setOpenPlaylistId(isOpen ? null : playlist.id)} className="hw-btn px-2 py-1 text-[11px]">
                    {isOpen ? "Fermer" : "Voir"}
                  </button>
                  <button
                    onClick={() => deletePlaylist(playlist.id)}
                    className="hw-btn px-2 py-1 text-[11px]"
                    style={{ ["--led" as string]: "#ef4444", color: "#ef4444" }}
                  >
                    {pendingDeleteId === playlist.id ? "Confirmer" : "Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {openPlaylist && (
          <div className="hw-well flex flex-col gap-1 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">{openPlaylist.name} · contenu</span>
              <span className="text-[10px] text-neutral-500">{openPlaylistTracks.length} titre(s)</span>
            </div>
            {openPlaylistTracks.length === 0 && (
              <p className="py-2 text-[11px] text-neutral-500">Liste vide : coche des titres dans « Mis de côté », puis « + coché(s) ».</p>
            )}
            {openPlaylistTracks.map((t, idx) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 border-t border-[#1d222a] px-1 py-1.5">
                <span className="w-5 text-right text-[10px] tabular-nums text-neutral-500">{idx + 1}</span>
                <span className="flex-1 min-w-[140px] truncate text-[11px] text-neutral-200">{t.name}</span>
                <span className="text-[10px] tabular-nums text-neutral-400">{t.bpm ? `${Math.round(t.bpm)} BPM` : "— BPM"}</span>
                <span className="text-[10px] text-neutral-400">{t.camelot ?? "—"}</span>
                <span className="text-[10px] tabular-nums text-neutral-400">{formatDuration(t.durationSec ?? 0)}</span>
                <button onClick={() => removeFromPlaylist(openPlaylist.id, t.id)} className="text-[10px] text-neutral-400 hover:text-red-400" title="Retirer de la liste (le titre reste dans « Mis de côté »)">Retirer</button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* SETS PAR GROUPE */}
      <div className="hw-well p-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Sets par groupe</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <div className="hw-well px-2 py-1 text-xs">
            <label className="text-[9px] text-neutral-400">Groupe</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="hw-well bg-transparent text-xs text-neutral-200 outline-none"
            >
              <option value="">Choisir un groupe</option>
              {groups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>
          {selectedGroup && (
            <div className="text-xs text-neutral-400">
              {groupInfo.count} morceaux · {fmt(groupInfo.duration)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={createSetForGroup}
            disabled={!selectedGroup || groupInfo.count < 2}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#a78bfa", color: "#a78bfa" }}
          >
            Créer le set
          </button>
          <button
            onClick={() => launchSet("A")}
            disabled={!selectedGroup || groupInfo.count < 2 || !onLaunchSet}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            Lancer sur A
          </button>
          <button
            onClick={() => launchSet("B")}
            disabled={!selectedGroup || groupInfo.count < 2 || !onLaunchSet}
            className="hw-btn px-2 py-1 text-xs"
            style={{ ["--led" as string]: "#ffcc00", color: "#ffcc00" }}
          >
            Lancer sur B
          </button>
        </div>
        {setOrder.length > 0 && (
          <div className="mt-2">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-1">Aperçu du set</h3>
            <ol className="space-y-1 max-h-40 overflow-y-auto">
              {setOrder.map((trackId, index) => {
                const track = lib.tracks.find(t => t.id === trackId);
                if (!track) return null;

                const nextTrack = index < setOrder.length - 1
                  ? lib.tracks.find(t => t.id === setOrder[index + 1])
                  : null;

                return (
                  <li key={trackId} className="hw-strip px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-6 text-right">{index + 1}.</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium truncate">{track.name}</p>
                        {track.meta && (
                          <p className="text-[9px] text-neutral-400 truncate">
                            {[
                              track.meta.artist,
                              track.meta.label,
                              track.meta.released,
                              track.meta.genre,
                              track.meta.style,
                              track.meta.format,
                              track.meta.country,
                              track.meta.tracklist?.length ? `${track.meta.tracklist.length} titres` : null
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {nextTrack && (
                          <div className="text-[10px] text-neutral-400">
                            <span className="mr-2">{getTempoRelation(track, nextTrack)}</span>
                            <span>{getKeyRelation(track, nextTrack)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

    </div>
  );
}
