"use client";
import { useState, useSyncExternalStore } from "react";
import { Knob } from "./Knob";
import { Retouch, RETOUCH_GROUPS, RETOUCH_PARAMS, RETOUCH_PRESETS } from "@/lib/audio/Retouch";
import { subscribeAutomation, getAutomationVersion } from "@/lib/audio/deckAutomation";

interface Props {
  retouch: Retouch;
  color: string;
}

export function RetouchPanel({ retouch, color }: Props) {
  useSyncExternalStore(subscribeAutomation, getAutomationVersion, getAutomationVersion); // redraw when a REC replay changes the deck
  const [, forceRender] = useState(0);
  const bypass = retouch.getBypass();
  const neutral = retouch.isNeutral();

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-black tracking-widest text-xs" style={{ color }}>
          RETOUCHE
        </h2>
        <span className={`hw-badge px-2 py-0.5 text-[10px] font-bold ${neutral ? "bg-neutral-200 text-neutral-600" : ""}`} style={!neutral ? { backgroundColor: color, color: "white" } : undefined}>
          {neutral ? "NEUTRE" : "ACTIVE"}
        </span>
        <button
          className="hw-btn px-2 py-1 text-[10px] font-bold"
          title="Compare avec le son original (coupe toute la retouche)"
          onClick={() => { retouch.setBypass(!bypass); forceRender(Date.now()); }}
          style={bypass ? { backgroundColor: "#facc15", color: "black" } : undefined}
        >
          A/B
        </button>
        <button
          className="hw-btn px-2 py-1 text-[10px] font-bold"
          onClick={() => { retouch.reset(); forceRender(Date.now()); }}
        >
          RESET
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {RETOUCH_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className="hw-btn px-2.5 py-1 text-[11px] font-bold"
            title={preset.title}
            onClick={() => { retouch.applyPreset(preset.name); forceRender(Date.now()); }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Groups */}
      {RETOUCH_GROUPS.map((group) => (
        <div key={group.id} className="hw-recess p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">
            {group.label}
          </div>
          <div className={`flex flex-wrap items-end justify-around gap-3 ${bypass ? "opacity-55" : ""}`}>
            {RETOUCH_PARAMS.filter(p => p.group === group.id).map((param) => (
              param.toggle ? (
                <button
                  key={param.key}
                  className="hw-btn px-3 py-2 text-xs font-bold"
                  onClick={() => { retouch.setParam(param.key, 1 - retouch.getParam(param.key)); forceRender(Date.now()); }}
                  style={retouch.getParam(param.key) > 0.5 ? { backgroundColor: "#facc15", color: "black" } : undefined}
                >
                  {param.label}
                </button>
              ) : (
                <Knob
                  key={param.key}
                  label={param.label}
                  value={retouch.getParam(param.key)}
                  min={param.min}
                  max={param.max}
                  defaultValue={param.def}
                  color={color}
                  size={48}
                  led
                  format={param.fmt}
                  onChange={(v) => { retouch.setParam(param.key, v); forceRender(Date.now()); }}
                />
              )
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
