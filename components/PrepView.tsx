"use client";

import { compatibleQuery, searchTracks } from "@/lib/trackSearch";
import { splitTitle } from "@/lib/trackTitle";
import { dedupeOnline, rankOnline } from "@/lib/trackRank";
import { useState, useRef, useMemo, useSyncExternalStore, useEffect } from "react";
import { loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { enqueuePrep, getPrepState, subscribePrep, forgetPrep, cancelPrep } from "@/lib/stemPrep";
import { queueAnalysis } from "@/lib/analyze";
import { analyzeLibraryTrack } from "@/lib/analyzeTrack";
import { Journey, buildJourney } from "./prep/Journey";
import { qualityFromKbps, kbpsFromSize, QUALITY_LABEL, QUALITY_HINT, QUALITY_RANK } from "@/lib/quality";
import { SetWizard, type WizardDest as SendDest, type SetDraft, type WizardInitial as SetStudioInitial } from "./playlist/SetWizard";
import { pickNext } from "@/lib/setPicker";
import { useStemsShared } from "@/lib/stemsShared";
import { prepareSet, useSetPrep } from "@/lib/setPrep";
import { getCachedQuality, probeQualities } from "@/lib/ytQuality";
import { VIDEO_LABEL, VIDEO_RANK, videoLevelFromHeight, effectiveVideoLevel } from "@/lib/videoQuality";
import type { LibTrack, LibraryData, Playlist } from "@/lib/library";
import type { AudiusTrack } from "@/lib/audius";
import type { PrepReady } from "@/lib/stemPrep";
import type { QualityLevel } from "@/lib/quality";
import type { VideoLevel } from "@/lib/videoQuality";
import type { Cue } from "@/lib/setPicker";
import type { VideoMeta } from "@/lib/videoMeta";
import { BpmChip, Cover, Icon, KeyChip, Mosaic, StemPill, fmtDur, stemInfoFrom } from "./prep/parts";
import { AmbientHero, PlayDisc, QuickSets } from "./prep/AmbientHero";
import { DurationBar, KeyWheel, MiniKeyWheel, QualityBars, StemQuad, camelotColour, StemsDonut, TempoHistogram, TempoRuler } from "./prep/TrayOverview";
import { Section, SegFilter, StepBadge, useStored, useStoredOpen } from "./prep/Blocks";
import "./prep/prep-view.css";

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

// tray table columns: check, sleeve, title, BPM, key, length, stems, actions
// (phone: check, sleeve, title, stems — BPM, key and length go under the title)
// list rows: compact in a narrow tray; from 56rem of tray width the tempo gets its own wide column, plus stems and length columns
const ROW_COLS = "[grid-template-columns:28px_40px_minmax(0,1fr)_auto] sm:[grid-template-columns:28px_40px_minmax(0,1fr)_56px_66px_112px_64px] @4xl:[grid-template-columns:28px_44px_minmax(220px,1.2fr)_minmax(180px,1fr)_96px_172px_150px_64px]";
const LIST_ACCENTS = ["#22d3ee", "#34d399", "#ffcc00", "#a78bfa", "#f97316", "#fdba74"];
const DUR_OPTIONS = DUR_FILTERS.map((f) => [f.key, f.label] as const);
const RESULT_AUDIO_OPTIONS = [["all", "Toutes"], ["HQ", "HQ et plus"], ["HR", "HiRes"]] as const;
const TRAY_AUDIO_OPTIONS = [["all", "Toutes"], ["HR", "HiRes"], ["HQ", "HQ"], ["STD", "Standard"], ["LQ", "Basse"], ["unknown", "?"]] as const;
const VIDEO_OPTIONS = [["all", "Toutes"], ["HD", "HD+"], ["FHD", "Full HD+"], ["4K", "4K"]] as const;
const DRAG_TYPE = "application/x-djsynth-tracks"; // tray rows dragged onto lists
const NEW_LIST = "__new"; // drop zone that creates a list

const GRID_CLASS = {
  S: "grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 flex-1 overflow-y-auto",
  M: "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 flex-1 overflow-y-auto",
  L: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 flex-1 overflow-y-auto"
};


// the key as a filled chip in its Camelot colour (grey "?" when unknown)
function KeyBadge({ camelot }: { camelot?: string }) {
  const c = camelotColour(camelot);
  return (
    <span className="rounded-md px-1.5 py-px font-mono text-[12px] font-black" style={c ? { background: c, color: "#0b0b0d" } : { background: "rgba(255,255,255,.08)", color: "#8a8a8a" }}>
      {camelot ?? "?"}
    </span>
  );
}

export default function PrepView({ onLaunchSet }: { onLaunchSet?: (dest: SendDest, playlistId: string) => void } = {}) {
  const [lib, setLib] = useState(() => loadLibrary());
  const [newListName, setNewListName] = useState<string | null>(null); // null = formulaire fermé
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null); // première pression sur Supprimer
  const [ambient, setAmbient] = useState<string | null>(null); // colour of the hovered set in the header
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
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
  const sharedStems = useStemsShared();
  const setPreps = useSetPrep();

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [checkingQualityIds, setCheckingQualityIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useStored<"list" | "grid">("view", "list", ["list", "grid"]);
  const [gridSize, setGridSize] = useStored<"S" | "M" | "L">("grid", "L", ["S", "M", "L"]);
  const [setsOpen, setSetsOpen] = useStoredOpen("sets");
  const [wizardOpen, setWizardOpen] = useStoredOpen("wizard");
  const [durationFilter, setDurationFilter] = useState<DurationFilterKey>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [videoFilter, setVideoFilter] = useState<VideoFilter>("all");
  // set creator: remounted (new key) whenever another entry point asks for it ("En set", "Créer un set")
  const [studio, setStudio] = useState<{ nonce: number; initial?: SetStudioInitial }>({ nonce: 0 });
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
  const trayFiltersOn = durationFilter !== "all" || qualityFilter !== "all" || videoFilter !== "all" || filterTheme !== "" || filterGroup !== "";
  const [trayQuery, setTrayQuery] = useState(""); // quick filter of the tray by name / theme / group
  const [dragOverList, setDragOverList] = useState<string | null>(null);
  const [pendingLong, setPendingLong] = useState<string | null>(null); // long tracks waiting for a 2nd click before their stems start
  const newListInputRef = useRef<HTMLInputElement>(null);
  const setSectionRef = useRef<HTMLElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // "Plus" menus (native <details>): a click outside, or on one of their actions, closes them
  useEffect(() => {
    const close = (e: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>(".prep-menu[open]").forEach((d) => {
        if (!d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  const flash = (message: string, ms = 6000) => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    setNotice(message);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), ms);
  };

  // tracks over 20 min take hours to download and split: the first click warns,
  // a second click on the same tracks starts them (window.confirm is always "no" in the Mac app)
  const queueStems = (tracks: LibTrack[]) => {
    const longTracks = tracks.filter(t => t.durationSec && t.durationSec > LONG_TRACK_SEC);
    const key = tracks.map(t => t.id).join(",");
    if (longTracks.length > 0 && pendingLong !== key) {
      setPendingLong(key);
      flash(
        longTracks.length === 1
          ? `« ${longTracks[0].name} » dure ${formatDuration(longTracks[0].durationSec ?? 0)} : téléchargement et séparation très longs. Reclique pour lancer quand même.`
          : `${longTracks.length} titres dépassent 20 minutes : téléchargement et séparation très longs. Reclique pour lancer quand même.`,
        10000
      );
      return;
    }
    setPendingLong(null);
    const count = enqueuePrep(tracks);
    flash(count > 0 ? (tracks.length === 1 ? `Préparation lancée : ${tracks[0].name}` : `Préparation lancée : ${count} titre(s)`) : "Déjà en préparation ou déjà prêt");
  };

  const [searchMore, setSearchMore] = useState(false); // "encore plus" / "étendre": a longer search is running
  const [searchLevel, setSearchLevel] = useState(0); // how many times the list was made longer (each adds 40 results)
  const [searchExtended, setSearchExtended] = useState(false); // the query was widened with its variants
  const [searched, setSearched] = useState(false); // a search has been run (to tell "no result" from "nothing yet")

  // `level` 0 = a first search; 1.. = the same search with more results; `extend` adds the variants of the query
  const runSearch = async (level: number, extend: boolean) => {
    const q = searchQuery.trim();
    if (!q) return;
    const more = level > 0 || extend;
    setSearched(true);
    if (more) setSearchMore(true);
    else {
      setIsSearching(true);
      setSearchResults([]);
      setProbed({});
    }
    setSearchOpen(true);
    setShowSearchFilters(false);
    setSearchError("");
    setChecking(false);
    const n = Math.min(40 + level * 40, 150);
    // a widened search also asks for the usual versions of a song, which a plain query hides behind the official clip
    const queries = extend ? [q, `${q} remix`, `${q} live`, `${q} extended mix`, `${q} audio`] : [q];
    try {
      const lists = await Promise.all(
        queries.map((qq) =>
          fetch(`/api/youtube/search?q=${encodeURIComponent(qq)}&n=${qq === q ? n : 30}&min=0&max=100000`)
            .then((r) => r.json() as Promise<{ tracks?: AudiusTrack[] }>)
            .catch(() => ({ tracks: [] as AudiusTrack[] }))
        )
      );
      const seen = new Set<string>();
      const results: AudiusTrack[] = [];
      for (const t of [...(more ? searchResults : []), ...lists.flatMap((l) => l.tracks ?? [])]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        results.push({ ...t, bpm: t.bpm ? Number(t.bpm) || undefined : undefined });
      }
      const ranked = rankOnline(q, dedupeOnline(results)); // the answers to the query first, one entry per song
      setSearchResults(ranked);
      setSearchLevel(level);
      setSearchExtended(extend || (more && searchExtended));
      // quality is checked for the new results only
      const fresh = ranked.filter((t) => !probed[t.id]).map((t) => t.id);
      setChecking(true);
      probeQualities(fresh, (id, result) => {
        setProbed((prev) => ({ ...prev, [id]: result }));
      }, 3).finally(() => setChecking(false));
    } catch {
      setSearchError("Échec de la recherche");
    } finally {
      setIsSearching(false);
      setSearchMore(false);
    }
  };
  const handleSearch = () => runSearch(0, false);

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
      // a YouTube song: the same quick excerpt analysis (and server memory) as the Radio and the Playlist views
      if (track.source === "youtube" && track.url) {
        const fast = await analyzeLibraryTrack(track);
        if (fast) {
          setAnalyzingIds(prev => { const next = new Set(prev); next.delete(track.id); return next; });
          persist(data => ({ ...data, tracks: data.tracks.map(t => t.id === track.id ? { ...t, bpm: fast.bpm, bpmEstimated: true, bpmConfidence: fast.bpmConfidence, camelot: fast.camelot } : t) }));
          return;
        }
      }
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

  // tempo ET tonalité manquants, un titre après l'autre ; ce qui est déjà connu est conservé
  const analyzeIds = async (ids: string[]) => {
    const todo = lib.tracks.filter(t => ids.includes(t.id) && !analyzingIds.has(t.id));
    setAnalyzingIds(prev => new Set([...prev, ...todo.map(t => t.id)]));
    for (const t of todo) {
      const r = await analyzeLibraryTrack(t);
      setAnalyzingIds(prev => { const next = new Set(prev); next.delete(t.id); return next; });
      if (!r) { setFailedIds(prev => new Set(prev).add(t.id)); continue; }
      persist(data => ({
        ...data,
        tracks: data.tracks.map(x => x.id !== t.id ? x : { ...x, bpm: x.bpm || r.bpm, bpmEstimated: x.bpm ? x.bpmEstimated : true, bpmConfidence: x.bpm ? x.bpmConfidence : r.bpmConfidence, camelot: x.camelot || r.camelot }),
      }));
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

  const openStudio = (initial?: SetStudioInitial) => {
    setStudio(st => ({ nonce: st.nonce + 1, initial }));
    setWizardOpen(true);
    setSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // a set made in the creator is a playlist with its own transition: new, or the one it was last saved as
  const saveSet = (draft: SetDraft): string => {
    const existing = draft.id ? lib.playlists.find(p => p.id === draft.id) : undefined;
    const id = existing?.id ?? uid();
    // the default names repeat ("Set · Fluide"): keep every set name unique
    const taken = new Set(lib.playlists.filter(p => p.id !== id).map(p => p.name));
    let name = draft.name;
    for (let n = 2; taken.has(name); n++) name = `${draft.name} (${n})`;
    persist(data => {
      const set: Playlist = {
        ...existing,
        id,
        name,
        trackIds: draft.trackIds,
        transitionType: draft.transitionType,
        transitionSec: draft.transitionSec,
        preloadSec: existing?.preloadSec ?? 15,
      };
      return { ...data, playlists: existing ? data.playlists.map(p => (p.id === id ? set : p)) : [...data.playlists, set] };
    });
    flash(`Set « ${name} » enregistré : ${draft.trackIds.length} titres`);
    return id;
  };

  const getStemStatus = (trackId: string) => {
    const job = prepState.jobs.find(j => j.trackId === trackId);
    if (!job) return sharedStems.has(lib.tracks.find(t => t.id === trackId)) ? "done" : "none";

    if (job.status === "error") return "error";
    if (job.status === "running") {
      if (job.phase === "download") return "download";
      if (job.phase === "separate") return `separate ${Math.round(job.progress)}`;
      return `running ${Math.round(job.progress)}`;
    }
    return job.status;
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

    // tolerant search (accents, typos, "phrases", -words, bpm:120-130, key:8A...), best match first
    const hasQuery = trayQuery.trim() !== "";
    if (hasQuery) result = searchTracks(result, trayQuery);

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
        return hasQuery ? result : result.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); // a search keeps the best match first
    }
  }, [laterTracks, trayQuery, sortBy, filterTheme, filterGroup, durationFilter, qualityFilter, videoFilter]);

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

  const stemOf = (id: string) => stemInfoFrom(getStemStatus(id), prepState.jobs.find((j) => j.trackId === id)?.error);

  // drag one title (or every checked one, when it is checked) from the tray onto a list
  const dragIds = (id: string) => (selectedLaterIds.has(id) ? [...selectedLaterIds] : [id]);
  const readDrag = (e: React.DragEvent): string[] => {
    try {
      const ids: unknown = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]");
      return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const acceptsDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

  const addIdsToPlaylist = (playlistId: string, ids: string[]) => {
    if (ids.length === 0) return;
    const name = lib.playlists.find((p) => p.id === playlistId)?.name ?? "";
    persist((data) => ({
      ...data,
      playlists: data.playlists.map((p) => (p.id === playlistId ? { ...p, trackIds: [...p.trackIds, ...ids.filter((id) => !p.trackIds.includes(id))] } : p)),
    }));
    flash(`${ids.length} titre(s) ajouté(s) à « ${name} »`);
  };
  const addCheckedToPlaylist = (playlistId: string) => {
    addIdsToPlaylist(playlistId, [...selectedLaterIds]);
    setSelectedLaterIds(new Set());
  };
  const createPlaylistFrom = (ids: string[], rawName: string) => {
    if (ids.length === 0) return;
    const name = rawName.trim() || `Set ${lib.playlists.length + 1}`;
    persist((data) => ({ ...data, playlists: [...data.playlists, { id: uid(), name, trackIds: ids }] }));
    setNewListName(null);
    setSelectedLaterIds(new Set());
    flash(`Set « ${name} » créé (${ids.length} titre(s))`);
  };

  const rowDrag = (track: LibTrack) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds(track.id)));
      e.dataTransfer.effectAllowed = "copy";
    },
  });

  // tray row: checkbox, sleeve, title, BPM, key, length, stems, actions on hover
  const renderTrayRow = (track: LibTrack) => {
    const nice = splitTitle(track.name);
    const checked = selectedLaterIds.has(track.id);
    const analyzing = analyzingIds.has(track.id);
    const needsAnalysis = !track.bpm || !track.camelot;
    const sub = [track.theme, track.group, track.quality ? QUALITY_LABEL[track.quality] : null].filter(Boolean).join(" · ");
    return (
      <div
        key={track.id}
        data-checked={checked}
        {...rowDrag(track)}
        className={`prep-row prep-keyed-row grid cursor-grab items-center gap-3 px-2 py-1.5 active:cursor-grabbing ${ROW_COLS}`}
        style={{ ["--key" as string]: camelotColour(track.camelot) ?? "rgba(255,255,255,.12)" }}
        title={[track.name, sub || SRC_BADGE[track.source]?.label || track.source].filter(Boolean).join("\n")}
      >
        <label className="prep-check">
          <input type="checkbox" checked={checked} onChange={() => toggleLaterSelected(track.id)} className="accent-[var(--prep-accent)]" aria-label={`Sélectionner ${track.name}`} />
        </label>
        <Cover art={track.art} name={track.name} camelot={track.camelot} size={40} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold tracking-[-0.01em] text-neutral-50">{nice.title}</p>
          <p className="truncate text-[12px] text-neutral-400">
            {nice.artist && <span className="font-semibold text-neutral-200">{nice.artist}</span>}
            {nice.extra && <span className="italic text-neutral-500">{nice.artist ? " · " : ""}{nice.extra}</span>}
            {/* narrow tray only: the wide one has its own columns, the source is in the tooltip */}
            <span className="@4xl:hidden">{[nice.artist || nice.extra ? "" : null, fmtDur(track.durationSec), sub || SRC_BADGE[track.source]?.label || track.source].filter((x) => x !== null).join(" · ")}</span>
          </p>
          <div className="mt-0.5 max-w-[180px] max-sm:hidden @4xl:hidden"><TempoRuler bpm={track.bpm} median={trayMedianBpm} /></div>
          <div className="mt-1 flex items-center gap-2 sm:hidden">
            <BpmChip bpm={track.bpm} estimated={track.bpmEstimated} />
            <KeyChip camelot={track.camelot} />
            <span className="font-mono text-[11px] text-neutral-500">{fmtDur(track.durationSec)}</span>
            <span className="ml-auto flex items-center gap-1">
              {needsAnalysis && (
                <button onClick={() => analyzeTrack(track)} disabled={analyzing} className="prep-btn-ghost prep-tap px-2 py-0.5 text-[11px]" aria-label={`Analyser le BPM et la tonalité de ${track.name}`}>
                  {analyzing ? "…" : "Analyser"}
                </button>
              )}
              <button onClick={() => removeLaterTrack(track.id)} className="prep-tap flex items-center justify-center p-1 text-neutral-500" aria-label={`Retirer ${track.name}`}>
                <Icon name="x" size={14} />
              </button>
            </span>
          </div>
        </div>
        <span className="flex items-center justify-end gap-3 max-sm:hidden">
          <span className="hidden min-w-0 flex-1 @4xl:block"><TempoRuler bpm={track.bpm} median={trayMedianBpm} /></span>
          <span className="@4xl:hidden"><BpmChip bpm={track.bpm} estimated={track.bpmEstimated} /></span>
          <span className="hidden w-12 text-right font-mono text-[15px] font-black text-[#ffcc00] @4xl:inline">{track.bpm ? Math.round(track.bpm) : "—"}</span>
        </span>
        <span className="flex items-center gap-1 max-sm:hidden">
          <MiniKeyWheel camelot={track.camelot} size={30} label={false} />
          <KeyBadge camelot={track.camelot} />
        </span>
        <span className="flex items-center justify-center gap-2 @4xl:justify-start">
          <span className="hidden @4xl:inline-flex"><StemQuad state={stemOf(track.id).state} pct={stemOf(track.id).pct} /></span>
          <StemPill info={stemOf(track.id)} onPrepare={() => queueStems([track])} />
        </span>
        <span className="hidden items-center gap-2 @4xl:flex">
          <QualityBars level={track.quality} />
          <span className="min-w-0 flex-1"><DurationBar sec={track.durationSec} /></span>
          <span className="font-mono text-[11px] text-neutral-400">{fmtDur(track.durationSec)}</span>
        </span>
        <span className="prep-row-actions flex items-center justify-end gap-1 max-sm:hidden">
          {needsAnalysis && (
            <button onClick={() => analyzeTrack(track)} disabled={analyzing} className="prep-btn-ghost px-1.5 py-0.5 text-[10px]" title="Analyser le BPM et la tonalité" aria-label={`Analyser le BPM et la tonalité de ${track.name}`}>
              {analyzing ? "…" : "BPM"}
            </button>
          )}
          <button onClick={() => removeLaterTrack(track.id)} className="prep-btn-ghost p-1 text-neutral-500 hover:text-red-400" title="Retirer du bac" aria-label={`Retirer ${track.name}`}>
            <Icon name="x" size={12} />
          </button>
        </span>
      </div>
    );
  };

  // tray card (grid view): big sleeve with key and BPM on it
  const renderTrayCard = (track: LibTrack) => {
    const nice = splitTitle(track.name);
    const checked = selectedLaterIds.has(track.id);
    const analyzing = analyzingIds.has(track.id);
    const checking = checkingQualityIds.has(track.id);
    const hasMeta = !!track.meta && Object.keys(track.meta).length > 0;
    // a card only offers what is still missing; the rest appears on hover
    const showAnalyze = track.bpm === undefined || analyzing;
    const showQuality = track.source !== "local" && (!track.quality || checking);
    const showActions = gridSize !== "S" && (showAnalyze || showQuality || hasMeta);
    return (
      <div
        key={track.id}
        data-checked={checked}
        {...rowDrag(track)}
        className="prep-row prep-keyed flex cursor-grab flex-col gap-2 p-2 active:cursor-grabbing"
        style={{ ["--key" as string]: camelotColour(track.camelot) ?? "rgba(255,255,255,.18)" }}
      >
        <div className="relative">
          <div className="prep-sleeve"><Cover art={track.art} name={track.name} camelot={track.camelot} fill rounded={8} /></div>
          {camelotColour(track.camelot) ? <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 rounded-b-[8px]" style={{ background: camelotColour(track.camelot)! }} /> : null}
          <label className="prep-check absolute left-0 top-0">
            <input type="checkbox" checked={checked} onChange={() => toggleLaterSelected(track.id)} className="accent-[var(--prep-accent)]" aria-label={`Sélectionner ${track.name}`} />
          </label>
          <button onClick={() => removeLaterTrack(track.id)} className="prep-card-actions prep-tap absolute right-1 top-1 rounded-full bg-black/65 p-1 text-neutral-400 hover:text-red-400" title="Retirer du bac" aria-label={`Retirer ${track.name}`}>
            <Icon name="x" size={11} />
          </button>
          {showActions && (
            <div className="prep-card-actions absolute inset-x-1 top-1/2 flex -translate-y-1/2 flex-wrap justify-center gap-1" data-busy={analyzing || checking}>
              {showAnalyze && <button onClick={() => analyzeTrack(track)} disabled={analyzing} className="prep-btn-ghost prep-tap bg-black/70 px-1.5 py-0.5 text-[11px]" title="Analyser le BPM et la tonalité">{analyzing ? "Analyse…" : "Analyser"}</button>}
              {showQuality && (
                <button onClick={() => checkQuality(track)} disabled={checking} className="prep-btn-ghost prep-tap bg-black/70 px-1.5 py-0.5 text-[11px]" title="Vérifier la qualité audio et vidéo">
                  {checking ? "Vérif…" : "Qualité"}
                </button>
              )}
              {hasMeta && (
                <button onClick={() => toggleDetails(track.id)} aria-pressed={openDetailsIds.has(track.id)} className="prep-btn-ghost prep-tap bg-black/70 px-1.5 py-0.5 text-[11px]">Détails</button>
              )}
            </div>
          )}
        </div>
        <div className="min-w-0" title={track.name}>
          <p className="line-clamp-2 min-h-[2.5em] text-[14px] font-extrabold leading-[1.25] tracking-[-0.01em] text-neutral-50">{nice.title}</p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-300">{nice.artist || " "}</p>
          <p className="truncate text-[10px] italic text-neutral-500">{nice.extra || " "}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/30 p-1.5">
          <MiniKeyWheel camelot={track.camelot} size={38} label={false} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-1">
              <KeyBadge camelot={track.camelot} />
              <span className="font-mono text-[12px] font-black text-[#ffcc00]">{track.bpm ? `${Math.round(track.bpm)}` : "—"}<span className="ml-0.5 text-[9px] font-bold text-neutral-500">BPM</span></span>
            </div>
            <TempoRuler bpm={track.bpm} median={trayMedianBpm} />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <StemQuad state={stemOf(track.id).state} pct={stemOf(track.id).pct} />
          <StemPill info={stemOf(track.id)} onPrepare={() => queueStems([track])} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <QualityBars level={track.quality} />
          <div className="min-w-0 flex-1"><DurationBar sec={track.durationSec} /></div>
          <span className="font-mono text-[10px] text-neutral-400">{fmtDur(track.durationSec)}</span>
        </div>
        {hasMeta && openDetailsIds.has(track.id) && renderMetaDetails(track.meta!)}
      </div>
    );
  };

  // set card: mosaic, name, stats; accepts dropped titles; opens to show its content
  const renderListCard = (playlist: Playlist, index: number) => {
    const stats = playlistStats(playlist.trackIds);
    const tracks = playlist.trackIds.map((id) => lib.tracks.find((t) => t.id === id)).filter((t): t is LibTrack => !!t);
    const isOpen = openPlaylistId === playlist.id;
    const accent = LIST_ACCENTS[index % LIST_ACCENTS.length];
    const ready = tracks.filter((t) => stemOf(t.id).state === "done").length;
    const prep = setPreps[playlist.id];
    const confirming = pendingDeleteId === playlist.id;
    const toggle = () => setOpenPlaylistId(isOpen ? null : playlist.id);
    return (
      <div
        key={playlist.id}
        data-over={dragOverList === playlist.id}
        onDragOver={(e) => {
          if (!acceptsDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOverList(playlist.id);
        }}
        onDragLeave={() => setDragOverList(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverList(null);
          addIdsToPlaylist(playlist.id, readDrag(e));
        }}
        className="prep-drop prep-card"
        style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
      >
        <div className="flex items-center gap-3 p-2.5 pl-3.5">
          <Mosaic tracks={tracks} accent={accent} />
          <button onClick={toggle} aria-expanded={isOpen} className="prep-tap min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-bold text-neutral-100">{playlist.name}</p>
            <p className="text-[11px] text-neutral-500">
              {stats.count} titre(s) · {formatDuration(stats.seconds)} · {stats.bpmRange} BPM ·{" "}
              <span style={{ color: tracks.length > 0 && ready === tracks.length ? "#34d399" : "#7b8494" }}>stems {ready}/{tracks.length}</span>
            </p>
          </button>
          <button onClick={toggle} className={`prep-tap flex items-center justify-center text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-label={isOpen ? "Fermer le set" : "Voir le contenu"}>
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--prep-line)] px-3 py-2">
          <button
            onClick={() => onLaunchSet?.("relay", playlist.id)}
            disabled={tracks.length < 2 || !onLaunchSet}
            className="prep-btn-accent prep-tap flex items-center gap-1 px-2.5 py-1 text-[11px]"
            title="Lance ce set tel quel en automix A→B→A"
          >
            <Icon name="play" size={11} />
            Jouer
          </button>
          <details className="prep-menu relative">
            <summary className="prep-btn-ghost prep-tap flex items-center px-1.5 py-1" aria-label="Plus d'actions pour ce set" title="Ordonner, stems, précharger">
              <Icon name="more" size={13} />
            </summary>
            <div className="prep-menu-panel" onClick={(e) => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
              <button
                onClick={() => openStudio({ source: "list", listId: playlist.id, autoBuild: true })}
                disabled={tracks.length < 2}
                className="prep-btn-ghost prep-tap flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
                title="Réordonner ce set (forme, durée, transitions)"
              >
                <Icon name="bolt" size={11} />
                Ordonner
              </button>
              <button onClick={() => queueStems(tracks)} disabled={tracks.length === 0 || ready === tracks.length} className="prep-btn-ghost prep-tap flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px]" title="Préparer les stems de tout le set">
                <Icon name="stems" size={11} />
                Stems
              </button>
              <button
                onClick={() => void prepareSet(playlist.id)}
                disabled={tracks.length === 0 || prep?.state === "running"}
                className="prep-btn-ghost prep-tap flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
                title="Télécharge les titres dans le cache de l'appli et fabrique les annonces de la voix du DJ : le set démarre sans attente, dans tous les onglets"
              >
                <Icon name="disc" size={11} />
                {prep?.state === "running" ? `Audio ${prep.warmed}/${prep.total}${prep.voiceTotal ? ` · Voix ${prep.voiced}/${prep.voiceTotal}` : ""}` : prep?.state === "done" ? "Préchargé" : "Précharger"}
              </button>
            </div>
          </details>
          {prep?.state === "running" && <span className="font-mono text-[10px] text-neutral-400">Audio {prep.warmed}/{prep.total}{prep.voiceTotal ? ` · Voix ${prep.voiced}/${prep.voiceTotal}` : ""}</span>}
          {selectedLaterIds.size > 0 && (
            <button onClick={() => addCheckedToPlaylist(playlist.id)} className="prep-btn-ghost prep-tap flex items-center gap-1 px-2 py-1 text-[11px]" style={{ borderColor: "var(--prep-accent)", color: "var(--prep-accent)" }} title="Ajouter les titres cochés à ce set">
              <Icon name="plus" size={11} />
              {selectedLaterIds.size} coché(s)
            </button>
          )}
          <button
            onClick={() => deletePlaylist(playlist.id)}
            className="prep-tap ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold"
            style={confirming ? { background: "#dc2626", color: "#fff" } : { color: "#f87171" }}
            title="Supprimer ce set (les titres restent dans le bac)"
            aria-label={confirming ? `Confirmer la suppression du set ${playlist.name}` : `Supprimer le set ${playlist.name}`}
          >
            {confirming ? "Confirmer" : <Icon name="trash" size={13} />}
          </button>
        </div>
        {isOpen && (
          <ol className="flex max-h-72 flex-col overflow-y-auto border-t border-[var(--prep-line)] py-1">
            {tracks.length === 0 && <li className="px-3 py-3 text-[11px] text-neutral-500">Set vide : glisse des titres ici, ou coche-les puis « + coché(s) ».</li>}
            {tracks.map((t, i) => (
              <li key={t.id} className="group flex items-center gap-2 px-3 py-1 hover:bg-white/[.03]">
                <span className="w-4 text-right font-mono text-[10px] text-neutral-600">{i + 1}</span>
                <Cover art={t.art} name={t.name} camelot={t.camelot} size={24} rounded={4} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-200" title={t.name}>{t.name}</span>
                <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
                <KeyChip camelot={t.camelot} />
                <button onClick={() => removeFromPlaylist(playlist.id, t.id)} className="prep-tap flex items-center justify-center text-neutral-600 opacity-0 transition-opacity hover:text-red-400 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100" title="Retirer du set (le titre reste dans le bac)" aria-label={`Retirer ${t.name} du set`}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ol>
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
    const meta = probed[track.id]?.meta;
    const hasMeta = !!meta && Object.keys(meta).length > 0;
    const kept = lib.tracks.some((t) => t.source === "youtube" && t.url === track.id && t.later);
    const open = openDetailsIds.has(track.id);
    return (
      <div key={track.id} className="flex flex-col gap-2 rounded-xl border border-[var(--prep-line)] bg-[var(--prep-surface-2)] p-2">
        <div className="flex items-center gap-3">
          <Cover art={track.artwork ?? undefined} name={track.title} size={52} />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-100" title={track.title}>{track.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
              {track.duration ? <span className="font-mono">{fmtDur(track.duration)}</span> : null}
              {track.bpm ? <BpmChip bpm={Number(track.bpm)} /> : null}
              {renderResultQualityBadge(track)}
            </div>
          </div>
          <button
            onClick={() => addLaterTrack(track)}
            disabled={kept}
            className={`prep-tap flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] ${kept ? "prep-btn-ghost" : "prep-btn-accent"}`}
            title={kept ? "Déjà dans le bac" : "Mettre de côté dans le bac"}
            aria-label={kept ? `${track.title} : déjà dans le bac` : `Mettre ${track.title} de côté`}
          >
            <Icon name={kept ? "check" : "plus"} size={12} />
            {kept ? "Dans le bac" : "De côté"}
          </button>
        </div>
        {hasMeta && (
          <button onClick={() => toggleDetails(track.id)} aria-expanded={open} className="self-start text-[11px] text-neutral-500 hover:text-neutral-200">
            {open ? "Masquer les détails" : "Détails : label, sortie, tracklist…"}
          </button>
        )}
        {hasMeta && open && renderMetaDetails(meta!)}
      </div>
    );
  };

  const visibleResultsCount = filteredSearchResults.length;

  const stemStates = laterTracks.map((t) => stemOf(t.id).state);
  const stemsReady = stemStates.filter((s) => s === "done").length;
  const stemsBusy = stemStates.filter((s) => s === "run" || s === "download").length;
  const stemsWaiting = stemStates.filter((s) => s === "queued").length;
  const stemsFailed = stemStates.filter((s) => s === "error").length;
  const stemsMissing = laterTracks.filter((_, i) => stemStates[i] === "none" || stemStates[i] === "error");
  const analysisMissing = laterTracks.filter((t) => t.bpm === undefined && !analyzingIds.has(t.id) && !failedIds.has(t.id)).length;
  const qualityMissing = laterTracks.filter((t) => t.source !== "local" && !t.quality && !checkingQualityIds.has(t.id)).length;
  const selectedTracks = laterTracks.filter((t) => selectedLaterIds.has(t.id));
  const selectedSec = selectedTracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const allShownChecked = filteredTracks.length > 0 && filteredTracks.every((t) => selectedLaterIds.has(t.id));
  const searchFiltersOn = durationFilter !== "all" || resultQualityMin !== "all" || videoFilter !== "all";
  const dot = <span className="h-1.5 w-1.5 rounded-full bg-[var(--prep-accent)]" />;

  const resetTrayFilters = () => {
    setDurationFilter("all");
    setQualityFilter("all");
    setVideoFilter("all");
    setFilterTheme("");
    setFilterGroup("");
    setTrayQuery("");
  };
  const resetSearchFilters = () => {
    setDurationFilter("all");
    setResultQualityMin("all");
    setVideoFilter("all");
  };

  // the steps of the strip drive the screen
  const focusSearch = () => {
    searchInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    searchInputRef.current?.focus({ preventScroll: true });
  };
  const goToTray = () => trayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const totalLaterSec = laterTracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const laterBpms = laterTracks.map((t) => t.bpm).filter((b): b is number => !!b);
  const trayMedianBpm = laterBpms.length ? [...laterBpms].sort((a, b) => a - b)[Math.floor(laterBpms.length / 2)] : undefined;
  const playFirstSet = () => {
    const set = lib.playlists.find((p) => p.trackIds.length >= 2);
    if (set) onLaunchSet?.("relay", set.id);
    else flash("Crée d'abord un set d'au moins deux titres.");
  };
  const newEmptySet = () => {
    setSetsOpen(true);
    setTimeout(() => {
      newListInputRef.current?.focus();
      newListInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  };

  return (
    <div className="prep hw-screwed hw-panel flex min-w-0 max-w-full flex-1 flex-col gap-4 p-3 sm:p-5">
      {/* en-tête façon Spotify : la couleur suit le set survolé */}
      <AmbientHero
        level={1}
        label="Préparation"
        ambient={ambient ?? undefined}
        overline="Ton bac"
        title="Préparation"
        cover={<Mosaic tracks={laterTracks.slice(-4).reverse()} size={112} accent="var(--prep-accent)" />}
        subtitle={`${laterTracks.length} titre(s) mis de côté${totalLaterSec ? ` · ${formatDuration(totalLaterSec)}` : ""}${laterBpms.length ? ` · ${Math.round(Math.min(...laterBpms))}–${Math.round(Math.max(...laterBpms))} BPM` : ""}`}
        actions={
          <>
            <PlayDisc label="Jouer le premier set" onClick={playFirstSet} disabled={!onLaunchSet || !lib.playlists.some((p) => p.trackIds.length >= 2)} />
            <span className="text-[11px] text-neutral-400">Jouer le premier set</span>
          </>
        }
      >
        <QuickSets tracks={lib.tracks} playlists={lib.playlists} onLaunch={onLaunchSet ? (id) => onLaunchSet("relay", id) : undefined} onAmbient={setAmbient} title="Tes sets" />
      </AmbientHero>

      {/* le parcours : chaque étape amène à sa zone */}
      <Journey
        steps={buildJourney({
          tracks: laterTracks,
          playlists: lib.playlists,
          stemsReady,
          playing: false,
        }).map((st) => ({
          ...st,
          onClick:
            st.key === "find"
              ? () => focusSearch()
              : st.key === "stems"
                ? () => goToTray()
                : st.key === "set"
                  ? () => openStudio()
                  : st.key === "play" && onLaunchSet
                    ? () => playFirstSet()
                    : undefined,
        }))}
      />

      {/* étape 1 : recherche YouTube */}
      <section className="prep-card p-3" aria-label="Chercher un titre">
        <div className="mb-2.5 flex items-center gap-2">
          <StepBadge n={1} />
          <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-neutral-100">Chercher</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"><Icon name="search" /></span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Un titre, un artiste, un label…"
              aria-label="Chercher sur YouTube"
              className="prep-input prep-tap w-full py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className="prep-btn-accent prep-tap px-4 py-2 text-xs">
            {isSearching ? "Recherche…" : "Rechercher"}
          </button>
          <button onClick={() => setShowSearchFilters((v) => !v)} aria-pressed={showSearchFilters} className="prep-btn-ghost prep-tap flex items-center gap-1.5 px-3 py-2 text-xs" title="Filtrer les résultats par durée, qualité audio, qualité vidéo">
            <Icon name="filter" size={13} />
            Filtres
            {searchFiltersOn && dot}
          </button>
          {!searchOpen && searchResults.length > 0 && (
            <button onClick={() => setSearchOpen(true)} className="prep-btn-ghost prep-tap px-3 py-2 text-xs">Résultats ({searchResults.length})</button>
          )}
        </div>
        {searchError && <p role="alert" className="mt-2 text-[12px] text-red-400">{searchError}</p>}
        {showSearchFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <SegFilter label="Durée" hint="Vaut aussi pour le bac" value={durationFilter} options={DUR_OPTIONS} onChange={setDurationFilter} />
            <SegFilter label="Audio" value={resultQualityMin} options={RESULT_AUDIO_OPTIONS} onChange={setResultQualityMin} />
            <SegFilter label="Vidéo" hint="Vaut aussi pour le bac" value={videoFilter} options={VIDEO_OPTIONS} onChange={setVideoFilter} />
            {searchFiltersOn && <button onClick={resetSearchFilters} className="prep-btn-ghost prep-tap px-2.5 py-1 text-[11px]">Réinitialiser</button>}
          </div>
        )}
        {searchOpen && searched && !isSearching && searchResults.length === 0 && !searchError && (
          <p className="mt-3 border-t border-[var(--prep-line)] pt-3 text-[12px] text-neutral-500">Aucun résultat pour cette recherche. Essaie d&apos;autres mots, ou le nom de l&apos;artiste seul.</p>
        )}
        {searchOpen && (isSearching || searchResults.length > 0) && (
          <div className="mt-3 border-t border-[var(--prep-line)] pt-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[12px] text-neutral-400" aria-live="polite">
                {isSearching ? "Recherche en cours…" : `${visibleResultsCount} résultat(s) sur ${searchResults.length}`}
                {checking ? " · vérification de la qualité…" : ""}
              </span>
              <button onClick={() => setSearchOpen(false)} className="prep-btn-ghost prep-tap ml-auto px-3 py-1 text-[11px]" title="Replier les résultats (le bouton « Résultats » les rouvre)">Terminé</button>
            </div>
            <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
              {filteredSearchResults.map((track) => renderSearchResultCard(track))}
              {!isSearching && searchResults.length > 0 && filteredSearchResults.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-[12px] text-neutral-500">Aucun résultat ne passe les filtres.</p>
                  <button onClick={resetSearchFilters} className="prep-btn-ghost prep-tap px-3 py-1 text-[11px]">Réinitialiser les filtres</button>
                </div>
              )}
              {!isSearching && (
                <div className="col-span-full flex flex-wrap items-center justify-center gap-2 py-2">
                  <button type="button" disabled={searchMore || searchLevel >= 3} onClick={() => runSearch(searchLevel + 1, false)} className="prep-btn-ghost prep-tap px-4 py-1.5 text-[11px]" title="Relance la recherche avec 40 résultats de plus">
                    {searchMore ? "Recherche…" : searchLevel >= 3 ? "Maximum atteint" : "+ Encore plus de résultats"}
                  </button>
                  <button type="button" disabled={searchMore || searchExtended} onClick={() => runSearch(searchLevel, true)} className="prep-btn-ghost prep-tap px-4 py-1.5 text-[11px]" title="Ajoute les versions remix, live, extended et audio de ta recherche">
                    {searchExtended ? "Recherche étendue" : "Étendre la recherche"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* étape 2 : le bac, titres mis de côté */}
        <section ref={trayRef} className="prep-card flex min-w-0 scroll-mt-4 flex-col" aria-label="Titres mis de côté">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--prep-line)] p-3">
            <label className="prep-check" title="Tout cocher">
              <input
                type="checkbox"
                checked={allShownChecked}
                onChange={(e) => setSelectedLaterIds(e.target.checked ? new Set(filteredTracks.map((t) => t.id)) : new Set())}
                className="accent-[var(--prep-accent)]"
                aria-label="Tout cocher"
                disabled={filteredTracks.length === 0}
              />
            </label>
            <StepBadge n={2} />
            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-neutral-100">Mis de côté</h2>
            <span className="rounded-full bg-white/5 px-2 py-px font-mono text-[10px] text-neutral-400">
              {filteredTracks.length !== laterTracks.length ? `${filteredTracks.length}/${laterTracks.length}` : laterTracks.length}
            </span>
            <div className="relative ml-auto min-w-[140px] max-w-[240px] flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"><Icon name="search" size={12} /></span>
              <input value={trayQuery} onChange={(e) => setTrayQuery(e.target.value)} placeholder="Filtrer le bac…" className="prep-input prep-tap w-full py-1 pl-7 pr-2 text-xs" aria-label="Filtrer les titres mis de côté" />
            </div>
            {(() => {
              // one track checked: keep in the tray only what mixes after it (harmonic keys, tempo within a turntable's ±6 %)
              const one = selectedLaterIds.size === 1 ? laterTracks.find((t) => selectedLaterIds.has(t.id)) : undefined;
              const q = one ? compatibleQuery(one) : "";
              if (!q) return null;
              return (
                <button
                  type="button" onClick={() => setTrayQuery(q)}
                  className="prep-btn-ghost prep-tap flex items-center gap-1 px-2 py-1 text-[11px]"
                  title={`Garder les titres qui s'enchaînent avec « ${one!.name} » : ${q}`}
                  aria-label={`Titres compatibles avec ${one!.name}`}
                >
                  <Icon name="disc" size={11} />
                  Compatibles
                </button>
              );
            })()}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="prep-input prep-tap px-2 py-1 text-xs" aria-label="Trier le bac" title="Trier le bac">
              <option value="recent">Tri : récents</option>
              <option value="title">Tri : titre A-Z</option>
              <option value="bpm">Tri : BPM croissant</option>
              <option value="camelot">Tri : tonalité Camelot</option>
              <option value="theme">Tri : thème</option>
              <option value="group">Tri : groupe</option>
            </select>
            <div className="prep-seg" role="group" aria-label="Affichage">
              <button aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} title="Liste" aria-label="Affichage en liste"><Icon name="list" size={13} /></button>
              <button aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} title="Pochettes" aria-label="Affichage en pochettes"><Icon name="grid" size={13} /></button>
              {viewMode === "grid" && (["S", "M", "L"] as const).map((s) => <button key={s} aria-pressed={gridSize === s} onClick={() => setGridSize(s)} title={`Pochettes ${s === "S" ? "petites" : s === "M" ? "moyennes" : "grandes"}`} aria-label={`Pochettes ${s === "S" ? "petites" : s === "M" ? "moyennes" : "grandes"}`}>{s}</button>)}
            </div>
            <button onClick={() => setShowTrayFilters((v) => !v)} aria-pressed={showTrayFilters} className="prep-btn-ghost prep-tap flex items-center gap-1.5 px-2.5 py-1 text-[11px]" title="Filtrer par durée, qualité, thème, groupe">
              <Icon name="filter" size={12} />
              Filtres
              {trayFiltersOn && dot}
            </button>
          </div>

          {showTrayFilters && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-[var(--prep-line)] px-3 py-2.5">
              <SegFilter label="Durée" hint="Vaut aussi pour les résultats de recherche" value={durationFilter} options={DUR_OPTIONS} onChange={setDurationFilter} />
              <SegFilter label="Audio" value={qualityFilter} options={TRAY_AUDIO_OPTIONS} onChange={setQualityFilter} />
              <SegFilter label="Vidéo" hint="Vaut aussi pour les résultats de recherche" value={videoFilter} options={VIDEO_OPTIONS} onChange={setVideoFilter} />
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-500">Thème
                <select value={filterTheme} onChange={(e) => setFilterTheme(e.target.value)} className="prep-input prep-tap px-2 py-1 text-[11px] font-normal normal-case tracking-normal">
                  <option value="">Tous</option>
                  {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-500">Groupe
                <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="prep-input prep-tap px-2 py-1 text-[11px] font-normal normal-case tracking-normal">
                  <option value="">Tous</option>
                  {groups.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
              {trayFiltersOn && <button onClick={resetTrayFilters} className="prep-btn-ghost prep-tap px-2.5 py-1 text-[11px]">Réinitialiser</button>}
            </div>
          )}

          {laterTracks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="prep-accent opacity-70"><Icon name="crate" size={44} /></span>
              <p className="text-sm font-semibold text-neutral-200">Le bac est vide</p>
              <p className="max-w-sm text-[12px] text-neutral-500">Cherche un titre ci-dessus et clique « De côté ». Tu pourras ensuite préparer ses stems, l&apos;analyser et le ranger dans un set.</p>
              <button onClick={focusSearch} className="prep-btn-accent prep-tap mt-1 flex items-center gap-1.5 px-4 py-2 text-xs">
                <Icon name="search" size={13} />
                Chercher un titre
              </button>
            </div>
          ) : (
            <>
              {/* actions sur tout le bac : une principale, le reste en second plan */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--prep-line)] px-3 py-2.5">
                <button
                  onClick={() => queueStems(stemsMissing)}
                  disabled={stemsMissing.length === 0}
                  className="prep-btn-accent prep-tap flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  title={stemsMissing.length === 0 ? "Tous les stems sont prêts, en cours ou en attente" : "Sépare la voix, la batterie, la basse et le reste de chaque titre sans stems, pour les mixer séparément"}
                >
                  <Icon name="stems" size={13} />
                  Préparer les stems{stemsMissing.length > 0 ? ` (${stemsMissing.length})` : ""}
                </button>
                <details className="prep-menu relative">
                  <summary className="prep-btn-ghost prep-tap flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]" title="Analyser le BPM et la tonalité, vérifier la qualité">
                    <Icon name="more" size={13} />
                    Plus
                    {analysisMissing + qualityMissing > 0 && <span className="rounded bg-white/10 px-1 font-mono text-[10px] text-neutral-300">{analysisMissing + qualityMissing}</span>}
                  </summary>
                  <div className="prep-menu-panel" onClick={(e) => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
                    <button onClick={analyzeAllBPM} disabled={analysisMissing === 0} className="prep-btn-ghost prep-tap flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px]" title="Analyse le BPM et la tonalité des titres du bac qui n'en ont pas encore">
                      <Icon name="disc" size={12} />
                      Analyser BPM et tonalité{analysisMissing > 0 ? ` (${analysisMissing})` : ""}
                    </button>
                    <button onClick={checkAllQuality} disabled={qualityMissing === 0} className="prep-btn-ghost prep-tap flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px]" title="Vérifie la qualité audio et vidéo des titres YouTube du bac">
                      <Icon name="bolt" size={12} />
                      Vérifier la qualité{qualityMissing > 0 ? ` (${qualityMissing})` : ""}
                    </button>
                  </div>
                </details>
              </div>
              {/* the tray at a glance: a bar or a key filters the cards */}
              <div className="grid gap-3 border-b border-[var(--prep-line)] p-3 sm:grid-cols-3">
                <StemsDonut done={stemsReady} running={stemsBusy} queued={stemsWaiting} error={stemsFailed} total={laterTracks.length} />
                <TempoHistogram bpms={laterBpms} query={trayQuery} onFilter={setTrayQuery} />
                <KeyWheel keys={laterTracks.flatMap((t) => (t.camelot ? [t.camelot] : []))} query={trayQuery} onFilter={setTrayQuery} />
              </div>
              {viewMode === "list" ? (
                <div className="@container flex flex-col p-2">
                  <div className={`grid items-center gap-3 px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-600 max-sm:hidden ${ROW_COLS}`}>
                    <span />
                    <span />
                    <span>Titre</span>
                    <span className="text-right @4xl:text-left">
                      <span className="@4xl:hidden">BPM</span>
                      <span className="hidden @4xl:inline">Tempo · médiane {trayMedianBpm ? Math.round(trayMedianBpm) : "—"}</span>
                    </span>
                    <span>Ton.</span>
                    <span className="text-center @4xl:text-left">Stems</span>
                    <span className="hidden @4xl:block">Qualité · durée</span>
                    <span />
                  </div>
                  <div className="flex max-h-[62vh] flex-col gap-0.5 overflow-y-auto pr-1">
                    {filteredTracks.map(renderTrayRow)}
                    {filteredTracks.length === 0 && (
                      <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                        <p className="text-[12px] text-neutral-500">Aucun titre ne correspond au filtre.</p>
                        <button onClick={resetTrayFilters} className="prep-btn-ghost prep-tap px-3 py-1 text-[11px]">Réinitialiser les filtres</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`${GRID_CLASS[gridSize]} max-h-[62vh] p-3`}>
                  {filteredTracks.map(renderTrayCard)}
                  {filteredTracks.length === 0 && (
                    <div className="col-span-full flex flex-col items-center gap-2 px-3 py-8 text-center">
                      <p className="text-[12px] text-neutral-500">Aucun titre ne correspond au filtre.</p>
                      <button onClick={resetTrayFilters} className="prep-btn-ghost prep-tap px-3 py-1 text-[11px]">Réinitialiser les filtres</button>
                    </div>
                  )}
                </div>
              )}
              <p className="prep-drag-hint flex items-center gap-1.5 border-t border-[var(--prep-line)] px-3 py-2 text-[11px] text-neutral-600">
                <Icon name="grip" size={12} />
                Glisse un titre (ou les cochés) sur un set pour l&apos;y ranger.
              </p>
            </>
          )}
        </section>

        {/* les sets */}
        <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <Section title="Sets" count={lib.playlists.length} summary={`${lib.playlists.length} set(s)`} open={setsOpen} onToggle={() => setSetsOpen(!setsOpen)}>
            <div className="flex flex-col gap-3 p-3 pt-0">
              <div
                data-over={dragOverList === NEW_LIST}
                onDragOver={(e) => {
                  if (!acceptsDrag(e)) return;
                  e.preventDefault();
                  setDragOverList(NEW_LIST);
                }}
                onDragLeave={() => setDragOverList(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverList(null);
                  createPlaylistFrom(readDrag(e), newListName ?? "");
                }}
                className="prep-drop flex flex-col gap-2 rounded-xl border border-dashed border-[var(--prep-line)] p-2.5"
              >
                <div className="flex gap-2">
                  <input
                    ref={newListInputRef}
                    value={newListName ?? ""}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createPlaylistFrom([...selectedLaterIds], newListName ?? ""); }}
                    placeholder="Nom du nouveau set"
                    aria-label="Nom du nouveau set"
                    className="prep-input prep-tap min-w-0 flex-1 px-2.5 py-1.5 text-xs"
                  />
                  <button onClick={() => createPlaylistFrom([...selectedLaterIds], newListName ?? "")} disabled={selectedLaterIds.size === 0} className="prep-btn-accent prep-tap flex items-center gap-1 px-3 py-1.5 text-xs">
                    <Icon name="plus" size={12} />
                    Créer
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  {selectedLaterIds.size > 0 ? `${selectedLaterIds.size} titre(s) coché(s) iront dans le set.` : "Coche des titres, ou glisse-les ici pour créer un set."}
                </p>
              </div>
              {lib.playlists.map((playlist, index) => renderListCard(playlist, index))}
              {lib.playlists.length === 0 && <p className="px-1 text-[12px] text-neutral-500">Aucun set pour l&apos;instant. Coche des titres du bac, puis « Créer un set » dans la barre qui apparaît.</p>}
            </div>
          </Section>
        </aside>
      </div>

      {/* étape 3 : créateur de set (source, forme d'énergie, durée, transitions, envoi sur les platines) */}
      <Section
        title="Créer un set"
        step={3}
        hint="titres, forme, ordre, envoi sur les platines"
        open={wizardOpen}
        onToggle={() => setWizardOpen(!wizardOpen)}
        sectionRef={setSectionRef}
      >
        <div className="p-3 pt-0">
          <SetWizard
            key={studio.nonce}
            bac={laterTracks}
            allTracks={lib.tracks}
            checkedIds={selectedLaterIds}
            playlists={lib.playlists}
            initial={studio.initial}
            poolLabel="le bac"
            isStemReady={(id) => stemOf(id).state === "done"}
            analyzing={analyzingIds}
            onAnalyze={analyzeIds}
            onPrepareStems={(ids) => queueStems(lib.tracks.filter(t => ids.includes(t.id)))}
            onSave={saveSet}
            onSend={(dest, id) => onLaunchSet?.(dest, id)}
            canSend={!!onLaunchSet}
          />
        </div>
      </Section>

      {/* barre de sélection collante : n'existe que si des titres sont cochés */}
      {selectedLaterIds.size > 0 && (
        <div role="toolbar" aria-label="Actions sur les titres cochés" className="prep-selbar sticky bottom-3 z-30 mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 backdrop-blur">
          <span className="flex items-center gap-2 text-xs font-bold text-neutral-100">
            <span className="prep-accent"><Icon name="check" /></span>
            {selectedLaterIds.size} coché(s)
          </span>
          <span className="font-mono text-[11px] text-neutral-500">{formatDuration(selectedSec)}</span>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <button onClick={() => openStudio({ source: "checked", autoBuild: selectedLaterIds.size >= 2 })} disabled={selectedLaterIds.size < 2} className="prep-btn-accent prep-tap flex items-center gap-1.5 px-3 py-1 text-xs" title="Ordonner les titres cochés en set (forme, durée, transitions), puis l'envoyer sur les platines">
            <Icon name="bolt" size={12} />
            Créer un set
          </button>
          <button onClick={() => queueStems(selectedTracks)} className="prep-btn-ghost prep-tap flex items-center gap-1 px-3 py-1 text-xs"><Icon name="stems" size={12} />Préparer les stems</button>
          <select value="" onChange={(e) => { if (e.target.value) addCheckedToPlaylist(e.target.value); }} className="prep-input prep-tap px-2 py-1 text-xs" aria-label="Ajouter les titres cochés à un set">
            <option value="">Ajouter à un set…</option>
            {lib.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={newEmptySet} className="prep-btn-ghost prep-tap px-3 py-1 text-xs">Nouveau set vide…</button>
          <button onClick={() => setSelectedLaterIds(new Set())} className="prep-tap ml-auto px-2 text-[12px] text-neutral-400 hover:text-white">Tout décocher</button>
        </div>
      )}

      {notice && (
        <div role="status" className={`fixed right-4 z-50 max-w-sm rounded-xl px-4 py-2.5 text-xs font-semibold text-neutral-100 sm:right-6 ${selectedLaterIds.size > 0 ? "bottom-28" : "bottom-6"}`} style={{ background: "var(--prep-surface-2)", border: "1px solid var(--prep-accent)", boxShadow: "0 10px 30px rgba(0,0,0,.6)" }}>
          {notice}
        </div>
      )}
    </div>
  );
}
