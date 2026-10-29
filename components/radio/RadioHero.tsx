"use client";

import { useState } from "react";
import { loadLibrary, type LibTrack, type Playlist } from "@/lib/library";
import { pickOneClick, saveOneClick } from "@/lib/oneClick";
import { Mosaic } from "../prep/parts";
import { useStored } from "../prep/Blocks";
import { AmbientHero, QuickSets, PlayDisc } from "../prep/AmbientHero";

const COUNT_OPTIONS = ["10", "20", "30", "50"] as const;
type CountOption = typeof COUNT_OPTIONS[number];

export function RadioHero({ tracks, playlists, onLaunch }: { tracks: LibTrack[]; playlists: Playlist[]; onLaunch?: (playlistId: string) => void }) {
  const [count, setCount] = useStored<CountOption>("djsynth.oneclick.count", "20", COUNT_OPTIONS);
  const [last, setLast] = useState<{ n: number; at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<string | null>(null);

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
  const subtitle = `${count} titres qui s'enchaînent (tempo et tonalité), lancés tout de suite sur les platines`;

  return (
    <AmbientHero
      label="Radio-AVA, accès rapide"
      ambient={ambient ?? "var(--prep-accent)"}
      cover={
        <>
          <div className="hidden sm:block">
            <Mosaic tracks={recentTracks} size={112} accent="var(--prep-accent)" />
          </div>
          <div className="sm:hidden">
            <Mosaic tracks={recentTracks} size={88} accent="var(--prep-accent)" />
          </div>
        </>
      }
      overline="Playlist instantanée"
      title="One click"
      subtitle={subtitle}
      actions={
        <>
          <PlayDisc size={56} onClick={handleClick} disabled={isDisabled} label={`One click : lancer ${count} titres`} />
          <div role="group" aria-label="Nombre de titres" className="prep-seg">
            {COUNT_OPTIONS.map((option) => (
              <button key={option} type="button" onClick={() => setCount(option)} aria-pressed={count === option}>
                {option}
              </button>
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">titres</span>
        </>
      }
    >
      {last && <div className="text-xs text-neutral-400 mt-1">Dernier one click : {last.n} titres à {last.at}</div>}
      {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      <QuickSets tracks={tracks} playlists={playlists} onLaunch={onLaunch} onAmbient={setAmbient} />
    </AmbientHero>
  );
}
