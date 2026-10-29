"use client";

import { useState } from "react";
import { loadLibrary, type LibTrack } from "@/lib/library";
import { pickOneClick, saveOneClick } from "@/lib/oneClick";
import { Mosaic } from "../prep/parts";
import { useStored } from "../prep/Blocks";

const COUNT_OPTIONS = ["10", "20", "30", "50"] as const;
type CountOption = typeof COUNT_OPTIONS[number];

export function OneClick({ tracks, onLaunch }: { tracks: LibTrack[]; onLaunch?: (playlistId: string) => void }) {
  const [count, setCount] = useStored<CountOption>("djsynth.oneclick.count", "20", COUNT_OPTIONS);
  const [last, setLast] = useState<{ n: number; at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const recentTracks = [...tracks]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 4);

  const isDisabled = tracks.length < 2 || !onLaunch;

  return (
    <section
      aria-label="One click"
      className="rounded-2xl p-5 sm:p-6 bg-[#121212] border border-white/[.06] relative overflow-hidden"
      style={{
        backgroundImage: "linear-gradient(to bottom, oklch(0.42 0.09 175 / 0.55), transparent)",
      }}
    >
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="flex-shrink-0">
          <div className="sm:hidden">
            <Mosaic tracks={recentTracks} size={88} accent="#1ed2a0" />
          </div>
          <div className="hidden sm:block">
            <Mosaic tracks={recentTracks} size={112} accent="#1ed2a0" />
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="text-xs font-bold tracking-wider uppercase text-neutral-400">
            PLAYLIST INSTANTANÉE
          </div>

          <h2 className="text-4xl font-black tracking-tight text-white">
            One click
          </h2>

          <p className="text-xs text-neutral-400">
            {count} titres qui s&apos;enchaînent (tempo et tonalité), lancés tout de suite sur les platines
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center mt-2 flex-wrap">
            <button
              type="button"
              onClick={handleClick}
              disabled={isDisabled}
              aria-label={`One click : lancer ${count} titres`}
              className="w-14 h-14 rounded-full bg-[#1ed2a0] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212] disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-[120ms] hover:scale-[1.04]"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="black"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <div
              role="group"
              aria-label="Nombre de titres"
              className="flex gap-1 p-1 rounded-lg bg-white/5"
            >
              {COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  aria-pressed={count === option}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    count === option
                      ? "bg-white text-black"
                      : "text-neutral-300 hover:bg-white/10"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">titres</div>

          {last && (
            <div className="text-xs text-neutral-400 mt-1">
              Dernier one click : {last.n} titres à {last.at}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 mt-1">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
