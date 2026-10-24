"use client";

// The Playlist view: decks on top, then sets | open set | library. Presentational only:
// MediaLibrary owns the audio engine, the storage and the playback logic and feeds the props.

import type { ReactNode } from "react";
import { StatTile } from "../prep/parts";
import { DeckStrip, type DeckStripProps } from "./DeckStrip";
import { LibraryPane, type LibraryPaneProps } from "./LibraryPane";
import { SetDetail, type SetDetailProps } from "./SetDetail";
import { SetRail, type SetRailProps } from "./SetRail";

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
}

export function PlaylistStudio({ tiles, decks, rail, detail, library, extras }: PlaylistStudioProps) {
  return (
    <div className="prep hw-screwed hw-panel flex flex-1 flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-[220px]">
          <h1 className="text-base font-black uppercase tracking-[0.25em] text-neutral-100">Playlist</h1>
          <p className="mt-0.5 text-[11px] text-neutral-500">Compose tes sets, règle leurs transitions, lance-les sur les platines.</p>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[780px] xl:flex-1">
          {tiles.map((t) => (
            <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} color={t.color} meter={t.meter} />
          ))}
        </div>
      </header>

      <DeckStrip {...decks} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[260px_minmax(0,1fr)_400px]">
        <aside className="lg:col-span-2 xl:col-span-1">
          <SetRail {...rail} />
        </aside>
        <section className="min-w-0">
          <SetDetail {...detail} />
        </section>
        <section className="min-w-0">
          <LibraryPane {...library} />
        </section>
      </div>
      {extras}
    </div>
  );
}
