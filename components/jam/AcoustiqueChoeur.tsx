"use client";
import { useEffect, useState } from "react";
import type { LyricChoir } from "@/lib/audio/lyricChoir";
import { Knob } from "../Knob";

export function AcoustiqueChoeur({ m, bump, color }: { m: LyricChoir; bump: () => void; color: string }) {
  const [info, setInfo] = useState({ status: "", now: "", next: "" });

  useEffect(() => {
    const interval = setInterval(() => {
      setInfo({ status: m.loading() ?? m.lyricsStatus(), ...m.lines() });
    }, 300);
    return () => clearInterval(interval);
  }, [m]);

  const buttonStyle = (active: boolean) => ({
    backgroundColor: active ? color : "transparent",
    color: active ? "oklch(0.18 0.02 165)" : "oklch(0.92 0.01 260)",
    border: active ? "1px solid transparent" : "1px solid oklch(0.32 0.015 260)"
  });

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Choeur sur paroles">
        <button
          className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
          style={buttonStyle(!m.on)}
          aria-pressed={!m.on}
          onClick={() => { m.setOn(false); bump(); }}
          type="button"
        >
          Arrêt
        </button>
        <button
          className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
          style={buttonStyle(m.on)}
          aria-pressed={m.on}
          onClick={() => { m.setOn(true); bump(); }}
          type="button"
        >
          Sur les paroles
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Knob
          label="NAPPE"
          value={m.pad}
          min={0}
          max={1.5}
          defaultValue={0.7}
          onChange={(v) => { m.setLevel("pad", v); bump(); }}
          color={color}
          size={46}
          format={(v) => v <= 0.001 ? "coupé" : `${Math.round(v * 100)} %`}
          led
        />
        <Knob
          label="CORDES"
          value={m.strings}
          min={0}
          max={1.5}
          defaultValue={0}
          onChange={(v) => { m.setLevel("strings", v); bump(); }}
          color={color}
          size={46}
          format={(v) => v <= 0.001 ? "coupé" : `${Math.round(v * 100)} %`}
          led
        />
        <Knob
          label="CHŒUR"
          value={m.choir}
          min={0}
          max={1.5}
          defaultValue={0.9}
          onChange={(v) => { m.setLevel("choir", v); bump(); }}
          color={color}
          size={46}
          format={(v) => v <= 0.001 ? "coupé" : `${Math.round(v * 100)} %`}
          led
        />
      </div>

      <div>
        <div className="text-[10px] text-[var(--jam-text-3)]">Le chœur</div>
        <div role="group" aria-label="Mode du chœur">
          <button
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            style={buttonStyle(m.mode === "suit")}
            aria-pressed={m.mode === "suit"}
            onClick={() => { m.setMode("suit"); bump(); }}
            type="button"
          >
            Chante les phrases
          </button>
          <button
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            style={buttonStyle(m.mode === "reponse")}
            aria-pressed={m.mode === "reponse"}
            onClick={() => { m.setMode("reponse"); bump(); }}
            type="button"
          >
            Répond entre les phrases
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Knob
          label="CALAGE"
          value={m.nudge}
          min={-3}
          max={3}
          defaultValue={0}
          onChange={(v) => { m.setNudge(v); bump(); }}
          color={color}
          size={46}
          format={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")} s`}
          led
        />
        <div className="text-[10px] text-[var(--jam-text-3)]">
          Le calage se fait seul sur la voix des stems ; ce bouton l&apos;avance ou le retarde.
        </div>
      </div>

      {m.on && (
        <div className="flex flex-col gap-1">
          <div role="status" className="text-[10px] text-[var(--jam-text-3)]">
            {info.status}
          </div>
          {info.now && (
            <div className="text-[13px] text-[var(--jam-text)]">
              « {info.now} »
            </div>
          )}
          {info.next && (
            <div className="text-[10px] text-[var(--jam-text-3)]">
              Ensuite : {info.next}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
