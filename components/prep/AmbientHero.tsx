// Spotify-like header of the main views: a colour that follows the hovered set, quick access to the latest sets (MaRuche/Falken)
"use client";

import type { ReactNode } from "react";

export const AMBIENTS = ["#22d3ee", "#a78bfa", "#34d399", "#ffcc00", "#f97316", "#60a5fa"] as const;

export function AmbientHero({
  label,
  ambient = "var(--prep-accent)",
  cover,
  overline,
  title,
  subtitle,
  actions,
  children,
  level = 2,
}: {
  level?: 1 | 2; // 1 when the hero is the page title
  label: string;
  ambient?: string;
  cover?: ReactNode;
  overline: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
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
          {cover}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">{overline}</div>
            {level === 1 ? <h1 className="text-4xl font-black tracking-tight text-white">{title}</h1> : <h2 className="text-4xl font-black tracking-tight text-white">{title}</h2>}
            {subtitle && <div className="text-xs text-neutral-400">{subtitle}</div>}
            {actions && <div className="mt-2 flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

export function QuickSets({
  tracks,
  playlists,
  onLaunch,
  onAmbient,
  title = "Accès rapide",
  max = 6,
}: {
  tracks: LibTrack[];
  playlists: Playlist[];
  onLaunch?: (id: string) => void;
  onAmbient?: (colour: string | null) => void;
  title?: string;
  max?: number;
}) {
  if (playlists.length === 0) return null;
  const trackMap = new Map(tracks.map(t => [t.id, t]));
  const recent = [...playlists].reverse().slice(0, max);

  return (
    <>
      <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {recent.map((p, i) => {
          const pTracks = p.trackIds.map(id => trackMap.get(id)).filter(Boolean) as LibTrack[];
          return (
            <div
              key={p.id}
              className="group relative flex items-center gap-3 overflow-hidden rounded-md bg-white/[.06] pr-3 transition-colors hover:bg-white/[.12] motion-reduce:transition-none"
              onMouseEnter={() => onAmbient?.(AMBIENTS[i % AMBIENTS.length])}
              onMouseLeave={() => onAmbient?.(null)}
              onFocus={() => onAmbient?.(AMBIENTS[i % AMBIENTS.length])}
              onBlur={() => onAmbient?.(null)}
            >
              <Mosaic tracks={pTracks.slice(0, 4)} size={56} accent={AMBIENTS[i % AMBIENTS.length]} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-white truncate">{p.name}</div>
                <div className="text-[11px] text-neutral-400">{pTracks.length} titres</div>
              </div>
              <PlayDisc size={36} onClick={() => onLaunch?.(p.id)} disabled={pTracks.length < 2 || !onLaunch} label={`Jouer ${p.name}`} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export function PlayDisc({ size = 56, onClick, disabled, label }: { size?: 56 | 36; onClick?: () => void; disabled?: boolean; label: string }) {
  const sizeClass = size === 56 ? "w-14 h-14" : "w-9 h-9";
  const iconSize = size === 56 ? 26 : 14;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${sizeClass} rounded-full bg-[var(--prep-accent)] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--prep-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-150 hover:scale-105 shadow-[0_8px_24px_rgba(0,0,0,.45)] motion-reduce:transition-none`}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="#050505" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>
  );
}

import { Mosaic } from "./parts";
import type { LibTrack, Playlist } from "@/lib/library";
