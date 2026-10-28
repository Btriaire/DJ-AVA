"use client";
import { useEffect, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { Deck } from "@/lib/audio/Deck";
import { DRUM_VOICES } from "@/lib/audio/DrumMachine";
import { RACK_MODULES } from "@/lib/audio/Rack";
import { deleteScene, getScene, listScenes, saveScene } from "@/lib/rhythmScenes";
import type { VelCurve } from "@/lib/audio/rhythmMath";
import { GLOBAL_MODULES, listModulePresets } from "@/lib/modulePresets";
import { RhythmBus, type RhythmRoute, type RhythmSource, type RouteKind } from "@/lib/audio/rhythmBus";
import { SFX_LIST } from "@/lib/audio/SoundFX";
import { FX_META, type FxName } from "@/lib/audio/fxTypes";
import { PresetPicker, RouteCard, SOURCE_STYLE } from "./RhythmCards";
import { HSlider, Segmented, ToggleSwitch } from "./RhythmSlider";
import { PatchCable, SourcePads, TargetTiles } from "./RhythmPatch";
import { RECIPES, scaleRecipe, type Intensity } from "@/lib/rhythmRecipes";

// Liaisons: the rhythm detected in a song (drum attacks, bass notes, synth notes) is never played, but it can drive
// the modules: the DJ synth in harmony, a drum voice, a pulse on a rack parameter.
type Side = "A" | "B";
const KEY = "djsynth.rhythm.v1";
const SOURCES: { id: RhythmSource; label: string }[] = [{ id: "drums", label: "Batterie" }, { id: "kick", label: "Grosse caisse" }, { id: "snare", label: "Caisse claire" }, { id: "hat", label: "Charleston" }, { id: "bass", label: "Basse" }, { id: "synth", label: "Autre (synthé, piano…)" }, { id: "voice", label: "Voix chantée" }, { id: "beat", label: "Chaque temps" }, { id: "bar", label: "Chaque mesure" }, { id: "phrase8", label: "Chaque phrase (8 mesures)" }, { id: "phrase16", label: "Toutes les 16 mesures" }];
const KINDS: { id: RouteKind; label: string }[] = [{ id: "stemduck", label: "Pompe sur un stem du morceau" }, { id: "stemfilter", label: "Filtre d'un stem (pulse)" }, { id: "stemsend", label: "Jet de reverb ou d'écho sur un stem" }, { id: "stemfx", label: "Effet DJ sur un stem (reverse, roll…)" }, { id: "synth", label: "Synthé DJ (en harmonie)" }, { id: "drum", label: "Boîte à rythmes" }, { id: "rack", label: "Pulse sur un effet du rack" }, { id: "rackpreset", label: "Préréglage d'un module du rack" }, { id: "synth2", label: "Synthé (module Global, 1er)" }, { id: "sampler", label: "Super-Sampler (en harmonie)" }, { id: "pad", label: "Pad du sampler" }, { id: "seqrec", label: "Séquenceur synthé (écriture)" }, { id: "duck", label: "Pompe du volume (sidechain)" }, { id: "filter", label: "Filtre d'un deck (pulse)" }, { id: "sfx", label: "Effet sonore (riser, impact…)" }, { id: "djknob", label: "Bouton du synthé DJ (pulse)" }, { id: "plugin", label: "DX7 (module ouvert)" }, { id: "voices", label: "Nappes : chœur, cordes, synthé planant" }, { id: "keypad", label: "DJ Keys : touche" }, { id: "keyfx", label: "DJ Keys : effet (impact, frein…)" }];
const TARGET_GROUPS: { title: string; kinds: RouteKind[] }[] = [
  { title: "Le morceau : ses stems", kinds: ["stemduck", "stemfilter", "stemsend", "stemfx"] },
  { title: "Notes", kinds: ["synth", "synth2", "sampler", "plugin", "voices", "seqrec"] },
  { title: "Rythme", kinds: ["drum", "pad", "keypad", "keyfx", "sfx"] },
  { title: "Effets", kinds: ["rack", "rackpreset", "filter", "duck", "djknob"] },
];
const PRESETS: { label: string; route: Omit<RhythmRoute, "id" | "on"> }[] = [
  { label: "Basse → Synthé DJ", route: { source: "bass", kind: "synth", amount: 0.7 } },
  { label: "Autre → Synthé DJ", route: { source: "synth", kind: "synth", amount: 0.5 } },
  { label: "Batterie → Synthé sur la tonique", route: { source: "drums", kind: "synth", amount: 0.5 } },
  { label: "Basse → Séquenceur synthé", route: { source: "bass", kind: "seqrec", amount: 0.8 } },
  { label: "Autre → Super-Sampler", route: { source: "synth", kind: "sampler", amount: 0.6 } },
  { label: "Grosse caisse → Pompe du volume", route: { source: "kick", kind: "duck", arg: "self", amount: 0.6 } },
  { label: "Grosse caisse → Impact de DJ Keys", route: { source: "kick", kind: "keyfx", arg: "impact", amount: 0.7 } },
  { label: "Caisse claire → Super-Sampler", route: { source: "snare", kind: "sampler", amount: 0.7 } },
  { label: "Caisse claire → Filtre passe-bas", route: { source: "snare", kind: "filter", arg: "self:lp", amount: 0.6 } },
  { label: "Charleston → DJ Keys (touche 4)", route: { source: "hat", kind: "keypad", arg: "3", amount: 0.6 } },
  { label: "Voix → Chœur", route: { source: "voice", kind: "voices", arg: "choir", amount: 0.8 } },
  { label: "Voix → Cordes", route: { source: "voice", kind: "voices", arg: "strings", amount: 0.8 } },
  { label: "Voix → Synthé planant", route: { source: "voice", kind: "voices", arg: "dream", amount: 0.8 } },
  { label: "Basse → Synthé planant", route: { source: "bass", kind: "voices", arg: "dream", amount: 0.7 } },
  { label: "Voix → Synthé DJ", route: { source: "voice", kind: "synth", amount: 0.9, transpose: -12 } },
  { label: "Temps → Pompe du volume", route: { source: "beat", kind: "duck", arg: "self", amount: 0.35 } },
  { label: "Batterie → Pompe de l'autre deck", route: { source: "drums", kind: "duck", arg: "other", amount: 0.4 } },
  { label: "Batterie → Filtre passe-bas", route: { source: "drums", kind: "filter", arg: "self:lp", amount: 0.5 } },
  { label: "Mesure → Impact", route: { source: "bar", kind: "sfx", arg: "impact", amount: 0.7 } },
  { label: "Basse → Ouverture du synthé", route: { source: "bass", kind: "djknob", arg: "cutoff", amount: 0.6 } },
  { label: "Basse → Super-Sampler", route: { source: "bass", kind: "sampler", amount: 0.7 } },
  { label: "Voix → Super-Sampler", route: { source: "voice", kind: "sampler", amount: 0.8 } },
  { label: "Temps → DJ Keys (touche 2)", route: { source: "beat", kind: "keypad", arg: "1", amount: 0.7 } },
  { label: "Basse → DJ Keys (touche 3)", route: { source: "bass", kind: "keypad", arg: "2", amount: 0.7 } },
  { label: "Batterie → Touches de DJ Keys", route: { source: "drums", kind: "keypad", arg: "0", amount: 0.7 } },
  { label: "Mesure → Impact de DJ Keys", route: { source: "bar", kind: "keyfx", arg: "impact", amount: 0.7 } },
  { label: "Basse → DX7", route: { source: "bass", kind: "plugin", arg: "dx7", amount: 0.7 } },
  { label: "Basse → Synthé DJ en swing", route: { source: "bass", kind: "synth", amount: 0.7, grid: 2, swing: 0.3 } },
  { label: "Temps → Pompe 4/4", route: { source: "beat", kind: "duck", arg: "self", amount: 0.4, grid: 1, pattern: "xxxx" } },
  { label: "Autre → Synthé DJ, hors voix", route: { source: "synth", kind: "synth", amount: 0.5, avoidVoice: true, snapKey: true } },
  { label: "Batterie → Clap", route: { source: "drums", kind: "drum", arg: "clap", amount: 0.6 } },
];

// the stems a link can act on (names of htdemucs), and the DJ effects of a stem that read well when fired on a hit
export const STEMS = [{ id: "drums", label: "Batterie" }, { id: "bass", label: "Basse" }, { id: "other", label: "Autre" }, { id: "vocals", label: "Voix" }];
const STEM_FX_PICK: FxName[] = ["reverse", "roll", "echo", "echoout", "brake", "gate", "dub", "flanger", "wash", "freeze", "halftime"];
const stemLabel = (n?: string) => STEMS.find((x) => x.id === n)?.label ?? n ?? "";
const NAPPES = [{ id: "choir", label: "Chœur" }, { id: "strings", label: "Cordes" }, { id: "dream", label: "Synthé planant" }];
const KEYFX = [{ id: "impact", label: "Impact" }, { id: "brake", label: "Frein 1 temps" }, { id: "scratch", label: "Scratch" }, { id: "drop", label: "Drop" }];
const KNOBS = [{ id: "cutoff", label: "Filtre" }, { id: "reso", label: "Résonance" }, { id: "drive", label: "Saturation" }, { id: "wobble", label: "Wobble" }, { id: "env", label: "Enveloppe" }];
const targetLabel = (r: RhythmRoute) => {
  const k = KINDS.find((x) => x.id === r.kind)?.label ?? r.kind;
  if (r.kind === "stemduck") return `Pompe · ${stemLabel(r.arg)}`;
  if (r.kind === "stemfilter") { const [n, f] = (r.arg ?? "").split(":"); return `${f === "lp" ? "Passe-bas" : "Passe-haut"} · ${stemLabel(n)}`; }
  if (r.kind === "stemsend") { const [n, f] = (r.arg ?? "").split(":"); return `${f === "delay" ? "Jet d'écho" : "Jet de reverb"} · ${stemLabel(n)}`; }
  if (r.kind === "stemfx") { const [n, f] = (r.arg ?? "").split(":"); return `${FX_META.get(f as FxName)?.label ?? f} · ${stemLabel(n)}`; }
  if (r.kind === "voices") return NAPPES.find((x) => x.id === r.arg)?.label ?? "Chœur";
  if (r.kind === "plugin") return r.arg === "dx7" ? "DX7" : String(r.arg);
  if (r.kind === "keypad") return `DJ Keys touche ${Number(r.arg) + 1}`;
  if (r.kind === "keyfx") return `DJ Keys · ${KEYFX.find((x) => x.id === r.arg)?.label ?? r.arg}`;
  if (r.kind === "pad") return `Pad ${Number(r.arg) + 1}`;
  if (r.kind === "drum") return `Voix ${r.arg}`;
  if (r.kind === "rackpreset") return `${(r.arg ?? "").replace(":", " · ")}${r.hold ? " (hold)" : ""}${r.alt ? ` / ${r.alt}` : ""}`;
  if (r.kind === "rack") return `Pulse ${r.arg?.replace(":", " · ")}`;
  if (r.kind === "sfx") return SFX_LIST.find((f) => f.id === r.arg)?.label ?? k;
  if (r.kind === "djknob") return `Synthé · ${KNOBS.find((x) => x.id === r.arg)?.label ?? r.arg}`;
  if (r.kind === "duck") return r.arg === "other" ? "Pompe de l'autre deck" : "Pompe du volume";
  if (r.kind === "filter") return (r.arg ?? "").replace("self", "Filtre").replace("other", "Filtre autre").replace(":lp", " passe-bas").replace(":hp", " passe-haut");
  return k.replace(/ \(.*\)/, "");
};

// the shortcuts grouped by what drives them
const PRESET_GROUPS = (() => {
  const order: { title: string; sources: RhythmSource[] }[] = [
    { title: "Batterie", sources: ["drums", "kick", "snare", "hat"] },
    { title: "Basse", sources: ["bass"] },
    { title: "Synthé et voix", sources: ["synth", "voice"] },
    { title: "Temps, mesures et phrases", sources: ["beat", "bar", "phrase8", "phrase16"] },
  ];
  return order.map((o) => ({ title: o.title, items: PRESETS.filter((p) => o.sources.includes(p.route.source)) })).filter((g) => g.items.length);
})();

let seq = 0;
const newId = () => `r${Date.now()}-${seq++}`;
const buses = new WeakMap<Deck, RhythmBus>();
const busFor = (engine: DJEngine, d: Deck) => {
  let b = buses.get(d);
  if (!b) { b = new RhythmBus(engine, d); buses.set(d, b); }
  return b;
};
const load = (): Record<Side, RhythmRoute[]> => {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<Side, unknown>>;
    const ok = (a: unknown): RhythmRoute[] => (Array.isArray(a) ? a.filter((r) => r && typeof r.id === "string" && typeof r.amount === "number" && SOURCES.some((s) => s.id === r.source) && KINDS.some((k) => k.id === r.kind)) : []);
    return { A: ok(j.A), B: ok(j.B) };
  } catch { return { A: [], B: [] }; }
};
let saveTimer: number | undefined;
// a fader drag calls this on every pointer move: write once, 250 ms after the last change
const save = (r: Record<Side, RhythmRoute[]>) => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private window */ } }, 250);
};

const MASTER_KEY = "djsynth.rhythm.master";
const loadMaster = () => { try { return localStorage.getItem(MASTER_KEY) !== "0"; } catch { return true; } };

// always mounted (app/page.tsx): the links keep playing whether or not the DJ synth panel is open
export function RhythmRunner({ engine }: { engine: DJEngine }) {
  useEffect(() => {
    const saved = load();
    busFor(engine, engine.deckA).routes = saved.A;
    busFor(engine, engine.deckB).routes = saved.B;
    const id = window.setInterval(() => {
      const on = loadMaster();
      for (const s of ["A", "B"] as const) {
        const d = s === "A" ? engine.deckA : engine.deckB;
        const b = busFor(engine, d);
        b.enabled = on;
        if (b.stale) { b.load(d.stemNotes); b.start(); } // a new track replaces the events even without passing through null
        // a stem effect fired by a link (reverse, roll...) needs the past of that stem: its rack listens before the first hit
        if (d.stemsActive) for (const r of b.routes) if (r.on && r.kind === "stemfx" && r.arg) d.stemFxRack(d.stemIndex(r.arg.split(":")[0]))?.warm();
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [engine]);
  return null;
}

export function FineSettings({ r, patch, measure }: { r: RhythmRoute; patch: (p: Partial<RhythmRoute>) => void; measure?: () => number | undefined }) {
  const isNoteKind = ["synth", "synth2", "sampler", "seqrec", "plugin", "voices"].includes(r.kind);

  const steps = Math.min(16, (r.grid ?? 1) * 4);
  const current = (r.pattern || 'x'.repeat(steps)).padEnd(steps, 'x').slice(0, steps);
  const handlePatternToggle = (index: number) => {
    patch({ pattern: current.split('').map((c, i) => (i === index ? (c === 'x' ? '.' : 'x') : c)).join('') });
  };

  const color = SOURCE_STYLE[r.source].glow;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const ms = (v: number) => `${v > 0 ? "+" : ""}${v} ms`;
  const beats = (b: number) => `${b}`;
  const box = "flex flex-col gap-2 rounded-lg border border-neutral-700 bg-black/30 p-2";
  const title = "text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500";
  const selCls = "min-h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-100";

  // the pattern: a row of step pads, lit when the step plays
  const patternEditor = r.grid ? (
    <div className={box}>
      <span className={title}>Motif</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: steps }).map((_, i) => {
          const on = current[i] === "x";
          return (
            <button
              key={i} type="button" aria-pressed={on} aria-label={`Pas ${i + 1}`}
              className={`h-9 min-w-9 flex-1 rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${on ? "border-transparent text-neutral-950" : "border-neutral-700 bg-neutral-900 text-neutral-600"} ${i % 4 === 0 ? "ring-1 ring-white/10" : ""}`}
              style={on ? { background: color, boxShadow: `0 0 8px ${color}` } : undefined}
              onClick={() => handlePatternToggle(i)}
            >
              <span className="text-[10px] font-bold">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="min-h-9 self-start rounded-md border border-neutral-700 px-3 text-[11px] text-neutral-300 hover:bg-neutral-800" onClick={() => patch({ pattern: undefined })}>Motif libre</button>
    </div>
  ) : null;

  const presets = r.kind === "rackpreset" ? listModulePresets((r.arg ?? "").split(":")[0]) : [];

  return (
    <details className="w-full text-neutral-200">
      <summary className="min-h-9 cursor-pointer text-xs font-bold">Réglages fins</summary>
      <div className="mt-1 flex flex-col gap-2 text-[11px] text-neutral-400">
        <div className={box}>
          <span className={title}>Dynamique</span>
          <Segmented
            label="Courbe de vélocité" color={color} value={r.curve ?? "lin"}
            options={[{ value: "soft", label: "Douce" }, { value: "lin", label: "Linéaire" }, { value: "hard", label: "Dure" }]}
            onChange={(v) => patch({ curve: v === "lin" ? undefined : (v as VelCurve) })}
          />
          <HSlider label="Probabilité" min={0.1} max={1} step={0.05} value={r.prob ?? 1} reset={1} ticks={9} color={color} format={pct} onChange={(v) => patch({ prob: v })} />
          <ToggleSwitch label="Accents sur le premier temps" color={color} checked={r.accent ?? false} onChange={(v) => patch({ accent: v })} />
        </div>

        <div className={box}>
          <span className={title}>Placement</span>
          {(r.grid ?? 0) >= 2 && (
            <>
              <HSlider label="Swing" min={0} max={0.6} step={0.05} value={r.swing ?? 0} reset={0} ticks={12} color={color} format={pct} onChange={(v) => patch({ swing: v })} />
              {measure && (
                <button type="button" className="min-h-9 self-start rounded-md border border-neutral-700 px-3 text-[11px] text-neutral-300 hover:bg-neutral-800" onClick={() => { const v = measure(); if (v !== undefined) patch({ swing: v }); }}>
                  Mesurer sur le morceau
                </button>
              )}
            </>
          )}
          <HSlider label="Humaniser" min={0} max={30} step={1} value={r.humanize ?? 0} reset={0} ticks={6} color={color} format={(v) => `${v} ms`} onChange={(v) => patch({ humanize: v })} />
          <HSlider label="Décalage" min={-60} max={60} step={5} value={r.nudge ?? 0} reset={0} ticks={12} color={color} format={ms} onChange={(v) => patch({ nudge: v })} />
        </div>

        {patternEditor}

        {r.kind === "stemduck" && (
          <div className={box}>
            <span className={title}>Pompe du stem</span>
            <HSlider label="Profondeur" min={0.1} max={1} step={0.05} value={r.depth ?? 0.7} reset={0.7} ticks={9} color={color} format={pct} onChange={(v) => patch({ depth: v })} />
            <Segmented label="Retour (temps)" color={color} value={r.len ?? 0.55} options={[0.25, 0.55, 1, 2].map((b) => ({ value: b, label: b === 0.55 ? "1/2" : b === 0.25 ? "1/4" : String(b) }))} onChange={(v) => patch({ len: v })} />
          </div>
        )}
        {(r.kind === "stemsend" || r.kind === "stemfx") && (
          <div className={box}>
            <span className={title}>{r.kind === "stemfx" ? "Durée de l'effet" : "Durée du jet"}</span>
            <Segmented label="Temps" color={color} value={r.len ?? 1} options={[0.5, 1, 2, 4].map((b) => ({ value: b, label: String(b) }))} onChange={(v) => patch({ len: v })} />
          </div>
        )}
        {r.kind === "rackpreset" && (
          <div className={box}>
            <span className={title}>Préréglage du module</span>
            <ToggleSwitch label="Hold" hint="Reste tant que la liaison est active" color={color} checked={!!r.hold} onChange={(v) => patch({ hold: v })} />
            {!r.hold && (
              <Segmented label="Retour après (temps)" color={color} value={r.len ?? 1} options={[0.5, 1, 2, 4, 8].map((b) => ({ value: b, label: beats(b) }))} onChange={(v) => patch({ len: v })} />
            )}
            <Segmented label="Glissement (temps)" color={color} value={r.morph ?? 0} options={[{ value: 0, label: "Non" }, ...[1, 2, 4, 8, 16].map((b) => ({ value: b, label: beats(b) }))]} onChange={(v) => patch({ morph: v || undefined })} />
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">Alterner avec</span>
              <select aria-label="Alterner avec" className={selCls} value={r.alt ?? ""} onChange={(e) => patch({ alt: e.target.value || undefined })}>
                <option value="">Pas d&apos;alternance</option>
                {presets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </label>
          </div>
        )}

        <div className={box}>
          <span className={title}>Voix et tonalité</span>
          <ToggleSwitch label="Se taire quand la voix chante" color={color} checked={r.avoidVoice ?? false} onChange={(v) => patch({ avoidVoice: v, onlyVoice: v ? false : r.onlyVoice })} />
          <ToggleSwitch label="Jouer seulement quand la voix chante" color={color} checked={r.onlyVoice ?? false} onChange={(v) => patch({ onlyVoice: v, avoidVoice: v ? false : r.avoidVoice })} />
          {isNoteKind && <ToggleSwitch label="Caler sur la tonalité du synthé" color={color} checked={r.snapKey ?? false} onChange={(v) => patch({ snapKey: v })} />}
        </div>
      </div>
    </details>
  );
}

export function RhythmLinks({ engine }: { engine: DJEngine }) {
  const [routes, setRoutes] = useState<Record<Side, RhythmRoute[]>>({ A: [], B: [] });
  const [, tick] = useState(0);
  const [master, setMaster] = useState(true);
  const [recipe, setRecipe] = useState(RECIPES[0].id);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [draft, setDraft] = useState<Omit<RhythmRoute, "id" | "on">>({ source: "bass", kind: "synth", amount: 0.7 });

  useEffect(() => {
    const saved = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- routes live in localStorage, read once after hydration
    setRoutes(saved);
    setMaster(loadMaster());
    const id = window.setInterval(() => tick((n) => n + 1), 800);
    return () => window.clearInterval(id);
  }, [engine]);

  const toggleMaster = () => {
    const next = !master;
    setMaster(next);
    try { localStorage.setItem(MASTER_KEY, next ? "1" : "0"); } catch { /* private window */ }
    busFor(engine, engine.deckA).enabled = next;
    busFor(engine, engine.deckB).enabled = next;
  };

  const apply = (side: Side, next: RhythmRoute[]) => {
    const all = { ...routes, [side]: next };
    setRoutes(all);
    save(all);
    const d = side === "A" ? engine.deckA : engine.deckB;
    const b = busFor(engine, d);
    b.routes = next;
    b.start();
  };
  const add = (side: Side, r: Omit<RhythmRoute, "id" | "on">) => apply(side, [...routes[side], { ...r, id: newId(), on: true }]);
  const patch = (side: Side, id: string, p: Partial<RhythmRoute>) => apply(side, routes[side].map((r) => (r.id === id ? { ...r, ...p } : r)));

  const presetArg = (mod: string) => `${mod}:${listModulePresets(mod)[0] ?? ""}`;
  const rackParams = (mod: string) => RACK_MODULES.find((m) => m.id === mod)?.params ?? [];
  const sel = "min-h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100";
  const lcdSel = "min-h-9 rounded-md border border-neutral-700 bg-black/70 px-2 font-mono text-[11px] text-neutral-100";
  const draftColor = SOURCE_STYLE[draft.source].glow;
  // what a target needs first when it is picked
  const defaultArg = (k: RouteKind): string | undefined =>
    k === "stemduck" ? "bass" : k === "stemfilter" ? "other:hp" : k === "stemsend" ? "vocals:reverb" : k === "stemfx" ? "other:reverse" : k === "drum" ? "kick" : k === "pad" ? "0" : k === "plugin" ? "dx7" : k === "voices" ? "choir" : k === "keypad" ? "0" : k === "keyfx" ? "impact" : k === "duck" ? "self"
    : k === "filter" ? "self:lp" : k === "sfx" ? "impact" : k === "djknob" ? "cutoff" : k === "rackpreset" ? presetArg("reverb") : k === "rack" ? "isolator:" + (rackParams("isolator")[0]?.key ?? "") : undefined;

  return (
    <section className="prep rounded-xl border border-neutral-800 bg-neutral-950/60 p-3" aria-label="Liaisons rythmiques">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-200">Liaisons rythmiques</h3>
        <button
          type="button"
          role="switch"
          aria-checked={master}
          onClick={toggleMaster}
          className={`min-h-9 rounded-full border px-4 text-xs font-bold ${master ? "border-emerald-400 bg-emerald-400/20 text-emerald-200" : "border-neutral-600 bg-neutral-800 text-neutral-400"}`}
        >
          {master ? "Liaisons ACTIVES" : "Liaisons COUPÉES"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">Les notes détectées ne sont pas jouées : elles pilotent les modules que vous connectez.</p>
      <div className="mt-3">
        <PresetPicker
          groups={PRESET_GROUPS.map((g) => ({ title: g.title, items: g.items.map((p) => ({ label: p.label })) }))}
          onPick={(g, i, side) => add(side, PRESET_GROUPS[g].items[i].route)}
        />
      </div>
      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-neutral-700 bg-black/30 p-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Recettes · le morceau transformé</span>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {RECIPES.map((rc) => (
            <button
              key={rc.id} type="button" aria-pressed={recipe === rc.id} onClick={() => setRecipe(rc.id)}
              className={`min-h-11 rounded-md border px-2 text-[11px] font-bold focus-visible:ring-2 focus-visible:ring-white/60 ${recipe === rc.id ? "border-emerald-400 bg-emerald-400/15 text-neutral-50" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"}`}
            >
              {rc.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400">{RECIPES.find((x) => x.id === recipe)?.hint} Il faut les stems du deck.</p>
        <Segmented label="Intensité" color="oklch(78% 0.17 150)" value={intensity} options={[{ value: "light", label: "Léger" }, { value: "medium", label: "Moyen" }, { value: "strong", label: "Fort" }]} onChange={(v) => setIntensity(v as Intensity)} />
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as const).map((side) => {
            const rc = RECIPES.find((x) => x.id === recipe)!;
            const has = routes[side].some((x) => x.recipe === rc.id);
            return (
              <div key={side} className="flex flex-col gap-1">
                <button
                  type="button"
                  // a recipe already on the deck is replaced: picking another intensity and pressing again updates it
                  onClick={() => apply(side, [...routes[side].filter((x) => x.recipe !== rc.id), ...scaleRecipe(rc, intensity, rc.id).map((r) => ({ ...r, id: newId(), on: true }))])}
                  className="min-h-11 rounded-md border border-neutral-600 bg-neutral-800 text-xs font-black uppercase tracking-wider text-neutral-100 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {has ? `Mettre à jour · deck ${side}` : `Ajouter au deck ${side}`}
                </button>
                {has && (
                  <button type="button" onClick={() => apply(side, routes[side].filter((x) => x.recipe !== rc.id))} className="min-h-9 rounded-md border border-neutral-700 text-[11px] text-neutral-400 hover:bg-neutral-800">
                    Retirer du deck {side}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const d = side === "A" ? engine.deckA : engine.deckB;
          const n = d.stemNotes;
          return (
            <div key={side} className="flex min-w-0 flex-col gap-2 rounded-lg border border-neutral-800 p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <b className="text-neutral-100">Deck {side}</b>
                <span className="flex shrink-0 gap-1">
                  <select
                    aria-label={`Scènes du deck ${side}`}
                    className="min-h-9 max-w-[110px] rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-200"
                    value=""
                    onChange={(e) => { const sc = e.target.value ? getScene(e.target.value, newId) : undefined; if (sc) apply(side, sc); }}
                  >
                    <option value="">Scènes…</option>
                    {listScenes().map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button
                    type="button"
                    className="min-h-9 rounded-md border border-neutral-700 px-2 text-[11px] text-neutral-300 hover:bg-neutral-800"
                    onClick={() => { const name = window.prompt("Nom de la scène ?"); if (name) { saveScene(name, routes[side]); tick((n) => n + 1); } }}
                  >
                    Enregistrer
                  </button>
                  <select
                    aria-label="Supprimer une scène"
                    className="min-h-9 max-w-[80px] rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-500"
                    value=""
                    onChange={(e) => { if (e.target.value && window.confirm(`Supprimer la scène « ${e.target.value} » ?`)) { deleteScene(e.target.value); tick((n) => n + 1); } }}
                  >
                    <option value="">Suppr…</option>
                    {listScenes().map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </span>
                {routes[side].length > 0 && (
                  <>
                    <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300" title="Liaisons actives sur ce deck">{routes[side].filter((x) => x.on).length}/{routes[side].length}</span>
                    <button
                      type="button"
                      className="min-h-9 shrink-0 rounded-md border border-neutral-700 px-2 text-[11px] text-neutral-300 hover:bg-neutral-800"
                      onClick={() => { const allOn = routes[side].every((x) => x.on); apply(side, routes[side].map((x) => ({ ...x, on: !allOn }))); }}
                    >
                      {routes[side].every((x) => x.on) ? "Tout couper" : "Tout réactiver"}
                    </button>
                  </>
                )}
                {routes[side].some((x) => x.kind.startsWith("stem")) && !d.stemsActive && (
                  <span className="truncate rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200" title="Les liaisons sur stems n'agissent que quand le deck joue ses stems séparés">Activez les stems du deck</span>
                )}
                {n ? (
                  <span className="truncate text-neutral-400">{`${n.drums?.length ?? 0} attaques · ${n.bass?.length ?? 0} basses · ${n.other?.length ?? 0} autres`}</span>
                ) : (
                  <span className="truncate rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
                    {d.stemReady ? "Notes en cours d'analyse…" : "Préparez les stems du morceau"}
                  </span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
              {routes[side].map((r) => (
                <RouteCard
                  key={r.id}
                  r={r}
                  sourceLabel={SOURCES.find((x) => x.id === r.source)?.label ?? r.source}
                  targetLabel={targetLabel(r)}
                  readFire={() => busFor(engine, d).lastFire.get(r.id)}
                  onToggle={() => patch(side, r.id, { on: !r.on })}
                  onAmount={(v) => patch(side, r.id, { amount: v })}
                  onLevel={(v) => patch(side, r.id, { level: v })}
                  onRemove={() => apply(side, routes[side].filter((x) => x.id !== r.id))}
                  onDuplicate={() => apply(side, routes[side].flatMap((x) => (x.id === r.id ? [x, { ...r, id: newId() }] : [x])))}
                  onCopyOther={() => apply(side === "A" ? "B" : "A", [...routes[side === "A" ? "B" : "A"], { ...r, id: newId() }])}
                  otherLabel={side === "A" ? "B" : "A"}
                >
                  <div className="flex flex-col gap-2 rounded-lg border border-neutral-700 bg-black/30 p-2 text-xs">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Jeu</span>
                    <Segmented
                      label="Grille" color={SOURCE_STYLE[r.source].glow} value={r.grid ?? 0}
                      options={[{ value: 0, label: "Libre" }, { value: 1, label: "Temps" }, { value: 2, label: "1/8" }, { value: 4, label: "1/16" }]}
                      onChange={(v) => patch(side, r.id, { grid: v || undefined })}
                    />
                    {["synth", "synth2", "sampler", "seqrec", "plugin", "voices"].includes(r.kind) && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400">Transposition</span>
                        <select aria-label="Transposition" value={r.transpose ?? 0} onChange={(e) => patch(side, r.id, { transpose: Number(e.target.value) || undefined })} className="min-h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-100">
                          {[-24, -12, -7, -5, 0, 5, 7, 12, 24].map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n} demi-tons</option>)}
                        </select>
                      </label>
                    )}
                    <HSlider label="Durée des notes" min={0.25} max={2} step={0.25} value={r.gate ?? 1} reset={1} ticks={7} color={SOURCE_STYLE[r.source].glow} format={(v) => `x${v}`} onChange={(v) => patch(side, r.id, { gate: v })} />
                    <HSlider label="Densité" min={0.1} max={1} step={0.1} value={r.density ?? 1} reset={1} ticks={9} color={SOURCE_STYLE[r.source].glow} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => patch(side, r.id, { density: v })} />
                  </div>
                  <FineSettings r={r} patch={(p) => patch(side, r.id, p)} measure={() => busFor(engine, d).measuredSwing()} />
                </RouteCard>
              ))}
              </div>
              {!routes[side].length && <p className="text-[11px] text-neutral-500">Aucune liaison. Utilisez « Nouvelle liaison » ci-dessus.</p>}
            </div>
          );
        })}
      </div>
      <details className="mt-3 rounded-lg border border-neutral-700 bg-black/30">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-black uppercase tracking-[0.18em] text-neutral-200">
          <span className="h-2 w-2 rounded-full" style={{ background: draftColor, boxShadow: `0 0 6px ${draftColor}` }} aria-hidden="true" />
          Composer une liaison
        </summary>
        <div className="flex flex-col gap-3 border-t border-neutral-800 p-3">
          <div className="rounded-md border border-neutral-700 bg-black/70 px-3 py-2 font-mono text-[12px]" style={{ color: draftColor, textShadow: `0 0 6px ${draftColor}` }} aria-live="polite">
            {SOURCES.find((x) => x.id === draft.source)?.label ?? draft.source} <span aria-hidden="true">→</span> {targetLabel({ ...draft, id: "", on: true })}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1.4fr)]">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Entrée · ce qui joue dans le morceau</span>
              <SourcePads sources={SOURCES} value={draft.source} onChange={(src) => setDraft({ ...draft, source: src })} />
            </div>
            <div className="hidden items-center md:flex"><PatchCable color={draftColor} /></div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Sortie · l&apos;appareil piloté</span>
              <TargetTiles
                groups={TARGET_GROUPS} color={draftColor} value={draft.kind}
                label={(k) => KINDS.find((x) => x.id === k)?.label ?? k}
                onChange={(k) => setDraft({ ...draft, kind: k, arg: defaultArg(k) })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-neutral-700 bg-black/40 p-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Réglage de la sortie</span>
            <div className="flex flex-wrap items-center gap-2">
          {["stemduck", "stemfilter", "stemsend", "stemfx"].includes(draft.kind) && (
            <select aria-label="Stem" className={lcdSel} value={(draft.arg ?? "").split(":")[0]} onChange={(e) => { const rest = (draft.arg ?? "").split(":")[1]; setDraft({ ...draft, arg: rest ? `${e.target.value}:${rest}` : e.target.value }); }}>
              {STEMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          )}
          {draft.kind === "stemfilter" && (
            <select aria-label="Filtre du stem" className={lcdSel} value={(draft.arg ?? "").split(":")[1]} onChange={(e) => setDraft({ ...draft, arg: `${(draft.arg ?? "").split(":")[0]}:${e.target.value}` })}>
              <option value="hp">Passe-haut</option><option value="lp">Passe-bas</option>
            </select>
          )}
          {draft.kind === "stemsend" && (
            <select aria-label="Envoi" className={lcdSel} value={(draft.arg ?? "").split(":")[1]} onChange={(e) => setDraft({ ...draft, arg: `${(draft.arg ?? "").split(":")[0]}:${e.target.value}` })}>
              <option value="reverb">Reverb</option><option value="delay">Écho</option>
            </select>
          )}
          {draft.kind === "stemfx" && (
            <select aria-label="Effet du stem" className={lcdSel} value={(draft.arg ?? "").split(":")[1]} onChange={(e) => setDraft({ ...draft, arg: `${(draft.arg ?? "").split(":")[0]}:${e.target.value}` })}>
              {STEM_FX_PICK.map((f) => <option key={f} value={f}>{FX_META.get(f)?.label ?? f}</option>)}
            </select>
          )}
          {draft.kind === "drum" && (
            <select aria-label="Voix" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {DRUM_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          )}
          {draft.kind === "keypad" && (
            <select aria-label="Touche" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {Array.from({ length: 16 }, (_, i) => <option key={i} value={String(i)}>Touche {i + 1}</option>)}
            </select>
          )}
          {draft.kind === "voices" && (
            <select aria-label="Nappe" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {NAPPES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          {draft.kind === "keyfx" && (
            <select aria-label="Effet du keyboard" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {KEYFX.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          {draft.kind === "duck" && (
            <select aria-label="Deck" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              <option value="self">Ce deck</option><option value="other">L&apos;autre deck</option>
            </select>
          )}
          {draft.kind === "filter" && (
            <select aria-label="Filtre" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              <option value="self:lp">Passe-bas, ce deck</option><option value="self:hp">Passe-haut, ce deck</option>
              <option value="other:lp">Passe-bas, autre deck</option><option value="other:hp">Passe-haut, autre deck</option>
            </select>
          )}
          {draft.kind === "sfx" && (
            <select aria-label="Effet" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {SFX_LIST.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          {draft.kind === "djknob" && (
            <select aria-label="Bouton" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {KNOBS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          {draft.kind === "pad" && (
            <select aria-label="Pad" className={lcdSel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {Array.from({ length: engine.sampler.pads.length }, (_, i) => <option key={i} value={String(i)}>Pad {i + 1}</option>)}
            </select>
          )}
          {draft.kind === "rackpreset" && (
            <>
              <select aria-label="Module" className={lcdSel} value={draft.arg?.split(":")[0]} onChange={(e) => setDraft({ ...draft, arg: presetArg(e.target.value) })}>
                {GLOBAL_MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {RACK_MODULES.filter((m) => m.id !== "eq").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select aria-label="Préréglage" className={lcdSel} value={draft.arg?.slice((draft.arg?.indexOf(":") ?? 0) + 1)} onChange={(e) => setDraft({ ...draft, arg: `${draft.arg?.split(":")[0]}:${e.target.value}` })}>
                {listModulePresets(draft.arg?.split(":")[0] ?? "").length === 0 && <option value="">Aucun : enregistre-en un dans le rack</option>}
                {listModulePresets(draft.arg?.split(":")[0] ?? "").map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
          {draft.kind === "rack" && (
            <>
              <select aria-label="Module" className={lcdSel} value={draft.arg?.split(":")[0]} onChange={(e) => setDraft({ ...draft, arg: `${e.target.value}:${rackParams(e.target.value)[0]?.key ?? ""}` })}>
                {RACK_MODULES.filter((m) => m.id !== "eq").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select aria-label="Réglage" className={lcdSel} value={draft.arg?.split(":")[1]} onChange={(e) => setDraft({ ...draft, arg: `${draft.arg?.split(":")[0]}:${e.target.value}` })}>
                {rackParams(draft.arg?.split(":")[0] ?? "").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </>
          )}
            </div>
            <HSlider label="Force" min={0.1} max={1} step={0.05} value={draft.amount} reset={0.7} ticks={9} color={draftColor} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setDraft({ ...draft, amount: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((s) => (
              <button
                key={s} type="button" onClick={() => add(s, draft)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-neutral-600 bg-neutral-800 text-xs font-black uppercase tracking-wider text-neutral-100 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: draftColor, boxShadow: `0 0 8px ${draftColor}` }} aria-hidden="true" />
                Connecter au deck {s}
              </button>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
