"use client";
import type { LibTrack, Playlist } from "@/lib/library";
import { Icon } from "./parts";

// The whole workflow in one strip: find tracks -> prepare stems -> build a set -> play it.
// Shared by Préparation and Playlist; each view only supplies the numbers and what a click does.

export interface JourneyStep {
  key: string;
  label: string;
  detail: string;
  state: "done" | "current" | "todo";
  onClick?: () => void;
}

export interface JourneyInput {
  tracks: LibTrack[];
  playlists: Playlist[];
  stemsReady: number;
  playing: boolean;
  onFind?: () => void;
  onStems?: () => void;
  onCreate?: () => void;
  onPlay?: () => void;
}

export function buildJourney(i: JourneyInput): JourneyStep[] {
  const n = i.tracks.length;
  const sets = i.playlists.filter((p) => p.trackIds.length >= 2).length;
  const done = [n >= 2, n > 0 && i.stemsReady === n, sets > 0, i.playing];
  const current = done.findIndex((d) => !d);
  const state = (k: number): JourneyStep["state"] => (done[k] ? "done" : k === current ? "current" : "todo");
  return [
    { key: "find", label: "Chercher", detail: n ? `${n} titre(s) en bibliothèque` : "ajoute des titres", state: state(0), onClick: i.onFind },
    { key: "stems", label: "Préparer", detail: n ? `stems prêts ${i.stemsReady}/${n}` : "stems des titres", state: state(1), onClick: i.onStems },
    { key: "set", label: "Créer un set", detail: sets ? `${sets} set(s) prêt(s)` : "enchaîner les titres", state: state(2), onClick: i.onCreate },
    { key: "play", label: "Jouer", detail: i.playing ? "en cours" : "sur les platines", state: state(3), onClick: i.onPlay },
  ];
}

export function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <nav aria-label="Parcours : de la recherche à la lecture" className="prep-card flex flex-wrap items-stretch gap-1.5 p-1.5">
      {steps.map((s, i) => {
        const cur = s.state === "current";
        return (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            disabled={!s.onClick}
            aria-current={cur ? "step" : undefined}
            className="flex min-w-[140px] flex-1 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left disabled:cursor-default"
            style={cur ? { background: "color-mix(in srgb, var(--prep-accent) 14%, transparent)", boxShadow: "inset 0 0 0 1px var(--prep-accent)" } : undefined}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${s.state === "todo" ? "border border-[var(--prep-line)] text-neutral-500" : "text-[#05070a]"}`}
              style={s.state === "done" ? { background: "#34d399" } : cur ? { background: "var(--prep-accent)" } : undefined}
            >
              {s.state === "done" ? <Icon name="check" size={13} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-bold text-neutral-100">{s.label}</span>
              <span className="block truncate text-[10px] text-neutral-500">{s.detail}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
