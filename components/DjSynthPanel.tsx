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
import { RhythmLinks } from "./RhythmLinks";
import { NoteFollower, loadStemLine, MIDI_TRACK } from "@/lib/audio/noteFollower";

// stop a note replay (and a transcription in flight); the synth stays where it is
function endReplay(follower: { current: NoteFollower | null }, loading: { current: AbortController | null }) {
  loading.current?.abort();
  loading.current = null;
  const f = follower.current;
  follower.current = null;
  if (!f) return;
  f.stop();
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

  const [keep, setKeep] = useState(false);
  const replacedName = replaced !== null ? (sd.stemNames[replaced] ?? null) : null;
  const otherDeck = stemSide === "A" ? engine.deckB : engine.deckA;
  const elsewhere = replaced === null && otherDeck.stemSynthIndex !== null;
  const info = (n: string) => STEM_INFO[n] ?? { label: n.toUpperCase(), title: n };
  const xf = engine.getCrossfade();
  const deckGain = stemSide === "A" ? Math.cos((xf * Math.PI) / 2) : Math.cos(((1 - xf) * Math.PI) / 2);
  const deckCut = replaced !== null && (deckGain < 0.05 || sd.volumeValue < 0.05);
  const modeOn = (k: boolean) => (replaced !== null ? sd.stemSynthKeep === k : keep === k);

  const [replay, setReplay] = useState<{ side: "A" | "B"; stem: string; status: "loading" | "on" | "error"; msg?: string; notes?: number } | null>(null);
  const follower = useRef<NoteFollower | null>(null);
  const loading = useRef<AbortController | null>(null);
  const replayHere = replay && replay.side === stemSide ? replay : null;
  const canReplay = replacedName !== null && !!MIDI_TRACK[replacedName];

  const stopReplay = () => {
    endReplay(follower, loading);
    setReplay(null);
  };

  const choose = (i: number | null) => {
    stopReplay();
    sd.setStemSynth(i, keep);
    force();
  };

  const chooseMode = (k: boolean) => {
    setKeep(k);
    if (replaced !== null) {
      sd.setStemSynth(replaced, k);
      force();
    }
  };

  const startReplay = async () => {
    endReplay(follower, loading);
    if (replacedName === null) return;
    const d = sd;
    const side = stemSide;
    const stem = replacedName;
    const ac = new AbortController();
    loading.current = ac;
    setReplay({ side, stem, status: "loading" });
    try {
      const notes = await loadStemLine(d, stem, ac.signal);
      if (ac.signal.aborted) return;
      if (!notes || notes.length === 0) throw new Error("Pas de notes détectées dans ce stem");
      const f = new NoteFollower(engine.ctx, s, d, notes, () => {
        follower.current = null;
        setReplay(null);
      });
      f.start();
      follower.current = f;
      setReplay({ side, stem, status: "on", notes: notes.length });
    } catch (e) {
      if (!ac.signal.aborted) setReplay({ side, stem, status: "error", msg: (e as Error).message });
    } finally {
      if (loading.current === ac) loading.current = null;
    }
  };

  const prepare = async () => {
    await sd.ensureStems();
    if (sd.stemReady) sd.setStemsActive(true);
    force();
  };

  // module closed: stop the replay and give the replaced stems back
  useEffect(() => () => {
    endReplay(follower, loading);
    engine.deckA.releaseStemSynth();
    engine.deckB.releaseStemSynth();
  }, [engine]);

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

      <div className="hw-recess flex flex-col gap-1.5 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">SYNTHÉ DANS LES STEMS</span>
          {(["A", "B"] as const).map((k) => (
            <button
              key={k}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${stemSide === k ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: k === "A" ? "#38bdf8" : "#f59e0b" }}
              onClick={() => {
                stopReplay();
                setStemSide(k);
              }}
            >
              PLATINE {k}
            </button>
          ))}
          <span className="text-[10px] text-neutral-300">
            {elsewhere
              ? `Le synthé joue dans un stem de la platine ${stemSide === "A" ? "B" : "A"} : choisis MASTER ou un stem ici pour le ramener.`
              : replacedName === null
              ? "Le synthé joue sur le master : joue les pads ci-dessous."
              : `Le synthé ${sd.stemSynthKeep ? "joue avec" : "remplace"} ${info(replacedName).title} (platine ${stemSide}) : il passe par son filtre, ses effets et le fader de la platine. ${
                  replayHere?.status === "on" ? "Il rejoue les notes du stem." : "Joue les pads ou lance REJOUER."
                }`}
          </span>
        </div>

        {!sd.audioBuffer ? (
          <span className="text-[10px] text-neutral-400">Charge un morceau sur la platine {stemSide} pour jouer dans ses stems.</span>
        ) : sd.stemStatus === "working" ? (
          <span className="text-[10px] text-neutral-400">Séparation des stems… {sd.stemProgress ?? 0} %</span>
        ) : sd.stemStatus === "blocked" ? (
          <>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              style={{ ["--led" as string]: presetColor }}
              onClick={prepare}
            >
              PRÉPARER LES STEMS
            </button>
            <span className="text-[10px] text-amber-400">mets les platines en pause pour séparer</span>
          </>
        ) : sd.stemStatus === "error" ? (
          <>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              style={{ ["--led" as string]: presetColor }}
              onClick={prepare}
            >
              PRÉPARER LES STEMS
            </button>
            <span className="text-[10px] text-red-400">échec — réessaie</span>
          </>
        ) : !sd.stemReady ? (
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            style={{ ["--led" as string]: presetColor }}
            onClick={prepare}
          >
            PRÉPARER LES STEMS
          </button>
        ) : !sd.stemsActive ? (
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
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-neutral-400">1 · OÙ JOUE LE SYNTHÉ</span>
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${replaced === null && !elsewhere ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: presetColor }}
                onClick={() => choose(null)}
                title="Le synthé sort directement sur le master, sans passer par une platine"
              >
                MASTER
              </button>
              {sd.stemNames.map((n, i) => (
                <button
                  key={n}
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${replaced === i ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: presetColor }}
                  onClick={() => choose(replaced === i ? null : i)}
                  title={`Le synthé joue dans le stem ${info(n).title} : son filtre, ses effets, le fader de la platine`}
                >
                  {info(n).label}
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-white/10" />
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${modeOn(false) ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: presetColor }}
                onClick={() => chooseMode(false)}
                title="Le stem se tait, le synthé prend sa place"
              >
                REMPLACER
              </button>
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${modeOn(true) ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: presetColor }}
                onClick={() => chooseMode(true)}
                title="Le stem continue, le synthé joue par-dessus"
              >
                DOUBLER
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-neutral-400">2 · QUI JOUE LES NOTES</span>
              <span className={`hw-btn px-2 py-1 text-[11px] font-bold ${!replayHere ? "hw-btn-on" : ""}`} style={{ ["--led" as string]: presetColor }}>TOI · PADS</span>
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${replayHere && replayHere.status !== "error" ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: presetColor }}
                disabled={!canReplay || (!!replay && replay.side !== stemSide && replay.status !== "error")}
                onClick={() => (replayHere && replayHere.status !== "error" ? stopReplay() : startReplay())}
                title={replacedName === null ? "Choisis d'abord un stem à l'étape 1" : !MIDI_TRACK[replacedName] ? "La batterie n'a pas de notes à rejouer" : "Le synthé rejoue les notes de ce stem (transcrites du morceau), avec le son choisi. La première fois, la transcription prend un moment"}
              >
                {replayHere?.status === "loading" ? "TRANSCRIPTION…" : `REJOUER ${replacedName ? info(replacedName).label : "LE STEM"}`}
              </button>
              {replayHere?.status === "on" && (
                <span className="text-[10px] text-neutral-400">{replayHere.notes} notes</span>
              )}
              {replayHere?.status === "error" && (
                <span className="text-[10px] text-red-400">{replayHere.msg}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-neutral-400">3 · SIDECHAIN</span>
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
            </div>

            {deckCut && (
              <div className="rounded-md bg-amber-500/10 p-1.5 text-[10px] text-amber-300 ring-1 ring-amber-500/30 flex flex-wrap items-center gap-2">
                <span>La platine {stemSide} est coupée (crossfader ou volume) : le synthé ne s&apos;entend pas.</span>
                <button
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                  onClick={() => {
                    engine.setCrossfade(0.5);
                    force();
                  }}
                >
                  CROSSFADER AU CENTRE
                </button>
              </div>
            )}
            {replayHere?.status === "on" && !sd.playing && (
              <div className="rounded-md bg-amber-500/10 p-1.5 text-[10px] text-amber-300 ring-1 ring-amber-500/30 flex flex-wrap items-center gap-2">
                <span>Lance la platine {stemSide} : le synthé suit sa lecture.</span>
              </div>
            )}
          </>
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
      <RhythmLinks engine={engine} />
    </div>
  );
}
