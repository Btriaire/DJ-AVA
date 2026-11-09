"use client";

import { useState } from "react";
import { ModuleThumb } from "./ModuleThumb";
import { thumbFor, shortName, blurb } from "@/lib/moduleThumbs";
import { hasShot } from "@/lib/moduleShots";

const ACCENT: Record<string, string> = {
  "Stems en live": "oklch(0.80 0.10 300)",
  "Instruments & Sources": "oklch(0.82 0.10 165)",
  "Performance DJ": "oklch(0.84 0.13 70)",
  "Mixer & EQ": "oklch(0.80 0.10 235)",
  "Dynamique & Filtrage": "oklch(0.80 0.10 20)",
  "Distorsion & Caractère": "oklch(0.78 0.14 45)",
  "Espace & Modulation": "oklch(0.82 0.09 200)"
};

interface ModulePickerProps {
  defs: { key: string; label: string; scope: string; category: string }[];
  active: Record<string, boolean>;
  onToggle: (key: string) => void;
  categories: readonly string[];
}

export default function ModulePicker({ defs, active, onToggle, categories }: ModulePickerProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Tous");

  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredDefs = defs.filter(def => {
    const matchesCategory = filter === "Tous" || filter === def.category;
    const matchesActive = filter !== "Actifs" || active[def.key];
    const matchesSearch = normalize(def.label).toLowerCase().includes(normalize(q).toLowerCase());
    return matchesCategory && matchesActive && matchesSearch;
  });

  const activeCount = defs.filter(def => active[def.key]).length;

  return (
    <div>
      <input
        type="search"
        aria-label="Chercher un module"
        placeholder="Chercher un module"
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[12px] text-neutral-100"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={filter === "Tous"}
          onClick={() => setFilter("Tous")}
          style={{
            backgroundColor: filter === "Tous" ? "oklch(0.82 0.05 260)" : "transparent",
            color: filter === "Tous" ? "oklch(0.18 0.02 260)" : "oklch(0.92 0.01 260)",
            border: filter === "Tous" ? "none" : "1px solid oklch(0.32 0.015 260)"
          }}
          className="rounded px-2 py-1 text-[10px] font-bold"
        >
          Tous
        </button>
        <button
          type="button"
          aria-pressed={filter === "Actifs"}
          onClick={() => setFilter("Actifs")}
          style={{
            backgroundColor: filter === "Actifs" ? "oklch(0.82 0.05 260)" : "transparent",
            color: filter === "Actifs" ? "oklch(0.18 0.02 260)" : "oklch(0.92 0.01 260)",
            border: filter === "Actifs" ? "none" : "1px solid oklch(0.32 0.015 260)"
          }}
          className="rounded px-2 py-1 text-[10px] font-bold"
        >
          Actifs ({activeCount})
        </button>
        {categories.map(category => (
          <button
            key={category}
            type="button"
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
            style={{
              backgroundColor: filter === category ? "oklch(0.82 0.05 260)" : "transparent",
              color: filter === category ? "oklch(0.18 0.02 260)" : "oklch(0.92 0.01 260)",
              border: filter === category ? "none" : "1px solid oklch(0.32 0.015 260)"
            }}
            className="rounded px-2 py-1 text-[10px] font-bold"
          >
            {category}
          </button>
        ))}
      </div>
      {filteredDefs.length === 0 ? (
        <p className="text-[11px] text-neutral-400">Aucun module ne correspond.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredDefs.map(({ key, label, scope, category }) => {
            const actif = !!active[key];
            const accent = ACCENT[category] || "oklch(0.82 0.05 260)";
            return (
              <button
                key={key}
                type="button"
                aria-pressed={actif}
                title={label}
                onClick={() => onToggle(key)}
                className="flex flex-col gap-1.5 rounded-lg p-2 text-left"
                style={{
                  backgroundColor: "oklch(0.21 0.012 260)",
                  border: `1.5px solid ${actif ? accent : "oklch(0.32 0.015 260)"}`,
                  boxShadow: actif ? `0 0 14px color-mix(in oklab, ${accent} 35%, transparent)` : "none"
                }}
              >
                <div className="aspect-video w-full overflow-hidden rounded bg-[oklch(0.16_0.012_260)]">
{hasShot(key) ? (
<img src={`/module-thumbs/${key}.jpg`} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover object-top" />
) : (
<ModuleThumb kind={thumbFor(key)} color={actif ? accent : "oklch(0.72 0.02 260)"} className="mx-auto h-full w-auto p-2" />
)}
</div>
        <div className="flex items-start justify-between gap-1">
          <span className="text-[11px] font-black leading-tight text-neutral-100">{shortName(label)}</span>
          {actif && <span aria-hidden="true" className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
        </div>
        {blurb(label) !== "" && <p className="text-[10px] leading-snug text-neutral-400" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{blurb(label)}</p>}
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="text-[9px] font-bold uppercase" style={{ color: accent }}>{category}</span>
          <span className="font-mono text-[9px] uppercase text-neutral-400">{scope}</span>
        </div>
      </button>
    );
  })}
  </div>
  )}
  </div>
);
}
