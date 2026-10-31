"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { voiceLab } from "@/lib/audio/voiceLab";
import { Knob } from "../Knob";
import { JamPads, JamShell, useJamRefresh, JamSwap } from "./JamKit";
const C = "var(--jam-voice)";
const pct = (v: number) => `${Math.round(v * 100)} %`;
export function VoiceLabPanel({ engine }: { engine: DJEngine }) {
  const m = voiceLab(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  return (
    <JamShell title="Voix humaines" tag="la voix du morceau rechantée autrement" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <p className="text-[11px] text-[var(--jam-text-2)]">Chaque bouton ajoute une autre version de la voix du morceau, calée au millième sur elle : doublage, harmonies dans sa gamme, octave, voix de femme, d&apos;homme ou d&apos;enfant, chuchoté, foule. Les voix sont calculées une fois à la préparation, donc sans effet robot. Combine-les ; REMPLACER coupe la voix d&apos;origine pour n&apos;entendre que les nouvelles.</p>
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-2 gap-2 sm:grid-cols-5" />
      <div className="flex flex-wrap items-center gap-4">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.2} defaultValue={0.8} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <JamSwap m={m} color={C} what="les nouvelles voix" onChange={bump} />
        <span className="text-[10px] text-[var(--jam-text-3)]">{m.available.length ? `${m.available.length} voix prêtes pour ce morceau` : ""}</span>
      </div>
    </JamShell>
  );
}
