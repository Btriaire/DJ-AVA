"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { LIVE_BEATS, slicerFor, type SliceTag } from "@/lib/audio/stemSlicer";
import { Knob } from "../Knob";
import { JamShell, useJamRefresh, JamSwap } from "./JamKit";
import { JamHelp } from "./JamHelp";
import { VoicePadGrid } from "./VoicePadGrid";
import { RepeatSwitch } from "./RepeatSwitch";
import { LevelPicker } from "./LevelPicker";
import { KEY_ROWS } from "./jamKeys";
import { PHRASE_NAMES } from "@/lib/audio/loopLevels";

const TITLE: Record<SliceTag, string> = { bass: "Basse du morceau", other: "Autres du morceau", guitar: "Guitare du morceau", piano: "Piano du morceau" };
const COLOR: Record<SliceTag, string> = { bass: "var(--jam-bass)", other: "var(--jam-synth)", guitar: "oklch(0.78 0.15 30)", piano: "oklch(0.85 0.13 130)" };
const SAMPLES: Record<SliceTag, string> = { bass: "Samples basse", other: "Samples du stem", guitar: "Samples guitare", piano: "Samples piano" };
const NEW_SOUND: Record<SliceTag, string> = { bass: "la nouvelle basse", other: "les nouveaux sons", guitar: "la nouvelle guitare", piano: "le nouveau piano" };

export function StemSlicePanel({ engine, role }: { engine: DJEngine; role: SliceTag }) {
  const m = slicerFor(engine, role);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const C = COLOR[role];
  const keys = role === "bass" ? KEY_ROWS.bassSlice : role === "other" ? KEY_ROWS.otherSlice : []; // guitar and piano: mouse / touch only

  return (
    <JamShell title={TITLE[role]} tag="joue les vraies notes de ce stem" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <JamHelp>Les 8 pads sont les notes les plus fortes de ce stem, coupées là où chaque note commence, jouées en temps sur la grille. Avec Répéter allumé, un pad maintenu se répète. Les touches sont Maj + chiffres 1 à 8 pour la basse (9 frein, 0 demi-tempo), Maj + A S D F G H J K pour les autres (L frein, ; demi-tempo). Niveau de boucle choisit la partie de la note qui boucle, Boucle verrouillée conserve la boucle après relâchement. Samples basse remplace les notes par les samples du Stem Sample Pad (boucles et coups préparés à l&apos;avance). Répéter est coupé par défaut : un appui joue la note une fois. Les 3 pads ● LIVE prennent, pendant que le morceau joue, les derniers temps de ce stem seul (la durée se choisit dans Live) ; ensuite ils se jouent comme les autres pads. Vider Live les remet à zéro pour ce morceau.{role === "guitar" || role === "piano" ? " La guitare et le piano n'existent que sur les morceaux préparés en 6 pistes." : ""}</JamHelp>
      <VoicePadGrid m={m} list={m.pads()} keys={keys} tint={C} />
      {m.liveNote && <div className="text-[11px] font-bold text-amber-300" aria-live="polite">{m.liveNote}</div>}
      {m.state === "ready" && (
        <div className="text-[10px] text-[var(--jam-text-3)]">{m.slices.length} {m.source === "samples" ? "samples du Stem Sample Pad" : "notes trouvées"}</div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.2} defaultValue={0.9} color={C} size={46} led onChange={(v) => { m.setLevel(v); bump(); }} />
        <RepeatSwitch label={SAMPLES[role]} on={m.source === "samples"} color={C} onChange={(v) => { m.setSource(v ? "samples" : "notes"); bump(); }} />
        <RepeatSwitch on={m.repeat} color={C} onChange={(v) => { m.setRepeat(v); bump(); }} />
        <RepeatSwitch label="Normaliser" on={m.normalize} color={C} onChange={(v) => { m.setNormalize(v); bump(); }} />
        <LevelPicker label="Niveau de boucle" names={PHRASE_NAMES} index={m.fracIdx} color={C} onChange={(i) => { m.setFrac(i); bump(); }} />
        <RepeatSwitch label="Boucle verrouillée" on={m.latch} color={C} onChange={(v) => { m.setLatch(v); bump(); }} />
        <JamSwap m={m} color={C} what={NEW_SOUND[role]} onChange={bump} />
        <div className="flex items-center gap-1.5" title="Durée prise par un pad ● LIVE : les derniers temps joués de ce stem">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--jam-text-2)]">Live</span>
          {LIVE_BEATS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={m.liveBeats === n}
              onClick={() => { m.setLiveBeats(n); bump(); }}
              className="rounded px-2 py-1 text-[11px] font-bold"
              style={m.liveBeats === n ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            >
              {n} t.
            </button>
          ))}
          {m.hasLive() && (
            <button type="button" onClick={() => { m.clearLive(); bump(); }} className="rounded px-2 py-1 text-[11px] font-bold" style={{ background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }} title="Vide les 3 pads LIVE de ce morceau">
              Vider Live
            </button>
          )}
        </div>
      </div>
    </JamShell>
  );
}
