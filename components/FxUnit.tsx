"use client";

import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import { Knob } from "./Knob";
import { useFrameLoop } from "./frameLoop";
import { FxXyPad } from "./FxXyPad";
import { FXRack, FX_META, BEAT_DIVS, BEAT_LABELS, type FxName } from "@/lib/audio/FXRack";
import { subscribeAutomation, getAutomationVersion } from "@/lib/audio/deckAutomation";

const HOLD_MS = 300;
const pct = (v: number) => `${Math.round(v * 100)}%`;

type Saved = { levels?: Record<string, number>; beats?: Record<string, number>; params?: Record<string, [number, number]> };
function restore(rack: FXRack, ids: FxName[], storageKey?: string): Record<string, number> {
  const levels: Record<string, number> = Object.fromEntries(ids.map((id) => [id, FX_META.get(id)!.trigger ? 1 : 0.85]));
  if (!storageKey || typeof window === "undefined") return levels;
  try {
    const s = JSON.parse(localStorage.getItem(`djsynth.fxunit.${storageKey}`) || "{}") as Saved;
    for (const id of ids) {
      if (typeof s.levels?.[id] === "number") levels[id] = s.levels[id];
      if (typeof s.beats?.[id] === "number") rack.setBeat(id, s.beats[id]);
      const p = s.params?.[id];
      if (p) { rack.setParam(id, "p1", p[0]); rack.setParam(id, "p2", p[1]); }
    }
  } catch {
    /* corrupt or unavailable storage: defaults */
  }
  return levels;
}

export function FxUnit({ rack, ids, color, storageKey }: { rack: FXRack; ids: FxName[]; color: string; storageKey?: string }) {
  const [selected, setSelected] = useState<FxName>(ids[0]);
  const [levels, setLevels] = useState<Record<string, number>>(() => restore(rack, ids, storageKey));
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  useSyncExternalStore(subscribeAutomation, getAutomationVersion, getAutomationVersion); // redraw when a REC replay changes the deck
  const press = useRef<Map<FxName, { at: number; wasOn: boolean }>>(new Map());
  const led = useRef<HTMLSpanElement>(null);
  const padHeld = useRef(false);
  useEffect(() => { rack.warm(); }, [rack]); // the effects that replay the last beats start listening once the unit is shown

  function persist(next: Record<string, number> = levels) {
    if (!storageKey) return;
    try {
      localStorage.setItem(`djsynth.fxunit.${storageKey}`, JSON.stringify({
        levels: next,
        beats: Object.fromEntries(ids.map((id) => [id, rack.getBeat(id)])),
        params: Object.fromEntries(ids.map((id) => [id, [rack.getParam(id, "p1"), rack.getParam(id, "p2")]]))
      }));
    } catch {}
  }

  const down = (id: FxName, t: number) => {
    if (press.current.has(id)) return;
    const meta = FX_META.get(id)!;
    const wasOn = rack.getWet(id) > 0;
    press.current.set(id, { at: t, wasOn });
    setSelected(id);
    if (meta.trigger || !wasOn) rack.setWet(id, levels[id] ?? 0.85);
    rerender();
  };

  const up = (id: FxName, t: number) => {
    const p = press.current.get(id);
    if (!p) return;
    press.current.delete(id);
    const meta = FX_META.get(id)!;
    const long = t - p.at >= HOLD_MS;
    if (meta.trigger) rack.setWet(id, 0);
    else if (!p.wasOn && long) rack.setWet(id, 0);
    else if (p.wasOn && !long) rack.setWet(id, 0);
    rerender();
  };

  const allOff = () => {
    ids.forEach((id) => rack.setWet(id, 0));
    rerender();
  };

  const meta = FX_META.get(selected)!;
  const beatIdx = rack.getBeat(selected);
  const active = ids.filter((id) => rack.getWet(id) > 0).length;

  useFrameLoop(led, () => {
    const el = led.current;
    if (!el) return;
    const b = rack.beatInfo();
    const lit = !!b && b.toNext > 0 && b.period - b.toNext < 0.09;
    el.style.opacity = lit ? "1" : "0.18";
  });

  return (
    <div className="hw-panel flex flex-col gap-2.5 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color }}>FX</span>
        <span ref={led} className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}`, opacity: 0.18 }} title="Tempo de la platine" />
        <span className="font-mono text-[11px] text-neutral-400">♩ {rack.getBpm().toFixed(1)}</span>
        {active > 0 && <span className="text-[10px] font-bold text-neutral-300">{active} actif{active > 1 ? "s" : ""}</span>}
        <button type="button" className="hw-btn ml-auto px-2 py-1 text-[10px] font-bold" disabled={active === 0} onClick={allOff} title="Coupe tous les effets">OFF</button>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid w-[228px] shrink-0 grid-cols-3 gap-1.5">
          {ids.map((id) => {
            const m = FX_META.get(id)!;
            const on = rack.getWet(id) > 0;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                title={m.title}
                className="relative flex h-[56px] flex-col items-center justify-center gap-0.5 rounded text-[10px] font-black uppercase touch-none select-none"
                style={{
                  background: on ? `linear-gradient(180deg, ${m.color}, color-mix(in srgb, ${m.color} 62%, #000))` : "linear-gradient(180deg, #202024, #0f0f12)",
                  color: on ? "#0a0a0a" : "#8a8a92",
                  boxShadow: on ? `0 0 16px ${m.color}99, 0 0 4px ${m.color}, inset 0 1px 0 rgba(255,255,255,0.45)` : "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.6)",
                  outline: selected === id ? `2px solid ${m.color}` : undefined,
                  outlineOffset: 1,
                }}
                onPointerDown={(e) => {
                  // capture can fail (pointer already gone): the press must still register
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  down(id, e.timeStamp);
                }}
                onPointerUp={(e) => up(id, e.timeStamp)}
                onPointerCancel={(e) => up(id, e.timeStamp)}
                onLostPointerCapture={(e) => up(id, e.timeStamp)}
                onKeyDown={(e) => { if (e.repeat || (e.key !== " " && e.key !== "Enter")) return; e.preventDefault(); down(id, e.timeStamp); }}
                onKeyUp={(e) => { if (e.key !== " " && e.key !== "Enter") return; e.preventDefault(); up(id, e.timeStamp); }}
              >
                <span className="text-base leading-none">{m.glyph}</span>
                <span>{m.label}</span>
                {m.trigger && <span className="absolute right-1 top-0.5 text-[8px]">●</span>}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-sm font-black uppercase tracking-[0.15em]" style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-[11px] leading-snug text-neutral-300">Tu entends : {meta.title.charAt(0).toLowerCase() + meta.title.slice(1)}</span>
          </div>
          {meta.beat !== null && (
            <div className="flex items-center gap-1.5">
              <button type="button" className="hw-btn px-2 py-1 text-[11px] font-bold" disabled={beatIdx <= 0} onClick={() => { rack.setBeat(selected, beatIdx - 1); persist(); rerender(); }}>◀</button>
              <span className="hw-recess min-w-[56px] rounded px-2 py-1 text-center font-mono text-[12px] font-bold" style={{ color: meta.color }}>{BEAT_LABELS[beatIdx]}</span>
              <button type="button" className="hw-btn px-2 py-1 text-[11px] font-bold" disabled={beatIdx >= BEAT_DIVS.length - 1} onClick={() => { rack.setBeat(selected, beatIdx + 1); persist(); rerender(); }}>▶</button>
              <span className="text-[10px] text-neutral-500">temps</span>
            </div>
          )}
          <div className="flex items-end gap-3">
            <Knob
              label="LEVEL"
              value={levels[selected] ?? 0.85}
              min={0.05}
              max={1}
              defaultValue={0.85}
              color={color}
              size={56}
              led
              format={pct}
              onChange={(v) => {
                const lv = Math.max(0.05, v);
                const next = { ...levels, [selected]: lv };
                setLevels(next);
                if (rack.getWet(selected) > 0) rack.setWet(selected, lv);
                persist(next);
                rerender();
              }}
            />
            {meta.p1 && (
              <Knob
                key={`${selected}-p1`}
                label={meta.p1.label}
                value={rack.getParam(selected, "p1")}
                min={0}
                max={1}
                defaultValue={meta.p1.def}
                color={meta.color}
                size={46}
                led
                format={meta.p1.fmt}
                onChange={(v) => { rack.setParam(selected, "p1", v); persist(); rerender(); }}
              />
            )}
            {meta.p2 && (
              <Knob
                key={`${selected}-p2`}
                label={meta.p2.label}
                value={rack.getParam(selected, "p2")}
                min={0}
                max={1}
                defaultValue={meta.p2.def}
                color={meta.color}
                size={46}
                led
                format={meta.p2.fmt}
                onChange={(v) => { rack.setParam(selected, "p2", v); persist(); rerender(); }}
              />
            )}
          </div>
          <FxXyPad
            x={meta.p1 ? rack.getParam(selected, "p1") : 0.5}
            y={levels[selected] ?? 0.85}
            color={meta.color}
            labelX={meta.p1?.label ?? "—"}
            labelY="LEVEL"
            fmtX={meta.p1?.fmt ?? pct}
            fmtY={pct}
            defX={meta.p1?.def ?? 0.5}
            defY={0.85}
            onPress={() => {
              padHeld.current = meta.trigger || rack.getWet(selected) === 0;
              if (padHeld.current) rack.setWet(selected, levels[selected] ?? 0.85);
              rerender();
            }}
            onChange={(x, y) => {
              const lv = Math.max(0.05, y);
              if (meta.p1) rack.setParam(selected, "p1", x);
              const next = { ...levels, [selected]: lv };
              setLevels(next);
              if (rack.getWet(selected) > 0) rack.setWet(selected, lv);
              rerender();
            }}
            onRelease={() => {
              if (padHeld.current) {
                rack.setWet(selected, 0);
                padHeld.current = false;
              }
              persist();
              rerender();
            }}
          />
        </div>
      </div>
      <span className="text-[10px] leading-snug text-neutral-500">Court : marche / arrêt · long : momentané · pad X/Y : toucher pour jouer</span>
    </div>
  );
}
