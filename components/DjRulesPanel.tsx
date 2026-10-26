"use client";
import { ACCENT_LABEL, MASTER_MOVES, STEM_MOVES, type AccentKind } from "@/lib/djForce";
import { FADE_LABEL, getDjRules, hasRules, setDjRules, VOICE_MOVES, VOICE_TECHS, type DjRules } from "@/lib/djRules";
import type { DjOptions } from "@/lib/mixPlan";
import { STEM_TECH_LABEL, STEM_TECH_NOTE, type StemTech } from "@/lib/stemMix";
import { TRANSITIONS } from "@/lib/transitions";
import type { TransitionType } from "@/lib/library";

// The rules of the intelligent DJ: what it may not do. Everything starts allowed; a lit chip is allowed, a struck one
// is forbidden. The rules go with the set (dj.rules) and the last ones chosen also serve songs played by hand.

const DECK_MOVES: AccentKind[] = ["filterbreath", "echothrow", "reverbwash", "flangersweep", "gatechop", "dubthrow", "roll", "noiseburst"];
const RACK_MOVES = Object.keys(MASTER_MOVES) as AccentKind[];
const BLENDS: TransitionType[] = ["filter", "highpass", "eq", "loop", "echo", "wash", "dub", "flanger", "gate", "noise", "roll", "brake", "reverse", "drop"];
const TECHS = Object.keys(STEM_TECH_LABEL) as StemTech[];
const BLEND_LABEL = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.label])) as Record<TransitionType, string>;
const BLEND_HINT = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.hint])) as Record<TransitionType, string>;

function Group<T extends string>({ title, hint, keys, off, label, note, locked, disabled, onChange }: { title: string; hint?: string; keys: T[]; off: T[]; label: (k: T) => string; note?: (k: T) => string; locked?: (k: T) => boolean; disabled?: boolean; onChange: (off: T[]) => void }) {
  const toggle = (k: T) => onChange(off.includes(k) ? off.filter((x) => x !== k) : [...off, k]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] font-semibold text-neutral-200">{title}</span>
        <span className="text-[10px] text-neutral-500">{`${keys.length - keys.filter((k) => off.includes(k)).length} / ${keys.length} autorisés`}</span>
        <button type="button" disabled={disabled} className="text-[10px] text-neutral-400 underline disabled:opacity-50" onClick={() => onChange([])}>tout autoriser</button>
        <button type="button" disabled={disabled} className="text-[10px] text-neutral-400 underline disabled:opacity-50" onClick={() => onChange([...keys])}>tout interdire</button>
      </div>
      {hint && <p className="text-[10px] text-neutral-500">{hint}</p>}
      <div className="flex flex-wrap gap-1">
        {keys.map((k) => {
          const allowed = !off.includes(k) && !locked?.(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={allowed}
              disabled={disabled || locked?.(k)}
              title={note?.(k) ?? `${label(k)} : ${allowed ? "autorisé" : "interdit"}`}
              onClick={() => toggle(k)}
              className="rounded-md border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40"
              style={{
                borderColor: allowed ? "var(--prep-accent)" : "var(--prep-line)",
                background: allowed ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent",
                color: allowed ? "#fff" : "#6b7280",
                textDecoration: allowed ? "none" : "line-through",
              }}
            >
              {label(k)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DjRulesPanel({ dj, disabled, onChange }: { dj: DjOptions; disabled?: boolean; onChange: (next: DjOptions) => void }) {
  const rules: DjRules = dj.rules ?? getDjRules();
  const set = (patch: Partial<DjRules>) => {
    const next = { ...rules, ...patch };
    setDjRules(next); // also for the songs played by hand
    onChange({ ...dj, rules: next });
  };
  const voices = rules.touchVoices !== false;
  const noMoves = rules.noMoves ?? [];
  return (
    <details className="rounded-lg border border-[var(--prep-line)] p-3" open={hasRules(rules) ? true : undefined}>
      <summary className="cursor-pointer text-[12px] font-semibold text-neutral-100">
        Règles du DJ intelligent
        <span className="ml-2 text-[11px] font-bold" style={{ color: hasRules(rules) ? "var(--prep-accent)" : "#6b7280" }}>{hasRules(rules) ? "personnalisées" : "tout autorisé"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-[11px] text-neutral-400">Une pastille allumée est autorisée, une pastille barrée est interdite : le DJ ne l&apos;utilisera jamais. Les stems n&apos;ont de gestes que sur les titres qui les ont prêts.</p>
        <Group title="Effets de platine (pendant les morceaux)" keys={DECK_MOVES} off={noMoves} label={(k) => ACCENT_LABEL[k]} disabled={disabled} onChange={(v) => set({ noMoves: [...noMoves.filter((k) => !DECK_MOVES.includes(k)), ...v] })} />
        <Group title="Effets du rack général" hint="Les effets de la Console (sur tout le mélange)." keys={RACK_MOVES} off={noMoves} label={(k) => ACCENT_LABEL[k]} disabled={disabled} onChange={(v) => set({ noMoves: [...noMoves.filter((k) => !RACK_MOVES.includes(k)), ...v] })} />
        <Group title="Gestes avec les stems" keys={[...STEM_MOVES]} off={noMoves} label={(k) => ACCENT_LABEL[k]} locked={(k) => !voices && VOICE_MOVES.includes(k)} disabled={disabled} onChange={(v) => set({ noMoves: [...noMoves.filter((k) => !STEM_MOVES.includes(k)), ...v] })} />
        <Group title="Enchaînements : filtres et effets" hint="Un enchaînement interdit est remplacé par un fondu simple." keys={BLENDS} off={rules.noTransitions ?? []} label={(k) => BLEND_LABEL[k]} note={(k) => BLEND_HINT[k]} disabled={disabled} onChange={(v) => set({ noTransitions: v })} />
        <Group title="Enchaînements : techniques de stems" keys={TECHS} off={rules.noTechs ?? []} label={(k) => STEM_TECH_LABEL[k]} note={(k) => STEM_TECH_NOTE[k]} locked={(k) => !voices && VOICE_TECHS.includes(k)} disabled={disabled} onChange={(v) => set({ noTechs: v })} />
        <div className="flex flex-col gap-2 border-t border-[var(--prep-line)] pt-3">
          <span className="text-[11px] font-semibold text-neutral-200">Règles des stems</span>
          <label className="flex items-center gap-2 text-[12px] text-neutral-300">
            <input type="checkbox" checked={voices} disabled={disabled} onChange={(e) => set({ touchVoices: e.target.checked })} />
            Le DJ peut jouer avec les voix (couper, isoler, écho de voix)
          </label>
          <label className="flex items-center gap-2 text-[12px] text-neutral-300">
            <input type="checkbox" checked={rules.autoStems !== false} disabled={disabled} onChange={(e) => set({ autoStems: e.target.checked })} />
            Le DJ passe de lui-même un titre en stems quand ils sont prêts
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Les stems montent et descendent</span>
            <div className="prep-seg" role="group" aria-label="Vitesse des stems">
              {(Object.keys(FADE_LABEL) as (keyof typeof FADE_LABEL)[]).map((f) => (
                <button key={f} type="button" aria-pressed={(rules.stemFade ?? "normal") === f} disabled={disabled} onClick={() => set({ stemFade: f })}>
                  {FADE_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Force maximale des gestes</span>
            <select className="prep-input px-2 py-1 text-[12px]" value={rules.maxAmount ?? 1} disabled={disabled} aria-label="Force maximale des gestes du DJ" onChange={(e) => set({ maxAmount: Number(e.target.value) })}>
              {[0.3, 0.5, 0.7, 0.85, 1].map((v) => (
                <option key={v} value={v}>{v === 1 ? "Sans limite" : `${Math.round(v * 100)} %`}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" disabled={disabled || !hasRules(rules)} className="self-start text-[11px] text-neutral-400 underline disabled:opacity-40" onClick={() => set({ noMoves: [], noTransitions: [], noTechs: [], touchVoices: true, autoStems: true, stemFade: "normal", maxAmount: 1 })}>
          Tout remettre par défaut
        </button>
      </div>
    </details>
  );
}
