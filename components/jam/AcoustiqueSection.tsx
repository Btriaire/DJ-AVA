"use client";

import { ReactNode } from "react";

export function AcoustiqueSection({ title, hint, color, children }: { title: string; hint?: string; color: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg p-3" style={{ border: "1px solid oklch(0.32 0.015 260)", background: "oklch(0.18 0.02 80)" }}>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} />
        <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-100">{title}</h4>
        {hint && <span className="text-[10px] text-[var(--jam-text-3)]">{hint}</span>}
      </header>
      {children}
    </section>
  );
}