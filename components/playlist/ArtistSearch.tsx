"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "../prep/parts";
import type { AudiusTrack } from "@/lib/audius";

interface ArtistSearchProps {
  setName: string | null;
  onAdd: (track: AudiusTrack) => void;
}

export default function ArtistSearch({ setName, onAdd }: ArtistSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AudiusTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [searched, setSearched] = useState(false); // a search was made (the empty message only follows one)
  const [addedTracks, setAddedTracks] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  // "/" jumps to the search field (unless one is already being typed in)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || t?.matches("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fetchResults = async (append = false) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(query)}&n=${append ? offset + 40 : 40}&min=0&max=100000`
      );
      if (!response.ok) throw new Error("Échec de la recherche");

      const data = await response.json();
      const newTracks = data.tracks.filter(
        (track: AudiusTrack) => !results.some((r) => r.id === track.id)
      );

      setResults(append ? [...results, ...newTracks] : newTracks);
      setOffset(append ? offset + 40 : 40);
      setSearched(true);
    } catch (err) {
      setError("Échec de la recherche");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResults([]);
    setOffset(0);
    fetchResults();
  };

  const handleMoreResults = () => {
    if (offset >= 120) return;
    fetchResults(true);
  };

  const handleAddTrack = (track: AudiusTrack) => {
    if (!setName) return;
    onAdd(track);
    setAddedTracks(new Set(addedTracks).add(track.id));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="prep-card">
      {setName && (
        <h3 className="text-sm font-medium mb-4">
          Ajout dans : <span className="font-bold">{setName}</span>
        </h3>
      )}

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un artiste ou un titre sur YouTube…"
              className="prep-input w-full pl-10"
              aria-label="Rechercher un artiste ou un titre (raccourci : /)"
              autoFocus
            />
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
          <button
            type="submit"
            className="prep-btn-accent"
            disabled={loading || !query.trim()}
            aria-label="Lancer la recherche"
          >
            <Icon name="search" className="mr-2" /> Chercher
          </button>
        </div>
      </form>

      {loading && (
        <div className="flex items-center gap-2 py-4">
          <Icon name="refresh" className="animate-spin" />
          <span>Recherche…</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 py-4 flex items-center gap-2">
          <Icon name="x" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <div className="py-4 text-gray-500">Aucun résultat trouvé</div>
      )}

      {results.length > 0 && (
        <>
          <div className="max-h-[50vh] overflow-y-auto">
            <ul className="divide-y divide-gray-200">
              {results.map((track) => (
                <li key={track.id} className="py-2">
                  <div className="flex items-center gap-3">
                    <img
                      src={track.artwork || "/placeholder-artwork.jpg"}
                      alt={`Pochette de ${track.title}`}
                      className="w-10 h-10 object-cover rounded"
                    />
                    <div className="flex-grow min-w-0">
                      <div className="font-medium truncate">{track.title}</div>
                      <div className="text-sm text-gray-500 truncate">
                        {track.artist}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 w-12 text-right">
                      {formatDuration(track.duration)}
                    </div>
                    <button
                      onClick={() => handleAddTrack(track)}
                      disabled={!setName || addedTracks.has(track.id)}
                      className={`prep-btn-ghost inline-flex min-h-11 min-w-[7.5rem] items-center justify-center whitespace-nowrap px-3 ${
                        addedTracks.has(track.id) ? "bg-emerald-500/20 text-emerald-300" : ""
                      }`}
                      aria-label={
                        !setName
                          ? "Choisis d'abord un set"
                          : addedTracks.has(track.id)
                          ? "Ajouté"
                          : "Ajouter au set"
                      }
                    >
                      {addedTracks.has(track.id) ? (
                        <>
                          <Icon name="check" className="mr-1" /> Ajouté
                        </>
                      ) : (
                        <>
                          <Icon name="plus" className="mr-1" /> Ajouter
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {offset < 120 && (
            <button
              onClick={handleMoreResults}
              className="prep-btn-ghost w-full mt-4"
              disabled={loading}
              aria-label="Charger plus de résultats"
            >
              <Icon name="plus" className="mr-2" /> Encore plus de résultats
            </button>
          )}
        </>
      )}
    </div>
  );
}
