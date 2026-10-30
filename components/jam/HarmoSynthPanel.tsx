"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules } from "@/lib/audio/jamModules";
import { JamShell, useJamRefresh } from "./JamKit";
import { ChordStrip } from "./ChordStrip";
import { JamSlots } from "./JamSlots";
import { SynthSound } from "./SynthSound";
import { SynthPlay } from "./SynthPlay";
import { SynthChords } from "./SynthChords";

const C = "var(--jam-synth)";

export function HarmoSynthPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).synth;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell
      title="Synth"
      tag="dans la tonalité · stem autre"
      color={C}
      status={m.status()}
      deckName={m.deck() === engine.deckA ? "A" : "B"}
      pref={m.pref}
      onPref={(p) => {
        m.set("pref", p);
        bump();
      }}
      lit={() => m.lit()}
      warning={m.warning()}
      onReset={() => {
        m.reset();
        bump();
      }}
      stemsOff={m.canEnableStems()}
      stemsLoading={m.stemsLoading()}
      onEnableStems={() => {
        void m.enableStems();
        bump();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ChordStrip data={() => m.chordView()} color="oklch(0.80 0.12 180)" />
        </div>
        <JamSlots m={m} color={C} />
      </div>
      <div className="h-px w-full" style={{ background: "var(--jam-line)" }} />
      <SynthSound m={m} C={C} bump={bump} />
      <div className="h-px w-full" style={{ background: "var(--jam-line)" }} />
      <SynthPlay m={m} C={C} bump={bump} />
      <div className="h-px w-full" style={{ background: "var(--jam-line)" }} />
      <SynthChords m={m} C={C} bump={bump} />
    </JamShell>
  );
}
