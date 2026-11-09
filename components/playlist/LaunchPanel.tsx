import type { Playlist, LibTrack } from "@/lib/library";
import { Icon, Mosaic, fmtDur } from "../prep/parts";
import { DECK_COLOR } from "./types";

// Step 4 of the Sets view: the set's poster and name, then the three ways to send it to the decks.
// The decks strip above it plays, pauses and stops what was sent.
function Playing({ colors }: { colors: string[] }) {
  return (
    <span className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
      {colors.map((c) => (
        <span key={c} className="h-2 w-2 rounded-full motion-safe:animate-pulse" style={{ background: c }} />
      ))}
      <span className="ml-1">En cours</span>
    </span>
  );
}

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
  const card = "flex h-36 flex-col items-center justify-center rounded-xl p-4 text-center disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="prep-card space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Mosaic tracks={tracks} size={96} accent="var(--prep-accent)" cover={playlist?.cover} />
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Lancer le set</p>
          <h2 className="truncate text-2xl font-black text-white" title={playlist?.name}>{playlist?.name ?? "Aucun set"}</h2>
          <p className="text-sm text-neutral-400">
            {ready}/{tracks.length} titres prêts · {fmtDur(totalSec)} · {bpmRange}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button type="button" className={`prep-btn-accent ${card}`} onClick={() => onPlay("relay")} disabled={!hasEnoughTracks}>
          <Icon name="swap" size={28} className="mb-2" />
          <span className="font-bold">Relais automatique</span>
          <span className="mt-1 text-xs">Les deux platines s&apos;enchaînent seules (A→B→A) avec les enchaînements du set.</span>
          {driving.relay && <Playing colors={[DECK_COLOR.A, DECK_COLOR.B]} />}
        </button>

        {(["A", "B"] as const).map((side) => (
          <button key={side} type="button" className={`prep-btn-ghost ${card}`} onClick={() => onPlay(side)} disabled={!hasEnoughTracks}>
            <span style={{ color: DECK_COLOR[side] }}>
              <Icon name="disc" size={28} className="mb-2" />
            </span>
            <span className="font-bold">Charger sur platine {side}</span>
            <span className="mt-1 text-xs text-neutral-400">Le set se met en file sur la platine {side}, en boucle.</span>
            {driving[side] && <Playing colors={[DECK_COLOR[side]]} />}
          </button>
        ))}
      </div>

      {!hasEnoughTracks && (
        <p className="flex items-center gap-2 text-sm text-amber-400">
          <Icon name="bolt" size={16} />
          Ajoutez au moins 2 titres pour lancer le set.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-[var(--prep-line)] pt-4">
        <button type="button" className="prep-btn-ghost min-h-9 px-3 text-xs" onClick={onBack}>
          Retour au mix
        </button>
        <span className="text-[11px] text-neutral-500">La barre des platines, au-dessus, met chaque platine en pause et coupe l&apos;automix.</span>
      </div>
    </div>
  );
}
