"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { ActivityLed } from "./ActivityLed";

export function JamShell({
  title,
  tag,
  color,
  status,
  deckName,
  pref,
  onPref,
  lit,
  children,
}: {
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
        <span className="text-[10px] text-neutral-500">{tag}</span>
        {lit && <ActivityLed lit={lit} color={color} />}
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-neutral-800/50 px-2 py-0.5 text-[10px] font-bold">
          {/* a status dot instead of glyphs (no emoji-like characters in the UI) */}
          <span className="my-auto h-1.5 w-1.5 rounded-full" style={{ background: status === "ok" ? "#34d399" : status === "nostems" ? "#fbbf24" : "#737373" }} />
          {statusText}
        </div>
      </div>
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
}: {
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
      className={`h-14 w-full rounded-lg font-black text-[12px] tracking-wide transition-[transform,box-shadow] duration-80 motion-reduce:transition-none ${
        active
          ? "translate-y-0.5 shadow-[0_0_14px_color-mix(in_srgb,_var(--tw-shadow-color)_55%,_transparent)]"
          : "translate-y-0"
      }`}
      style={{
        backgroundColor: active
          ? `color-mix(in srgb, ${color} 38%, #111)`
          : "#17171b",
        boxShadow: active ? `inset 0 0 0 1px ${color}` : "inset 0 1px 0 rgba(255,255,255,.06), 0 2px 0 #0a0a0c",
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
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            className={`px-2 py-1 text-[10px] font-bold rounded ${
              value === v
                ? "text-white"
                : "text-neutral-400 bg-white/5"
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
    const id = setInterval(() => setN((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  return n;
}
