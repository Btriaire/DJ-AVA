"use client";

// Building blocks of the Préparation view: collapsible section with memory,
// segmented filter, step badge, summary figure and the stems progress bar.

import { useState, type ReactNode, type Ref } from "react";
import { Icon } from "./parts";

// ---- remembered choices (localStorage, never required) ----------------------------

const PREFIX = "djsynth.prep.";

function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

// a choice among a few strings, remembered between sessions
export function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const s = readStored(key);
    return s !== null && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
  });
  const set = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(PREFIX + key, v);
    } catch {
      /* storage blocked: the choice just is not remembered */
    }
  };
  return [value, set];
}

// open / closed state of a section, remembered
export function useStoredOpen(key: string, fallback = true): [boolean, (v: boolean) => void] {
  const [v, set] = useStored<"1" | "0">(`open.${key}`, fallback ? "1" : "0", ["1", "0"]);
  return [v === "1", (o) => set(o ? "1" : "0")];
}

// ---- small pieces ---------------------------------------------------------------------

export function StepBadge({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--prep-accent)] text-[11px] font-black text-[#05070a]">
      {n}
    </span>
  );
}

// segmented filter with its label; keys are the stored values, labels what is shown
export function SegFilter<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2" title={hint}>
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-500">{label}</span>
      <div className="prep-seg" role="group" aria-label={label}>
        {options.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// ---- collapsible section ------------------------------------------------------------------

// The content stays mounted when folded (hidden), so what is typed or chosen inside is kept.
export function Section({ title, step, hint, count, summary, open, onToggle, sectionRef, className = "", children }: {
  title: string;
  step?: number;
  hint?: string;
  count?: ReactNode;
  summary?: string; // shown while folded
  open: boolean;
  onToggle: () => void;
  sectionRef?: Ref<HTMLElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} className={`prep-card min-w-0 scroll-mt-4 ${className}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="prep-tap flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {step !== undefined && <StepBadge n={step} />}
        <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-neutral-100">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-white/5 px-2 py-px font-mono text-[10px] text-neutral-400">{count}</span>}
        {hint && <span className="hidden min-w-0 truncate text-[11px] text-neutral-500 sm:inline">{hint}</span>}
        {!open && summary && <span className="ml-auto min-w-0 truncate text-[11px] text-neutral-500">{summary}</span>}
        <span className={`${open || !summary ? "ml-auto" : ""} text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      <div hidden={!open}>{children}</div>
    </section>
  );
}

// ---- stems progress -------------------------------------------------------------------------

