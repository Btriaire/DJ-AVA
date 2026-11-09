"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { bassSlicer, otherSlicer } from "@/lib/audio/stemSlicer";
import { Knob } from "../Knob";
import { JamShell, useJamRefresh, JamSwap } from "./JamKit";
import { JamHelp } from "./JamHelp";
import { VoicePadGrid } from "./VoicePadGrid";
import { RepeatSwitch } from "./RepeatSwitch";
import { LevelPicker } from "./LevelPicker";
import { KEY_ROWS } from "./jamKeys";
import { PHRASE_NAMES } from "@/lib/audio/loopLevels";

export function StemSlicePanel({ engine, role }: { engine: DJEngine; role: "bass" | "other" }) {
  const m = role === "bass" ? bassSlicer(engine) : otherSlicer(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const C = role === "bass" ? "var(--jam-bass)" : "var(--jam-synth)";

  return (
    <JamShell title={role === "bass" ? "Basse du morceau" : "Autres du morceau"} tag="joue les vraies notes de ce stem" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <JamHelp>Les 8 pads sont les notes les plus fortes de ce stem, coupées là où chaque note commence, jouées en temps sur la grille. Avec Répéter allumé, un pad maintenu se répète. Les touches sont Maj + chiffres 1 à 8 pour la basse (9 frein, 0 demi-tempo), Maj + A S D F G H J K pour les autres (L frein, ; demi-tempo). Niveau de boucle choisit la partie de la note qui boucle, Boucle verrouillée conserve la boucle après relâchement. Samples basse remplace les notes par les samples du Stem Sample Pad (boucles et coups préparés à l&apos;avance). Répéter est coupé par défaut : un appui joue la note une fois.</JamHelp>
      <VoicePadGrid m={m} list={m.pads()} keys={role === "bass" ? KEY_ROWS.bassSlice : KEY_ROWS.otherSlice} tint={C} />
      {m.state === "ready" && (
        <div className="text-[10px] text-[var(--jam-text-3)]">{m.slices.length} {m.source === "samples" ? "samples du Stem Sample Pad" : "notes trouvées"}</div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.2} defaultValue={0.9} color={C} size={46} led onChange={(v) => { m.setLevel(v); bump(); }} />
        <RepeatSwitch label={role === "bass" ? "Samples basse" : "Samples du stem"} on={m.source === "samples"} color={C} onChange={(v) => { m.setSource(v ? "samples" : "notes"); bump(); }} />
        <RepeatSwitch on={m.repeat} color={C} onChange={(v) => { m.setRepeat(v); bump(); }} />
        <LevelPicker label="Niveau de boucle" names={PHRASE_NAMES} index={m.fracIdx} color={C} onChange={(i) => { m.setFrac(i); bump(); }} />
        <RepeatSwitch label="Boucle verrouillée" on={m.latch} color={C} onChange={(v) => { m.setLatch(v); bump(); }} />
        <JamSwap m={m} color={C} what={role === "bass" ? "la nouvelle basse" : "les nouveaux sons"} onChange={bump} />
      </div>
    </JamShell>
  );
}
