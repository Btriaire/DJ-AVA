// Posters drawn from a set itself: its name in big letters, a line under it (date, place, or the set's figures),
// on a few looks. Drawn on a 320-px grid; the set keeps a 320-px JPEG, the download is redrawn at 1080 px.
import type { LibTrack } from "./library";

export const SIDE = 320;
export const HD_SIDE = 1080;

// the line under the name: the DJ's own words (date, place) or else the set's figures
export function posterSubtitle(tracks: LibTrack[], line?: string): string {
  if (line?.trim()) return line.trim();
  const bpms = tracks.map((t) => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const bpm = bpms.length ? ` · ${Math.round(Math.min(...bpms))}–${Math.round(Math.max(...bpms))} BPM` : "";
  return `${tracks.length} titre(s)${bpm}`;
}

// ---- posters drawn from the set itself: its name in big letters on a few looks ----------------------------
export type Look = { key: string; label: string; draw: (g: CanvasRenderingContext2D) => { ink: string; sub: string } };

export const LOOKS: Look[] = [
  {
    key: "neon",
    label: "Néon",
    draw: (g) => {
      g.fillStyle = "#07080c";
      g.fillRect(0, 0, SIDE, SIDE);
      for (const [x, y, c] of [[60, 60, "rgba(34,211,238,.55)"], [270, 250, "rgba(217,70,239,.55)"]] as const) {
        const r = g.createRadialGradient(x, y, 0, x, y, 220);
        r.addColorStop(0, c);
        r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, SIDE, SIDE);
      }
      g.shadowColor = "#22d3ee";
      g.shadowBlur = 18;
      return { ink: "#ffffff", sub: "#a5f3fc" };
    },
  },
  {
    key: "sunset",
    label: "Coucher de soleil",
    draw: (g) => {
      const l = g.createLinearGradient(0, 0, 0, SIDE);
      l.addColorStop(0, "#f97316");
      l.addColorStop(0.55, "#db2777");
      l.addColorStop(1, "#3b0764");
      g.fillStyle = l;
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "rgba(255,237,160,.9)";
      g.beginPath();
      g.arc(SIDE / 2, SIDE * 0.78, 70, Math.PI, 0);
      g.fill();
      return { ink: "#ffffff", sub: "#fde68a" };
    },
  },
  {
    key: "vinyl",
    label: "Vinyle",
    draw: (g) => {
      g.fillStyle = "#facc15";
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "#0a0a0a";
      g.beginPath();
      g.arc(SIDE * 0.72, SIDE * 0.72, 150, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,.08)";
      for (let r = 60; r < 150; r += 7) {
        g.beginPath();
        g.arc(SIDE * 0.72, SIDE * 0.72, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = "#facc15";
      g.beginPath();
      g.arc(SIDE * 0.72, SIDE * 0.72, 28, 0, Math.PI * 2);
      g.fill();
      return { ink: "#0a0a0a", sub: "#3f3f46" };
    },
  },
  {
    key: "mono",
    label: "Minimal",
    draw: (g) => {
      g.fillStyle = "#f5f5f4";
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "#ef4444";
      g.fillRect(24, 24, 10, SIDE - 48);
      return { ink: "#0a0a0a", sub: "#57534e" };
    },
  },
];

// splits the name into at most 3 lines that fit the width, at the biggest size that works
function fitLines(g: CanvasRenderingContext2D, text: string, maxW: number): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = 64; size >= 22; size -= 2) {
    g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lines: string[] = [];
    let cur = "";
    let ok = true;
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width <= maxW) cur = next;
      else {
        if (!cur || g.measureText(w).width > maxW) { ok = false; break; }
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (ok && lines.length <= 3) return { lines, size };
  }
  g.font = `900 22px system-ui, sans-serif`;
  return { lines: [text.slice(0, 40)], size: 22 };
}

export function drawPoster(lookKey: string, name: string, subtitle: string, side = SIDE): string {
  const look = LOOKS.find((l) => l.key === lookKey) ?? LOOKS[0];
  const c = document.createElement("canvas");
  c.width = c.height = side;
  const g = c.getContext("2d");
  if (!g) return "";
  g.scale(side / SIDE, side / SIDE); // drawn on a 320 grid, at any size
  const { ink, sub } = look.draw(g);
  const left = look.key === "mono" ? 50 : 26;
  const { lines, size } = fitLines(g, name.toUpperCase(), SIDE - left - 26);
  g.fillStyle = ink;
  g.textBaseline = "alphabetic";
  const lineH = size * 1.02;
  const top = look.key === "vinyl" || look.key === "sunset" ? 40 + size : SIDE - 64 - lineH * (lines.length - 1);
  lines.forEach((l, i) => g.fillText(l, left, top + i * lineH));
  g.shadowBlur = 0;
  g.font = `700 15px system-ui, sans-serif`;
  g.fillStyle = sub;
  g.fillText(subtitle, left, top + (lines.length - 1) * lineH + 30);
  return c.toDataURL("image/jpeg", 0.85);
}

