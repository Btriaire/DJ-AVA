"use client";
import { Knob } from "../Knob";
import { JamSeg, JamSwap } from "./JamKit";
import type { HarmoSynth } from "@/lib/audio/jamModules";

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function SynthPlay({ m, C, bump }: { m: HarmoSynth; C: string; bump: () => void }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Contrôles de jeu du synthé">
      <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--jam-text-2)]">Jeu</h4>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Jeu" color={C} value={m.mode} options={[["off","Off"],["replay","Reprise"],["arp","Arpège"],["stab","Stabs"],["pad","Nappe"],["comp","Accompagnement"]] as const} onChange={(v) => { m.set("mode", v); bump(); }} />
        {m.mode === "replay" && <JamSeg label="Reprise" color={C} value={m.replayStyle} options={[["chords", "Accords du morceau"], ["notes", "Notes du morceau"]] as const} onChange={(v) => { m.set("replayStyle", v); bump(); }} />}
        <JamSwap m={m} color={C} what="la partie" onChange={bump} />
        {m.mode === "comp" && (
          <JamSeg label="Rythme" color={C} value={m.comp} options={[["charleston","Charleston"],["bossa","Bossa"],["skank","Skank reggae"],["ballad","Ballade"],["pulse","Croches"],["strum","Grattage"]] as const} onChange={(v) => { m.set("comp", v); bump(); }} />
        )}
        <JamSeg label="Forme" color={C} value={m.shape} options={[["up","Montant"],["down","Descendant"],["updown","Aller-retour"],["converge","Convergent"],["pinky","Pinky"],["random","Hasard"],["gate","Gate trance"]] as const} onChange={(v) => { m.set("shape", v); bump(); }} />
        <JamSeg label="Étendue" color={C} value={String(m.arpOctaves)} options={[["1","1 octave"],["2","2 octaves"]] as const} onChange={(v) => { m.set("arpOctaves", v === "2" ? 2 : 1); bump(); }} />
        <JamSeg label="Pas" color={C} value={String(m.rate)} options={[["0.5","1/8"],["0.25","1/16"]] as const} onChange={(v) => { m.set("rate", v === "0.5" ? 0.5 : 0.25); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-2","-2"],["-1","-1"],["0","0"],["1","+1"],["2","+2"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
        <JamSeg label="Couleur" color={C} value={m.color} options={[["triad","Triade"],["seventh","7e"],["ninth","9e"]] as const} onChange={(v) => { m.set("color", v); bump(); }} />
        <JamSeg label="Pompe" color={C} value={m.pumpOn ? "on" : "off"} options={[["off","Off"],["on","Sur les kicks"]] as const} onChange={(v) => { m.set("pumpOn", v === "on"); bump(); }} />
      </div>
      <div className="flex flex-wrap gap-4">
        <Knob label="GATE" value={m.gateLen} min={0.2} max={1} defaultValue={0.9} color={C} size={42} led format={pct} onChange={(v) => { m.set("gateLen", v); bump(); }} />
        <Knob label="HUMAIN" value={m.human} min={0} max={1} defaultValue={0.35} color={C} size={42} led format={pct} onChange={(v) => { m.set("human", v); bump(); }} />
        <Knob label="ORIGINAL" value={m.otherLevel} min={0} max={1.4} defaultValue={1} color={C} size={42} led format={pct} onChange={(v) => { m.setOtherLevel(v); bump(); }} />
      </div>
      <div className="text-[10px] text-[var(--jam-text-3)]">
        Accompagnement : le synth&apos;é ou l&apos;instrument réel joue un rythme d&apos;accompagnement sur les accords du morceau. HUMAIN décale un peu les notes et leur force, comme un musicien.
      </div>
    </section>
  );
}
