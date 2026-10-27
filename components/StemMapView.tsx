"use client";
import { useEffect, useRef, useMemo, useState } from "react";

export interface StemMapLike {
  hop: number;
  duration: number;
  energy: number[];
  stems?: Record<string, number[]>;
  sections: { start: number; end: number; kind: "peak" | "slow" | "blank" | "normal" }[];
}

const SECTION_COLORS = {
  peak: "oklch(0.72 0.22 350)",
  slow: "oklch(0.65 0.18 260)",
  blank: "oklch(0.88 0.02 60)",
  normal: "oklch(0.42 0.03 270)",
};

const ENERGY_COLORS = [
  "oklch(0.12 0.005 350)",
  "oklch(0.30 0.04 350)",
  "oklch(0.50 0.14 350)",
  "oklch(0.72 0.22 350)",
];

const STEM_ORDER = ["voix", "harmonies", "basse", "batterie"];

export default function StemMapView({
  map,
  position,
  height = 96,
  onSeek,
  label,
}: {
  map: StemMapLike | null;
  position?: number;
  height?: number;
  onSeek?: (sec: number) => void;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  // Derived upcoming peak (no state, no effect)
  const upcomingPeak = useMemo(() => {
    if (!map || position === undefined) return null;
    const peak = map.sections.find(
      (s) => s.kind === "peak" && s.start > position && s.start <= position + 14 && s.start >= position + 3
    );
    return peak ? `Pic dans ${Math.round(peak.start - position)} s` : null;
  }, [map, position]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Draw canvas
  useEffect(() => {
    if (!map || !canvasRef.current || width === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "oklch(0.15 0.01 270)";
    ctx.fillRect(0, 0, width, height);

    // Sections bar (6px)
    map.sections.forEach((s) => {
      const x = (s.start / map.duration) * width;
      const w = ((s.end - s.start) / map.duration) * width;
      ctx.fillStyle = SECTION_COLORS[s.kind];
      ctx.fillRect(x, 0, w, 6);
      // Patterns
      if (s.kind === "peak") {
        ctx.strokeStyle = "oklch(0.9 0.05 350)";
        ctx.lineWidth = 1;
        for (let i = x; i < x + w; i += 4) ctx.stroke(new Path2D(`M${i} 0 L${i + 2} 6`));
      } else if (s.kind === "blank") {
        ctx.strokeStyle = "oklch(0.9 0.05 60)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke(new Path2D(`M${x} 3 L${x + w} 3`));
        ctx.setLineDash([]);
      } else if (s.kind === "slow") {
        ctx.strokeStyle = "oklch(0.9 0.05 260)";
        ctx.lineWidth = 1;
        ctx.stroke(new Path2D(`M${x} 3 L${x + w} 3`));
      }
    });

    // Cascade
    const stemKeys = map.stems ? STEM_ORDER.filter((k) => map.stems?.[k]) : ["total"];
    const rowHeight = (height - 6) / stemKeys.length;
    stemKeys.forEach((key, i) => {
      const y = 6 + i * rowHeight;
      // Label
      ctx.fillStyle = "oklch(0.7 0.02 270)";
      ctx.font = "9px system-ui";
      ctx.fillText(key === "total" ? "énergie" : key, 2, y + 10);
      // Heatmap
      const data = map.stems?.[key] || map.energy;
      const max = Math.max(...data, 1);
      data.forEach((v, j) => {
        const x = (j * map.hop) / map.duration * width;
        const w = map.hop / map.duration * width;
        const t = v / max;
        const colorIndex = Math.min(3, Math.floor(t * 3));
        const c1 = ENERGY_COLORS[colorIndex];
        const c2 = ENERGY_COLORS[Math.min(3, colorIndex + 1)];
        const ratio = (t * 3) % 1;
        const color = interpolateOklch(c1, c2, ratio);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, rowHeight);
      });
    });

    // Total energy curve
    const maxEnergy = Math.max(...map.energy, 1);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    map.energy.forEach((v, j) => {
      const x = (j * map.hop) / map.duration * width;
      const y = 6 + (1 - v / maxEnergy) * (height - 6);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [map, width, height]);

  // Tooltip and seek
  const [tooltip, setTooltip] = useState<string | null>(null);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!map || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const sec = (x / rect.width) * map.duration;
    const section = map.sections.find((s) => sec >= s.start && sec <= s.end);
    if (section) {
      const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      setTooltip(`${section.kind}: ${format(section.start)}-${format(section.end)}`);
    } else setTooltip(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!map || !onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek((x / rect.width) * map.duration);
  };

  if (!map) {
    return (
      <div
        className="flex items-center justify-center border border-oklch-25-0.015-270 rounded-[6px] bg-oklch-15-0.01-270 text-oklch-70-0.02-270"
        style={{ height, width: "100%" }}
        role="img"
        aria-label="Carte non disponible : prépare les stems du titre"
      >
        Carte non disponible : prépare les stems du titre
      </div>
    );
  }

  // Section counts for aria-label
  const counts = { peak: 0, slow: 0, blank: 0, normal: 0 };
  map.sections.forEach((s) => counts[s.kind]++);
  const ariaLabel = `Carte du morceau : ${counts.peak} pics, ${counts.slow} passages lents, ${counts.blank} blancs, ${counts.normal} normaux`;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height, borderRadius: 6, border: "1px solid oklch(0.25 0.015 270)", background: "oklch(0.15 0.01 270)", cursor: onSeek ? "pointer" : "default" }}
      role="img"
      aria-label={label || ariaLabel}
      title={tooltip || undefined}
      onMouseMove={handleMouseMove}
      onClick={onSeek ? handleClick : undefined}
    >
      <canvas ref={canvasRef} className="w-full" />
      {position !== undefined && (
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-[#ff7a1a]"
          style={{ left: `${(position / map.duration) * 100}%` }}
        />
      )}
      {upcomingPeak && (
        <div className="absolute top-1 right-1 px-1 text-[10px] bg-[#ff7a1a] text-white rounded-[3px]">
          {upcomingPeak}
        </div>
      )}
    </div>
  );
}

function interpolateOklch(c1: string, c2: string, ratio: number): string {
  const parse = (c: string) => c.match(/oklch\(([^)]+)\)/)?.[1].split(" ").map(Number) || [0, 0, 0];
  const [l1, c1v, h1] = parse(c1);
  const [l2, c2v] = parse(c2);
  const l = l1 + (l2 - l1) * ratio;
  const c = c1v + (c2v - c1v) * ratio;
  return `oklch(${l} ${c} ${h1})`;
}
