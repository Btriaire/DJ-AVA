"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "../prep/parts";
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
  const [selectedSet, setSelectedSet] = useState<string | null>(rail.activeId || null);

  const handleSetSelect = (id: string) => {
    rail.onSelect(id);
    setSelectedSet(id);
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
  const bpmRange = bpmValues.length > 0 ? `${Math.min(...bpmValues)}–${Math.max(...bpmValues)} BPM` : "0–0 BPM";

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
                setSelectedSet(rail.activeId);
                setStep(2);
              }}
            />
            <button
              type="button"
              className="prep-btn-accent mt-2"
              onClick={rail.onWizard}
            >
              <Icon name="bolt" /> Créer un set avec l&apos;assistant
            </button>
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
                <button type="button" className="prep-btn-accent px-3 py-1.5 text-xs" onClick={() => setStep(3)} disabled={setTracks.length === 0}>
                  Suivant : régler le mix
                </button>
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
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-black uppercase tracking-[0.25em] text-neutral-100">Sets</h1>
        <p className="text-[11px] text-neutral-400">Composez vos sets, réglez leurs enchaînements, lancez-les sur les platines.</p>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 flex-wrap">
          {stepLabels.map((s, index) => {
            const stepNumber = index + 1 as 1 | 2 | 3 | 4;
            const isActive = step === stepNumber;
            const isCompleted = step > stepNumber;
            const isLocked =
              (stepNumber === 2 && !selectedSet) ||
              (stepNumber === 3 && (!selectedSet || setTracks.length === 0)) ||
              (stepNumber === 4 && (!selectedSet || setTracks.length < 2));

            return (
              <div
                key={s.label}
                className={`flex flex-col items-start gap-1 ${isLocked ? "opacity-50" : ""}`}
              >
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${
                    isActive ? "bg-neutral-100 text-neutral-900" :
                    isCompleted ? "bg-green-500/20 text-green-400" :
                    isLocked ? "bg-neutral-800 text-neutral-500" :
                    "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  {isCompleted ? <Icon name="check" size={14} /> : (
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                      isActive ? "bg-neutral-900 text-neutral-100" :
                      isLocked ? "bg-neutral-700 text-neutral-500" :
                      "bg-neutral-700 text-neutral-300"
                    }`}>
                      {s.num}
                    </span>
                  )}
                  <span>{s.label}</span>
                </div>
                <span className={`text-xs ${isLocked ? "text-neutral-500" : "text-neutral-400"}`}>
                  {isLocked ? stepLockedReasons[index] : s.sub}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {renderStepContent()}
        </div>

        <div className="flex justify-between mt-4">
          {step > 1 && (
            <button
              type="button"
              className="prep-btn-ghost"
              onClick={handleBack}
            >
              <Icon name="chevron" className="transform rotate-90" /> Retour
            </button>
          )}
          {step < 4 && (
            <button
              type="button"
              className="prep-btn-accent"
              onClick={handleNext}
              disabled={
                (step === 1 && !selectedSet) ||
                (step === 2 && setTracks.length === 0) ||
                (step === 3 && setTracks.length < 2)
              }
            >
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
