"use client";
import { useEffect, useRef, useState } from "react";
import { Knob } from "./Knob";
import { FxXyPad } from "./FxXyPad";
import { FXRack, FX_LIST, FX_META, BEAT_LABELS, type FxName } from "@/lib/audio/FXRack";

type FxMode = "auto" | "lock" | "hold";

export function DjFxPanel({ rack, color }: { rack: FXRack; color: string }) {
  const [selected, setSelected] = useState<FxName>(FX_LIST[0].id);
  const [mode, setMode] = useState<FxMode>("auto");
  const [, forceUpdate] = useState(0);
  const [levels, setLevels] = useState<Record<FxName, number>>(
    FX_LIST.reduce((acc, fx) => ({ ...acc, [fx.id]: fx.trigger ? 1 : 0.85 }), {} as Record<FxName, number>)
  );
  const heldFx = useRef<Set<FxName>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem("djsynth.fxMode") as FxMode | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate client-only init (avoids SSR hydration mismatch)
      if (saved) setMode(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      heldFx.current.forEach((id) => rack.setWet(id, 0));
      heldFx.current.clear();
    };
    window.addEventListener("blur", handleBlur);
    return () => {
      handleBlur();
      window.removeEventListener("blur", handleBlur);
    };
  }, [rack]);

  const activeCount = FX_LIST.filter((fx) => rack.getWet(fx.id) > 0).length;
  const meta = FX_META.get(selected)!;
  const wet = rack.getWet(selected);
  const isActive = wet > 0;

  const handleModeChange = () => {
    const nextMode: FxMode = mode === "auto" ? "lock" : mode === "lock" ? "hold" : "auto";
    setMode(nextMode);
    try {
      localStorage.setItem("djsynth.fxMode", nextMode);
    } catch {}
  };

  const handleFxPress = (id: FxName, e: React.PointerEvent | React.KeyboardEvent) => {
    const fxMeta = FX_META.get(id)!;
    const isTrigger = fxMeta.trigger;
    const shouldHold = mode === "hold" || (mode === "auto" && isTrigger);

    if (shouldHold) {
      rack.setWet(id, levels[id]);
      heldFx.current.add(id);
      if ("pointerId" in e) {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    } else {
      rack.setWet(id, rack.getWet(id) > 0 ? 0 : levels[id]);
    }
    setSelected(id);
    forceUpdate((n) => n + 1);
  };

  const handleFxRelease = (id: FxName) => {
    if (heldFx.current.has(id)) {
      rack.setWet(id, 0);
      heldFx.current.delete(id);
      forceUpdate((n) => n + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: FxName) => {
    if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
    handleFxPress(id, e);
  };

  const handleKeyUp = (e: React.KeyboardEvent, id: FxName) => {
    if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
    handleFxRelease(id);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-black tracking-widest text-xs" style={{ color }}>
          DJ FX
        </h2>
        <span className="font-mono text-[11px]">♩ {rack.getBpm().toFixed(1)}</span>
        <button
          type="button"
          className="hw-btn min-w-[64px] text-[10px]"
          onClick={handleModeChange}
          title={
            mode === "auto"
              ? "AUTO : effets trigger à maintenir, autres basculent au clic"
              : mode === "lock"
              ? "VERROU : tout bascule au clic"
              : "MAINT. : tout est à maintenir"
          }
        >
          {mode === "auto" ? "AUTO" : mode === "lock" ? "VERROU" : "MAINT."}
        </button>
        <button
          type="button"
          className="hw-btn min-w-[64px] text-[10px]"
          onClick={() => {
            rack.resetAll();
            forceUpdate((n) => n + 1);
          }}
          disabled={activeCount === 0}
        >
          TOUT OFF
        </button>
        {activeCount > 0 && (
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-bold" style={{ color }}>
            {activeCount} actif{activeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="hw-recess grid grid-cols-4 gap-1.5 p-1.5 sm:grid-cols-5">
        {FX_LIST.map((fx) => (
          <button
            key={fx.id}
            type="button"
            className="flex h-[52px] flex-col items-center justify-center rounded text-[10px] font-black uppercase touch-none select-none"
            style={{
              background: rack.getWet(fx.id) > 0 ? `linear-gradient(180deg, ${fx.color}, color-mix(in srgb, ${fx.color} 62%, #000))` : "linear-gradient(180deg, #202024, #0f0f12)",
              color: rack.getWet(fx.id) > 0 ? "#0a0a0a" : "#8a8a92",
              boxShadow: rack.getWet(fx.id) > 0 ? `0 0 16px ${fx.color}99, 0 0 4px ${fx.color}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.35)` : "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 5px rgba(0,0,0,0.6), 0 1px 0 #000",
              outline: selected === fx.id ? `2px solid ${fx.color}` : undefined,
            }}
            onPointerDown={(e) => handleFxPress(fx.id, e)}
            onPointerUp={() => handleFxRelease(fx.id)}
            onPointerCancel={() => handleFxRelease(fx.id)}
            onLostPointerCapture={() => handleFxRelease(fx.id)}
            onKeyDown={(e) => handleKeyDown(e, fx.id)}
            onKeyUp={(e) => handleKeyUp(e, fx.id)}
            aria-pressed={rack.getWet(fx.id) > 0}
          >
            <span className="text-lg">{fx.glyph}</span>
            <span>{fx.label}</span>
            {fx.trigger && <span className="absolute right-1 top-1 text-[8px]">●</span>}
          </button>
        ))}
      </div>

      <div className="hw-recess relative flex flex-col gap-3 p-3" style={{ borderLeft: `3px solid ${meta.color}` }}>
        <div className="flex items-center gap-2">
          <span className="text-lg" style={{ color: meta.color }}>
            {meta.glyph}
          </span>
          <h3 className="font-black uppercase" style={{ color: meta.color }}>
            {meta.label}
          </h3>
          <span className="text-[11px] text-neutral-400">{meta.title}</span>
        </div>

        {meta.beat !== null && (
          <div className="flex flex-wrap gap-1">
            {BEAT_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                className="min-w-[34px] h-8 rounded text-[11px] font-bold"
                style={{
                  background: rack.getBeat(selected) === i ? meta.color : "#2a2a2a",
                  color: rack.getBeat(selected) === i ? "#000" : "#ccc",
                }}
                onClick={() => {
                  rack.setBeat(selected, i);
                  forceUpdate((n) => n + 1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-around gap-3">
          <Knob
            label="Niveau"
            value={isActive ? wet : levels[selected]}
            min={0}
            max={1}
            defaultValue={levels[selected]}
            color={meta.color}
            size={52}
            led
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              setLevels(prev => ({ ...prev, [selected]: v }));
              if (isActive) rack.setWet(selected, v);
              forceUpdate((n) => n + 1);
            }}
          />
          {meta.p1 && (
            <Knob
              label={meta.p1.label}
              value={rack.getParam(selected, "p1")}
              min={0}
              max={1}
              defaultValue={meta.p1.def}
              color={meta.color}
              size={52}
              led
              format={meta.p1.fmt}
              onChange={(v) => {
                rack.setParam(selected, "p1", v);
                forceUpdate((n) => n + 1);
              }}
            />
          )}
          {meta.p2 && (
            <Knob
              label={meta.p2.label}
              value={rack.getParam(selected, "p2")}
              min={0}
              max={1}
              defaultValue={meta.p2.def}
              color={meta.color}
              size={52}
              led
              format={meta.p2.fmt}
              onChange={(v) => {
                rack.setParam(selected, "p2", v);
                forceUpdate((n) => n + 1);
              }}
            />
          )}
        </div>

        {meta.p1 && meta.p2 && (
          <FxXyPad
            x={rack.getParam(selected, "p1")}
            y={rack.getParam(selected, "p2")}
            color={meta.color}
            labelX={meta.p1.label}
            labelY={meta.p2.label}
            fmtX={meta.p1.fmt}
            fmtY={meta.p2.fmt}
            defX={meta.p1.def}
            defY={meta.p2.def}
            onChange={(x, y) => {
              rack.setParam(selected, "p1", x);
              rack.setParam(selected, "p2", y);
              forceUpdate((n) => n + 1);
            }}
          />
        )}

        {!meta.p1 && !meta.p2 && (
          <p className="text-[11px] text-neutral-400">
            Tiens le pad pour inverser les derniers {meta.title.toLowerCase()}
          </p>
        )}
      </div>
    </div>
  );
}
