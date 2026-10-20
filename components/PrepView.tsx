"use client";

import { useState, useRef, useMemo, useSyncExternalStore } from "react";
import { loadLibrary, saveLibrary, uid, idbGetBlob } from "@/lib/library";
import { enqueuePrep, getPrepState, subscribePrep, forgetPrep } from "@/lib/stemPrep";
import { queueAnalysis } from "@/lib/analyze";
import type { LibTrack, LibraryData, Playlist } from "@/lib/library";
import type { AudiusTrack } from "@/lib/audius";
import type { PrepReady } from "@/lib/stemPrep";

type SortOption = "recent" | "title" | "bpm" | "camelot" | "theme" | "group";

export default function PrepView() {
  const [lib, setLib] = useState(() => loadLibrary());
  const libRef = useRef(lib);
  const prepState = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);

  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

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

  const filteredTracks = useMemo((): LibTrack[] => {
    let result = [...laterTracks];

    if (filterTheme) {
      result = result.filter(t => t.theme === filterTheme);
    }

    if (filterGroup) {
      result = result.filter(t => t.group === filterGroup);
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
  }, [laterTracks, sortBy, filterTheme, filterGroup]);

  const formatDuration = (sec?: number) => {
    if (!sec) return "--:--";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

  return (
    <div className="p-4 space-y-6 max-w-full">
      {/* Recherche YouTube */}
      <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-700">
        <h2 className="text-lg font-medium mb-4">Recherche YouTube</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher sur YouTube..."
            className="flex-1 p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {isSearching ? "Recherche..." : "Rechercher"}
          </button>
        </div>
        {searchError && <p className="text-red-500 mb-4">{searchError}</p>}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {searchResults.map((track) => (
            <div key={track.id} className="flex items-center gap-3 p-2 bg-neutral-800 rounded">
              {track.artwork && (
                <img src={track.artwork} alt="" className="w-12 h-12 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{track.title}</p>
                <div className="flex gap-2 text-sm text-neutral-400">
                  <span>{formatDuration(track.duration)}</span>
                  {track.bpm && <span>BPM: {track.bpm}</span>}
                </div>
              </div>
              <button
                onClick={() => addLaterTrack(track)}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
              >
                {lib.tracks.some(t => t.source === "youtube" && t.url === track.id && t.later)
                  ? "Déjà en préparation"
                  : "Mettre de côté"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Listes sauvegardées */}
      <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-700">
        <h2 className="text-lg font-medium mb-4">Listes sauvegardées</h2>
        <div className="flex gap-2 mb-4">
          <button
            onClick={createPlaylist}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
          >
            Créer une liste depuis la vue
          </button>
        </div>
        <div className="space-y-2">
          {lib.playlists.map((playlist) => (
            <div key={playlist.id} className="flex items-center justify-between p-2 bg-neutral-800 rounded">
              <div>
                <p className="font-medium">{playlist.name}</p>
                <p className="text-sm text-neutral-400">{playlist.trackIds.length} morceaux</p>
              </div>
              <button
                onClick={() => deletePlaylist(playlist.id)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* À préparer */}
      <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-700">
        <h2 className="text-lg font-medium mb-4">À préparer ({filteredTracks.length} morceaux)</h2>

        {/* Filtres et tri */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Trier par</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200"
            >
              <option value="recent">Récents</option>
              <option value="title">Titre A-Z</option>
              <option value="bpm">BPM croissant</option>
              <option value="camelot">Tonalité Camelot</option>
              <option value="theme">Thème</option>
              <option value="group">Groupe</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Filtrer par thème</label>
            <select
              value={filterTheme}
              onChange={(e) => setFilterTheme(e.target.value)}
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200"
            >
              <option value="">Tous</option>
              {themes.map(theme => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Filtrer par groupe</label>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200"
            >
              <option value="">Tous</option>
              {groups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Boutons globaux */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => enqueuePrep(laterTracks)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            Préparer tous les stems
          </button>
          <button
            onClick={analyzeAllBPM}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
          >
            Analyser tous les BPM
          </button>
        </div>

        {/* Liste des morceaux */}
        <div className="space-y-3">
          {filteredTracks.map((track) => {
            const stemStatus = getStemStatus(track.id);
            const isAnalyzing = analyzingIds.has(track.id);
            const isFailed = failedIds.has(track.id);

            return (
              <div key={track.id} className="p-3 bg-neutral-800 rounded border border-neutral-700">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                  <div>
                    <p className="font-medium truncate">{track.name}</p>
                    <p className="text-sm text-neutral-400">
                      {track.source} • {formatDuration(track.durationSec)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <label className="block text-sm text-neutral-400 mb-1">Thème</label>
                      <input
                        type="text"
                        list="theme-suggestions"
                        value={track.theme || ""}
                        onChange={(e) => updateTrackField(track.id, "theme", e.target.value)}
                        onBlur={(e) => updateTrackField(track.id, "theme", e.target.value)}
                        className="w-full p-1 bg-neutral-700 border border-neutral-600 rounded text-neutral-200"
                      />
                      <datalist id="theme-suggestions">
                        {themes.map(theme => (
                          <option key={theme} value={theme} />
                        ))}
                      </datalist>
                    </div>
                    <div className="w-1/2">
                      <label className="block text-sm text-neutral-400 mb-1">Groupe</label>
                      <input
                        type="text"
                        list="group-suggestions"
                        value={track.group || ""}
                        onChange={(e) => updateTrackField(track.id, "group", e.target.value)}
                        onBlur={(e) => updateTrackField(track.id, "group", e.target.value)}
                        className="w-full p-1 bg-neutral-700 border border-neutral-600 rounded text-neutral-200"
                      />
                      <datalist id="group-suggestions">
                        {groups.map(group => (
                          <option key={group} value={group} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm text-neutral-400">BPM</p>
                      <p className="font-medium">
                        {isAnalyzing ? "analyse…" :
                         isFailed ? "analyse impossible" :
                         formatBPM(track.bpm, track.bpmEstimated)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-neutral-400">Camelot</p>
                      <p className="font-medium">{track.camelot || "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="text-sm text-neutral-400">
                    Stems: {stemStatus === "queued" ? "en attente" :
                            stemStatus === "done" ? "prêt" :
                            stemStatus === "error" ? "erreur" :
                            stemStatus.startsWith("running") ? `en cours ${stemStatus.split(" ")[1]}` : "—"}
                  </div>
                  <button
                    onClick={() => enqueuePrep([track])}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  >
                    Préparer les stems
                  </button>
                  <button
                    onClick={() => analyzeTrack(track)}
                    disabled={isAnalyzing}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50"
                  >
                    {isAnalyzing ? "Analyse..." : "Analyser BPM"}
                  </button>
                  <button
                    onClick={() => removeLaterTrack(track.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
