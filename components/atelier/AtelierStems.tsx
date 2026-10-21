"use client";

import { useState, useEffect } from "react";
import { Knob } from "../Knob";
import { WaveEditor } from "./WaveEditor";
import { StemZoom } from "./StemZoom";
import { addToBank } from "@/lib/atelier/bank";
import { encodeWav } from "@/lib/audio/engine";
import { downloadBlob } from "@/lib/atelier/download";
import type { StemMixer } from "@/lib/atelier/stemMixer";
import type { Region, StemCtl, WorkSample, SoundKind } from "@/lib/atelier/types";
import { DEFAULT_CTL, STEM_FR, STEM_COLOR } from "@/lib/atelier/types";
import { enhanceOptions } from "@/lib/atelier/stemEnhance";
import type { SampleKeys } from "@/lib/atelier/players";

export function AtelierStems({
  sound,
  mixer,
  color,
  playhead,
  cursor,
  playing,
  loop,
  sel,
  onCtls,
  onPlay,
  onStop,
  onSeek,
  toKeys,
  onNewSound,
  onSaved,
  keys,
  onStemEdit,
  canUndoStem,
  onUndoStem,
}: {
  sound: WorkSample;
  mixer: StemMixer;
  color: string;
  playhead: () => number | null;
  cursor: number;
  playing: boolean;
  loop: boolean;
  sel: Region | null;
  onCtls: (ctls: StemCtl[]) => void;
  onPlay: (from: number, region: Region | null, loop: boolean, only: number | null) => void;
  onStop: () => void;
  onSeek: (t: number) => void;
  toKeys: (buf: AudioBuffer, name: string) => void;
  onNewSound: (buf: AudioBuffer, name: string, kind: SoundKind) => void;
  onSaved: () => void;
  keys?: SampleKeys;
  onStemEdit?: (i: number, label: string, run: (buf: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer) => void;
  canUndoStem?: (i: number) => boolean;
  onUndoStem?: (i: number) => void;
}) {
  const stems = sound.stems ?? [];
  const ctls = stems.map((_, i) => sound.ctls?.[i] ?? DEFAULT_CTL);
  const grid = sound.bpm > 0 ? { bpm: sound.bpm, offset: sound.offset } : null;
  const spb = sound.bpm > 0 ? 60 / sound.bpm : 0;
  const anySolo = ctls.some((c) => c.solo);
  const [zoom, setZoom] = useState<number | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<{ stem: number; id: number; duration: number } | null>(null);
  const [triggerCounter, setTriggerCounter] = useState(0);

  const nameOf = (i: number) => STEM_FR[stems[i].name] ?? stems[i].name.toUpperCase();
  const colorOf = (i: number) => STEM_COLOR[stems[i].name] ?? color;

  useEffect(() => {
    if (!keys) return;
    const unsubscribe = keys.onNote((ev) => {
      const stemIndex = stems.findIndex((_, i) => `${sound.name} · ${nameOf(i)}` === keys.name);
      if (stemIndex !== -1) {
        setTriggerCounter(prev => prev + 1);
        setTrigger({ stem: stemIndex, id: triggerCounter + 1, duration: ev.duration });
      }
    });
    return () => unsubscribe();
  }, [keys, stems, sound.name]);

  const change = (i: number, patch: Partial<StemCtl>) => {
    const next = ctls.map((c, j) => (j === i ? { ...c, ...patch } : c));
    mixer.setCtl(i, next[i]);
    onCtls(next);
  };

  const setAll = (next: StemCtl[]) => {
    next.forEach((ctl, i) => {
      if (JSON.stringify(ctl) !== JSON.stringify(ctls[i])) {
        mixer.setCtl(i, ctl);
      }
    });
    onCtls(next);
  };

  const act = async (i: number, what: "keys" | "sound" | "save" | "wav") => {
    try {
      setWorking(`${what}-${i}`);
      setErr(null);
      const part = ctls[i].part;
      const region = part ? { a: part.a, b: part.b } : sel;
      const buf = await mixer.render(region, i);
      const name = `${sound.name} · ${nameOf(i)}`;

      switch (what) {
        case "keys":
          toKeys(buf, name);
          break;
        case "sound":
          onNewSound(buf, name, "stem");
          break;
        case "save":
          await addToBank(encodeWav(buf, 24), {
            name,
            kind: "stem",
            stem: stems[i].name,
            from: sound.name,
            bpm: sound.bpm,
            key: sound.key,
            dur: buf.duration,
            tags: "",
          });
          onSaved();
          setSaved(i);
          setTimeout(() => setSaved(null), 2000);
          break;
        case "wav":
          downloadBlob(encodeWav(buf, 24), `${sound.name}-${stems[i].name}.wav`);
          break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setWorking(null);
    }
  };

  const resetAll = () => {
    const next = ctls.map((c) => ({
      ...c,
      filter: 0,
      drive: 0,
      pan: 0,
      rev: 0,
      dly: 0,
      reverse: false,
      sub: 0,
      pitch: 0,
      part: null,
    }));
    setAll(next);
  };

  const preset = (type: "acapella" | "instru" | "drums" | "no-drums" | "all") => {
    const next = ctls.map((c, i) => {
      const isVoice = stems[i].name.toLowerCase().includes("vocals");
      const isDrums = stems[i].name.toLowerCase().includes("drums");
      let mute = false;

      switch (type) {
        case "acapella":
          mute = !isVoice;
          break;
        case "instru":
          mute = isVoice || isDrums;
          break;
        case "drums":
          mute = !isDrums;
          break;
        case "no-drums":
          mute = isDrums;
          break;
        case "all":
          mute = false;
          break;
      }

      return { ...c, mute, solo: false };
    });
    setAll(next);
  };

  const setLoop = (i: number, beats: number) => {
    if (!grid?.bpm) return;
    const pos = playhead() ?? cursor;
    const offset = grid.offset;
    let a = offset + Math.floor((pos - offset) / spb) * spb;
    if (ctls[i].part) {
      a = offset + Math.floor((ctls[i].part.a - offset) / spb) * spb;
    }
    while (a < 0) a += spb;
    if (a + beats * spb > stems[i].buf.duration) a = Math.max(0, stems[i].buf.duration - beats * spb);
    const b = Math.min(a + beats * spb, stems[i].buf.duration);
    change(i, { part: { a, b, loop: true } });
  };

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          3 · STEMS
        </h2>
        <span className="text-[10px] text-neutral-400">{stems.length} PISTES</span>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => preset("acapella")}
        >
          ACAPELLA
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => preset("instru")}
        >
          INSTRU
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => preset("drums")}
        >
          BATTERIE SEULE
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => preset("no-drums")}
        >
          SANS BATTERIE
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => preset("all")}
        >
          TOUT
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={resetAll}
          title="Remet à zéro filtres, drive, panoramique, envois, reverse, sub, hauteur et parties de tous les stems ; garde volumes, solos et muets"
        >
          TOUT OFF
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={async () => {
            try {
              setWorking("mix");
              const buf = await mixer.render(sel);
              onNewSound(buf, `${sound.name} · mix`, "sample");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Erreur inconnue");
            } finally {
              setWorking(null);
            }
          }}
          disabled={working !== null}
        >
          {working === "mix" ? "…" : "MIX → NOUVEAU SON"}
        </button>
        {err ? <span className="text-[10px] text-red-500">{err}</span> : null}
      </div>

      <p className="text-[10px] text-neutral-500">
        Clic sur une piste : placer la lecture · double-clic : l&apos;éditer en grand (partie, boucle, reverse, sub).
      </p>

      {stems.map((stem, i) => {
        const c = ctls[i];
        const audible = !c.mute && (!anySolo || c.solo);
        const stemColor = colorOf(i);
        const stemName = nameOf(i);
        const isKeysStem = keys && `${sound.name} · ${stemName}` === keys.name;

        return (
          <div key={i} className="hw-recess flex flex-col gap-1 p-1.5 relative">
            {isKeysStem && (
              <div className="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-bold text-neutral-100 bg-neutral-800 rounded">
                CLAVIER
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="text-[11px] font-black w-[76px]"
                style={{ color: stemColor }}
              >
                {stemName}
              </span>
              <button
                className={`hw-btn px-1.5 py-0.5 text-[10px] font-black ${c.solo ? "hw-btn-on" : ""}`}
                style={c.solo ? { ["--led" as string]: stemColor } : {}}
                onClick={() => {
                  const next = ctls.map((ctl, j) => ({
                    ...ctl,
                    solo: j === i ? !ctl.solo : false,
                  }));
                  setAll(next);
                }}
              >
                S
              </button>
              <button
                className={`hw-btn px-1.5 py-0.5 text-[10px] font-black ${c.mute ? "hw-btn-on" : ""}`}
                style={c.mute ? { ["--led" as string]: stemColor } : {}}
                onClick={() => change(i, { mute: !c.mute })}
              >
                M
              </button>
              <Knob
                label="VOL"
                value={c.vol}
                min={0}
                max={1.5}
                defaultValue={1}
                onChange={(v) => change(i, { vol: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="FILTRE"
                value={c.filter}
                min={-1}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { filter: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => v < -0.02 ? `PB ${Math.round(Math.abs(v) * 100)}` : v > 0.02 ? `PH ${Math.round(Math.abs(v) * 100)}` : "—"}
              />
              <Knob
                label="DRIVE"
                value={c.drive}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { drive: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="PAN"
                value={c.pan}
                min={-1}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { pan: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => v < -0.02 ? `G ${Math.round(-v * 100)}` : v > 0.02 ? `D ${Math.round(v * 100)}` : "C"}
              />
              <Knob
                label="RÉV"
                value={c.rev}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { rev: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="ÉCHO"
                value={c.dly}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { dly: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="SUB"
                value={c.sub}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => change(i, { sub: v })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Knob
                label="HAUT."
                value={c.pitch}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={(v) => change(i, { pitch: Math.round(v) })}
                color={stemColor}
                size={30}
                led
                format={(v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`}
              />
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${c.reverse ? "hw-btn-on" : ""}`}
                style={c.reverse ? { ["--led" as string]: stemColor } : {}}
                onClick={() => change(i, { reverse: !c.reverse })}
              >
                REVERSE
              </button>
              {grid?.bpm ? (
                <>
                  <span className="text-[10px]">BOUCLE</span>
                  {[1/4, 1/2, 1, 2, 4, 8, 16].map((b) => (
                    <button
                      key={b}
                      className={`hw-btn px-2 py-1 text-[11px] font-bold ${c.part?.loop && Math.abs((c.part.b - c.part.a) / spb - b) < 0.01 ? "hw-btn-on" : ""}`}
                      style={c.part?.loop && Math.abs((c.part.b - c.part.a) / spb - b) < 0.01 ? { ["--led" as string]: stemColor } : {}}
                      onClick={() => setLoop(i, b)}
                    >
                      {b === 0.25 ? "1/4" : b === 0.5 ? "1/2" : b}
                    </button>
                  ))}
                  <button
                    className="hw-btn px-2 py-1 text-[11px] font-bold"
                    onClick={() => change(i, { part: null })}
                  >
                    OFF
                  </button>
                </>
              ) : null}
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => onPlay(playhead() ?? cursor, sel, loop, i)}
                title="Écouter ce stem seul"
              >
                ▶ SEUL
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => act(i, "keys")}
                disabled={working !== null}
              >
                → CLAVIER
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => act(i, "sound")}
                disabled={working !== null}
              >
                + SON
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => act(i, "save")}
                disabled={working !== null}
              >
                {saved === i ? "SAUVÉ" : working === `save-${i}` ? "…" : "SAUVER"}
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => act(i, "wav")}
                disabled={working !== null}
              >
                ⤓ WAV
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => setZoom(i)}
              >
                ÉDITER
              </button>
              <select
                className="hw-well bg-transparent px-1 py-0.5 text-[11px] text-neutral-200"
                value=""
                disabled={working !== null || !onStemEdit}
                title="Améliorer ce stem : options adaptées à son type (chaque option garde la durée)"
                onChange={(e) => {
                  const opt = enhanceOptions(stems[i].name).find((o) => o.key === e.target.value);
                  if (opt && onStemEdit) onStemEdit(i, opt.label, opt.run);
                  e.target.value = "";
                }}
              >
                <option value="">AMÉLIORER…</option>
                {enhanceOptions(stems[i].name).map((o) => (
                  <option key={o.key} value={o.key} title={o.hint}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="relative" style={{ position: 'relative' }}>
              <WaveEditor
                buf={stem.buf}
                sel={null}
                part={c.part ? { a: c.part.a, b: c.part.b } : null}
                playhead={playhead}
                grid={grid}
                color={stemColor}
                height={56}
                dim={!audible}
                label={stemName}
                onSeek={onSeek}
                onDoubleClick={() => setZoom(i)}
              />
              {trigger && trigger.stem === i && (
                <div
                  key={trigger.id}
                  className="stem-trait"
                  style={{
                    animationDuration: `${trigger.duration}s`,
                    backgroundColor: stemColor,
                    boxShadow: `0 0 6px ${stemColor}`
                  }}
                  onAnimationEnd={() => setTrigger(null)}
                />
              )}
            </div>
          </div>
        );
      })}

      {zoom !== null && (
        <StemZoom
          label={nameOf(zoom)}
          color={colorOf(zoom)}
          buf={stems[zoom].buf}
          ctl={ctls[zoom]}
          grid={grid}
          playhead={playhead}
          playing={playing}
          busy={mixer.busy}
          working={working && working.endsWith(`-${zoom}`) ? working.split("-")[0] : null}
          onCtl={(c) => change(zoom, c)}
          onPlay={(r, lp, solo) => onPlay(r ? r.a : playhead() ?? cursor, r, lp, solo ? zoom : null)}
          onStop={onStop}
          onAction={(w) => act(zoom, w)}
          onClose={() => setZoom(null)}
          onEdit={onStemEdit ? (label, run) => onStemEdit(zoom, label, run) : undefined}
          canUndo={canUndoStem?.(zoom) ?? false}
          onUndo={() => onUndoStem?.(zoom)}
        />
      )}
    </div>
  );
}
