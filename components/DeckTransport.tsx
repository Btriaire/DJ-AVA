"use client";
import { Deck } from "@/lib/audio/Deck";

export function DeckTransport({ deck, color, side, stepping, onStep, onSync, autoSync, autoReset, pitch, onToggleAutoSync, onTogglePitchReset, onChange }: { deck: Deck; color: string; side: "A" | "B"; stepping: boolean; onStep: (dir: -1 | 1) => void; onSync: () => void; autoSync: boolean; autoReset: boolean; pitch: number; onToggleAutoSync: () => void; onTogglePitchReset: () => void; onChange: () => void }) {
  return (
    <div className="hw-recess flex flex-col gap-2 p-2" style={{ ["--led" as string]: color }}>
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">CUE & LECTURE</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            disabled={stepping}
            onClick={() => { onStep(-1); onChange(); }}
            title={`Single précédent (morceaux classés sur le Deck ${side})`}
          >
            ⏮
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            onClick={() => { onStep(1); onChange(); }}
            title="Single suivant"
          >
            ⏭
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            onClick={() => { deck.setCue(); onChange(); }}
            title="Poser un point de départ"
          >
            SET CUE
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            onClick={() => { deck.gotoCue(); onChange(); }}
            title="Aller au point de départ"
          >
            CUE
          </button>
          <button
            className={`hw-btn flex-1 min-w-[120px] h-12 px-2.5 py-2 text-[11px] font-bold ${deck.playing ? "hw-transport-play" : ""}`}
            onClick={() => { deck.toggle(); onChange(); }}
          >
            {deck.playing ? "❚❚ PAUSE" : "▶ PLAY"}
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            onClick={onSync}
            title="Caler le tempo sur l'autre deck (immédiat)"
          >
            SYNC
          </button>
        </div>
      </div>

      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">SAUT</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            disabled={!deck.name}
            onClick={() => { const t = Math.min(deck.duration, Math.max(0, deck.position() - 15)); deck.seek(t); onChange(); }}
            title="Retour rapide"
          >
            «15
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            disabled={!deck.name}
            onClick={() => { const t = Math.min(deck.duration, Math.max(0, deck.position() - 5)); deck.seek(t); onChange(); }}
            title="Retour"
          >
            ‹5
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            disabled={!deck.name}
            onClick={() => { const t = Math.min(deck.duration, Math.max(0, deck.position() + 5)); deck.seek(t); onChange(); }}
            title="Avance"
          >
            5›
          </button>
          <button
            className="hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px]"
            disabled={!deck.name}
            onClick={() => { const t = Math.min(deck.duration, Math.max(0, deck.position() + 15)); deck.seek(t); onChange(); }}
            title="Avance rapide"
          >
            15»
          </button>
          <button
            className={`hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px] ${deck.quantize ? "hw-btn-on" : ""}`}
            onClick={() => { deck.toggleQuantize(); onChange(); }}
            title="QUANTIZE ON : calage automatique des départs, repères et boucles sur la grille rythmique / QUANTIZE OFF : déclenchement libre"
          >
            Q
          </button>
        </div>
      </div>

      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">TEMPO</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px] ${autoSync ? "hw-btn-on" : ""}`}
            onClick={onToggleAutoSync}
            title="Glisser progressivement vers le tempo de l'autre deck (6 s)"
          >
            {autoSync ? "⇄ Auto-sync" : "■ Sync…"}
          </button>
          <button
            className={`hw-btn px-2.5 py-2 text-[11px] font-bold min-h-[36px] ${autoReset ? "hw-btn-on" : ""}`}
            disabled={Math.abs(pitch) <= 0.05 && !autoReset}
            onClick={onTogglePitchReset}
            title="Glisser progressivement le pitch pour revenir au tempo naturel 0% (5 s)"
          >
            {autoReset ? "↺ 0% Pitch" : "■ Reset…"}
          </button>
        </div>
      </div>
    </div>
  );
}
