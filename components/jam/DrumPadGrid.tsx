"use client";

import type { PadDef } from "@/lib/audio/jamModules";
import { keyLabel } from "./jamKeys";

const padColors: Record<string, string> = {
  kick: "oklch(0.72 0.17 38)",
  snare: "oklch(0.85 0.13 82)",
  "roll-snare": "oklch(0.85 0.13 82)",
  hat: "oklch(0.83 0.10 215)",
  "roll-hat": "oklch(0.83 0.10 215)",
  r8: "oklch(0.76 0.12 255)",
  r16: "oklch(0.76 0.12 255)",
  double: "oklch(0.76 0.12 255)",
  half: "oklch(0.76 0.12 255)",
  brake: "oklch(0.76 0.12 255)",
  scatter: "oklch(0.76 0.12 255)",
};

const FALLBACK = "oklch(0.76 0.12 255)";

export function DrumPadGrid({ m, list, keys }: { m: { press: (id: string, on: boolean, list?: PadDef[]) => void; padActive: (p: PadDef) => boolean; isRepeating?: (id: string) => boolean; waveOf?: (kind: "kick" | "snare" | "hat") => number[] | null }; list: PadDef[]; keys: string[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", maxWidth: "460px" }}>
      {list.map((p, i) => {
        const color = padColors[p.id] ?? FALLBACK;
        const active = m.padActive(p);
        const wave = (p.id === "kick" || p.id === "snare" || p.id === "hat") ? m.waveOf?.(p.id as "kick" | "snare" | "hat") : null;

        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            aria-label={p.label}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: "18px",
              background: active ? `color-mix(in oklab, ${color} 88%, black)` : `radial-gradient(ellipse 90% 70% at 50% 115%, color-mix(in oklab, ${color} 24%, transparent), transparent 70%), oklch(0.21 0.012 260)`,
              border: `1px solid oklch(0.32 0.015 260)`,
              boxShadow: active ? `0 0 28px color-mix(in oklab, ${color} 70%, transparent)` : "inset 0 0 4px rgba(0, 0, 0, 0.3)",
              color: active ? "#0a0a0a" : "oklch(0.92 0.01 260)",
              transform: active ? "scale(0.97)" : "none",
              transition: active ? "none" : "all 160ms ease-out",
              position: "relative",
              overflow: "hidden",
              touchAction: "none",
              userSelect: "none",
              textAlign: "left",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              m.press(p.id, true, list);
            }}
            onPointerUp={() => {
              if (m.padActive(p)) m.press(p.id, false, list);
            }}
            onPointerCancel={() => {
              if (m.padActive(p)) m.press(p.id, false, list);
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                m.press(p.id, true, list);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                m.press(p.id, false, list);
              }
            }}
          >
            <div style={{ position: "absolute", top: "8px", left: "12px", fontFamily: "monospace", fontSize: "12px", opacity: 0.75 }}>
              {keys[i] ? keyLabel(keys[i]) : ""}
            </div>
            <div style={{ position: "absolute", bottom: "8px", left: "12px", fontSize: "14px", fontWeight: "bold", lineHeight: 1.15, maxWidth: "calc(100% - 24px)" }}>
              {p.label.toUpperCase()}
            </div>
            {m.isRepeating?.(p.id) && (
              <span aria-hidden style={{ position: "absolute", bottom: "10px", right: "12px", width: "9px", height: "9px", borderRadius: "999px", background: "#0a0a0a", boxShadow: "0 0 0 2px color-mix(in oklab, #0a0a0a 40%, transparent)" }} />
            )}
            {wave && (
              <div style={{ position: "absolute", top: "8px", right: "10px", width: "64px", height: "24px" }}>
                <svg viewBox="0 0 64 24" style={{ width: "100%", height: "100%" }}>
                  {wave.map((peak, j) => (
                    <rect
                      key={j}
                      x={j * (64 / wave.length)}
                      y={(24 - (1 + peak * 21)) / 2}
                      width={64 / wave.length}
                      height={1 + peak * 21}
                      fill={`color-mix(in oklab, ${color} 70%, transparent)`}
                    />
                  ))}
                </svg>
              </div>
            )}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "5px",
              background: `color-mix(in oklab, ${color} 60%, transparent)`,
            }} />
          </button>
        );
      })}
    </div>
  );
}
