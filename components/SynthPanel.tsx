"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wave } from "@/lib/audio/Synth";
import { DJEngine, encodeWav } from "@/lib/audio/engine";
import { idbPutBlob, idbGetBlob, idbDelBlob } from "@/lib/library";
import { Knob } from "./Knob";
import { WaveTrimmer } from "./WaveTrimmer";
import { MidiButton } from "./MidiButton";

// --- persistent synth-sample bank (WAV blob in IndexedDB, metadata in localStorage) ---
const SAMPLE_BANK_KEY = "djsynth.synthsamples.v1";
interface SampleMeta { id: string; name: string; date: number }
function loadSampleBank(): SampleMeta[] {
  try { return JSON.parse(localStorage.getItem(SAMPLE_BANK_KEY) || "[]"); } catch { return []; }
}
function saveSampleBank(all: SampleMeta[]) {
  localStorage.setItem(SAMPLE_BANK_KEY, JSON.stringify(all));
}

interface Props {
  engine: DJEngine;
}

const WAVES: Wave[] = ["sawtooth", "square", "triangle", "sine"];
const WAVE_LABEL: Record<Wave, string> = {
  sawtooth: "SAW",
  square: "SQR",
  triangle: "TRI",
  sine: "SIN",
};
const WAVE_GLYPH: Record<Wave, string> = {
  sawtooth: "◣",
  square: "⊓",
  triangle: "△",
  sine: "∿",
};

// One chromatic octave C4 (midi 60) .. C5 (midi 72), rendered as OP-XY pads.
const KEYS: { midi: number; name: string; sharp: boolean }[] = [
  { midi: 60, name: "C", sharp: false },
  { midi: 61, name: "C♯", sharp: true },
  { midi: 62, name: "D", sharp: false },
  { midi: 63, name: "D♯", sharp: true },
  { midi: 64, name: "E", sharp: false },
  { midi: 65, name: "F", sharp: false },
  { midi: 66, name: "F♯", sharp: true },
  { midi: 67, name: "G", sharp: false },
  { midi: 68, name: "G♯", sharp: true },
  { midi: 69, name: "A", sharp: false },
  { midi: 70, name: "A♯", sharp: true },
  { midi: 71, name: "B", sharp: false },
  { midi: 72, name: "C", sharp: false },
];

// Physical-key map (event.code) -> midi, layout independent (AZERTY/QWERTY).
const KEYMAP: Record<string, number> = {
  KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65,
  KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72,
};

// OP-XY graduated encoder caps: dark -> white, left to right
const CAP = ["#36363a", "#6f6f73", "#a6a6a8", "#ededed"];

// base-midi (60..72) -> note name, for the sequencer cells & armed readout
const NOTE_NAME = (m: number) => KEYS.find((k) => k.midi === m)?.name ?? "?";

// Small oscilloscope LCD — draws the synth's live time-domain output. A simple
// zero-crossing trigger keeps the trace from sliding so the waveform shape reads
// clearly even while idle (it just flat-lines on the centre when silent).
function SynthScope({ analyser, color = "#34d399" }: { analyser: AnalyserNode; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(buf);
      const w = cv.width;
      const h = cv.height;
      ctx.fillStyle = "#06120d";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(52,211,153,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      // trigger on the first rising zero-crossing to stabilise the trace
      let start = 0;
      for (let i = 1; i < buf.length / 2; i++) {
        if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
      }
      const span = Math.min(buf.length - start, Math.floor(buf.length / 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < span; i++) {
        const x = (i / span) * w;
        const y = h / 2 - buf[start + i] * (h / 2) * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, color]);
  return <canvas ref={ref} width={150} height={58} className="h-full w-full" />;
}

export function SynthPanel({ engine }: Props) {
  const synth = engine.synth;
  const synthSeq = engine.synthSeq;
  const [wave, setWave] = useState<Wave>(synth.wave);
  const [octave, setOctave] = useState(synth.octave);
  const [cutoff, setCutoff] = useState(synth.cutoff);
  const [reso, setReso] = useState(synth.reso);
  const [attack, setAttack] = useState(synth.attack);
  const [decay, setDecay] = useState(synth.decay);
  const [sustain, setSustain] = useState(synth.sustain);
  const [release, setRelease] = useState(synth.release);
  const [detune, setDetune] = useState(synth.detune);
  const [width, setWidth] = useState(synth.width);
  const [vol, setVol] = useState(synth.glideVol);
  const [tune, setTune] = useState(synth.tune);
  // --- performance modulation ---
  const [porta, setPorta] = useState(synth.portamento > 0);
  const [bend, setBend] = useState(0);
  const [vibDepth, setVibDepth] = useState(synth.vibratoDepth);
  const [vibRate, setVibRate] = useState(synth.vibratoRate);
  const [lfoDepth, setLfoDepth] = useState(synth.lfoDepth);
  const [lfoRate, setLfoRate] = useState(synth.lfoRate);
  const [envAmt, setEnvAmt] = useState(synth.envAmt);
  const bendDrag = useRef<number | null>(null);
  const onBendDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    bendDrag.current = e.clientY;
  };
  const onBendMove = (e: React.PointerEvent) => {
    if (bendDrag.current == null) return;
    const dy = bendDrag.current - e.clientY; // drag up = bend up
    const v = Math.max(-2, Math.min(2, (dy / 40) * 2));
    setBend(v);
    synth.setBend(v);
  };
  const onBendUp = () => {
    if (bendDrag.current == null) return;
    bendDrag.current = null;
    setBend(0); // spring back to centre
    synth.setBend(0);
  };
  const togglePorta = () => {
    const on = !porta;
    setPorta(on);
    synth.setPortamento(on ? 0.12 : 0);
  };
  const [hold, setHold] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [sampleName, setSampleName] = useState(synth.sampleName);
  const [trim, setTrim] = useState<[number, number]>([synth.sampleStart, synth.sampleEnd]);
  const [editVer, setEditVer] = useState(0); // bumps to redraw the waveform after edits
  const [zoom, setZoom] = useState(1); // horizontal waveform magnification (1..8×)
  const [canUndo, setCanUndo] = useState(false);
  const histRef = useRef<AudioBuffer[]>([]);
  const held = useRef<Set<number>>(new Set());
  const holdRef = useRef(false);
  holdRef.current = hold;

  // --- multi-sample (one sample per key) ---
  const [assignMode, setAssignMode] = useState(false);
  const [keyVer, setKeyVer] = useState(0); // bumps to redraw per-key badges
  const assignRef = useRef(false);
  assignRef.current = assignMode;
  // bind the currently-loaded (trimmed) sample to a key; a second click clears it
  const assignKey = (midi: number) => {
    if (synth.hasKeySample(midi)) {
      synth.clearKeySample(midi);
    } else {
      const buf = synth.getTrimmedSample();
      if (!buf) return;
      synth.assignKeySample(midi, buf, sampleName || "sample", 0, 1);
    }
    setKeyVer((v) => v + 1);
  };
  const clearAllKeys = () => {
    synth.clearAllKeySamples();
    setKeyVer((v) => v + 1);
  };

  // --- tiny step sequencer state ---
  const [seqPlay, setSeqPlay] = useState(synthSeq.playing);
  const [seqRec, setSeqRec] = useState(synthSeq.recording);
  const [seqLen, setSeqLen] = useState(synthSeq.length);
  const [seqStep, setSeqStep] = useState(synthSeq.current);
  const [bpm, setBpm] = useState(synthSeq.bpm);
  const [steps, setSteps] = useState<(number | null)[]>(() => [...synthSeq.steps]);
  const [armed, setArmed] = useState(60); // note written into steps on click
  const armedRef = useRef(60);
  const arm = (m: number) => {
    armedRef.current = m;
    setArmed(m);
  };
  const toggleSeq = () => {
    synthSeq.toggle();
    setSeqPlay(synthSeq.playing);
  };
  const toggleSeqRec = () => {
    synthSeq.recording = !synthSeq.recording;
    setSeqRec(synthSeq.recording);
  };
  const setSeqLength = (l: number) => {
    synthSeq.setLength(l);
    setSeqLen(l);
  };
  const setSeqBpm = (b: number) => {
    synthSeq.setBpm(b);
    setBpm(synthSeq.bpm);
  };
  const clearSeq = () => {
    synthSeq.clear();
    setSteps([...synthSeq.steps]);
  };
  const toggleStep = (i: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next[i] = next[i] === null ? armedRef.current : null;
      synthSeq.steps = next;
      return next;
    });
  };
  useEffect(() => {
    synthSeq.onTick = (i) => setSeqStep(i);
    synthSeq.onRecord = () => setSteps([...synthSeq.steps]); // reflect live writes
    return () => {
      synthSeq.onTick = undefined;
      synthSeq.onRecord = undefined;
      synthSeq.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // drop any edit history (called when a brand-new sample arrives)
  const resetHistory = () => {
    histRef.current = [];
    setCanUndo(false);
    setEditVer((v) => v + 1);
  };

  const finishRec = () => {
    const sec = engine.stopSamplingToSynth();
    setRecording(false);
    setRecSec(0);
    engine.recorder.onProgress = undefined;
    if (sec !== null) {
      setSampleName(synth.sampleName);
      setTrim([0, 1]);
      resetHistory();
    }
  };

  const toggleRec = () => {
    if (recording || engine.recorder.recording) {
      finishRec();
      return;
    }
    engine.recorder.onProgress = (sec) => {
      setRecSec(sec);
      if (!engine.recorder.recording) finishRec(); // auto-stop at 30s
    };
    engine.startSampling();
    setRecording(true);
  };

  const loadSampleFile = async (file: File) => {
    const buf = await engine.ctx.decodeAudioData(await file.arrayBuffer());
    synth.setSample(buf, file.name.replace(/\.[^.]+$/, ""));
    setSampleName(synth.sampleName);
    setTrim([0, 1]);
    resetHistory();
  };

  const clearSample = () => {
    synth.clearSample();
    setSampleName("");
    setTrim([0, 1]);
    resetHistory();
  };

  // --- persistent sample bank ---
  const [bank, setBank] = useState<SampleMeta[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  useEffect(() => { setBank(loadSampleBank()); }, []);

  const persistSample = async () => {
    const buf = synth.getTrimmedSample();
    if (!buf) return;
    const name = (window.prompt("Nom de l'échantillon ?", sampleName || "sample") || "").trim();
    if (!name) return;
    const id = `ss_${Date.now()}`;
    await idbPutBlob(`synthsample__${id}`, encodeWav(buf));
    // replace any existing entry with the same name (and drop its old blob)
    const old = loadSampleBank();
    const dup = old.find((s) => s.name === name);
    if (dup) await idbDelBlob(`synthsample__${dup.id}`);
    const next = [{ id, name, date: Date.now() }, ...old.filter((s) => s.name !== name)];
    saveSampleBank(next);
    setBank(next);
    setBankOpen(false);
  };

  const recallSample = async (meta: SampleMeta) => {
    const blob = await idbGetBlob(`synthsample__${meta.id}`);
    if (!blob) return;
    const buf = await engine.ctx.decodeAudioData(await blob.arrayBuffer());
    synth.setSample(buf, meta.name);
    setSampleName(synth.sampleName);
    setTrim([0, 1]);
    resetHistory();
    setBankOpen(false);
  };

  const removeSample = async (meta: SampleMeta) => {
    await idbDelBlob(`synthsample__${meta.id}`);
    const next = loadSampleBank().filter((s) => s.id !== meta.id);
    saveSampleBank(next);
    setBank(next);
  };

  // run a destructive edit on the sample, snapshotting first for one-step undo
  const edit = (fn: () => void) => {
    if (!synth.sampleBuffer) return;
    const snap = synth.cloneSampleBuffer();
    if (snap) {
      histRef.current.push(snap);
      if (histRef.current.length > 24) histRef.current.shift();
      setCanUndo(true);
    }
    fn();
    setTrim([synth.sampleStart, synth.sampleEnd]);
    setEditVer((v) => v + 1);
  };

  const undoEdit = () => {
    const prev = histRef.current.pop();
    if (!prev) return;
    synth.restoreSampleBuffer(prev);
    setCanUndo(histRef.current.length > 0);
    setTrim([synth.sampleStart, synth.sampleEnd]);
    setEditVer((v) => v + 1);
  };

  // stable provider of live playback positions for the waveform cursor
  const getPlayheads = useCallback(() => synth.samplePlayheads(), [synth]);

  const setTrimBoth = (s: number, e: number) => {
    synth.setSampleTrim(s, e);
    setTrim([synth.sampleStart, synth.sampleEnd]);
  };

  const saveSample = () => {
    const buf = synth.getTrimmedSample();
    if (!buf) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(encodeWav(buf));
    a.download = `op-xy-sample-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const down = (midi: number) => {
    if (held.current.has(midi)) return;
    held.current.add(midi);
    synth.noteOn(midi);
    arm(midi); // remember last key → becomes the note painted into the sequencer
    synthSeq.recordNote(midi); // live overdub when REC is armed + sequencer running
    rerender();
  };
  const up = (midi: number) => {
    if (!held.current.has(midi)) return;
    held.current.delete(midi);
    synth.noteOff(midi);
    rerender();
  };
  // latch-aware press/lift: in HOLD mode a second tap releases, pointer-up is ignored.
  // In ASSIGN mode a tap binds/clears the loaded sample on that key instead of playing.
  const press = (midi: number) => {
    if (assignRef.current) { assignKey(midi); return; }
    if (holdRef.current && held.current.has(midi)) up(midi);
    else down(midi);
  };
  const lift = (midi: number) => {
    if (!holdRef.current) up(midi);
  };
  const allOff = () => {
    [...held.current].forEach((m) => up(m));
  };

  // RAZ — restore every synth control to its default (a loaded sample is kept)
  const resetSynth = () => {
    allOff();
    synth.setWave("sawtooth"); setWave("sawtooth");
    synth.setCutoff(2400); setCutoff(2400);
    synth.setReso(6); setReso(6);
    synth.setDetune(10); setDetune(10);
    synth.setWidth(0.4); setWidth(0.4);
    synth.attack = 0.01; setAttack(0.01);
    synth.decay = 0.25; setDecay(0.25);
    synth.sustain = 0.6; setSustain(0.6);
    synth.release = 0.4; setRelease(0.4);
    synth.setOctave(0); setOctave(0);
    synth.setVolume(0.7); setVol(0.7);
    synth.setTune(0); setTune(0);
    synth.setPortamento(0); setPorta(false);
    synth.setBend(0); setBend(0);
    synth.setVibrato(0, 5); setVibDepth(0); setVibRate(5);
    synth.setLfo(0, 2); setLfoDepth(0); setLfoRate(2);
    synth.setEnvAmt(0); setEnvAmt(0);
    setHold(false);
  };

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;
      const m = KEYMAP[e.code];
      if (m !== undefined) {
        e.preventDefault();
        press(m);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const m = KEYMAP[e.code];
      if (m !== undefined) lift(m);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHeld = (m: number) => held.current.has(m);
  const fileRef = useRef<HTMLInputElement>(null);

  // grayscale level bars for the LCD, derived from the live patch
  const bars = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const tone = Math.sin(t * Math.PI * (1 + reso / 6)) * 0.5 + 0.5;
    const cut = Math.min(1, cutoff / 12000);
    return 0.2 + (tone * cut + (held.current.size ? 0.25 : 0)) * 0.8;
  });

  return (
    <div className="opxy-panel zoom-zone hw-screwed relative flex flex-col gap-2 p-2.5">
      <span className="pointer-events-none absolute bottom-1.5 right-2.5 text-[9px] font-bold tracking-[0.25em] text-neutral-500">
        OP·XY
      </span>

      {/* ===== top row: grille · edit keys · LCD · encoders · io keys ===== */}
      <div className="flex items-stretch gap-2">
        <div className="opxy-grille w-10 shrink-0" />

        <div className="relative flex shrink-0 flex-col justify-center gap-1">
          <button
            onClick={toggleRec}
            className={`opxy-iconbtn ${recording ? "opxy-iconbtn-rec" : ""}`}
            title="Échantillonner le live (max 30s)"
          >
            {recording ? <span className="text-[9px] font-bold">{recSec.toFixed(0)}</span> : "✎"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="opxy-iconbtn"
            title="Charger un fichier audio comme sample"
          >
            ⤓
          </button>
          <button
            onClick={() => setBankOpen((o) => !o)}
            className={`opxy-iconbtn ${bankOpen ? "opxy-iconbtn-on" : ""}`}
            title="Banque d'échantillons (sauver / charger)"
          >
            ≣
          </button>
          <MidiButton engine={engine} />

          {bankOpen && (
            <div className="absolute left-full top-0 z-30 ml-1 w-52 rounded-md border border-white/10 bg-neutral-900/95 p-1 shadow-xl backdrop-blur">
              <button
                onClick={persistSample}
                disabled={!synth.sampleBuffer}
                className="opxy-minibtn opxy-minibtn-go mb-1 w-full justify-center disabled:opacity-30"
                title="Sauvegarder l'échantillon courant"
              >
                ↧ Sauver l&apos;échantillon
              </button>
              <div className="max-h-48 overflow-y-auto">
                {bank.length === 0 && (
                  <div className="px-2 py-1 text-[10px] text-neutral-500">Aucun échantillon sauvé</div>
                )}
                {bank.map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      onClick={() => recallSample(s)}
                      className="flex-1 truncate rounded px-2 py-1 text-left text-[11px] text-emerald-200 hover:bg-white/10"
                      title={`Charger « ${s.name} »`}
                    >
                      ◆ {s.name}
                    </button>
                    <button onClick={() => removeSample(s)} className="opxy-minibtn" title="Supprimer">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* grayscale sequencer LCD */}
        <div className="opxy-screen relative flex flex-1 flex-col justify-between overflow-hidden px-2 py-1">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-neutral-700">
            <span className="font-bold text-neutral-900">{WAVE_LABEL[wave]}</span>
            <span className="max-w-[96px] truncate font-semibold text-neutral-800" title={sampleName || "SYNTH"}>
              {sampleName ? sampleName.toUpperCase() : "SYNTH"}
            </span>
            <span>{Math.round(cutoff)}Hz</span>
          </div>
          <div className="flex h-7 items-end gap-[2px]">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-[1px]"
                style={{ height: `${Math.min(100, h * 100)}%`, background: `rgba(20,22,26,${0.35 + h * 0.55})` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between font-mono text-[8px] text-neutral-600">
            <span>oct {octave >= 0 ? `+${octave}` : octave}</span>
            <span>det {detune.toFixed(0)}c</span>
            <span>{hold ? "HOLD" : "·"}</span>
          </div>
        </div>

        {/* 4 big graduated encoders — column 1..4 (top row) */}
        <div className="flex shrink-0 items-center gap-3">
          <Knob variant="op1" capColor={CAP[0]} size={40} label="Cutoff" value={cutoff} min={80} max={12000} defaultValue={2400}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => { setCutoff(v); synth.setCutoff(v); }} />
          <Knob variant="op1" capColor={CAP[1]} size={40} label="Reso" value={reso} min={0.5} max={20} defaultValue={6}
            format={(v) => v.toFixed(1)}
            onChange={(v) => { setReso(v); synth.setReso(v); }} />
          <Knob variant="op1" capColor={CAP[2]} size={40} label="Attack" value={attack} min={0.001} max={1.5} defaultValue={0.01}
            format={(v) => `${(v * 1000).toFixed(0)}ms`}
            onChange={(v) => { setAttack(v); synth.attack = v; }} />
          <Knob variant="op1" capColor={CAP[3]} size={40} label="Release" value={release} min={0.02} max={3} defaultValue={0.4}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={(v) => { setRelease(v); synth.release = v; }} />
        </div>
      </div>

      {/* ===== row A: big wheels (FREQ · OSC) + scope + detune/adsr bank ===== */}
      <div className="opxy-recess flex items-center justify-between gap-3 px-3 py-1.5">
        <Knob variant="op1" capColor="#1f1f22" size={76} label="Fréquences" value={tune} min={-24} max={24} defaultValue={0}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} st`}
          onChange={(v) => { setTune(v); synth.setTune(v); }} />
        <Knob variant="op1" capColor="#1f1f22" size={76} label="Oscillateur" value={WAVES.indexOf(wave)} min={0} max={3} defaultValue={0}
          format={() => WAVE_LABEL[wave]}
          onChange={(v) => { const w = WAVES[Math.max(0, Math.min(3, Math.round(v)))]; setWave(w); synth.setWave(w); }} />
        {/* small oscilloscope LCD — live synth waveform */}
        <div className="opxy-screen relative h-[54px] w-[150px] shrink-0 overflow-hidden rounded-[4px] p-[3px]">
          <SynthScope analyser={synth.analyser} />
          <span className="pointer-events-none absolute bottom-[1px] right-1 font-mono text-[7px] tracking-[0.2em] text-emerald-300/60">
            SCOPE
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Knob variant="op1" capColor={CAP[0]} size={40} label="Detune" value={detune} min={0} max={50} defaultValue={10}
            format={(v) => `${v.toFixed(0)}c`}
            onChange={(v) => { setDetune(v); synth.setDetune(v); }} />
          <Knob variant="op1" capColor={CAP[0]} size={40} label="Largeur" value={width} min={0} max={1} defaultValue={0.4}
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => { setWidth(v); synth.setWidth(v); }} />
          <Knob variant="op1" capColor={CAP[1]} size={40} label="Decay" value={decay} min={0.02} max={2} defaultValue={0.25}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={(v) => { setDecay(v); synth.decay = v; }} />
          <Knob variant="op1" capColor={CAP[2]} size={40} label="Sustain" value={sustain} min={0} max={1} defaultValue={0.6}
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => { setSustain(v); synth.sustain = v; }} />
          <Knob variant="op1" capColor={CAP[3]} size={40} label="Volume" value={vol} min={0} max={3} defaultValue={0.7}
            format={(v) => `${Math.round(v * 100)}`}
            onChange={(v) => { setVol(v); synth.setVolume(v); }} />
        </div>
      </div>

      {/* ===== row B: voicing buttons (waves/oct/hold) + modulation (porta/bend/lfo/env) ===== */}
      <div className="opxy-recess flex items-center gap-1.5 px-2 py-1.5">
        {WAVES.map((w, i) => (
          <button
            key={w}
            onClick={() => { setWave(w); synth.setWave(w); }}
            className={`opxy-tbtn ${wave === w ? "opxy-tbtn-on" : ""}`}
            title={WAVE_LABEL[w]}
          >
            <span className="text-sm leading-none">{WAVE_GLYPH[w]}</span>
            <span className="text-[7px] tracking-wide">{i + 1}</span>
          </button>
        ))}
        <button className="opxy-tbtn" onClick={() => { const o = Math.max(-2, octave - 1); setOctave(o); synth.setOctave(o); }} title="Octave −">
          <span className="text-sm leading-none">−</span>
          <span className="text-[7px]">OCT</span>
        </button>
        <div className="opxy-oct-readout font-mono text-xs font-bold tabular-nums text-neutral-300">
          {octave >= 0 ? `+${octave}` : octave}
        </div>
        <button className="opxy-tbtn" onClick={() => { const o = Math.min(2, octave + 1); setOctave(o); synth.setOctave(o); }} title="Octave +">
          <span className="text-sm leading-none">+</span>
          <span className="text-[7px]">OCT</span>
        </button>
        <button onClick={() => setHold((h) => !h)} className={`opxy-tbtn ${hold ? "opxy-tbtn-on" : ""}`} title="HOLD (latch)">
          <span className="text-sm leading-none">⎚</span>
          <span className="text-[7px]">HOLD</span>
        </button>
        <button onClick={allOff} className="opxy-tbtn" title="Couper toutes les notes">
          <span className="text-sm leading-none">⏻</span>
          <span className="text-[7px]">OFF</span>
        </button>
        <button onClick={resetSynth} className="opxy-tbtn" title="RAZ — réinitialiser tous les réglages du synthé">
          <span className="text-sm leading-none">⟲</span>
          <span className="text-[7px]">RAZ</span>
        </button>
        <button
          onClick={() => setAssignMode((a) => !a)}
          className={`opxy-tbtn ${assignMode ? "opxy-tbtn-on" : ""}`}
          style={assignMode ? { color: "#facc15" } : undefined}
          title="ASSIGN — clique une touche pour y assigner l'échantillon chargé (re-clic = retirer)"
        >
          <span className="text-sm leading-none">⊕</span>
          <span className="text-[7px]">ASSIGN</span>
        </button>
        <button onClick={togglePorta} className={`opxy-tbtn ${porta ? "opxy-tbtn-on" : ""}`} title="Portamento (glissando entre les notes)">
          <span className="text-sm leading-none">⌇</span>
          <span className="text-[7px]">PORTA</span>
        </button>

        {/* pitch-bend wheel — drag vertically, springs back to centre on release */}
        <div className="ml-1 flex flex-col items-center gap-0.5 select-none">
          <div
            className="relative cursor-ns-resize rounded-[4px]"
            style={{
              width: 18,
              height: 38,
              background: "linear-gradient(180deg,#0c0d10,#1c1e23 50%,#0c0d10)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 6px 8px rgba(0,0,0,0.6)",
              touchAction: "none",
            }}
            onPointerDown={onBendDown}
            onPointerMove={onBendMove}
            onPointerUp={onBendUp}
            onPointerCancel={onBendUp}
            title="Pitch bend (±2 demi-tons, revient au centre)"
          >
            <div
              className="absolute left-1/2 h-2 w-[24px] -translate-x-1/2 rounded-[3px]"
              style={{
                top: `calc(50% - 4px - ${(bend / 2) * 13}px)`,
                background: "linear-gradient(180deg,#4a4d55,#26282d)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            />
          </div>
          <span className="text-[8px] uppercase tracking-wide text-neutral-500">Bend {bend > 0 ? `+${bend.toFixed(1)}` : bend.toFixed(1)}</span>
        </div>

        {/* 5 identical big modulation knobs, spread to fill the row */}
        <div className="flex flex-1 items-center justify-around gap-1">
          <Knob variant="op1" capColor={CAP[2]} size={48} label="Vib" value={vibDepth} min={0} max={50} defaultValue={0}
            format={(v) => `${v.toFixed(0)}c`}
            onChange={(v) => { setVibDepth(v); synth.setVibrato(v, vibRate); }} />
          <Knob variant="op1" capColor={CAP[2]} size={48} label="V·Rate" value={vibRate} min={0.5} max={12} defaultValue={5}
            format={(v) => `${v.toFixed(1)}Hz`}
            onChange={(v) => { setVibRate(v); synth.setVibrato(vibDepth, v); }} />
          <Knob variant="op1" capColor={CAP[2]} size={48} label="LFO" value={lfoDepth} min={0} max={4000} defaultValue={0}
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => { setLfoDepth(v); synth.setLfo(v, lfoRate); }} />
          <Knob variant="op1" capColor={CAP[2]} size={48} label="L·Rate" value={lfoRate} min={0.1} max={10} defaultValue={2}
            format={(v) => `${v.toFixed(1)}Hz`}
            onChange={(v) => { setLfoRate(v); synth.setLfo(lfoDepth, v); }} />
          <Knob variant="op1" capColor={CAP[2]} size={48} label="Env" value={envAmt} min={-4000} max={4000} defaultValue={0}
            format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
            onChange={(v) => { setEnvAmt(v); synth.setEnvAmt(v); }} />
        </div>
      </div>

      {/* ===== tiny step sequencer (4 / 8 / 16 steps) ===== */}
      <div className="opxy-recess flex flex-col gap-1.5 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSeq}
            className={`opxy-tbtn ${seqPlay ? "opxy-tbtn-on" : ""}`}
            title="Lecture / Stop de la séquence"
          >
            <span className="text-sm leading-none">{seqPlay ? "■" : "▶"}</span>
            <span className="text-[7px]">SEQ</span>
          </button>
          <button
            onClick={toggleSeqRec}
            className={`opxy-tbtn ${seqRec ? "opxy-tbtn-on" : ""}`}
            style={seqRec ? { color: "#ff5b5b" } : undefined}
            title="Enregistrement live : joue les touches pendant la lecture pour écrire la séquence"
          >
            <span className="text-sm leading-none">{seqRec ? "●" : "○"}</span>
            <span className="text-[7px]">REC</span>
          </button>
          <div className="flex gap-1">
            {[4, 8, 16].map((l) => (
              <button
                key={l}
                onClick={() => setSeqLength(l)}
                className={`opxy-tbtn ${seqLen === l ? "opxy-tbtn-on" : ""}`}
                title={`${l} pas`}
              >
                <span className="text-[11px] font-bold leading-none">{l}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1 font-mono text-[10px] text-neutral-400">
            <button onClick={() => setSeqBpm(bpm - 1)} className="opxy-minibtn" title="BPM −">−</button>
            <span className="w-14 text-center tabular-nums">{bpm} BPM</span>
            <button onClick={() => setSeqBpm(bpm + 1)} className="opxy-minibtn" title="BPM ＋">＋</button>
          </div>
          <span className="font-mono text-[10px] text-emerald-300" title="Note écrite au clic (joue une touche pour la changer)">
            ♪ {NOTE_NAME(armed)}
          </span>
          <button onClick={clearSeq} className="opxy-minibtn" title="Effacer la séquence">✕</button>
        </div>
        <div className="flex gap-[3px]">
          {Array.from({ length: seqLen }, (_, i) => {
            const n = steps[i];
            const on = n !== null && n !== undefined;
            const playing = i === seqStep;
            return (
              <button
                key={i}
                onClick={() => toggleStep(i)}
                className="flex h-6 flex-1 items-center justify-center rounded-[3px] text-[8px] font-bold transition-colors"
                style={{
                  background: on ? "#34d399" : "rgba(255,255,255,0.04)",
                  color: on ? "#06281e" : "#555",
                  boxShadow: playing
                    ? "0 0 0 2px #fff, 0 0 7px #34d399"
                    : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                {on ? NOTE_NAME(n!) : i % 4 === 0 ? "·" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== sample editor (only when a sample is loaded) ===== */}
      {sampleName && synth.sampleBuffer && (
        <div className="opxy-recess flex flex-col gap-1 p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="truncate font-semibold text-emerald-300">◆ {sampleName}</span>
            <span className="font-mono text-neutral-500">
              {(synth.sampleBuffer.duration * (trim[1] - trim[0])).toFixed(2)}s
            </span>
            <div className="flex gap-1">
              <button onClick={undoEdit} disabled={!canUndo} className="opxy-minibtn disabled:opacity-30" title="Annuler la dernière édition">↶</button>
              <button onClick={() => setTrimBoth(0, 1)} className="opxy-minibtn" title="Réinitialiser le découpage">⤺</button>
              <button onClick={saveSample} className="opxy-minibtn opxy-minibtn-go" title="Sauvegarder le sample découpé (WAV)">⤓ WAV</button>
              <button onClick={clearSample} className="opxy-minibtn" title="Retirer le sample">✕</button>
            </div>
          </div>

          {/* graphical editing tools — act on the selected (highlighted) region */}
          <div className="flex flex-wrap items-center gap-1">
            <button onClick={() => edit(() => synth.reverseRegion())} className="opxy-minibtn" title="Inverser la sélection">↺ Rev</button>
            <button onClick={() => edit(() => synth.normalizeRegion())} className="opxy-minibtn" title="Normaliser (pic à 0 dB)">▲ Norm</button>
            <button onClick={() => edit(() => synth.fadeRegion("in"))} className="opxy-minibtn" title="Fondu d'entrée">◢ In</button>
            <button onClick={() => edit(() => synth.fadeRegion("out"))} className="opxy-minibtn" title="Fondu de sortie">◣ Out</button>
            <button onClick={() => edit(() => synth.gainRegion(1.4))} className="opxy-minibtn" title="Amplifier (+3 dB)">＋ Gain</button>
            <button onClick={() => edit(() => synth.gainRegion(0.7))} className="opxy-minibtn" title="Atténuer (−3 dB)">－ Gain</button>
            <button onClick={() => edit(() => synth.cropToSelection())} className="opxy-minibtn opxy-minibtn-go" title="Rogner sur la sélection">✂ Crop</button>
            <span className="mx-0.5 h-3 w-px bg-white/10" />
            <button onClick={() => setZoom((z) => Math.max(1, z / 2))} disabled={zoom <= 1} className="opxy-minibtn disabled:opacity-30" title="Dézoomer la forme d'onde">🔍−</button>
            <span className="w-7 text-center text-[9px] tabular-nums text-neutral-500">{zoom}×</span>
            <button onClick={() => setZoom((z) => Math.min(8, z * 2))} disabled={zoom >= 8} className="opxy-minibtn disabled:opacity-30" title="Zoomer la forme d'onde">🔍＋</button>
          </div>

          {/* horizontally-scrollable waveform — widens with zoom so you can edit fine detail */}
          <div className="overflow-x-auto">
            <div style={{ width: `${zoom * 100}%` }}>
              <WaveTrimmer
                buffer={synth.sampleBuffer}
                start={trim[0]}
                end={trim[1]}
                height={50}
                color="#34d399"
                version={editVer * 16 + zoom}
                playheads={getPlayheads}
                onChange={(s, e) => setTrimBoth(s, e)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== chromatic pad keyboard ===== */}
      {(assignMode || synth.keySampleNotes().length > 0) && (
        <div className="flex items-center gap-2 px-0.5 text-[9px]">
          <span className="font-semibold tracking-wide" style={{ color: "#facc15" }}>
            {assignMode ? "MODE ASSIGN — clique une touche" : "MULTI-SAMPLE"}
          </span>
          <span className="font-mono text-neutral-500">
            {synth.keySampleNotes().length} touche{synth.keySampleNotes().length > 1 ? "s" : ""} assignée
            {synth.keySampleNotes().length > 1 ? "s" : ""}
          </span>
          {synth.keySampleNotes().length > 0 && (
            <button onClick={clearAllKeys} className="opxy-minibtn ml-auto" title="Retirer tous les samples par touche">
              ✕ Tout retirer
            </button>
          )}
        </div>
      )}
      <div className="flex gap-[3px] select-none" data-keyver={keyVer}>
        {KEYS.map((k) => {
          const keyed = synth.hasKeySample(k.midi);
          const keyName = synth.keySampleName(k.midi);
          return (
            <button
              key={k.midi}
              className={`opxy-pad relative flex-1 ${k.sharp ? "opxy-pad-sharp" : ""} ${isHeld(k.midi) ? "opxy-pad-on" : ""}`}
              style={
                keyed
                  ? { boxShadow: "inset 0 0 0 1.5px #facc15, 0 0 6px rgba(250,204,21,0.4)" }
                  : assignMode
                  ? { boxShadow: "inset 0 0 0 1px rgba(250,204,21,0.35)" }
                  : undefined
              }
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); press(k.midi); }}
              onPointerUp={() => lift(k.midi)}
              onPointerLeave={(e) => { if (e.buttons === 1 && !assignRef.current) lift(k.midi); }}
              onPointerEnter={(e) => { if (e.buttons === 1 && !holdRef.current && !assignRef.current) down(k.midi); }}
              title={keyed ? `Sample : ${keyName}` : undefined}
            >
              <span className="text-[9px] font-bold">{k.name}</span>
              {keyed && (
                <span
                  className="pointer-events-none absolute left-1/2 top-[3px] h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                  style={{ background: "#facc15", boxShadow: "0 0 4px #facc15" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadSampleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
