"use client";
// the patch bay of the link composer: source pads, device tiles and a patch cable (MaRuche/Falken; the focus handling was redone here)

import { useRef, type KeyboardEvent } from "react";
import type { RhythmSource, RouteKind } from "@/lib/audio/rhythmBus";
import { SOURCE_STYLE, DeviceIcon } from "./RhythmCards";

type SourcePadProps = {
  sources: { id: RhythmSource; label: string }[];
  value: RhythmSource;
  onChange: (s: RhythmSource) => void;
};

export function SourcePads({ sources, value, onChange }: SourcePadProps) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKey = (e: KeyboardEvent) => {
    const idx = sources.findIndex((s) => s.id === value);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % sources.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + sources.length) % sources.length;
    if (next !== idx) {
      e.preventDefault();
      onChange(sources[next].id);
      btnRefs.current[next]?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      className="grid grid-cols-2 gap-1.5"
      onKeyDown={handleKey}
    >
      {sources.map((src, i) => {
        const active = src.id === value;
        const { glow } = SOURCE_STYLE[src.id];
        const ledStyle = active
          ? {
              backgroundColor: glow,
              boxShadow: `0 0 4px ${glow}`,
            }
          : { backgroundColor: "#2d2d2d" };
        const padStyle = active
          ? {
              backgroundColor: `color-mix(in oklch, ${glow} 22%, transparent)`,
              borderColor: glow,
              boxShadow: `0 0 6px ${glow}`,
            }
          : undefined;

        return (
          <button
            key={src.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => { btnRefs.current[i] = el; }}
            onClick={() => onChange(src.id)}
            className={`min-h-11 rounded-md border px-2 text-left text-[11px] font-bold
              ${active ? "" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"}
              focus-visible:ring-2 focus-visible:ring-white/60`}
            style={padStyle}
          >
            <span
              className="inline-block mr-2 h-2 w-2 rounded-full"
              style={ledStyle}
            />
            {src.label}
          </button>
        );
      })}
    </div>
  );
}

type TargetTilesProps = {
  groups: { title: string; kinds: RouteKind[] }[];
  label: (k: RouteKind) => string;
  value: RouteKind;
  onChange: (k: RouteKind) => void;
  color: string;
};

export function TargetTiles({
  groups,
  label,
  value,
  onChange,
  color,
}: TargetTilesProps) {
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.title} role="group" aria-label={g.title}>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
            {g.title}
          </div>
          {g.kinds.map((k) => {
            const active = k === value;
            const tileStyle = active
              ? {
                  backgroundColor: `color-mix(in oklch, ${color} 22%, transparent)`,
                  borderColor: color,
                  boxShadow: `0 0 6px ${color}`,
                }
              : undefined;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(k)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-md border px-2 text-left
                  ${active ? "" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"}
                  focus-visible:ring-2 focus-visible:ring-white/60`}
                style={tileStyle}
              >
                <DeviceIcon kind={k} />
                <span className="truncate text-[11px]">{label(k)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type PatchCableProps = {
  color: string;
};

export function PatchCable({ color }: PatchCableProps) {
  const filterId = `patch-filter-${color.replace(/[^\w]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      className="w-full h-8"
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id={filterId}>
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={color} />
        </filter>
      </defs>
      {/* End circles */}
      <circle cx="4" cy="10" r="3" fill={color} filter={`url(#${filterId})`} />
      <circle cx="96" cy="10" r="3" fill={color} filter={`url(#${filterId})`} />
      {/* Main cable */}
      <path
        d="M4 10 C30 0, 70 20, 96 10"
        fill="none"
        stroke={color}
        strokeWidth="2"
        filter={`url(#${filterId})`}
      />
      {/* Animated dash */}
      <path
        d="M4 10 C30 0, 70 20, 96 10"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="2 6"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-16"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
