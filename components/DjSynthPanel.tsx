"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { DJ_PRESETS, ARP_DIVS } from "@/lib/audio/DjSynth";
import { BEAT_LABELS } from "@/lib/audio/fxTypes";
import { SCALES, CHORDS, ARP_PATTERNS, NOTE_NAMES, midiName, type ScaleId } from "@/lib/audio/theory";
import { Knob } from "./Knob";
import { FxXyPad } from "./FxXyPad";
import { PerfPad } from "./PerfPad";
import { DjFxPanel } from "./DjFxPanel";
import type { FxName } from "@/lib/audio/FXRack";
import { STEM_INFO } from "./DeckPanel";
import { NoteFollower, loadBassLine } from "@/lib/audio/noteFollower";

// stop the bass replay (and a transcription in flight) and give the bass stem back
function endBassReplay(follower: { current: NoteFollower | null }, loading: { current: AbortController | null }) {
  loading.current?.abort();
  loading.current = null;
  const f = follower.current;
  follower.current = null;
  if (!f) return;
  f.stop();
  if (f.deck.stemSynthIndex === f.deck.stemNames.indexOf("bass")) f.deck.setStemSynth(null);
}

export function DjSynthPanel({ engine }: { engine: DJEngine }) {
  const s = engine.djSynth;
  const [held, setHeld] = useState(new Set<number>());
  const [auto, setAuto] = useState(true);
  const [fxOpen, setFxOpen] = useState(false);
  const [stemSide, setStemSide] = useState<"A" | "B">("A");
  const [scOn, setScOn] = useState(false);
  const [scDepth, setScDepth] = useState(0.6);
  const [, setV] = useState(0);
  const force = () => setV((n) => n + 1);

  const save = () => {
    try {
      localStorage.setItem("djsynth.djsynth.v1", JSON.stringify(s.exportState()));
      localStorage.setItem("djsynth.djsynth.auto", auto ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    const t0 = setTimeout(() => {
      try {
        const raw = localStorage.getItem("djsynth.djsynth.v1");
        if (raw) s.importState(JSON.parse(raw));
      } catch {}
    }, 0);

    const t1 = setTimeout(() => {
      try {
        const raw = localStorage.getItem("djsynth.djsynth.auto");
        setAuto(raw !== "0");
      } catch {}
    }, 0);

    const interval = setInterval(() => {
      if (auto) {
        const k = engine.masterDeck()?.effectiveKey;
        if (k) {
          const newScale: ScaleId = k.mode === "minor" ? "minor" : "major";
          if (s.root !== k.pitchClass || s.scale !== newScale) {
            s.setKey(k.pitchClass, newScale);
          }
        }
      }
      setV((n) => n + 1);
    }, 400);

    return () => {
      clearInterval(interval);
      clearTimeout(t0);
      clearTimeout(t1);
      s.panic();
    };
  }, [engine, auto, s]);

  const currentScale = SCALES.find((x) => x.id === s.scale)!;
  const presetColor = DJ_PRESETS.find((p) => p.id === s.preset)!.color;

  // stems of one deck: play in place of a stem, and duck on its drums (sidechain)
  const sd = stemSide === "A" ? engine.deckA : engine.deckB;
  const replaced = sd.stemSynthIndex;
  const drumsIdx = sd.stemNames.indexOf("drums");
  // no sidechain while the synth replaces the drums itself: it would duck on its own sound
  const scSrc = scOn && drumsIdx >= 0 && replaced !== drumsIdx ? sd.stemTap(drumsIdx) : null;

  useEffect(() => {
    s.setSidechain(scSrc, scDepth);
  }, [s, scSrc, scDepth]);
  useEffect(() => () => s.setSidechain(null, 0), [s]);

  // "REJOUER LA BASSE": the synth replays the track's bass line (transcribed from its bass
  // stem) in place of that stem, so you hear your synth sound playing the same notes
  const [bass, setBass] = useState<{ side: "A" | "B"; status: "loading" | "on" | "error"; msg?: string; notes?: number } | null>(null);
  const follower = useRef<NoteFollower | null>(null);
  const loading = useRef<AbortController | null>(null);
  const bassIdx = sd.stemNames.indexOf("bass");

  const stopBass = () => {
    endBassReplay(follower, loading);
    setBass(null);
  };

  const startBass = async () => {
    const d = sd;
    const side = stemSide;
    const idx = d.stemNames.indexOf("bass");
    if (idx < 0) return;
    const ac = new AbortController();
    loading.current = ac;
    setBass({ side, status: "loading" });
    try {
      const notes = await loadBassLine(d, ac.signal);
      if (ac.signal.aborted) return;
      if (!notes || notes.length === 0) throw new Error("Pas de ligne de basse détectée dans ce morceau");
      d.setStemSynth(idx);
      const f = new NoteFollower(engine.ctx, s, d, notes, () => {
        follower.current = null;
        if (d.stemSynthIndex === d.stemNames.indexOf("bass")) d.setStemSynth(null);
        setBass(null);
      });
      f.start();
      follower.current = f;
      setBass({ side, status: "on", notes: notes.length });
    } catch (e) {
      if (!ac.signal.aborted) setBass({ side, status: "error", msg: (e as Error).message });
    } finally {
      if (loading.current === ac) loading.current = null;
    }
  };

  // module closed: stop the replay and give the bass stem back
  useEffect(() => () => endBassReplay(follower, loading), []);

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">SYNTHÉ DJ</span>
        <span className="text-[10px] font-bold text-neutral-300">
          {NOTE_NAMES[s.root]} {currentScale.label}
        </span>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${auto ? "hw-btn-on" : ""}`}
          onClick={() => setAuto(!auto)}
        >
          AUTO
        </button>
      </div>

      <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">STEMS</span>
        {(["A", "B"] as const).map((k) => (
          <button
            key={k}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${stemSide === k ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: k === "A" ? "#38bdf8" : "#f59e0b" }}
            onClick={() => setStemSide(k)}
          >
            PLATINE {k}
          </button>
        ))}
        {sd.stemsActive ? (
          <>
            <span className="text-[10px] text-neutral-400">Jouer à la place de</span>
            {sd.stemNames.map((n, i) => {
              const info = STEM_INFO[n] ?? { label: n.toUpperCase(), title: n };
              return (
                <button
                  key={n}
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${replaced === i ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: presetColor }}
                  title={`Le synthé joue à la place du stem ${info.title} (il passe par son fader, son filtre et ses effets). Rappuie pour rendre le stem`}
                  onClick={() => {
                    sd.setStemSynth(replaced === i ? null : i);
                    force();
                  }}
                >
                  {info.label}
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${scSrc ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: presetColor }}
              disabled={drumsIdx < 0 || replaced === drumsIdx}
              title="Le synthé baisse sur chaque kick de la batterie de cette platine (sidechain)"
              onClick={() => setScOn(!scOn)}
            >
              SIDECHAIN
            </button>
            <Knob
              label="Prof."
              value={scDepth}
              min={0}
              max={1}
              defaultValue={0.6}
              onChange={setScDepth}
              color={presetColor}
              size={36}
              led
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${bass?.side === stemSide && bass.status !== "error" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: presetColor }}
              disabled={bassIdx < 0 || (!!bass && bass.side !== stemSide && bass.status !== "error")}
              title="Le synthé rejoue la ligne de basse du morceau (transcrite depuis le stem basse), avec le son choisi, à la place du stem basse. La première fois, la transcription prend un moment"
              onClick={() => (bass && bass.status !== "error" ? stopBass() : startBass())}
            >
              {bass?.side === stemSide && bass.status === "loading" ? "TRANSCRIPTION…" : "REJOUER LA BASSE"}
            </button>
            {bass?.side === stemSide && bass.status === "on" && (
              <span className="text-[10px] text-neutral-400">{bass.notes} notes</span>
            )}
            {bass?.side === stemSide && bass.status === "error" && (
              <span className="text-[10px] text-red-400">{bass.msg}</span>
            )}
          </>
        ) : sd.stemReady ? (
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => {
              sd.setStemsActive(true);
              force();
            }}
          >
            ACTIVER LES STEMS
          </button>
        ) : (
          <span className="text-[10px] text-neutral-400">
            Prépare les stems de la platine {stemSide} pour jouer à la place d&apos;un stem
          </span>
        )}
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {NOTE_NAMES.map((n, i) => (
          <button
            key={i}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${i === s.root ? "hw-btn-on" : ""}`}
            onClick={() => {
              s.setKey(i, s.scale);
              setAuto(false);
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {SCALES.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.scale ? "hw-btn-on" : ""}`}
            onClick={() => {
              s.setKey(s.root, id);
              setAuto(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {DJ_PRESETS.map(({ id, glyph, label, color, title }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.preset ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            title={title}
            onClick={() => s.setPreset(id)}
          >
            {glyph} {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1">
        {[8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <PerfPad
            key={i}
            label={midiName(s.padMidi(i))}
            sub={String(i % currentScale.steps.length + 1)}
            color={presetColor}
            lit={i % currentScale.steps.length === 0}
            active={held.has(i)}
            height={50}
            onDown={() => {
              s.padDown(i, 1);
              setHeld(new Set(held).add(i));
            }}
            onUp={() => {
              s.padUp(i);
              if (!s.latch) setHeld(new Set([...held].filter((x) => x !== i)));
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHORDS.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.chord ? "hw-btn-on" : ""}`}
            onClick={() => s.setChord(id)}
          >
            {label}
          </button>
        ))}
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => s.setOctave(s.octave - 1)}
        >
          OCT −
        </button>
        <span className="text-[10px] font-bold text-neutral-300">{s.octave}</span>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => s.setOctave(s.octave + 1)}
        >
          OCT +
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.latch ? "hw-btn-on" : ""}`}
          onClick={() => s.setLatch(!s.latch)}
        >
          HOLD
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.quantize ? "hw-btn-on" : ""}`}
          onClick={() => s.setQuantize(!s.quantize)}
        >
          QUANT
        </button>
      </div>

      <div className="hw-recess flex flex-wrap items-center gap-1 p-1">
        <button
          className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${s.arp.on ? "hw-btn-on" : ""}`}
          onClick={() => s.setArp({ on: !s.arp.on })}
        >
          ARP
        </button>
        {ARP_PATTERNS.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${id === s.arp.pattern ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ pattern: id })}
          >
            {label}
          </button>
        ))}
        {ARP_DIVS.map(({ label }, i) => (
          <button
            key={i}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${i === s.arp.div ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ div: i })}
          >
            {label}
          </button>
        ))}
        {[1, 2, 3].map((o) => (
          <button
            key={o}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${o === s.arp.octaves ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ octaves: o })}
          >
            {o} OCT
          </button>
        ))}
        <Knob
          label="Durée"
          value={s.arp.gate}
          min={0.1}
          max={1}
          defaultValue={0.5}
          onChange={(v) => s.setArp({ gate: v })}
          color={presetColor}
          size={44}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FxXyPad
          x={s.knobs.cutoff}
          y={s.knobs.reso}
          color={presetColor}
          labelX="Filtre"
          labelY="Réso"
          fmtX={(v) => {
            const hz = 80 * 200 ** v;
            return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
          }}
          fmtY={(v) => `${(0.5 + v * 15.5).toFixed(1)} dB`}
          defX={s.presetDef.cutoff}
          defY={s.presetDef.reso}
          onChange={(x, y) => {
            s.setKnob("cutoff", x);
            s.setKnob("reso", y);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Knob
            label="Volume"
            value={s.knobs.vol}
            min={0}
            max={1.5}
            defaultValue={0.8}
            onChange={(v) => {
              s.setKnob("vol", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Drive"
            value={s.knobs.drive}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("drive", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Env."
            value={s.knobs.env}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("env", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Glide"
            value={s.knobs.glide}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("glide", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Release"
            value={s.knobs.release}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("release", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Wobble"
            value={s.knobs.wobble}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("wobble", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="flex flex-wrap items-center gap-1">
            {[1, 2, 3, 5, 6].map((i) => (
              <button
                key={i}
                className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${i === s.wobbleDiv ? "hw-btn-on" : ""}`}
                onClick={() => {
                  s.setWobbleDiv(i);
                  save();
                  force();
                }}
              >
                {BEAT_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["pump", "echo", "reverb", "sweep"] as FxName[]).map((name) => {
          return (
            <button
              key={name}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.fx.getWet(name as FxName) > 0 ? "hw-btn-on" : ""}`}
              onClick={() => s.fx.setWet(name as FxName, s.fx.getWet(name as FxName) > 0 ? 0 : 0.85)}
            >
              {name.toUpperCase()}
            </button>
          );
        })}
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setFxOpen(!fxOpen)}
        >
          TOUS LES EFFETS {fxOpen ? "▴" : "▾"}
        </button>
      </div>

      {fxOpen && <DjFxPanel rack={s.fx} color={presetColor} />}
    </div>
  );
}
