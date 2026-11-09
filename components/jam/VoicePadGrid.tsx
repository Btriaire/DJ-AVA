"use client";

import type { PadDef } from "@/lib/audio/jamModules";
import { keyLabel } from "./jamKeys";
import { PadTrim } from "./PadTrim";
import type { Trim } from "@/lib/audio/padTrim";

const padColors: Record<string, string> = {
  chop: "oklch(0.80 0.10 280)",
  stutter: "oklch(0.84 0.13 70)",
  "echo-end": "oklch(0.76 0.12 255)",
};

const FALLBACK = "oklch(0.76 0.12 255)";

export function VoicePadGrid({ m, list, keys, tint }: { m: { press: (id: string, on: boolean, list?: PadDef[]) => void; padActive: (p: PadDef) => boolean; isRepeating?: (id: string) => boolean; waveOf?: (i: number) => number[] | null; padIndex?: (id: string) => number; trimOf?: (i: number) => Trim | null; setTrimOf?: (i: number, t: Trim) => void }; list: PadDef[]; keys: string[]; tint?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", maxWidth: "600px" }}>
      {list.map((p, i) => {
        const color = (p.id.startsWith("chop") && tint) || padColors[p.id.startsWith("chop") ? "chop" : p.id] || FALLBACK;
        const active = m.padActive(p);
        // LIVE pads of the stem slicers are slots 100.. (the found notes are 0..)
        const slot = m.padIndex?.(p.id) ?? -1;
        const trim = slot >= 0 ? m.trimOf?.(slot) ?? null : null; // the pads holding a note get the TRIM slider
        const wave = p.id.startsWith("chop") ? m.waveOf?.(parseInt(p.id.slice(4), 10)) : p.id.startsWith("live") ? m.waveOf?.(100 + parseInt(p.id.slice(4), 10)) : null;

        return (
          <div key={p.id} className="flex flex-col">
          <button
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
              if (p.mode === "toggle") {
                m.press(p.id, true, list);
              } else {
                m.press(p.id, true, list);
              }
            }}
            onPointerUp={() => {
              if (p.mode !== "toggle" && m.padActive(p)) m.press(p.id, false, list);
            }}
            onPointerCancel={() => {
              if (p.mode !== "toggle" && m.padActive(p)) m.press(p.id, false, list);
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                if (p.mode === "toggle") {
                  m.press(p.id, true, list);
                } else {
                  m.press(p.id, true, list);
                }
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                if (p.mode !== "toggle") m.press(p.id, false, list);
              }
            }}
          >
            <div style={{ position: "absolute", top: "8px", left: "12px", fontFamily: "monospace", fontSize: "12px", opacity: 0.75 }}>
              {keys[i] ? keyLabel(keys[i]) : ""}
            </div>
            <div style={{ position: "absolute", bottom: "26px", left: "12px", fontSize: "10px", opacity: 0.7 }}>
              {p.sub}
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
          {trim && m.setTrimOf && (
            <PadTrim value={trim} steps={16} color={color} label={p.label} onChange={(t) => m.setTrimOf!(slot, t)} />
          )}
          </div>
        );
      })}
    </div>
  );
}
