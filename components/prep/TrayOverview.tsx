"use client";

import type { KeyboardEvent } from "react";

// "Mis de côté" at a glance: stems ready, tempo spread and keys of the tray; a click on a bar or a key filters the tray (MaRuche)

export function StemsDonut({
  done,
  running,
  queued,
  error,
  total,
}: {
  done: number
  running: number
  queued: number
  error: number
  total: number
}) {
  const radius = 36
  const circumference = 2 * Math.PI * radius

  // Prepare segments with colors and labels
  const segments = [
    { value: done, color: '#34d399', label: 'Prêts' },
    { value: running, color: 'var(--prep-accent)', label: 'En cours' },
    { value: queued, color: 'rgba(255,255,255,.35)', label: 'En attente' },
    { value: error, color: '#f87171', label: 'Erreurs' },
  ] as const

  // Compute dash values and offsets
  const arcs: { label: string; color: string; dash: number; offset: number }[] = []
  let offset = 0
  for (const s of segments) {
    if (total <= 0 || s.value <= 0) continue
    const dash = (s.value / total) * circumference
    arcs.push({ label: s.label, color: s.color, dash, offset })
    offset += dash
  }

  return (
    <div className="prep-card flex flex-col gap-2 p-3">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
        Stems
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {/* Donut SVG */}
        <svg width={88} height={88} className="flex-shrink-0">
          {/* Track */}
          <circle
            cx={44}
            cy={44}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,.08)"
            strokeWidth={9}
          />
          {/* Segments */}
          {arcs.map(seg => (
            <circle
              key={seg.label}
              cx={44}
              cy={44}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={9}
              strokeLinecap="butt"
              transform="rotate(-90 44 44)"
              strokeDasharray={`${seg.dash} ${circumference}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
          {/* Center text */}
          <text
            x="50%"
            y="50%"
            dy="-0.2em"
            textAnchor="middle"
            fill="#ffffff"
            fontSize={18}
            fontWeight={900}
          >
            {done}
          </text>
          <text
            x="50%"
            y="50%"
            dy="1.2em"
            textAnchor="middle"
            fill="#a3a3a3"
            fontSize={10}
          >
            / {total}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-col gap-1 text-[11px] text-neutral-400">
          {segments
            .filter(s => s.value > 0)
            .map(s => (
              <div key={s.label} className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-mono text-white">{s.value}</span>{' '}
                {s.label}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export function TempoHistogram({
  bpms,
  query,
  onFilter,
}: {
  bpms: number[];
  query: string;
  onFilter: (q: string) => void;
}) {
  // Compute histogram counts (13 bins)
  const counts = Array.from({ length: 13 }, () => 0);
  for (const bpm of bpms) {
    let idx: number;
    if (bpm < 60) idx = 0;
    else if (bpm > 189) idx = 12;
    else idx = Math.floor((bpm - 60) / 10);
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  const maxCount = Math.max(...counts, 0);

  // Median calculation (French UI)
  const medianBpm =
    bpms.length === 0
      ? null
      : (() => {
          const sorted = [...bpms].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0
            ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
            : Math.round(sorted[mid]);
        })();

  // Helper to build filter string for a bin
  const binLabel = (lower: number, upper: number) => `bpm:${lower}-${upper}`;

  return (
    <div className="prep-card flex flex-col gap-2 p-3">
      {/* Header with title and optional median */}
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
          Tempo
        </span>
        {medianBpm !== null && (
          <span className="text-[11px] text-neutral-400">
            médiane {medianBpm} BPM
          </span>
        )}
      </div>

      {/* Empty state */}
      {bpms.length === 0 ? (
        <span className="text-[11px] text-neutral-500">
          Aucun tempo analysé
        </span>
      ) : (
        <>
          {/* Histogram SVG */}
          <svg
            viewBox="0 0 260 80"
            className="h-20 w-full"
            preserveAspectRatio="none"
          >
            {counts.map((cnt, i) => {
              const lower = 60 + i * 10;
              const upper = lower + 9;
              const isActive = query.trim() === binLabel(lower, upper);
              const height =
                cnt === 0
                  ? 0
                  : Math.max(2, (cnt / maxCount) * 72);
              const y = 76 - height;
              const opacity = cnt === 0 ? 0.12 : isActive ? 1 : 0.4;
              const ariaLabel = `${cnt} titre(s) entre ${lower} et ${upper} BPM`;

              const handleSelect = () => {
                onFilter(isActive ? '' : binLabel(lower, upper));
              };

              const handleKey = (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect();
                }
              };

              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={cnt === 0 ? -1 : 0}
                  aria-label={ariaLabel}
                  className="cursor-pointer outline-none"
                  onClick={cnt === 0 ? undefined : handleSelect}
                  onKeyDown={cnt === 0 ? undefined : handleKey}
                >
                  <rect
                    x={i * 20 + 2}
                    y={y}
                    width={16}
                    height={height}
                    rx={2}
                    fill="#ffcc00"
                    opacity={opacity}
                  />
                </g>
              );
            })}
          </svg>

          {/* Axis labels */}
          <div className="flex justify-between text-[10px] text-neutral-600">
            <span>60</span>
            <span>120</span>
            <span>190</span>
          </div>
        </>
      )}
    </div>
  );
}

function arcPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  // convert degrees (0 = top, clockwise) to radians
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180
  const rad0 = toRad(a0)
  const rad1 = toRad(a1)

  const x1 = cx + r1 * Math.cos(rad0)
  const y1 = cy + r1 * Math.sin(rad0)
  const x2 = cx + r1 * Math.cos(rad1)
  const y2 = cy + r1 * Math.sin(rad1)
  const x3 = cx + r0 * Math.cos(rad1)
  const y3 = cy + r0 * Math.sin(rad1)
  const x4 = cx + r0 * Math.cos(rad0)
  const y4 = cy + r0 * Math.sin(rad0)

  // outer arc clockwise, inner arc counter‑clockwise
  return `M ${x1} ${y1} A ${r1} ${r1} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r0} ${r0} 0 0 0 ${x4} ${y4} Z`
}

export function KeyWheel({
  keys,
  query,
  onFilter,
}: {
  keys: string[]
  query: string
  onFilter: (q: string) => void
}) {
  // count keys case‑insensitively
  const counts = keys.reduce<Record<string, number>>((acc, k) => {
    const key = k.toUpperCase()
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const maxCount = Math.max(...Object.values(counts), 1)

  // top 3 frequent keys for chips
  const topKeys = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const handleActivate = (key: string, active: boolean) => {
    onFilter(active ? '' : `key:${key}`)
  }

  const isActive = (key: string) =>
    query.trim().toLowerCase() === `key:${key}`.toLowerCase()

  return (
    <div className="prep-card flex flex-col gap-2 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
        Tonalités
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <svg width={104} height={104} viewBox="0 0 120 120" className="shrink-0">
          {[...Array(12)].map((_, i) => {
            const n = i + 1
            const a0 = (n - 1) * 30 - 15
            const a1 = (n - 1) * 30 + 15
            const sectors = [
              { key: `${n}A`, r0: 22, r1: 40 },
              { key: `${n}B`, r0: 40, r1: 58 },
            ] as const

            return sectors.map(({ key, r0, r1 }) => {
              const count = counts[key] ?? 0
              const active = isActive(key)
              const fillOpacity =
                0.08 + (0.92 * Math.min(count, maxCount)) / maxCount
              const stroke = active ? '#ffffff' : '#0b0b0d'
              const strokeWidth = active ? 2 : 1

              const midAngle = (a0 + a1) / 2
              const midR = (r0 + r1) / 2
              const rad = ((midAngle - 90) * Math.PI) / 180
              const tx = 60 + midR * Math.cos(rad)
              const ty = 60 + midR * Math.sin(rad)

              const onKeyDown = (e: KeyboardEvent) => {
                if (count && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  handleActivate(key, active)
                }
              }

              return (
                <g
                  key={key}
                  role="button"
                  tabIndex={count ? 0 : -1}
                  aria-label={`${count} titre(s) en ${key}`}
                  className="cursor-pointer outline-none"
                  onClick={() => count && handleActivate(key, active)}
                  onKeyDown={onKeyDown}
                >
                  <path
                    d={arcPath(60, 60, r0, r1, a0, a1)}
                    fill="var(--prep-accent)"
                    fillOpacity={fillOpacity}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                  {count > 0 && (
                    <text
                      x={tx}
                      y={ty}
                      fontSize={7}
                      fill="#d4d4d8"
                      textAnchor="middle"
                      dominantBaseline="central"
                      pointerEvents="none"
                    >
                      {key}
                    </text>
                  )}
                </g>
              )
            })
          })}
        </svg>
        <div className="flex flex-wrap gap-1">
          {topKeys.length ? (
            topKeys.map(([k, c]) => (
              <div
                key={k}
                className="whitespace-nowrap rounded-full bg-white/5 px-2 py-0.5 font-mono text-[11px] text-neutral-300"
              >
                {k} · {c}
              </div>
            ))
          ) : (
            <div className="text-[11px] text-neutral-500">
              Aucune tonalité analysée
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// the same reading on each title: its key on a small Camelot wheel, its tempo on a 60-190 ruler against the tray median
export function camelotColour(key: string | undefined): string | null {
  if (!key) return null;
  const match = key.match(/^(\d{1,2})([abAB])$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n < 1 || n > 12) return null;
  const hue = (n - 1) * 30;
  const lightness = match[2].toUpperCase() === 'A' ? 0.62 : 0.74;
  return `oklch(${lightness} 0.14 ${hue})`;
}

const polarToCartesian = (cx: number, cy: number, radius: number, angle: number) => {
  const rad = (angle - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
};

export function MiniKeyWheel({ camelot, size = 30, label = true }: { camelot?: string; size?: number; label?: boolean }) {
  const sector = (r0: number, r1: number, a0: number, a1: number) => {
    const start = polarToCartesian(20, 20, r0, a0);
    const end = polarToCartesian(20, 20, r0, a1);
    const largeArc = a1 - a0 <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${r0} ${r0} 0 ${largeArc} 1 ${end.x} ${end.y} L ${polarToCartesian(20, 20, r1, a1).x} ${polarToCartesian(20, 20, r1, a1).y} A ${r1} ${r1} 0 ${largeArc} 0 ${polarToCartesian(20, 20, r1, a0).x} ${polarToCartesian(20, 20, r1, a0).y} Z`;
  };

  const activeColour = camelot ? camelotColour(camelot) : null;

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={camelot ? `Tonalité ${camelot}` : "Tonalité inconnue"}>
      {Array.from({ length: 24 }, (_, i) => {
        const n = Math.floor(i / 2) + 1;
        const ring = i % 2 === 0 ? 'A' : 'B';
        const angle = (n - 1) * 30;
        const isActive = camelot && camelot.toUpperCase() === `${n}${ring}`;
        const fill = isActive ? activeColour : 'rgba(255,255,255,.1)';
        const r0 = ring === 'A' ? 9 : 14;
        const r1 = ring === 'A' ? 14 : 19;
        return (
          <path
            key={`${n}${ring}`}
            d={sector(r0, r1, angle - 15, angle + 15)}
            fill={fill || 'none'}
            stroke="#0b0b0d"
            strokeWidth={0.6}
          />
        );
      })}
      {label && (
        <text
          x={20}
          y={20}
          fontSize={7}
          fontWeight={800}
          fill={camelot ? "#e5e5e5" : "#737373"}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {camelot || '?'}
        </text>
      )}
    </svg>
  );
}

export function TempoRuler({ bpm, median }: { bpm?: number; median?: number }) {
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const bpmX = bpm !== undefined && bpm > 0 ? clamp((bpm - 60) / 130 * 96 + 2, 2, 98) : 0;
  const medianX = median !== undefined && median > 0 ? clamp((median - 60) / 130 * 96 + 2, 2, 98) : 0;

  return (
    <svg viewBox="0 0 100 14" className="h-3.5 w-full" preserveAspectRatio="none" role="img" aria-label={bpm !== undefined && bpm > 0 ? `${Math.round(bpm)} BPM` : "Tempo inconnu"}>
      <line x1={2} y1={7} x2={98} y2={7} stroke="rgba(255,255,255,.12)" strokeWidth={2} strokeLinecap="round" />
      {Array.from({ length: 14 }, (_, i) => (
        <line key={i} x1={2 + i * (96 / 13)} y1={7} x2={2 + i * (96 / 13)} y2={10} stroke="rgba(255,255,255,.12)" strokeWidth={0.5} />
      ))}
      {median !== undefined && median > 0 && <line x1={medianX} y1={2} x2={medianX} y2={12} stroke="rgba(255,255,255,.35)" strokeWidth={0.8} />}
      {bpm !== undefined && bpm > 0 && (
        <>
          <line x1={median !== undefined && median > 0 ? medianX : 2} y1={7} x2={bpmX} y2={7} stroke="#ffcc00" strokeOpacity={0.45} strokeWidth={2} />
          <ellipse cx={bpmX} cy={7} rx={1.3} ry={2.6} fill="#ffcc00" />
        </>
      )}
    </svg>
  );
}
