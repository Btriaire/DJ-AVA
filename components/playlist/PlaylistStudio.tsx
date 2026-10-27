"use client";

import { useState, useEffect, type ReactNode } from "react";
import { StatTile, Icon } from "../prep/parts";
import { Journey, type JourneyStep } from "../prep/Journey";
import { DeckStrip, type DeckStripProps } from "./DeckStrip";
import { LibraryPane, type LibraryPaneProps } from "./LibraryPane";
import { SetDetail, type SetDetailProps } from "./SetDetail";
import { SetRail, type SetRailProps } from "./SetRail";
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
  wizard: ReactNode | null;
}

export function PlaylistStudio({ tiles, decks, rail, detail, library, extras, journey, wizard }: PlaylistStudioProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    // Initialize step based on active set
    if (rail.activeId) {
      return 2;
    }
    return 1;
  });
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
    if (newStep === 1 || (newStep === 2 && selectedSet) || (newStep === 3 && selectedSet && detail.tracks.length > 0) || (newStep === 4 && selectedSet && detail.tracks.length >= 2)) {
      setStep(newStep);
    }
  };

  const stepLabels = ["Choisir", "Titres", "Mix", "Lancer"];
  const stepDescriptions = [
    "Sélectionnez un set existant ou créez-en un",
    "Ajoutez des titres à votre set",
    "Configurez les enchaînements et le mix",
    "Lancez votre set sur les platines"
  ];

  const stepLockedReasons = [
    "",
    "Sélectionnez d'abord un set",
    "Ajoutez au moins un titre au set",
    "Ajoutez au moins deux titres au set"
  ];

  // Calculate LaunchPanel props
  const readyCount = detail.tracks.filter((track) => detail.stemOf(track.id).state === "done").length;

  const totalSec = detail.tracks.reduce((sum, track) => sum + (track.durationSec || 0), 0);

  const bpmValues = detail.tracks
    .map(track => track.bpm)
    .filter((bpm): bpm is number => bpm !== undefined && bpm !== null);

  const bpmRange = bpmValues.length > 0
    ? `${Math.min(...bpmValues)}–${Math.max(...bpmValues)} BPM`
    : "0–0 BPM";

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Bibliothèque</h2>
              <p className="text-sm text-neutral-400">Recherchez un artiste ou un titre à ajouter</p>
              <LibraryPane {...library} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Titres du set</h2>
              <p className="text-sm text-neutral-400">Liste des titres actuellement dans le set</p>
              <SetDetail
                {...detail}
                view="titles"
                onOpenLibrary={() => {}}
              />
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
          <LaunchPanel
            playlist={detail.playlist}
            tracks={detail.tracks}
            driving={detail.driving}
            onPlay={(dest) => detail.onPlay(dest)}
            onBack={() => setStep(3)}
            ready={readyCount}
            totalSec={totalSec}
            bpmRange={bpmRange}
          />
        );
    }
  };

  return (
    <div className="prep hw-screwed hw-panel flex flex-1 flex-col gap-4 p-3 sm:p-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-[220px]">
          <h1 className="text-base font-black uppercase tracking-[0.25em] text-neutral-100">Sets</h1>
          <p className="mt-0.5 text-[11px] text-neutral-400">Composez vos sets, réglez leurs enchaînements, lancez-les sur les platines.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[760px]">
          {tiles.map((t) => (
            <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} color={t.color} meter={t.meter} />
          ))}
        </div>
      </header>

      <DeckStrip {...decks} />

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1 as 1 | 2 | 3 | 4;
            const isActive = step === stepNumber;
            const isCompleted = step > stepNumber;
            const isLocked =
              (stepNumber === 2 && !selectedSet) ||
              (stepNumber === 3 && (!selectedSet || detail.tracks.length === 0)) ||
              (stepNumber === 4 && (!selectedSet || detail.tracks.length < 2));

            return (
              <button
                key={label}
                type="button"
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                  isActive ? "bg-neutral-100 text-neutral-900" :
                  isCompleted ? "bg-green-500 text-white" :
                  isLocked ? "bg-neutral-700 text-neutral-400 cursor-not-allowed" :
                  "bg-neutral-800 text-neutral-300"
                }`}
                onClick={() => handleStepClick(stepNumber)}
                disabled={isLocked}
                title={isLocked ? stepLockedReasons[index] : stepDescriptions[index]}
              >
                {isCompleted ? <Icon name="check" /> : stepNumber}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {renderStepContent()}
        </div>

        <div className="flex justify-between mt-4">
          <button
            type="button"
            className="prep-btn-ghost"
            onClick={handleBack}
            disabled={step === 1}
          >
            <Icon name="chevron" className="transform rotate-90" /> Retour
          </button>
          {step < 4 && (
            <button
              type="button"
              className="prep-btn-accent"
              onClick={handleNext}
              disabled={
                (step === 1 && !selectedSet) ||
                (step === 2 && detail.tracks.length === 0) ||
                (step === 3 && detail.tracks.length < 2)
              }
            >
              Suivant : {stepLabels[step]} <Icon name="chevron" className="transform -rotate-90" />
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
