"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { SFX_LIST, SfxId } from "@/lib/audio/SoundFX";
import { Knob } from "./Knob";

interface Props {
  engine: DJEngine;
}

const VOL_KEY = "djsynth.soundfx.vol";
const GROUPS = ["Build", "Drop", "Tone", "Scratch"] as const;
const GROUP_LABEL: Record<(typeof GROUPS)[number], string> = {
  Build: "Build / Transition",
  Drop: "Drop / Impact",
  Tone: "Tonal",
  Scratch: "Scratch / Bass",
};

export function SoundFxPanel({ engine }: Props) {
  const sfx = engine.soundFx;
  const [vol, setVol] = useState(0.9);
  const [flash, setFlash] = useState<SfxId | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // restore saved volume
  useEffect(() => {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (!Number.isNaN(v)) { setVol(v); sfx.setVolume(v); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fire = (id: SfxId) => {
    sfx.trigger(id);
    setFlash(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 180);
  };

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          FX Sonores
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => sfx.stopAll()}
            className="hw-btn px-3 py-1.5 text-[11px] font-bold"
            style={{ ["--led" as string]: "#ff5b5b", color: "#ff8a8a" }}
            title="Couper tous les effets en cours"
          >
            ■ STOP
          </button>
          <Knob
            variant="op1"
            capColor="#1f1f22"
            size={34}
            label="Vol"
            value={vol}
            min={0}
            max={1.6}
            defaultValue={0.9}
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => { setVol(v); sfx.setVolume(v); localStorage.setItem(VOL_KEY, String(v)); }}
          />
        </div>
      </div>

      {GROUPS.map((grp) => (
        <div key={grp} className="flex flex-col gap-1.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-neutral-600">
            {GROUP_LABEL[grp]}
          </span>
          <div className="grid grid-cols-5 gap-2">
            {SFX_LIST.filter((s) => s.group === grp).map((s) => {
              const on = flash === s.id;
              return (
                <button
                  key={s.id}
                  onPointerDown={() => fire(s.id)}
                  className="sfx-pad flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-all active:translate-y-px"
                  style={{
                    color: on ? "#0a0a0a" : s.color,
                    background: on
                      ? `linear-gradient(180deg, ${s.color}, ${s.color}cc)`
                      : "linear-gradient(180deg,#26272b 0%,#15161900 100%)",
                    boxShadow: on
                      ? `0 0 14px ${s.color}, inset 0 1px 0 rgba(255,255,255,0.5)`
                      : `inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 5px rgba(0,0,0,0.55)`,
                    border: "1px solid #050506",
                  }}
                  title={s.label}
                >
                  <span className="text-base leading-none">{s.glyph}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wide leading-none">
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
