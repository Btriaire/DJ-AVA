"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules } from "@/lib/audio/jamModules";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";
import { NoteLane } from "./NoteLane";

const C = "var(--jam-vox)";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// VOX FX: throws held on the vocal stem, space, radio filter, a sung harmony in key, a vocoder and the voice lane
export function VoxFxPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).vox;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell title="Vox FX" tag="sur le stem voix" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <NoteLane
        data={() => m.laneData()}
        color="oklch(0.80 0.15 82)"
        accent="oklch(0.92 0.05 240)"
        label="Mélodie chantée et notes de l'harmonie autour de la tête de lecture"
        legend={["voix chantée", "harmonie"]}
      />
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="VOIX" value={m.level} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="ESPACE" value={m.space} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSpace(v); bump(); }} />
        <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
        <Knob label="RADIO" value={m.radio} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setRadio(v); bump(); }} />
      </div>
      <JamSeg
        color={C}
        label="Harmonie"
        value={m.harmonyMode}
        options={[
          ["third", "Tierce"],
          ["fifth", "Quinte"],
          ["chord", "Accord"],
          ["low", "Dessous"]
        ]}
        onChange={(v) => {
          m.set("harmonyMode", v);
          bump();
        }}
      />
      <div className="flex flex-wrap items-end gap-3">
        <JamSeg
          label="Voix de l'harmonie"
          color={C}
          value={m.harmonyVoice}
          options={[["choir_aahs", "Chœur"], ["voice_oohs", "Voix douces"], ["", "Synthèse"]] as const}
          onChange={(v) => { m.setHarmonyVoice(v); bump(); }}
        />
        {m.harmonyStatus() && <span className="text-[11px] text-[var(--jam-text-2)]" aria-live="polite">{m.harmonyStatus()}</span>}
        {m.nextPhrase() && <span className="text-[11px] text-[var(--jam-text-2)]" aria-live="polite">{m.nextPhrase()}</span>}
      </div>
      
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-black/25 p-2">
        <button
          type="button"
          aria-pressed={m.vocoderOn}
          onClick={() => {
            m.setVocoder(!m.vocoderOn);
            bump();
          }}
          className={`h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em] ${
            m.vocoderOn
              ? "bg-[color-mix(in_srgb,_var(--jam-vox)_45%,_#111)] text-white ring-1 ring-inset ring-[var(--jam-vox)]"
              : "bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
          }`}
          title="La voix fait parler un accord de synthé qui suit les accords du morceau"
        >
          VOCODER
        </button>
        <Knob
          label="VOCODER"
          value={m.vocoderLevel}
          min={0}
          max={1.5}
          defaultValue={0.8}
          color={C}
          size={42}
          led
          format={pct}
          onChange={(v) => {
            m.setVocoderLevel(v);
            bump();
          }}
        />
        <span className="text-[10px] text-[var(--jam-text-3)]">
          Accord de 7e du morceau, change à chaque temps
        </span>
      </div>
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-4 gap-2 sm:grid-cols-8" keys={KEY_ROWS.vox} />
      {/* CHOPS: the bars just sung become 8 slices to replay in time (Shift + the same keys) */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-black/25 p-2">
        <button type="button" onClick={() => m.capture()} className="h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em]" style={{ background: `color-mix(in srgb, ${C} 30%, #111)`, color: "#fff", boxShadow: `inset 0 0 0 1px ${C}` }} title="Prend les dernières mesures de la voix et les découpe en 8 morceaux">
          CAPTURER LA VOIX
        </button>
        <JamSeg label="Longueur" color={C} value={String(m.chopBeats)} options={[["2", "2 temps"], ["4", "1 mesure"], ["8", "2 mesures"]] as const} onChange={(v) => { m.set("chopBeats", v === "2" ? 2 : v === "8" ? 8 : 4); bump(); }} />
        <JamSeg label="Jeu" color={C} value={m.chopMode} options={[["slices", "Tranches"], ["melody", "Mélodie"]] as const} onChange={(v) => { m.setChopMode(v); bump(); }} />
        <span className="text-[10px] text-[var(--jam-text-3)]">{m.chop ? `Phrase de ${m.chop.beats} temps prise à ${Math.floor(m.chop.start / 60)}:${String(Math.floor(m.chop.start % 60)).padStart(2, "0")}` : "Aucune phrase capturée"}</span>
      </div>
      <JamPads m={m} list={m.chopPads()} color={C} className="grid grid-cols-8 gap-1.5" keys={KEY_ROWS.vox.map((k) => `maj ${k}`)} />
      <p className="text-[10px] text-[var(--jam-text-3)]">Maintiens un jet : il part en rythme et s&apos;arrête au relâché. CAPTURER prend les dernières mesures chantées : rejoue-les en morceaux, toujours en rythme ; en MÉLODIE, le dernier morceau joué chante sur les 8 notes de la gamme. HARMONIE chante une tierce, une quinte, un accord complet ou en dessous de la voix, dans la tonalité. VOCODER fait parler un accord de synthé avec la voix, même quand le curseur VOIX est baissé.</p>
    </JamShell>
  );
}
