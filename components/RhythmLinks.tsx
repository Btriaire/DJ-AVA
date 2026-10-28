"use client";
import { useEffect, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { Deck } from "@/lib/audio/Deck";
import { DRUM_VOICES } from "@/lib/audio/DrumMachine";
import { RACK_MODULES } from "@/lib/audio/Rack";
import { RhythmBus, type RhythmRoute, type RhythmSource, type RouteKind } from "@/lib/audio/rhythmBus";
import { SFX_LIST } from "@/lib/audio/SoundFX";
import { Icon } from "./prep/parts";

// Liaisons: the rhythm detected in a song (drum attacks, bass notes, synth notes) is never played, but it can drive
// the modules: the DJ synth in harmony, a drum voice, a pulse on a rack parameter.
type Side = "A" | "B";
const KEY = "djsynth.rhythm.v1";
const SOURCES: { id: RhythmSource; label: string }[] = [{ id: "drums", label: "Batterie" }, { id: "bass", label: "Basse" }, { id: "synth", label: "Synthé" }, { id: "voice", label: "Voix chantée" }, { id: "beat", label: "Chaque temps" }, { id: "bar", label: "Chaque mesure" }];
const KINDS: { id: RouteKind; label: string }[] = [{ id: "synth", label: "Synthé DJ (en harmonie)" }, { id: "drum", label: "Boîte à rythmes" }, { id: "rack", label: "Pulse sur un effet du rack" }, { id: "synth2", label: "Synthé (module Global, 1er)" }, { id: "sampler", label: "Super sampler (en harmonie)" }, { id: "pad", label: "Pad du sampler" }, { id: "seqrec", label: "Séquenceur synthé (écriture)" }, { id: "duck", label: "Pompe du volume (sidechain)" }, { id: "filter", label: "Filtre d'un deck (pulse)" }, { id: "sfx", label: "Effet sonore (riser, impact…)" }, { id: "djknob", label: "Bouton du synthé DJ (pulse)" }, { id: "plugin", label: "DX7 (module ouvert)" }, { id: "keypad", label: "DJ Keyboard : touche" }, { id: "keyfx", label: "DJ Keyboard : effet (impact, frein…)" }];
const PRESETS: { label: string; route: Omit<RhythmRoute, "id" | "on"> }[] = [
  { label: "Basse → Synthé DJ", route: { source: "bass", kind: "synth", amount: 0.7 } },
  { label: "Synthé → Synthé DJ", route: { source: "synth", kind: "synth", amount: 0.5 } },
  { label: "Batterie → Synthé sur la tonique", route: { source: "drums", kind: "synth", amount: 0.5 } },
  { label: "Basse → Séquenceur synthé", route: { source: "bass", kind: "seqrec", amount: 0.8 } },
  { label: "Synthé → Super sampler", route: { source: "synth", kind: "sampler", amount: 0.6 } },
  { label: "Voix → Synthé DJ", route: { source: "voice", kind: "synth", amount: 0.5, transpose: -12 } },
  { label: "Temps → Pompe du volume", route: { source: "beat", kind: "duck", arg: "self", amount: 0.35 } },
  { label: "Batterie → Pompe de l'autre deck", route: { source: "drums", kind: "duck", arg: "other", amount: 0.4 } },
  { label: "Batterie → Filtre passe-bas", route: { source: "drums", kind: "filter", arg: "self:lp", amount: 0.5 } },
  { label: "Mesure → Impact", route: { source: "bar", kind: "sfx", arg: "impact", amount: 0.7 } },
  { label: "Basse → Ouverture du synthé", route: { source: "bass", kind: "djknob", arg: "cutoff", amount: 0.6 } },
  { label: "Batterie → Touches du Keyboard", route: { source: "drums", kind: "keypad", arg: "0", amount: 0.7 } },
  { label: "Mesure → Impact du Keyboard", route: { source: "bar", kind: "keyfx", arg: "impact", amount: 0.7 } },
  { label: "Basse → DX7", route: { source: "bass", kind: "plugin", arg: "dx7", amount: 0.7 } },
  { label: "Basse → Synthé DJ en swing", route: { source: "bass", kind: "synth", amount: 0.7, grid: 2, swing: 0.3 } },
  { label: "Temps → Pompe 4/4", route: { source: "beat", kind: "duck", arg: "self", amount: 0.4, grid: 1, pattern: "xxxx" } },
  { label: "Synthé → Synthé DJ, hors voix", route: { source: "synth", kind: "synth", amount: 0.5, avoidVoice: true, snapKey: true } },
  { label: "Batterie → Clap", route: { source: "drums", kind: "drum", arg: "clap", amount: 0.6 } },
];

const KEYFX = [{ id: "impact", label: "Impact" }, { id: "brake", label: "Frein 1 temps" }, { id: "scratch", label: "Scratch" }, { id: "drop", label: "Drop" }];
const KNOBS = [{ id: "cutoff", label: "Filtre" }, { id: "reso", label: "Résonance" }, { id: "drive", label: "Saturation" }, { id: "wobble", label: "Wobble" }, { id: "env", label: "Enveloppe" }];
const targetLabel = (r: RhythmRoute) => {
  const k = KINDS.find((x) => x.id === r.kind)?.label ?? r.kind;
  if (r.kind === "plugin") return r.arg === "dx7" ? "DX7" : String(r.arg);
  if (r.kind === "keypad") return `Keyboard touche ${Number(r.arg) + 1}`;
  if (r.kind === "keyfx") return `Keyboard · ${KEYFX.find((x) => x.id === r.arg)?.label ?? r.arg}`;
  if (r.kind === "pad") return `Pad ${Number(r.arg) + 1}`;
  if (r.kind === "drum") return `Voix ${r.arg}`;
  if (r.kind === "rack") return `Pulse ${r.arg?.replace(":", " · ")}`;
  if (r.kind === "sfx") return SFX_LIST.find((f) => f.id === r.arg)?.label ?? k;
  if (r.kind === "djknob") return `Synthé · ${KNOBS.find((x) => x.id === r.arg)?.label ?? r.arg}`;
  if (r.kind === "duck") return r.arg === "other" ? "Pompe de l'autre deck" : "Pompe du volume";
  if (r.kind === "filter") return (r.arg ?? "").replace("self", "Filtre").replace("other", "Filtre autre").replace(":lp", " passe-bas").replace(":hp", " passe-haut");
  return k.replace(/ \(.*\)/, "");
};

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
const save = (r: Record<Side, RhythmRoute[]>) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private window */ } };

export function FineSettings({ r, patch }: { r: RhythmRoute; patch: (p: Partial<RhythmRoute>) => void }) {
  const isNoteKind = ["synth", "synth2", "sampler", "seqrec", "plugin"].includes(r.kind);

  const steps = Math.min(16, (r.grid ?? 1) * 4);
  const current = (r.pattern || 'x'.repeat(steps)).padEnd(steps, 'x').slice(0, steps);
  const handlePatternToggle = (index: number) => {
    patch({ pattern: current.split('').map((c, i) => (i === index ? (c === 'x' ? '.' : 'x') : c)).join('') });
  };

  const renderPatternEditor = () => {
    if (!r.grid) return null;
    const pattern = current;

    return (
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: steps }).map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={pattern[i] === 'x'}
            className={`min-h-8 min-w-8 rounded-md ${pattern[i] === 'x' ? 'bg-orange-400 text-neutral-950' : 'bg-neutral-800 text-neutral-400'}`}
            onClick={() => handlePatternToggle(i)}
          >
            {pattern[i]}
          </button>
        ))}
        <button
          type="button"
          className="min-h-8 px-2 rounded-md bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          onClick={() => patch({ pattern: undefined })}
        >
          Motif libre
        </button>
      </div>
    );
  };

  return (
    <details className="w-full text-neutral-200">
      <summary className="min-h-9 text-xs font-bold cursor-pointer">Réglages fins</summary>
      <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
        {(r.grid ?? 0) >= 2 && (
          <div className="flex flex-col gap-1">
            <label>Swing</label>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.05}
              value={r.swing ?? 0}
              className="w-24"
              onChange={(e) => patch({ swing: parseFloat(e.target.value) })}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label>Humaniser (ms)</label>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={r.humanize ?? 0}
            className="w-24"
            onChange={(e) => patch({ humanize: parseInt(e.target.value) })}
          />
          <span>{r.humanize ?? 0} ms</span>
        </div>

        <div className="flex flex-col gap-1">
          <label>Décalage (ms)</label>
          <input
            type="range"
            min={-60}
            max={60}
            step={5}
            value={r.nudge ?? 0}
            className="w-24"
            onChange={(e) => patch({ nudge: parseInt(e.target.value) })}
          />
          <span>{r.nudge ?? 0} ms</span>
        </div>

        {renderPatternEditor()}

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 min-h-9">
            <input
              type="checkbox"
              checked={r.avoidVoice ?? false}
              className="accent-orange-400"
              onChange={(e) => patch({ avoidVoice: e.target.checked })}
            />
            Se taire quand la voix chante
          </label>

          <label className="flex items-center gap-1 min-h-9">
            <input
              type="checkbox"
              checked={r.accent ?? false}
              className="accent-orange-400"
              onChange={(e) => patch({ accent: e.target.checked })}
            />
            Accents sur le premier temps
          </label>

          {isNoteKind && (
            <label className="flex items-center gap-1 min-h-9">
              <input
                type="checkbox"
                checked={r.snapKey ?? false}
                className="accent-orange-400"
                onChange={(e) => patch({ snapKey: e.target.checked })}
              />
              Caler sur la tonalité du synthé
            </label>
          )}
        </div>
      </div>
    </details>
  );
}

export function RhythmLinks({ engine }: { engine: DJEngine }) {
  const [routes, setRoutes] = useState<Record<Side, RhythmRoute[]>>({ A: [], B: [] });
  const [, tick] = useState(0);
  const [draft, setDraft] = useState<Omit<RhythmRoute, "id" | "on">>({ source: "bass", kind: "synth", amount: 0.7 });

  useEffect(() => {
    const saved = load();
    busFor(engine, engine.deckA).routes = saved.A;
    busFor(engine, engine.deckB).routes = saved.B;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- routes live in localStorage, read once after hydration
    setRoutes(saved);
    const id = window.setInterval(() => {
      for (const s of ["A", "B"] as const) {
        const d = s === "A" ? engine.deckA : engine.deckB;
        const b = busFor(engine, d);
        if (b.stale) { b.load(d.stemNotes); b.start(); } // a new track replaces the events even without passing through null
      }
      tick((n) => n + 1);
    }, 800);
    return () => window.clearInterval(id);
  }, [engine]);

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

  const rackParams = (mod: string) => RACK_MODULES.find((m) => m.id === mod)?.params ?? [];
  const sel = "min-h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100";

  return (
    <section className="prep rounded-xl border border-neutral-800 bg-neutral-950/60 p-3" aria-label="Liaisons rythmiques">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-200">Liaisons rythmiques</h3>
      <p className="mt-1 text-[11px] text-neutral-400">Les notes détectées ne sont pas jouées : elles pilotent les modules que vous connectez.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const d = side === "A" ? engine.deckA : engine.deckB;
          const n = d.stemNotes;
          return (
            <div key={side} className="flex flex-col gap-2 rounded-lg border border-neutral-800 p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <b className="text-neutral-100">Deck {side}</b>
                <span className="truncate text-neutral-400">
                  {n ? `${n.drums?.length ?? 0} attaques · ${n.bass?.length ?? 0} basses · ${n.other?.length ?? 0} synthé` : d.stemReady ? "Notes en cours d'analyse…" : "Préparez les stems du morceau"}
                </span>
              </div>
              {routes[side].map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md bg-neutral-900/70 p-2 text-xs">
                  <button type="button" aria-pressed={r.on} onClick={() => patch(side, r.id, { on: !r.on })} className={`min-h-9 rounded-md px-3 font-bold ${r.on ? "bg-orange-400 text-neutral-950" : "bg-neutral-700 text-neutral-300"}`}>
                    {r.on ? "Actif" : "Coupé"}
                  </button>
                  <span className="font-semibold">{SOURCES.find((s) => s.id === r.source)?.label}</span>
                  <span aria-hidden>→</span>
                  <span>{targetLabel(r)}</span>
                  <input type="range" min={0.1} max={1} step={0.05} value={r.amount} aria-label="Force" onChange={(e) => patch(side, r.id, { amount: Number(e.target.value) })} className="min-w-[80px] flex-1" />
                  <select aria-label="Grille" value={r.grid ?? 0} onChange={(e) => patch(side, r.id, { grid: Number(e.target.value) || undefined })} className={sel}>
                    <option value={0}>Libre</option><option value={1}>Sur le temps</option><option value={2}>1/8</option><option value={4}>1/16</option>
                  </select>
                  {["synth", "synth2", "sampler", "seqrec", "plugin"].includes(r.kind) && (
                    <select aria-label="Transposition" value={r.transpose ?? 0} onChange={(e) => patch(side, r.id, { transpose: Number(e.target.value) || undefined })} className={sel}>
                      {[-24, -12, -7, -5, 0, 5, 7, 12, 24].map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n} demi-tons</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 text-[11px] text-neutral-400">Durée
                    <input type="range" min={0.25} max={2} step={0.25} value={r.gate ?? 1} aria-label="Durée des notes" onChange={(e) => patch(side, r.id, { gate: Number(e.target.value) })} className="w-16" />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-neutral-400">Densité
                    <input type="range" min={0.1} max={1} step={0.1} value={r.density ?? 1} aria-label="Densité" onChange={(e) => patch(side, r.id, { density: Number(e.target.value) })} className="w-16" />
                  </label>
                  <button type="button" aria-label="Supprimer la liaison" onClick={() => apply(side, routes[side].filter((x) => x.id !== r.id))} className="min-h-9 min-w-9 rounded-md text-neutral-400 hover:bg-neutral-800"><Icon name="x" size={14} /></button>
                  <FineSettings r={r} patch={(p) => patch(side, r.id, p)} />
                </div>
              ))}
              {!routes[side].length && <p className="text-[11px] text-neutral-500">Aucune liaison. Choisissez un raccourci ou composez la vôtre.</p>}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => add(side, p.route)} className="min-h-9 rounded-full border border-neutral-700 px-3 text-[11px] text-neutral-200 hover:border-orange-400/70">+ {p.label}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <details className="mt-3">
        <summary className="min-h-9 cursor-pointer text-xs font-bold text-neutral-200">Composer une liaison</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Source" className={sel} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as RhythmSource })}>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span aria-hidden>→</span>
          <select aria-label="Cible" className={sel} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as RouteKind, arg: e.target.value === "drum" ? "kick" : e.target.value === "pad" ? "0" : e.target.value === "plugin" ? "dx7" : e.target.value === "keypad" ? "0" : e.target.value === "keyfx" ? "impact" : e.target.value === "duck" ? "self" : e.target.value === "filter" ? "self:lp" : e.target.value === "sfx" ? "impact" : e.target.value === "djknob" ? "cutoff" : e.target.value === "rack" ? "isolator:" + (rackParams("isolator")[0]?.key ?? "") : undefined })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          {draft.kind === "drum" && (
            <select aria-label="Voix" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {DRUM_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          )}
          {draft.kind === "keypad" && (
            <select aria-label="Touche" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {Array.from({ length: 16 }, (_, i) => <option key={i} value={String(i)}>Touche {i + 1}</option>)}
            </select>
          )}
          {draft.kind === "keyfx" && (
            <select aria-label="Effet du keyboard" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {KEYFX.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          {draft.kind === "duck" && (
            <select aria-label="Deck" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              <option value="self">Ce deck</option><option value="other">L&apos;autre deck</option>
            </select>
          )}
          {draft.kind === "filter" && (
            <select aria-label="Filtre" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              <option value="self:lp">Passe-bas, ce deck</option><option value="self:hp">Passe-haut, ce deck</option>
              <option value="other:lp">Passe-bas, autre deck</option><option value="other:hp">Passe-haut, autre deck</option>
            </select>
          )}
          {draft.kind === "sfx" && (
            <select aria-label="Effet" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {SFX_LIST.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          {draft.kind === "djknob" && (
            <select aria-label="Bouton" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {KNOBS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
          {draft.kind === "pad" && (
            <select aria-label="Pad" className={sel} value={draft.arg} onChange={(e) => setDraft({ ...draft, arg: e.target.value })}>
              {Array.from({ length: engine.sampler.pads.length }, (_, i) => <option key={i} value={String(i)}>Pad {i + 1}</option>)}
            </select>
          )}
          {draft.kind === "rack" && (
            <>
              <select aria-label="Module" className={sel} value={draft.arg?.split(":")[0]} onChange={(e) => setDraft({ ...draft, arg: `${e.target.value}:${rackParams(e.target.value)[0]?.key ?? ""}` })}>
                {RACK_MODULES.filter((m) => m.id !== "eq").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select aria-label="Réglage" className={sel} value={draft.arg?.split(":")[1]} onChange={(e) => setDraft({ ...draft, arg: `${draft.arg?.split(":")[0]}:${e.target.value}` })}>
                {rackParams(draft.arg?.split(":")[0] ?? "").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </>
          )}
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" onClick={() => add(s, draft)} className="prep-btn-accent inline-flex min-h-9 items-center px-3 text-xs">Connecter au deck {s}</button>
          ))}
        </div>
      </details>
    </section>
  );
}
