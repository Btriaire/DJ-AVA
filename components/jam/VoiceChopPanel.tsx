"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { voiceChop } from "@/lib/audio/voiceChop";
import { Knob } from "../Knob";
import { JamShell, useJamRefresh, JamSwap } from "./JamKit";
import { JamHelp } from "./JamHelp";
import { VoicePadGrid } from "./VoicePadGrid";
import { RepeatSwitch } from "./RepeatSwitch";
import { LevelPicker } from "./LevelPicker";
import { PHRASE_NAMES } from "@/lib/audio/loopLevels";
import { KEY_ROWS } from "./jamKeys";
const C = "var(--jam-voice)";
const pct = (v: number) => `${Math.round(v * 100)} %`;
export function VoiceChopPanel({ engine }: { engine: DJEngine }) {
  const m = voiceChop(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const prep = m.prep;
  return (
    <JamShell title="Voix du morceau" tag="joue les vraies phrases de ce morceau" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <JamHelp>Les huit pads PHR sont des phrases ou des groupes de mots complets de la voix de ce morceau, du début à la fin d&apos;un mot, jamais coupés au milieu : joue-les par-dessus, calées sur la grille. Un pad coupe le précédent. Bégaiement répète la syllabe en cours, Écho de fin lance un écho à chaque fin de phrase. Au clavier : K L ; {"'"} pour les phrases 1 à 4, O P [ ] pour 5 à 8, / bégaiement, . écho de fin, Maj + V inverse. Niveau de boucle choisit la part de la phrase qui boucle, Boucle verrouillée garde la boucle après le relâchement, Inverse joue les phrases à l&apos;envers.</JamHelp>
      <VoicePadGrid m={m} list={m.pads()} keys={[...KEY_ROWS.voiceChop, ...KEY_ROWS.voiceFx]} />
      {prep && (
        <div className="text-[10px] text-[var(--jam-text-3)]">{prep.phrases.length} phrase{prep.phrases.length > 1 ? "s" : ""} · {prep.segs.length} syllabes · {prep.sibilants.length} sifflantes · {prep.breaths.length} souffles</div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.2} defaultValue={0.9} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <RepeatSwitch on={m.repeat} color={C} onChange={(v) => { m.setRepeat(v); bump(); }} />
        <LevelPicker label="Niveau de boucle" names={PHRASE_NAMES} index={m.fracIdx} color={C} onChange={(i) => { m.setFrac(i); bump(); }} />
        <RepeatSwitch label="Boucle verrouillée" on={m.latch} color={C} onChange={(v) => { m.setLatch(v); bump(); }} />
        <JamSwap m={m} color={C} what="la nouvelle voix" onChange={bump} />
      </div>
    </JamShell>
  );
}
