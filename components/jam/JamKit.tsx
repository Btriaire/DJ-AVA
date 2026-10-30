"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ActivityLed } from "./ActivityLed";
import { onJamChange, type PadDef } from "@/lib/audio/jamModules";
import { keyLabel } from "./jamKeys";

export function JamShell({
  title,
  tag,
  color,
  status,
  deckName,
  pref,
  onPref,
  lit,
  warning,
  onReset,
  stemsOff,
  stemsLoading,
  onEnableStems,
  children,
}: {
  stemsLoading?: boolean;
  warning?: string | null; // something asked for cannot work on this song
  onReset?: () => void;
  stemsOff?: boolean; // stems prepared but not playing: a button switches them on
  onEnableStems?: () => void;
  title: string;
  tag: string;
  color: string;
  status: "ok" | "nostems" | "stopped";
  deckName: "A" | "B";
  pref: "auto" | "A" | "B";
  onPref: (p: "auto" | "A" | "B") => void;
  lit?: () => boolean; // flashes the activity LED on each note the module plays
  children: ReactNode;
}) {
  const statusText =
    status === "ok"
      ? `Deck ${deckName} · en jeu`
      : status === "stopped"
      ? `Deck ${deckName} · à l'arrêt`
      : "Active les stems du deck";

  return (
    <section
      className="hw-panel hw-screwed relative flex flex-col gap-3 overflow-hidden p-3"
      aria-label={title}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: status === "ok" ? `0 0 8px ${color}` : "none",
          }}
        />
        <h3 className="text-[13px] font-black uppercase tracking-[0.22em] text-neutral-100">
          {title}
        </h3>
        <span className="text-[10px] text-[var(--jam-text-3)]">{tag}</span>
        {lit && <ActivityLed lit={lit} color={color} />}
        {onReset && (
          <button type="button" onClick={onReset} className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-black tracking-[0.15em] text-[var(--jam-text-3)] hover:bg-white/5 hover:text-[var(--jam-text)]" title="Remet le module à zéro : effets coupés, réglages par défaut">
            RÀZ
          </button>
        )}
        <div className={`${onReset ? "" : "ml-auto "}flex items-center gap-1.5 rounded-full bg-neutral-800/50 px-2 py-0.5 text-[10px] font-bold`}>
          {/* a status dot instead of glyphs (no emoji-like characters in the UI) */}
          <span className="my-auto h-1.5 w-1.5 rounded-full" style={{ background: status === "ok" ? "#34d399" : status === "nostems" ? "#fbbf24" : "#737373" }} />
          {statusText}
        </div>
      </div>
      {status === "nostems" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#fbbf24]/10 px-2 py-1.5 text-[11px] text-[#fbbf24]">
          {stemsLoading ? (
            <>Chargement des stems du morceau…</>
          ) : stemsOff && onEnableStems ? (
            <>
              Les stems de ce morceau sont prêts mais coupés.
              <button type="button" onClick={onEnableStems} className="rounded bg-[#fbbf24] px-2 py-0.5 text-[10px] font-black tracking-wide text-[#1a1203]">ACTIVER LES STEMS</button>
            </>
          ) : (
            <>Stems non préparés pour le morceau de ce deck : prépare-les dans Préparation ou dans le panneau des stems.</>
          )}
        </div>
      )}
      {warning && <div className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-[#fbbf24]">{warning}</div>}
      <JamSeg
        label="Sur quel deck jouer"
        options={[
          ["auto", "Auto"],
          ["A", "A"],
          ["B", "B"],
        ]}
        value={pref}
        onChange={onPref}
        color={color}
      />
      {children}
    </section>
  );
}

export function JamPad({
  label,
  sub,
  color,
  mode,
  active,
  onChange,
  hint,
}: {
  hint?: string; // the computer key that plays this pad
  label: string;
  sub?: string;
  color: string;
  mode: "hold" | "toggle";
  active: boolean;
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (mode !== "hold") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(true);
  };

  const handlePointerUp = () => {
    if (mode === "hold" && active) onChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === "hold" && (e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      onChange(true);
    }
  };

  const handleKeyUp = () => {
    if (mode === "hold" && active) onChange(false);
  };

  return (
    <button
      ref={ref}
      className={`relative h-14 w-full rounded-lg font-black text-[12px] tracking-wide transition-[transform,box-shadow] duration-80 motion-reduce:transition-none ${
        active
          ? "translate-y-0.5 shadow-[0_0_14px_color-mix(in_srgb,_var(--tw-shadow-color)_55%,_transparent)]"
          : "translate-y-0"
      }`}
      style={{
        backgroundColor: active
          ? `color-mix(in srgb, ${color} 38%, #111)`
          : "#17171b",
        boxShadow: active ? `inset 0 0 0 1px ${color}, 0 0 14px color-mix(in srgb, ${color} 55%, transparent)` : "inset 0 1px 0 rgba(255,255,255,.06), 0 2px 0 #0a0a0c",
        color: active ? "white" : "#d4d4d8",
      }}
      aria-pressed={active}
      title={mode === "hold" ? "Maintenir" : "Activer / couper"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      onClick={mode === "toggle" ? () => onChange(!active) : undefined}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {hint && <span className="absolute right-1 top-1 rounded bg-black/45 px-1 font-mono text-[8px] font-bold leading-[12px] text-[var(--jam-text-2)]">{hint}</span>}
      <div className="flex flex-col items-center justify-center">
        {label}
        {sub && (
          <span className="text-[9px] font-semibold opacity-70">{sub}</span>
        )}
      </div>
    </button>
  );
}

export function JamSeg<T extends string>({
  label,
  options,
  value,
  onChange,
  color,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-3)]">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            className={`px-2 py-1 text-[10px] font-bold rounded ${
              value === v
                ? "text-white"
                : "text-[var(--jam-text-2)] bg-white/5"
            }`}
            style={{
              backgroundColor:
                value === v
                  ? `color-mix(in srgb, ${color} 30%, transparent)`
                  : undefined,
              boxShadow: value === v ? `inset 0 0 0 1px ${color}` : undefined,
            }}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useJamRefresh(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1000); // deck status; every change of a module also refreshes at once
    const off = onJamChange(() => setN((x) => x + 1)); // a pad pressed on the keyboard lights up at once
    return () => { clearInterval(id); off(); };
  }, []);
  return n;
}

// the pads of a module, from its own definitions (the same ones the computer keyboard plays)
export function JamPads({ m, list, color, className, keys }: { m: { press: (id: string, on: boolean, list?: PadDef[]) => void; padActive: (p: PadDef) => boolean }; list: PadDef[]; color: string; className: string; keys?: string[] }) {
  return (
    <div className={className}>
      {list.map((p, i) => (
        <JamPad key={p.id} label={p.label} sub={p.sub} color={color} mode={p.mode} active={m.padActive(p)} hint={keys?.[i] ? keyLabel(keys[i]) : undefined} onChange={(on) => m.press(p.id, on, list)} />
      ))}
    </div>
  );
}

// REMPLACER: the module takes its stem over (the original fades out over one bar), the same key in every module
export function JamSwap({ m, color, what, onChange }: { m: { swapped: boolean; toggleSwap: () => void; soft: boolean; setSoft: (on: boolean) => void }; color: string; what: string; onChange: () => void }) {
  return (
    <>
      <button
        type="button"
        className="h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em]"
        aria-pressed={m.swapped}
        onClick={() => { m.toggleSwap(); onChange(); }}
        title={`Le module rejoue ${what} du morceau et l'original s'efface en une mesure (appuie encore pour le rendre)`}
        style={{
          background: m.swapped ? `color-mix(in srgb, ${color} 45%, #111)` : 'rgba(255,255,255,.06)',
          color: m.swapped ? '#fff' : 'var(--jam-text-2)',
          boxShadow: m.swapped ? `inset 0 0 0 1px ${color}` : 'none'
        }}
      >
        <svg className="inline-block w-3.5 h-3.5 mr-1" aria-hidden="true" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 7H13M13 7L9 3M13 7L9 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        REMPLACER
        <span className="ml-2 text-[10px] text-[var(--jam-text-3)]">
          {m.swapped ? "remplacé" : `${what} d'origine`}
        </span>
      </button>
      <button
        type="button"
        className="h-9 rounded-md px-3 text-[11px] font-black tracking-[0.15em]"
        aria-pressed={m.soft}
        onClick={() => { m.setSoft(!m.soft); onChange(); }}
        title="Son arrondi et attaques adoucies ; avec REMPLACER, l'original reste dessous à 35 % et le passage se fait sur deux mesures"
        style={{
          background: m.soft ? `color-mix(in srgb, ${color} 45%, #111)` : 'rgba(255,255,255,.06)',
          color: m.soft ? '#fff' : 'var(--jam-text-2)',
          boxShadow: m.soft ? `inset 0 0 0 1px ${color}` : 'none'
        }}
      >
        <svg className="inline-block w-3.5 h-3.5 mr-1" aria-hidden="true" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 7C3 3 5 3 7 7S11 11 13 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        DOUCE
        <span className="ml-2 text-[10px] text-[var(--jam-text-3)]">
          {m.soft ? "son arrondi, mélange" : "son brut"}
        </span>
      </button>
    </>
  );
}
