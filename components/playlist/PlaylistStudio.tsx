"use client";

// The Playlist view. Reading order = the journey: the decks (what plays now), the sets, the open set,
// the library to fill it. Presentational only: MediaLibrary owns the audio engine, the storage and the
// playback logic and feeds the props.

import { useState, type ReactNode } from "react";
import { StatTile } from "../prep/parts";
import { Journey, type JourneyStep } from "../prep/Journey";
import { DeckStrip, type DeckStripProps } from "./DeckStrip";
import { LibraryPane, type LibraryPaneProps } from "./LibraryPane";
import { SetDetail, type SetDetailProps } from "./SetDetail";
import { SetRail, type SetRailProps } from "./SetRail";
import "./playlist.css";

export interface PlaylistTile {
  label: string;
  value: string;
  sub?: string;
  color: string;
  meter?: number;
}

export interface PlaylistStudioProps {
  tiles: PlaylistTile[];
  decks: DeckStripProps;
  rail: SetRailProps;
  detail: SetDetailProps;
  library: LibraryPaneProps;
  extras: ReactNode; // hidden file input
  journey: JourneyStep[];
  wizard: ReactNode | null; // the set assistant: replaces the open set and the library while it is open
}

export function PlaylistStudio({ tiles, decks, rail, detail, library, extras, journey, wizard }: PlaylistStudioProps) {
  // below 1024 px the open set and the library do not fit side by side: one at a time
  const [pane, setPane] = useState<"set" | "library">("set");

  return (
    <div className="prep hw-screwed hw-panel flex flex-1 flex-col gap-4 p-3 sm:p-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-[220px]">
          <h1 className="text-base font-black uppercase tracking-[0.25em] text-neutral-100">Playlist</h1>
          <p className="mt-0.5 text-[11px] text-neutral-400">Compose tes sets, règle leurs enchaînements, lance-les sur les platines.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[760px]">
          {tiles.map((t) => (
            <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} color={t.color} meter={t.meter} />
          ))}
        </div>
      </header>

      <Journey steps={journey} />

      <DeckStrip {...decks} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <aside className="min-w-0 lg:col-span-2" aria-label="Mes sets">
          <SetRail {...rail} />
        </aside>

        {wizard ? (
          <section className="min-w-0 lg:col-span-2" aria-label="Assistant de création de set">
            {wizard}
          </section>
        ) : (
          <>
            <div className="lg:hidden">
              <div className="pl-tabs" role="group" aria-label="Afficher">
                <button type="button" className="pl-tab" aria-pressed={pane === "set"} onClick={() => setPane("set")}>
                  Set ouvert
                </button>
                <button type="button" className="pl-tab" aria-pressed={pane === "library"} onClick={() => setPane("library")}>
                  Bibliothèque
                  <span className="pl-tab-count">{library.tracks.length}</span>
                </button>
              </div>
            </div>
            <section className={`min-w-0 ${pane === "set" ? "" : "max-lg:hidden"}`} aria-label="Set ouvert">
              <SetDetail {...detail} onWizard={rail.onWizard} onOpenLibrary={() => setPane("library")} />
            </section>
            <section className={`min-w-0 ${pane === "library" ? "" : "max-lg:hidden"}`} aria-label="Bibliothèque">
              <LibraryPane {...library} />
            </section>
          </>
        )}
      </div>
      {extras}
    </div>
  );
}
