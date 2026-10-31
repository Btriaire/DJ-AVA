"use client";

import { useState } from "react";
import type { Deck } from "@/lib/audio/Deck";
import { RACK_DEF, RACK_DIVS, type Rack, type RackModuleId } from "@/lib/audio/Rack";
import { RACK_GUIDE } from "@/lib/audio/rackGuide";
import { applyModule } from "@/lib/modulePresets";

const STEM_FR: Record<string, string> = { drums: "Batterie", bass: "Basse", other: "Autre", vocals: "Voix", guitar: "Guitare", piano: "Piano" };
export const stemLabel = (n: string) => STEM_FR[n] ?? n;

export function RackGuideBlock({ rack, deck, id, color, flashLcd, onChanged }: { rack: Rack; deck: Deck; id: RackModuleId; color: string; flashLcd: (t: string) => void; onChanged: () => void }) {
  const [held, setHeld] = useState(false);
  const label = RACK_DEF.get(id)?.label ?? id;
  const guide = RACK_GUIDE[id];
  const release = () => {
    if (!held) return;
    setHeld(false);
    rack.setEnabled(id, false);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-2">
      {guide && (
        <p className="text-[11px] leading-snug text-neutral-200">
          {guide.hear} <span className="text-neutral-400">{guide.tip}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 w-16 shrink-0">SUR QUOI</span>
        <button
          className="rounded px-2 py-1 text-[10px] font-bold"
          style={rack.getTarget(id) === -1 ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          aria-pressed={rack.getTarget(id) === -1}
          onClick={() => {
            rack.setTarget(id, -1);
            flashLcd(`${label} SUR TOUT LE MORCEAU`);
            onChanged();
          }}
        >
          Tout le morceau
        </button>
        {deck.stemNames.length > 0 ? (
          <>
            {deck.stemNames.map((stem, i) => (
              <button
                key={stem}
                className="rounded px-2 py-1 text-[10px] font-bold"
                style={rack.getTarget(id) === i ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
                aria-pressed={rack.getTarget(id) === i}
                onClick={() => {
                  rack.setTarget(id, i);
                  flashLcd(`${label} SUR ${stemLabel(stem).toUpperCase()}`);
                  onChanged();
                }}
              >
                {stemLabel(stem)}
              </button>
            ))}
            {!deck.stemsActive && rack.getTarget(id) >= 0 && (
              <span className="text-[10px] text-amber-300">Active les stems : en attendant, l’effet s’applique à tout le morceau.</span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-neutral-400">Prépare les stems du morceau pour viser la batterie, la basse ou la voix.</span>
        )}
      </div>
      {RACK_DEF.get(id)?.sync && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 w-16 shrink-0">TEMPS</span>
          {RACK_DIVS.map((entry, index) => (
            <button
              key={entry.label}
              className="rounded px-2 py-1 text-[10px] font-bold"
              style={Math.round(rack.getParam(id, "div")) === index ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
              aria-pressed={Math.round(rack.getParam(id, "div")) === index}
              onClick={() => {
                rack.setParam(id, "div", index);
                flashLcd(`TEMPS ${entry.label}`);
                onChanged();
              }}
              title={index === 0 ? "Libre : le bouton tourne à la main" : "Calé sur le tempo du deck"}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      {guide && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {guide.variations.map((v, i) => (
            <button
              key={i}
              className="rounded p-2 text-left ring-1 ring-neutral-700 hover:ring-neutral-400"
              style={{ background: "rgba(255,255,255,0.04)" }}
              onClick={() => {
                applyModule(rack, id, { on: true, mix: v.mix, params: v.params, flags: v.flags ?? {} }, 80);
                if (v.stem && deck.stemsActive) {
                  const i = deck.stemNames.indexOf(v.stem);
                  if (i >= 0) rack.setTarget(id, i);
                }
                flashLcd(`${label} · ${v.name.toUpperCase()}`);
                onChanged();
              }}
              title="Charge cette variation et allume l’effet"
            >
              <span className="block text-[11px] font-bold" style={{ color }}>{v.name}</span>
              <span className="block text-[10px] leading-tight text-neutral-300">{v.desc}</span>
              {v.stem && <span className="mt-1 inline-block rounded px-1 text-[9px] font-bold text-neutral-900" style={{ background: color }}>{stemLabel(v.stem)}</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className="self-start rounded px-3 py-1.5 text-[11px] font-black select-none touch-none"
        style={held ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
        onPointerDown={() => {
          if (rack.isOn(id)) return;
          setHeld(true);
          rack.setEnabled(id, true);
          onChanged();
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        title="Tiens appuyé : l’effet joue tant que tu appuies"
      >
        TIENS
      </button>
    </div>
  );
}
