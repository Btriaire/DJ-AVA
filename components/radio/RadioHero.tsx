"use client";

// top of Radio-AVA: One click and the latest sets, on a colour that follows the hovered set (Spotify-like, skin colours)

import { useState } from "react";
import { loadLibrary, type LibTrack, type Playlist } from "@/lib/library";
import { pickOneClick, saveOneClick } from "@/lib/oneClick";
import { Mosaic } from "../prep/parts";
import { useStored } from "../prep/Blocks";

const COUNT_OPTIONS = ["10", "20", "30", "50"] as const;
type CountOption = typeof COUNT_OPTIONS[number];
const ACCENTS = ["#22d3ee", "#a78bfa", "#34d399", "#ffcc00", "#f97316", "#60a5fa"] as const;

export function RadioHero({ tracks, playlists, onLaunch }: { tracks: LibTrack[]; playlists: Playlist[]; onLaunch?: (playlistId: string) => void }) {
  const [count, setCount] = useStored<CountOption>("djsynth.oneclick.count", "20", COUNT_OPTIONS);
  const [last, setLast] = useState<{ n: number; at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<string>("var(--prep-accent)");

  const handleClick = () => {
    if (tracks.length < 2 || !onLaunch) return;
    const ids = pickOneClick(loadLibrary().tracks, Number(count));
    const id = saveOneClick(ids);
    if (id) {
      const now = new Date();
      const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      setLast({ n: ids.length, at: time });
      setError(null);
      onLaunch(id);
    } else {
      setError("Pas assez de titres dans la bibliothèque");
    }
  };

  const recentTracks = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 4);
  const isDisabled = tracks.length < 2 || !onLaunch;
  const recentPlaylists = [...playlists].reverse().slice(0, 6);
  const trackMap = new Map(tracks.map(t => [t.id, t]));

  return (
    <section
      aria-label="Radio-AVA, accès rapide"
      className="relative rounded-2xl overflow-hidden border border-[var(--prep-line)] motion-reduce:transition-none"
      style={{
        backgroundColor: "color-mix(in srgb, var(--ambient) 30%, var(--prep-surface))",
        transition: "background-color 700ms ease",
        ["--ambient" as string]: ambient,
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent 0%, var(--prep-surface) 92%)" }} />
      <div className="relative z-10 p-5">
        <div className="flex flex-wrap gap-5 items-end">
          <div className="hidden sm:block">
            <Mosaic tracks={recentTracks} size={112} accent="var(--prep-accent)" />
          </div>
          <div className="sm:hidden">
            <Mosaic tracks={recentTracks} size={88} accent="var(--prep-accent)" />
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Playlist instantanée</div>
            <h2 className="text-4xl font-black tracking-tight text-white">One click</h2>
            <p className="text-xs text-neutral-400">{`${count} titres qui s'enchaînent (tempo et tonalité), lancés tout de suite sur les platines`}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleClick}
                disabled={isDisabled}
                aria-label={`One click : lancer ${count} titres`}
                className="w-14 h-14 rounded-full bg-[var(--prep-accent)] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--prep-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-150 hover:scale-105 shadow-[0_8px_24px_rgba(0,0,0,.45)] motion-reduce:transition-none"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#050505" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <div role="group" aria-label="Nombre de titres" className="prep-seg">
                {COUNT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCount(option)}
                    aria-pressed={count === option}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">titres</span>
            </div>
            {last && <div className="text-xs text-neutral-400 mt-1">Dernier one click : {last.n} titres à {last.at}</div>}
            {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
          </div>
        </div>

        {playlists.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Accès rapide</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {recentPlaylists.map((p, i) => {
                const pTracks = p.trackIds.map(id => trackMap.get(id)).filter(Boolean) as LibTrack[];
                const n = pTracks.length;
                return (
                  <div
                    key={p.id}
                    className="group relative flex items-center gap-3 overflow-hidden rounded-md bg-white/[.06] pr-3 transition-colors hover:bg-white/[.12] motion-reduce:transition-none"
                    onMouseEnter={() => setAmbient(ACCENTS[i % ACCENTS.length])}
                    onMouseLeave={() => setAmbient("var(--prep-accent)")}
                    onFocus={() => setAmbient(ACCENTS[i % ACCENTS.length])}
                    onBlur={() => setAmbient("var(--prep-accent)")}
                  >
                    <Mosaic tracks={pTracks.slice(0, 4)} size={56} accent={ACCENTS[i % ACCENTS.length]} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-white truncate">{p.name}</div>
                      <div className="text-[11px] text-neutral-400">{n} titres</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLaunch?.(p.id)}
                      disabled={n < 2 || !onLaunch}
                      aria-label={`Jouer ${p.name}`}
                      className="w-9 h-9 rounded-full bg-[var(--prep-accent)] flex items-center justify-center opacity-0 translate-x-1 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:translate-x-0 motion-reduce:transition-none disabled:opacity-30"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#050505" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
