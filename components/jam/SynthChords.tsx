"use client";
import { useState } from "react";
import { JamPads, JamSeg } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";
import { degreeNames } from "@/lib/audio/stemJam";
import type { HarmoSynth } from "@/lib/audio/jamModules";

type ProgressionName = "pop" | "dark" | "house" | "jazz" | "epic" | "dream";

export function SynthChords({ m, C, bump }: { m: HarmoSynth; C: string; bump: () => void }) {
  const [riser, setRiser] = useState(false);
  const names = degreeNames(m.deck());

  return (
    <section className="flex flex-col gap-2" aria-label="Accords du synthé">
      <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--jam-text-2)]">Accords</h4>
      <JamPads m={m} list={m.pads(names)} color={C} className="grid grid-cols-7 gap-1.5" keys={KEY_ROWS.synth} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { m.loopButton(); bump(); }}
          aria-pressed={m.loopState !== "off"}
          className="rounded-md px-3 py-1.5 text-[11px] font-black tracking-[0.15em]"
          style={m.loopState === "off"
            ? { background: "rgba(255,255,255,.06)", color: "var(--jam-text-2)" }
            : { background: m.loopState === "play"
                ? "color-mix(in srgb, var(--jam-synth) 35%, #111)"
                : "color-mix(in srgb, #f43f5e 35%, #111)",
                color: "#fff",
                boxShadow: `inset 0 0 0 1px ${m.loopState === "play" ? C : "#f43f5e"}` }
          }
        >
          {m.loopState === "off" ? "BOUCLE D&apos;ACCORDS" : m.loopState === "armed" ? "PRÊT · MESURE SUIVANTE" : m.loopState === "rec" ? "ENREGISTRE" : "BOUCLE · ARRÊTER"}
        </button>
        <span className="flex gap-1">
          {m.loop.map((deg, b) => (
            <span
              key={b}
              className="flex h-6 w-9 items-center justify-center rounded font-mono text-[10px] font-bold"
              style={{
                background: m.loopBar() === b
                  ? "color-mix(in srgb, var(--jam-synth) 40%, #111)"
                  : "rgba(255,255,255,.05)",
                color: deg >= 0 ? "var(--jam-text)" : "var(--jam-text-3)"
              }}
            >
              {deg >= 0 ? names[deg] : "·"}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <p className="w-full text-center text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">PROGRESSIONS</p>
        {(["pop", "dark", "house", "jazz", "epic", "dream"] as ProgressionName[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => { m.loadProgression(id); bump(); }}
            className="rounded-md px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "color-mix(in srgb, var(--jam-synth) 18%, transparent)", color: "var(--jam-text)" }}
          >
            {["Pop","Sombre","House","Jazz","Épique","Rêve"][["pop","dark","house","jazz","epic","dream"].indexOf(id)]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md h-10 px-4 text-[12px] font-black tracking-[0.15em]"
          style={{
            background: riser
              ? `color-mix(in srgb, ${C} 45%, #111)`
              : `color-mix(in srgb, ${C} 18%, transparent)`,
            color: riser ? "#fff" : "var(--jam-text)",
            boxShadow: riser ? `0 0 12px ${C}` : undefined,
          }}
          aria-pressed={riser}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setRiser(true);
            m.playRiser(true);
            bump();
          }}
          onPointerUp={() => setRiser(false)}
          onPointerCancel={() => setRiser(false)}
        >
          RISER
        </button>
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-bold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--jam-text-2)" }}
          onClick={() => { m.playRiser(false); bump(); }}
        >
          COUPER
        </button>
        <JamSeg
          label="Durée du riser"
          color={C}
          value={String(m.riserBars)}
          options={[["2","2 mes."],["4","4 mes."],["8","8 mes."]] as const}
          onChange={(v) => {
            m.set("riserBars", v === "2" ? 2 : v === "8" ? 8 : 4);
            bump();
          }}
        />
      </div>
      <p className="text-[10px] text-[var(--jam-text-3)]">
        Les accords de la tonalité du morceau : impossible de jouer faux. Sans accord tenu, le synthé suit les accords du morceau, chaque accord placé au plus près du précédent. 7e et 9e ajoutent de la couleur, ÉCHO une répétition à la croche pointée. RISER monte depuis la mesure suivante et retombe pile sur la mesure choisie. LARGEUR élargit le synthé en stéréo.
      </p>
    </section>
  );
}
