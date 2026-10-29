"use client";

import { useState, type ReactNode } from "react";
import { Icon, Mosaic } from "../prep/parts";
import { AmbientHero, PlayDisc, QuickSets } from "../prep/AmbientHero";
import { Journey, type JourneyStep } from "../prep/Journey";
import { DeckStrip, type DeckStripProps } from "./DeckStrip";
import { LibraryPane, type LibraryPaneProps } from "./LibraryPane";
import { SetDetail, type SetDetailProps } from "./SetDetail";
import { SetRail, type SetRailProps } from "./SetRail";
import { TRANSITION_LABEL } from "@/lib/transitions";
import type { AudiusTrack } from "@/lib/audius";
import ArtistSearch from "./ArtistSearch";
import { LaunchPanel } from "./LaunchPanel";
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
  extras: ReactNode;
  journey: JourneyStep[];
  onAddFound: (t: AudiusTrack) => void; // a track found by artist, filed in the library and added to the open set
  wizard: ReactNode | null;
}

export function PlaylistStudio({ tiles, decks, rail, detail, library, extras, journey, wizard, onAddFound }: PlaylistStudioProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    if (rail.activeId) {
      return 2;
    }
    return 1;
  });
  // the titles of the open set (detail.tracks is the whole library)
  const setTracks = (detail.playlist?.trackIds ?? []).map((id) => detail.tracks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const selectedSet = detail.playlist?.id ?? null; // the set that is open
  const [ambient, setAmbient] = useState<string | null>(null); // colour of the hovered set in the header

  const handleSetSelect = (id: string) => {
    rail.onSelect(id);
    setStep(2);
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1 as 1 | 2 | 3 | 4);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1 as 1 | 2 | 3 | 4);
  };

  const handleStepClick = (newStep: 1 | 2 | 3 | 4) => {
    if (newStep === 1 || (newStep === 2 && selectedSet) || (newStep === 3 && selectedSet && setTracks.length > 0) || (newStep === 4 && selectedSet && setTracks.length >= 2)) {
      setStep(newStep);
    }
  };

  const stepLabels = [
    { num: 1, label: "Choisir un set", sub: detail.playlist?.name ?? "Aucun set sélectionné" },
    { num: 2, label: "Ajouter des titres", sub: `${setTracks.length} titres` },
    { num: 3, label: "Régler le mix", sub: detail.playlist ? `${TRANSITION_LABEL[detail.playlist.transitionType ?? "fade"]} ${detail.playlist.transitionSec ?? 12} s${detail.playlist.dj?.auto === false ? "" : " · DJ actif"}` : "—" },
    { num: 4, label: "Lancer", sub: setTracks.length >= 2 ? "Prêt" : `${2 - setTracks.length} titre(s) manque(nt)` }
  ];

  const stepLockedReasons = [
    "",
    "Sélectionnez d'abord un set",
    "Ajoutez au moins un titre au set",
    "Ajoutez au moins deux titres au set"
  ];

  const readyCount = setTracks.filter((track) => detail.stemOf(track.id).state === "done").length;
  const totalSec = setTracks.reduce((sum, track) => sum + (track.durationSec || 0), 0);
  const bpmValues = setTracks.map(track => track.bpm).filter((bpm): bpm is number => bpm !== undefined && bpm !== null);
  const bpmRange = bpmValues.length > 0 ? `${Math.round(Math.min(...bpmValues))}–${Math.round(Math.max(...bpmValues))} BPM` : "0–0 BPM";

  // why "Suivant" is off, said in words under the buttons
  const nextBlocked: string | null =
    step === 1 && !selectedSet ? "Choisissez ou créez un set pour continuer" :
    step === 2 && setTracks.length === 0 ? "Ajoutez au moins un titre (recherche d'artiste ou bibliothèque)" :
    step === 3 && setTracks.length < 2 ? "Il faut deux titres pour enchaîner : retournez en étape 2" : null;

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Mes sets</h2>
              <p className="text-sm text-neutral-400">Sélectionnez un set existant ou créez-en un nouveau</p>
            </div>
            <SetRail
              {...rail}
              onSelect={handleSetSelect}
              onCreate={(name) => {
                rail.onCreate(name);
                setStep(2);
              }}
            />
          </div>
        );

      case 2:
        return (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="flex min-w-0 flex-col gap-3">
              <ArtistSearch setName={detail.playlist?.name ?? null} onAdd={onAddFound} />
              <LibraryPane {...library} />
            </div>
            <div className="flex flex-col gap-2 lg:sticky lg:top-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-neutral-100">Dans le set : {setTracks.length} titre(s)</h2>
              </div>
              <SetDetail {...detail} view="titles" onOpenLibrary={() => {}} />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Configuration du mix</h2>
              <p className="text-sm text-neutral-400">Réglez les enchaînements et les paramètres DJ</p>
            </div>
            <SetDetail
              {...detail}
              view="mix"
              onOpenLibrary={() => {}}
            />
          </div>
        );

      case 4:
        return (
          <>
            <DeckStrip {...decks} />
            <LaunchPanel
              playlist={detail.playlist}
              tracks={setTracks}
              driving={detail.driving}
              onPlay={(dest) => detail.onPlay(dest)}
              onBack={() => setStep(3)}
              ready={readyCount}
              totalSec={totalSec}
              bpmRange={bpmRange}
            />
          </>
        );
    }
  };

  return (
    <div className="prep hw-screwed hw-panel flex flex-1 flex-col gap-4 p-3 sm:p-5">
      {/* Spotify-like header: the open set, its launch button, quick access to the others */}
      <AmbientHero
        level={1}
        label="Sets"
        ambient={ambient ?? undefined}
        overline={detail.playlist ? "Set ouvert" : "Tes sets"}
        title={detail.playlist?.name ?? "Sets"}
        cover={<Mosaic tracks={setTracks} size={112} accent="var(--prep-accent)" />}
        subtitle={detail.playlist ? `${setTracks.length} titre(s) · ${Math.round(totalSec / 60)} min · ${bpmRange} · stems ${readyCount}/${setTracks.length}` : "Composez vos sets, réglez leurs enchaînements, lancez-les sur les platines."}
        actions={
          selectedSet ? (
            <>
              <PlayDisc label={`Lancer ${detail.playlist?.name ?? "le set"}`} onClick={() => rail.onPlay("relay", selectedSet)} disabled={setTracks.length < 2} />
              <span className="text-[11px] text-neutral-400">{setTracks.length >= 2 ? "Lancer en relais A et B" : "Il faut deux titres"}</span>
            </>
          ) : undefined
        }
      >
        <QuickSets
          tracks={rail.tracks}
          playlists={rail.playlists.filter((p) => p.id !== selectedSet)}
          onLaunch={(id) => {
            rail.onSelect(id);
            rail.onPlay("relay", id);
          }}
          onAmbient={setAmbient}
          title="Tes autres sets"
        />
      </AmbientHero>

      <div className="flex flex-col gap-4">
        <nav aria-label="Étapes du set" className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {stepLabels.map((s, index) => {
            const stepNumber = (index + 1) as 1 | 2 | 3 | 4;
            const isActive = step === stepNumber;
            const isCompleted = step > stepNumber;
            const isLocked =
              (stepNumber === 2 && !selectedSet) ||
              (stepNumber === 3 && (!selectedSet || setTracks.length === 0)) ||
              (stepNumber === 4 && (!selectedSet || setTracks.length < 2));
            return (
              <button
                key={s.label}
                type="button"
                disabled={isLocked}
                aria-current={isActive ? "step" : undefined}
                title={isLocked ? stepLockedReasons[index] : undefined}
                onClick={() => handleStepClick(stepNumber)}
                className={`flex min-h-12 min-w-[132px] flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  isActive ? "border-orange-400/70 bg-orange-400/10 text-neutral-50" :
                  isCompleted ? "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/15" :
                  isLocked ? "cursor-not-allowed border-neutral-800 bg-neutral-900/40 text-neutral-600" :
                  "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isActive ? "bg-orange-400 text-neutral-950" : isCompleted ? "bg-green-500/30" : "bg-neutral-700"}`}>
                  {isCompleted ? <Icon name="check" size={13} /> : s.num}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-bold">{s.label}</span>
                  <span className="truncate text-[11px] opacity-70">{isLocked ? stepLockedReasons[index] : s.sub}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-4">
          {renderStepContent()}
        </div>

        <div className="sticky bottom-0 z-10 -mx-3 mt-2 flex items-center gap-3 border-t border-neutral-800 bg-neutral-950/90 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
          {step > 1 && (
            <button type="button" className="prep-btn-ghost inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-4 text-xs" onClick={handleBack}>
              <Icon name="chevron" className="transform rotate-90" /> Retour
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-neutral-400" aria-live="polite">
            {nextBlocked ?? (detail.playlist ? `${detail.playlist.name} · ${setTracks.length} titre(s)${totalSec ? ` · ${Math.round(totalSec / 60)} min` : ""}` : "")}
          </span>
          {step < 4 && (
            <button type="button" className="prep-btn-accent ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-5 text-sm" onClick={handleNext} disabled={!!nextBlocked}>
              Suivant : {stepLabels[step].label} <Icon name="chevron" className="transform -rotate-90" />
            </button>
          )}
        </div>
      </div>

      {wizard && (
        <div className="fixed inset-0 bg-neutral-900/75 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-800 rounded-lg p-4 w-full max-w-3xl max-h-[90vh] overflow-auto">
            {wizard}
          </div>
        </div>
      )}

      {extras}
    </div>
  );
}
