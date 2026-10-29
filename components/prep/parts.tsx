"use client";

// Presentational pieces of the Préparation view: covers, key / BPM chips, stem
// status, stat tiles, list mosaics and the set flow. No state, no storage.

import type { LibTrack } from "@/lib/library";
import { thumbSrc } from "@/lib/thumb";

// ---- Camelot keys: pure helpers live in lib/camelot.ts ------------------------
export { parseCamelot, keyColor, keyCompat, type Compat } from "@/lib/camelot";
import { keyColor, keyCompat } from "@/lib/camelot";

// ---- formatting ---------------------------------------------------------------

export function fmtDur(s?: number): string {
  if (!s || !isFinite(s)) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

// ---- cover --------------------------------------------------------------------

// The track artwork, or a generated sleeve: key-coloured gradient, grooves and initials.
// fill = square that takes the full width of its container (grid cards)
export function Cover({ art, name, camelot, size = 40, rounded = 6, fill = false }: { art?: string; name: string; camelot?: string; size?: number; rounded?: number; fill?: boolean }) {
  const box = fill ? { width: "100%", aspectRatio: "1", borderRadius: rounded } : { width: size, height: size, borderRadius: rounded };
  if (art) {
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube / Audius thumbnails, no Next image loader in the Mac app
    return <img src={thumbSrc(art, fill ? 200 : size)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="shrink-0 object-cover" style={box} />;
  }
  const c = keyColor(camelot);
  const initials = name
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .split(/[\s\-–—_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden font-black text-white/85"
      style={{
        ...box,
        fontSize: fill ? 28 : Math.max(9, size * 0.3),
        background: `radial-gradient(circle at 50% 50%, transparent 0 18%, rgba(0,0,0,.35) 19% 20%, transparent 21% 34%, rgba(0,0,0,.25) 35% 36%, transparent 37%), linear-gradient(135deg, color-mix(in srgb, ${c} 70%, #000), color-mix(in srgb, ${c} 25%, #050608))`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
      }}
    >
      {initials || "♪"}
    </div>
  );
}

// ---- chips --------------------------------------------------------------------

export function KeyChip({ camelot }: { camelot?: string }) {
  const c = keyColor(camelot);
  return (
    <span
      className="inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-px font-mono text-[10px] font-bold tabular-nums"
      style={{ color: camelot ? c : "#5b6472", background: `color-mix(in srgb, ${c} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 45%, transparent)` }}
      title={camelot ? `Tonalité ${camelot} (roue Camelot)` : "Tonalité inconnue : lance l'analyse"}
    >
      {camelot ?? "—"}
    </span>
  );
}

export function BpmChip({ bpm, estimated }: { bpm?: number; estimated?: boolean }) {
  return (
    <span className="inline-flex min-w-[42px] items-baseline justify-end gap-0.5 font-mono text-[11px] font-bold tabular-nums text-neutral-200" title={estimated ? "BPM estimé par l'analyse" : "BPM"}>
      {bpm ? (estimated ? "≈" : "") + Math.round(bpm) : <span className="text-neutral-600">—</span>}
      <span className="text-[8px] font-normal text-neutral-500">BPM</span>
    </span>
  );
}

export type StemInfo = { state: "none" | "queued" | "download" | "run" | "done" | "error"; pct: number | null; error?: string };

export function stemInfoFrom(status: string, error?: string): StemInfo {
  if (status === "done") return { state: "done", pct: 100 };
  if (status === "error") return { state: "error", pct: null, error };
  if (status === "queued") return { state: "queued", pct: null };
  if (status === "download") return { state: "download", pct: null };
  if (status.startsWith("separate") || status.startsWith("running")) return { state: "run", pct: Number(status.split(" ")[1]) || 0 };
  return { state: "none", pct: null };
}

const STEM_LOOK: Record<StemInfo["state"], { label: string; color: string }> = {
  none: { label: "stems", color: "#5b6472" },
  queued: { label: "en attente", color: "#a3a3a3" },
  download: { label: "téléchargement", color: "#38bdf8" },
  run: { label: "séparation", color: "#ffcc00" },
  done: { label: "stems prêts", color: "#34d399" },
  error: { label: "erreur", color: "#f87171" },
};

// stem state as a small pill; while separating it fills like a progress bar
export function StemPill({ info, onPrepare }: { info: StemInfo; onPrepare?: () => void }) {
  const look = STEM_LOOK[info.state];
  if (info.state === "none" || info.state === "error") {
    return (
      <button
        type="button"
        onClick={onPrepare}
        className="whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold transition-colors hover:text-white"
        style={{ borderColor: `color-mix(in srgb, ${look.color} 55%, transparent)`, color: look.color }}
        title={info.state === "error" ? `Erreur : ${info.error ?? "inconnue"} — clique pour relancer` : "Préparer les stems de ce titre"}
      >
        {info.state === "error" ? "↻ relancer" : "+ stems"}
      </button>
    );
  }
  return (
    <span
      className="relative inline-flex min-w-[86px] items-center justify-center overflow-hidden whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold tabular-nums"
      style={{ color: look.color, background: `color-mix(in srgb, ${look.color} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${look.color} 40%, transparent)` }}
    >
      {info.pct !== null && info.state === "run" && (
        <span aria-hidden className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: `${info.pct}%`, background: `color-mix(in srgb, ${look.color} 28%, transparent)` }} />
      )}
      <span className={`relative ${info.state === "download" || info.state === "queued" ? "animate-pulse" : ""}`}>
        {info.state === "run" ? `${look.label} ${info.pct} %` : info.state === "done" ? `✓ ${look.label}` : look.label}
      </span>
    </span>
  );
}

// ---- header stats ---------------------------------------------------------------

export function StatTile({ label, value, sub, color, meter }: { label: string; value: string; sub?: string; color: string; meter?: number }) {
  return (
    <div className="prep-tile relative min-w-[120px] flex-1 overflow-hidden rounded-lg px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      <div className="font-mono text-xl font-black tabular-nums leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="truncate text-[10px] text-neutral-500">{sub}</div>}
      {meter !== undefined && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(meter * 100)}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

// ---- lists ------------------------------------------------------------------------

// 2×2 mosaic of the first covers of a list
export function Mosaic({ tracks, size = 52, accent }: { tracks: LibTrack[]; size?: number; accent: string }) {
  const cell = size / 2;
  const four = tracks.slice(0, 4);
  return (
    <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-md" style={{ width: size, height: size, boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 50%, transparent)` }}>
      {[0, 1, 2, 3].map((i) =>
        four[i] ? (
          <Cover key={i} art={four[i].art} name={four[i].name} camelot={four[i].camelot} size={cell} rounded={0} />
        ) : (
          <div key={i} style={{ width: cell, height: cell, background: `color-mix(in srgb, ${accent} 8%, #0b0d10)` }} />
        )
      )}
    </div>
  );
}

// ---- set flow -----------------------------------------------------------------------

// BPM line across the set, one point above the centre of each card of the flow
// (cardW + gapW = one card and the transition after it); each segment is coloured
// by the key compatibility of that transition
export function BpmCurve({ tracks, cardW, gapW, height = 64 }: { tracks: LibTrack[]; cardW: number; gapW: number; height?: number }) {
  const bpms = tracks.map((t) => t.bpm ?? null);
  const known = bpms.filter((b): b is number => b !== null);
  if (tracks.length < 2 || known.length < 2) return null;
  const lo = Math.min(...known) - 2;
  const hi = Math.max(...known) + 2;
  const W = tracks.length * cardW + (tracks.length - 1) * gapW;
  const x = (i: number) => i * (cardW + gapW) + cardW / 2;
  const y = (b: number) => height - 8 - ((b - lo) / (hi - lo)) * (height - 26);
  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="shrink-0" role="img" aria-label="Courbe des BPM du set">
      {tracks.slice(1).map((t, i) => {
        const a = bpms[i];
        const b = bpms[i + 1];
        if (a === null || b === null) return null;
        return <line key={t.id} x1={x(i)} y1={y(a)} x2={x(i + 1)} y2={y(b)} stroke={keyCompat(tracks[i].camelot, t.camelot).color} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />;
      })}
      {tracks.map((t, i) => {
        const b = bpms[i];
        if (b === null) return null;
        return (
          <g key={t.id}>
            <circle cx={x(i)} cy={y(b)} r={4.5} fill="#0b0d10" stroke={keyColor(t.camelot)} strokeWidth={2} />
            <text x={x(i)} y={y(b) - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill="#9aa3b2" fontFamily="ui-monospace, monospace">{Math.round(b)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Transition({ from, to, width }: { from: LibTrack; to: LibTrack; width: number }) {
  const k = keyCompat(from.camelot, to.camelot);
  const pct = from.bpm && to.bpm ? (to.bpm / from.bpm - 1) * 100 : null;
  const tempoColor = pct === null ? "#5b6472" : Math.abs(pct) <= 3 ? "#34d399" : Math.abs(pct) <= 6 ? "#ffcc00" : "#f87171";
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-center" style={{ width }} title={`${k.label} · tempo ${pct === null ? "?" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)} %`}`}>
      <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: tempoColor }}>
        {pct === null ? "? %" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)} %`}
      </span>
      <span className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${k.color}, transparent)` }} />
      <span className="text-[9px] font-bold" style={{ color: k.color }}>{k.label}</span>
    </div>
  );
}

// ---- icons (inline SVG, currentColor) -------------------------------------------------

const ICONS = {
  search: "M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14zm9 16l-4.2-4.2",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  chevron: "M8 10l4 4l4-4",
  x: "M6 6l12 12M18 6L6 18",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  stems: "M4 7h16M4 12h10M4 17h13",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  filter: "M4 6h16M7 12h10M10 18h4",
  play: "M8 5l11 7l-11 7z",
  disc: "M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zm0 7a2 2 0 1 1 0 4a2 2 0 0 1 0-4z",
  bolt: "M13 3L5 14h6l-1 7l8-11h-6z",
  check: "M5 12l5 5l9-10",
  crate: "M3 8l9-4l9 4v9l-9 4l-9-4zM3 8l9 4l9-4M12 12v9",
  up: "M8 14l4-4l4 4",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  send: "M4 12l16-8l-6 16l-3-7z",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  pause: "M8 5v14M16 5v14",
  prev: "M7 5v14M19 5l-9 7l9 7z",
  next: "M17 5v14M5 5l9 7l-9 7z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  copy: "M8 8h11v12H8zM5 16V4h11",
  edit: "M4 20l4-1l11-11l-3-3L5 16zM14 6l3 3",
  upload: "M12 16V4M7 9l5-5l5 5M5 20h14",
  swap: "M4 8h13l-3-3M20 16H7l3 3",
} as const;

export function Icon({ name, size = 14, className = "" }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "grip" ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
