"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { drumLab } from "@/lib/audio/drumLab";
import { Knob } from "../Knob";
import { JamShell, useJamRefresh, JamSwap } from "./JamKit";
import { JamHelp } from "./JamHelp";
import { DrumPadGrid } from "./DrumPadGrid";
import { KEY_ROWS } from "./jamKeys";
import { RepeatSwitch } from "./RepeatSwitch";
import { LevelPicker } from "./LevelPicker";
import { ReleasePicker } from "./ReleasePicker";
import { HIT_NAMES } from "@/lib/audio/loopLevels";
const C = "var(--jam-drum)";
const pct = (v: number) => `${Math.round(v * 100)} %`;
export function DrumLabPanel({ engine }: { engine: DJEngine }) {
  const m = drumLab(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const prep = m.prep;
  return (
    <JamShell title="Batterie du morceau" tag="joue le vrai kit de ce morceau" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <JamHelp>Kick, caisse et charley sont les vrais coups de la batterie de ce morceau, découpés à la préparation : joue-les par-dessus, ou en roulement. Les effets du bas travaillent sur le stem batterie : roll, double, demi-tempo, frein, éparpille. Au clavier, les huit premiers pads se jouent sur 7 8 9 0 - = ` \ (rangée des chiffres, sans pavé numérique) ; Maj + Z X C pour demi-tempo, frein et éparpille. Niveau de boucle règle la vitesse de la répétition (1/4 à 1/32), Boucle verrouillée garde la boucle après le relâchement, FEEL ajoute un jeu humain.</JamHelp>
      <DrumPadGrid m={m} list={m.pads()} keys={[...KEY_ROWS.drum, ...KEY_ROWS.drumFx]} />
      {prep && (
        <>
          <div className="flex gap-[2px] mt-2">
            {prep.pattern.map((_, i) => {
              const kind = prep.pattern[i][0];
              return (
                <div
                  key={i}
                  className="w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] font-bold"
                  style={{
                    backgroundColor: !kind ? "rgba(255,255,255,0.05)" : `color-mix(in oklab, var(--jam-drum) ${Math.round(Math.min(1, 0.25 + 0.6 * prep.velocity[i]) * 100)}%, transparent)`,
                    color: kind ? "#0a0a0a" : "var(--jam-text-3)",
                    marginRight: i === 3 || i === 7 || i === 11 ? 4 : 0,
                  }}
                >
                  {kind ? kind[0].toUpperCase() : "·"}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-[var(--jam-text-3)]">{Math.round(prep.bpm)} BPM · swing {prep.swing > 0 ? "+" : ""}{prep.swing.toFixed(1)} ms · {prep.fills.length} fill{prep.fills.length > 1 ? "s" : ""} détecté{prep.fills.length > 1 ? "s" : ""}</div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.2} defaultValue={0.9} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <RepeatSwitch on={m.repeat} color={C} onChange={(v) => { m.setRepeat(v); bump(); }} />
        <ReleasePicker value={m.release} color={C} onChange={(v) => { m.setRelease(v); bump(); }} />
        <LevelPicker label="Niveau de boucle" names={HIT_NAMES} index={m.divIdx} color={C} onChange={(i) => { m.setDiv(i); bump(); }} />
        <RepeatSwitch label="Boucle verrouillée" on={m.latch} color={C} onChange={(v) => { m.setLatch(v); bump(); }} />
        <Knob label="FEEL" value={m.feel} min={0} max={1} defaultValue={0.35} color={C} size={46} led format={pct} onChange={(v) => { m.setFeel(v); bump(); }} />
        <JamSwap m={m} color={C} what="les nouveaux coups" onChange={bump} />
      </div>
    </JamShell>
  );
}
