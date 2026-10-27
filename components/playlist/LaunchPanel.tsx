import type { Playlist, LibTrack } from "@/lib/library";
import { Icon, fmtDur } from "../prep/parts";
import { DECK_COLOR } from "./types";

export function LaunchPanel(props: {
  playlist: Playlist | null;
  tracks: LibTrack[];
  driving: { A: boolean; B: boolean; relay: boolean };
  ready: number;
  totalSec: number;
  bpmRange: string;
  onPlay: (dest: "relay" | "A" | "B") => void;
  onBack: () => void;
}) {
  const { playlist, tracks, driving, ready, totalSec, bpmRange, onPlay, onBack } = props;
  const hasEnoughTracks = tracks.length >= 2;
  const isDriving = driving.A || driving.B || driving.relay;

  return (
    <div className="prep-card p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Lancer le set</h2>
        <p className="text-sm text-gray-600">
          {ready} sur {tracks.length} titres prêts • Durée totale : {fmtDur(totalSec)} •
          Gamme de tempos : {bpmRange}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          className={`prep-btn-accent h-32 flex flex-col items-center justify-center p-4 ${
            !hasEnoughTracks ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => hasEnoughTracks && onPlay("relay")}
          disabled={!hasEnoughTracks}
        >
          <Icon name="swap" className="h-8 w-8 mb-2" />
          <span className="font-bold">Relais automatique</span>
          <p className="text-xs text-center mt-1">
            Les deux platines s&apos;enchaînent seules (A→B→A) avec les enchaînements du set.
          </p>
          {driving.relay && (
            <div className="mt-2 flex space-x-1">
              <span className={`h-2 w-2 rounded-full bg-${DECK_COLOR.A}`} />
              <span className={`h-2 w-2 rounded-full bg-${DECK_COLOR.B}`} />
            </div>
          )}
        </button>

        <button
          className={`prep-btn-ghost h-32 flex flex-col items-center justify-center p-4 ${
            !hasEnoughTracks ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => hasEnoughTracks && onPlay("A")}
          disabled={!hasEnoughTracks}
        >
          <Icon name="disc" className={`h-8 w-8 mb-2 text-${DECK_COLOR.A}`} />
          <span className="font-bold">Charger sur platine A</span>
          <p className="text-xs text-center mt-1">
            Le set se met en file sur la platine A, en boucle.
          </p>
          {driving.A && (
            <div className="mt-2">
              <span className={`h-2 w-2 rounded-full bg-${DECK_COLOR.A}`} />
            </div>
          )}
        </button>

        <button
          className={`prep-btn-ghost h-32 flex flex-col items-center justify-center p-4 ${
            !hasEnoughTracks ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => hasEnoughTracks && onPlay("B")}
          disabled={!hasEnoughTracks}
        >
          <Icon name="disc" className={`h-8 w-8 mb-2 text-${DECK_COLOR.B}`} />
          <span className="font-bold">Charger sur platine B</span>
          <p className="text-xs text-center mt-1">
            Le set se met en file sur la platine B, en boucle.
          </p>
          {driving.B && (
            <div className="mt-2">
              <span className={`h-2 w-2 rounded-full bg-${DECK_COLOR.B}`} />
            </div>
          )}
        </button>
      </div>

      {!hasEnoughTracks && (
        <div className="text-sm text-yellow-600 flex items-center">
          <Icon name="bolt" className="h-4 w-4 mr-2" />
          <span>Ajoutez au moins 2 titres pour lancer le set.</span>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button className="prep-btn-ghost" onClick={onBack}>
          Retour aux titres
        </button>
        <div className="flex space-x-2">
          {isDriving && (
            <button className="prep-btn-ghost" onClick={() => {}}>
              <Icon name="pause" className="h-4 w-4 mr-1" />
              Arrêter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
