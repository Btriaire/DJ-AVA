"use client"

import { useEffect, useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { VocoderNotes } from "@/lib/audio/jamVocoder";
import { vocoderLab, nextVariant } from "@/lib/audio/vocoderLab";
import { VOCODER_VARIANTS } from "@/lib/audio/jamVocoder";
import { Knob } from "../Knob";
import { JamShell, useJamRefresh, JamSwap } from "./JamKit";
import { JamHelp } from "./JamHelp";

const C = "var(--jam-vox)";
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function VocoderPanel({ engine }: { engine: DJEngine }) {
  const m = vocoderLab(engine);
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(m.now()), 300);
    return () => clearInterval(id);
  }, [m]);

  return (
    <JamShell
      title="Vocodeur"
      tag="la voix fait parler un accord du morceau"
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
      <JamHelp>
        Allume le vocodeur : la voix du morceau fait parler un accord de synthé qui suit les accords du morceau. Choisis une variante : elle règle aussi les boutons, que tu peux retoucher ensuite. REMPLACER coupe la voix d&apos;origine pour n&apos;entendre que le vocodeur. Il faut les stems du morceau. Accord suit les accords du morceau, Mélodie chante les notes de la voix, Les deux pose la mélodie sur l&apos;accord.
      </JamHelp>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={m.on}
          onClick={() => {
            m.setOn(!m.on);
            bump();
          }}
          className={`h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em] ${
            m.on
              ? "bg-[color-mix(in_srgb,_var(--jam-vox)_45%,_#111)] text-white ring-1 ring-inset ring-[var(--jam-vox)]"
              : "bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
          }`}
          title="La voix fait parler un accord de synthé qui suit les accords du morceau"
        >
          {m.on ? "VOCODEUR ALLUMÉ" : "ALLUMER"}
        </button>
        <JamSwap m={m} color={C} what="la voix" onChange={bump} />
      </div>
      <div role="group" aria-label="Variante" className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Variante précédente"
          onClick={() => {
            m.setVariant(nextVariant(m.variant, -1));
            bump();
          }}
          className="rounded-md px-2.5 py-1.5 text-[11px] font-black tracking-[0.1em] bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
            <path d="M8 2 4 6l4 4" stroke="currentColor" fill="none" strokeWidth="1.8" />
          </svg>
        </button>
        {VOCODER_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={m.variant === v.id}
            onClick={() => {
              m.setVariant(v.id);
              bump();
            }}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-black tracking-[0.1em] ${
              m.variant === v.id
                ? "bg-[color-mix(in_srgb,_var(--jam-vox)_45%,_#111)] text-white ring-1 ring-inset ring-[var(--jam-vox)]"
                : "bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
            }`}
          >
            {v.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Variante suivante"
          onClick={() => {
            m.setVariant(nextVariant(m.variant, 1));
            bump();
          }}
          className="rounded-md px-2.5 py-1.5 text-[11px] font-black tracking-[0.1em] bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
            <path d="M4 2l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      <p className="text-[11px] text-[var(--jam-text-2)]">{m.variantInfo().hint}</p>
      <div role="group" aria-label="Notes jouées" className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[var(--jam-text-3)]">Notes</span>
        {([["chord", "Accord"], ["melody", "Mélodie"], ["both", "Les deux"]] as [VocoderNotes, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={m.source === id}
            onClick={() => {
              m.setSource(id);
              bump();
            }}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-black tracking-[0.1em] ${
              m.source === id
                ? "bg-[color-mix(in_srgb,_var(--jam-vox)_45%,_#111)] text-white ring-1 ring-inset ring-[var(--jam-vox)]"
                : "bg-[rgba(255,255,255,0.06)] text-[var(--jam-text-2)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {m.on && <p className="text-[12px] text-[var(--jam-text)]">{now ?? "Accord : à la lecture"}</p>}
      <div className="flex flex-wrap justify-around gap-2">
        <Knob
          label="NIVEAU"
          value={m.level}
          min={0}
          max={1.5}
          defaultValue={0.8}
          color={C}
          size={42}
          led
          format={pct}
          onChange={(v) => {
            m.setLevel(v);
            bump();
          }}
        />
        <Knob
          label="TIMBRE"
          value={m.params.formant}
          min={-12}
          max={12}
          defaultValue={0}
          color={C}
          size={42}
          led
          format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} dt`}
          onChange={(v) => {
            m.setParam("formant", v);
            bump();
          }}
        />
        <Knob
          label="SOUFFLE"
          value={m.params.noise}
          min={0}
          max={1}
          defaultValue={0.5}
          color={C}
          size={42}
          led
          format={pct}
          onChange={(v) => {
            m.setParam("noise", v);
            bump();
          }}
        />
        <Knob
          label="RELÂCHE"
          value={m.params.release}
          min={0.01}
          max={0.4}
          defaultValue={0.06}
          color={C}
          size={42}
          led
          format={(v) => `${Math.round(v * 1000)} ms`}
          onChange={(v) => {
            m.setParam("release", v);
            bump();
          }}
        />
        <Knob
          label="LARGEUR"
          value={m.params.spread}
          min={0}
          max={1}
          defaultValue={0.6}
          color={C}
          size={42}
          led
          format={pct}
          onChange={(v) => {
            m.setParam("spread", v);
            bump();
          }}
        />
        <Knob
          label="SEUIL"
          value={m.params.gate}
          min={-80}
          max={-20}
          defaultValue={-55}
          color={C}
          size={42}
          led
          format={(v) => `${Math.round(v)} dB`}
          onChange={(v) => {
            m.setParam("gate", v);
            bump();
          }}
        />
      </div>
    </JamShell>
  );
}
