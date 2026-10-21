"use client";

import { useEffect, useRef, useState } from "react";
import { Knob } from "../Knob";
import { WaveEditor } from "./WaveEditor";
import { StemEditPanel } from "./StemEditPanel";
import type { Region, StemCtl } from "@/lib/atelier/types";

export function StemZoom({
  label,
  color,
  buf,
  ctl,
  grid,
  playhead,
  playing,
  busy,
  working,
  onCtl,
  onPlay,
  onStop,
  onAction,
  onClose,
  onEdit,
  canUndo,
  onUndo,
}: {
  label: string;
  color: string;
  buf: AudioBuffer;
  ctl: StemCtl;
  grid: { bpm: number; offset: number } | null;
  playhead: () => number | null;
  playing: boolean;
  busy: boolean;
  working: string | null;
  onCtl: (c: StemCtl) => void;
  onPlay: (region: Region | null, loop: boolean, solo: boolean) => void;
  onStop: () => void;
  onAction: (what: "keys" | "sound" | "save" | "wav") => void;
  onClose: () => void;
  onEdit?: (label: string, run: (buf: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer) => void;
  canUndo?: boolean;
  onUndo?: () => void;
}) {
  const [view, setView] = useState<Region | null>(null);
  const [draft, setDraft] = useState<Region | null>(
    ctl.part ? { a: ctl.part.a, b: ctl.part.b } : null
  );
  const [solo, setSolo] = useState(true);
  const [snap, setSnap] = useState(grid?.bpm ? true : false);
  const [seenPart, setSeenPart] = useState(ctl.part);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const ctlRef = useRef(ctl);

  const spb = grid?.bpm ? 60 / grid.bpm : 0;
  const dur = buf.duration;
  const partDur = draft ? draft.b - draft.a : dur;
  const beats = grid?.bpm ? partDur / spb : 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    ctlRef.current = ctl;
  }, [ctl]);

  if (ctl.part !== seenPart) {
    setSeenPart(ctl.part);
    setDraft(ctl.part ? { a: ctl.part.a, b: ctl.part.b } : null);
  }

  const select = (r: Region | null) => {
    if (timer.current) clearTimeout(timer.current);
    setDraft(r);
    timer.current = setTimeout(() => {
      if (!r) {
        onCtl({ ...ctlRef.current, part: null });
        timer.current = null;
        return;
      }
      let a = r.a;
      let b = r.b;
      if (snap && grid?.bpm) {
        const offset = grid.offset;
        a = offset + Math.round((a - offset) / spb) * spb;
        b = offset + Math.round((b - offset) / spb) * spb;
        if (b <= a) b = a + spb;
      }
      onCtl({
        ...ctlRef.current,
        part: { a, b, loop: ctlRef.current.part?.loop ?? true },
      });
      setDraft({ a, b });
      timer.current = null;
    }, 200);
  };

  const zoomIn = () => {
    const currentView = view ?? { a: 0, b: dur };
    const center = (currentView.a + currentView.b) / 2;
    const width = Math.max((currentView.b - currentView.a) / 2, 0.25);
    setView({
      a: Math.max(0, center - width / 2),
      b: Math.min(dur, center + width / 2),
    });
  };

  const zoomOut = () => {
    const currentView = view ?? { a: 0, b: dur };
    const center = (currentView.a + currentView.b) / 2;
    const width = Math.min(currentView.b - currentView.a, dur) * 2;
    if (width >= dur) {
      setView(null);
      return;
    }
    setView({
      a: Math.max(0, center - width / 2),
      b: Math.min(dur, center + width / 2),
    });
  };

  const setPartLength = (beats: number) => {
    if (!grid?.bpm) return;
    const offset = grid.offset;
    const pos = playhead() ?? 0;
    let a = offset + Math.floor((pos - offset) / spb) * spb;
    if (ctl.part) {
      a = offset + Math.floor((ctl.part.a - offset) / spb) * spb;
    }
    while (a < 0) a += spb;
    if (a + beats * spb > dur) a = Math.max(0, dur - beats * spb);
    const b = Math.min(a + beats * spb, dur);
    const newPart = { a, b, loop: ctl.part?.loop ?? true };
    onCtl({ ...ctl, part: newPart });
    setDraft({ a, b });
  };

  const isWorking = working !== null;
  const isDisabled = isWorking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="hw-panel w-full max-w-6xl max-h-[92vh] overflow-y-auto p-3 flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
            ÉDITEUR DE STEM
          </h2>
          <span className="text-sm font-black" style={{ color }}>
            {label}
          </span>
          <span className="text-[11px] text-neutral-300 ml-auto">
            {draft
              ? `PARTIE ${draft.a.toFixed(2)} → ${draft.b.toFixed(2)} s · ${partDur.toFixed(2)} s${
                  grid?.bpm ? ` · ${beats.toFixed(1)} temps` : ""
                }${ctl.part?.loop ? " · BOUCLE" : ""}`
              : "TOUT LE STEM"}
            {busy && (
              <span className="ml-2" style={{ color }}>
                CALCUL…
              </span>
            )}
          </span>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => setView(null)}
          >
            TOUT VOIR
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => setView(draft ? {
              a: Math.max(0, draft.a - partDur * 0.15),
              b: Math.min(dur, draft.b + partDur * 0.15),
            } : null)}
            disabled={!draft}
          >
            ZOOM SUR LA PARTIE
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={zoomIn}
          >
            +
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={zoomOut}
          >
            −
          </button>
        </div>

        <WaveEditor
          buf={buf}
          sel={draft}
          onSel={select}
          playhead={playhead}
          grid={grid}
          view={view}
          color={color}
          height={220}
        />

        <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${playing ? "hw-btn-on" : ""}`}
            style={playing ? { ["--led" as string]: color } : {}}
            onClick={() => (playing ? onStop() : onPlay(ctl.part ? { a: ctl.part.a, b: ctl.part.b } : null, ctl.part ? ctl.part.loop : false, solo))}
            disabled={isDisabled}
          >
            {playing ? "■ STOP" : "▶ JOUER LA PARTIE"}
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${solo ? "hw-btn-on" : ""}`}
            style={solo ? { ["--led" as string]: color } : {}}
            onClick={() => setSolo(!solo)}
            disabled={isDisabled}
          >
            SEUL
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${ctl.part?.loop ? "hw-btn-on" : ""}`}
            style={ctl.part?.loop ? { ["--led" as string]: color } : {}}
            onClick={() => onCtl({ ...ctl, part: ctl.part ? { ...ctl.part, loop: !ctl.part.loop } : null })}
            disabled={!draft || isDisabled}
          >
            BOUCLE
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${ctl.reverse ? "hw-btn-on" : ""}`}
            style={ctl.reverse ? { ["--led" as string]: color } : {}}
            onClick={() => onCtl({ ...ctl, reverse: !ctl.reverse })}
            disabled={isDisabled}
          >
            REVERSE
          </button>
          <Knob
            label="SUB"
            value={ctl.sub}
            min={0}
            max={1}
            defaultValue={0}
            onChange={(v) => onCtl({ ...ctl, sub: v })}
            color={color}
            size={36}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="HAUTEUR"
            value={ctl.pitch}
            min={-12}
            max={12}
            defaultValue={0}
            onChange={(v) => onCtl({ ...ctl, pitch: Math.round(v) })}
            color={color}
            size={36}
            led
            format={(v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`}
          />
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${snap ? "hw-btn-on" : ""}`}
            style={snap ? { ["--led" as string]: color } : {}}
            onClick={() => setSnap(!snap)}
            disabled={!grid?.bpm || isDisabled}
          >
            CALER SUR LES TEMPS
          </button>
          {grid?.bpm ? (
            <>
              {[1, 2, 4, 8, 16].map((b) => (
                <button
                  key={b}
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${ctl.part?.loop && Math.abs((ctl.part.b - ctl.part.a) / spb - b) < 0.01 ? "hw-btn-on" : ""}`}
                  style={ctl.part?.loop && Math.abs((ctl.part.b - ctl.part.a) / spb - b) < 0.01 ? { ["--led" as string]: color } : {}}
                  onClick={() => setPartLength(b)}
                  disabled={isDisabled}
                >
                  {b}
                </button>
              ))}
              <span className="text-[10px]">TEMPS</span>
            </>
          ) : null}
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => onCtl({ ...ctl, part: null })}
            disabled={isDisabled}
          >
            TOUT LE STEM
          </button>
        </div>

        <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => onAction("keys")}
            disabled={isDisabled}
          >
            → CLAVIER
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => onAction("sound")}
            disabled={isDisabled}
          >
            + SON
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => onAction("save")}
            disabled={isDisabled}
          >
            {working === "save" ? "…" : "SAUVER"}
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => onAction("wav")}
            disabled={isDisabled}
          >
            ⤓ WAV
          </button>
        </div>

        {onEdit && (
          <StemEditPanel buf={buf} region={draft} bpm={grid?.bpm ?? 0} color={color} busy={busy || working !== null} canUndo={!!canUndo} onEdit={onEdit} onUndo={() => onUndo?.()} />
        )}

        <p className="text-[10px] text-neutral-500">
          Glisse sur la forme d&apos;onde pour choisir la partie que joue ce stem dans le mix. BOUCLE : elle se répète sur tout le morceau, calée sur sa place ; sinon elle ne joue qu&apos;à sa place. SUB ajoute une octave en dessous. Les exports reprennent tous les réglages du stem.
        </p>
      </div>
    </div>
  );
}
