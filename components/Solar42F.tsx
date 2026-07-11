'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import type { DJEngine } from '@/lib/audio/engine';
import type { Recorder } from '@/lib/audio/Recorder';

/* ─────────────────────────────────────────────────────────────────────────────
   SOLAR 42F — Drone Ambient Machine.
   4 continuous drone voices (FatOscillator) summed into a shared ambient FX
   chain (drive → filter → chorus → delay → giant reverb → width → out), two
   slow LFOs (filter sweep + pitch drift), a shimmer "SOLAR FLARE", a sampled
   texture layer, user-sample loop pad, and live sampling of the DJ-AVA mix.
   Same integration contract as DX7Synth: { engine?, embedded? }.
   ──────────────────────────────────────────────────────────────────────────── */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WAVES = ['sine', 'triangle', 'sawtooth'] as const;
type Wave = typeof WAVES[number];

type VoiceState = { on: boolean; semi: number; oct: number; wave: Wave; level: number };

/* chord = semitone offsets applied to the 4 voices from the root */
const CHORDS: Record<string, number[]> = {
  'QUINTES': [0, 7, 12, 19],
  'MIN 7': [0, 3, 7, 10],
  'MAJ 9': [0, 4, 7, 14],
  'SUS 4': [0, 5, 7, 12],
  'OCTAVES': [0, 12, 24, 36],
  'UNISSON': [0, 0, 7, 12],
};

type Preset = {
  name: string;
  root: number; oct: number; chord: keyof typeof CHORDS;
  waves: Wave[]; detune: number;
  cutoff: number; reso: number; drive: number;
  chorus: number; dlyTime: number; dlyFb: number; dlyMix: number;
  revDecay: number; revMix: number;
  lfo1Rate: number; lfo1Depth: number; lfo2Rate: number; lfo2Depth: number;
  flare: boolean;
};

const PRESETS: Preset[] = [
  { name: 'DEEP SPACE', root: 0, oct: 1, chord: 'QUINTES', waves: ['sine', 'sine', 'triangle', 'sine'], detune: 8, cutoff: 900, reso: 1.5, drive: 0.1, chorus: 0.3, dlyTime: 0.9, dlyFb: 0.55, dlyMix: 0.3, revDecay: 14, revMix: 0.6, lfo1Rate: 0.05, lfo1Depth: 0.5, lfo2Rate: 0.08, lfo2Depth: 6, flare: false },
  { name: 'OCEAN', root: 2, oct: 1, chord: 'SUS 4', waves: ['triangle', 'sine', 'triangle', 'sine'], detune: 12, cutoff: 1400, reso: 2.5, drive: 0.15, chorus: 0.5, dlyTime: 0.6, dlyFb: 0.45, dlyMix: 0.35, revDecay: 10, revMix: 0.55, lfo1Rate: 0.12, lfo1Depth: 0.7, lfo2Rate: 0.15, lfo2Depth: 10, flare: false },
  { name: 'CATHEDRAL', root: 7, oct: 1, chord: 'MAJ 9', waves: ['sine', 'triangle', 'sine', 'triangle'], detune: 5, cutoff: 2200, reso: 1, drive: 0.05, chorus: 0.25, dlyTime: 1.2, dlyFb: 0.6, dlyMix: 0.4, revDecay: 15, revMix: 0.7, lfo1Rate: 0.04, lfo1Depth: 0.4, lfo2Rate: 0.05, lfo2Depth: 4, flare: true },
  { name: 'SOLAR WIND', root: 9, oct: 2, chord: 'QUINTES', waves: ['sawtooth', 'sawtooth', 'triangle', 'sine'], detune: 18, cutoff: 800, reso: 4, drive: 0.3, chorus: 0.6, dlyTime: 0.45, dlyFb: 0.5, dlyMix: 0.3, revDecay: 9, revMix: 0.5, lfo1Rate: 0.25, lfo1Depth: 0.8, lfo2Rate: 0.3, lfo2Depth: 14, flare: false },
  { name: 'GLACIER', root: 4, oct: 2, chord: 'OCTAVES', waves: ['sine', 'sine', 'sine', 'triangle'], detune: 4, cutoff: 3000, reso: 0.8, drive: 0, chorus: 0.2, dlyTime: 1.5, dlyFb: 0.65, dlyMix: 0.45, revDecay: 13, revMix: 0.65, lfo1Rate: 0.03, lfo1Depth: 0.3, lfo2Rate: 0.04, lfo2Depth: 3, flare: true },
  { name: 'NEBULA', root: 5, oct: 1, chord: 'MIN 7', waves: ['triangle', 'sawtooth', 'sine', 'triangle'], detune: 14, cutoff: 1100, reso: 3, drive: 0.2, chorus: 0.55, dlyTime: 0.75, dlyFb: 0.5, dlyMix: 0.35, revDecay: 12, revMix: 0.6, lfo1Rate: 0.09, lfo1Depth: 0.6, lfo2Rate: 0.11, lfo2Depth: 9, flare: true },
  { name: 'MONOLITH', root: 0, oct: 0, chord: 'UNISSON', waves: ['sawtooth', 'sawtooth', 'sine', 'sine'], detune: 22, cutoff: 500, reso: 5, drive: 0.45, chorus: 0.35, dlyTime: 0.5, dlyFb: 0.4, dlyMix: 0.25, revDecay: 8, revMix: 0.45, lfo1Rate: 0.06, lfo1Depth: 0.5, lfo2Rate: 0.07, lfo2Depth: 12, flare: false },
];

/* sampled texture layer — banks already verified 200 OK by the DX7 (same CDN) */
const NB = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
const TEXTURES: Record<string, { baseUrl: string; urls: Record<string, string> }> = {
  ORGAN: { baseUrl: NB + 'organ/', urls: { C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3' } },
  CELLO: { baseUrl: NB + 'cello/', urls: { A2: 'A2.mp3', A3: 'A3.mp3', C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', E3: 'E3.mp3', G2: 'G2.mp3', G3: 'G3.mp3' } },
  VIOLIN: { baseUrl: NB + 'violin/', urls: { A3: 'A3.mp3', A4: 'A4.mp3', C4: 'C4.mp3', C5: 'C5.mp3', E4: 'E4.mp3', G4: 'G4.mp3' } },
};

const semiToNote = (semi: number, oct: number) => `${NOTE_NAMES[((semi % 12) + 12) % 12]}${oct + Math.floor(semi / 12) + 2}`;

type Props = { engine?: DJEngine; embedded?: boolean };

export default function Solar42F({ engine, embedded = false }: Props) {
  /* ── state ── */
  const [presetIdx, setPresetIdx] = useState(0);
  const [root, setRoot] = useState(PRESETS[0].root);
  const [oct, setOct] = useState(PRESETS[0].oct);
  const [chord, setChord] = useState<keyof typeof CHORDS>(PRESETS[0].chord);
  const [voices, setVoices] = useState<VoiceState[]>(() =>
    CHORDS[PRESETS[0].chord].map((s, i) => ({ on: false, semi: PRESETS[0].root + s, oct: PRESETS[0].oct, wave: PRESETS[0].waves[i], level: 0.7 }))
  );
  const [detune, setDetune] = useState(PRESETS[0].detune);
  const [drive, setDrive] = useState(PRESETS[0].drive);
  const [cutoff, setCutoff] = useState(PRESETS[0].cutoff);
  const [reso, setReso] = useState(PRESETS[0].reso);
  const [chorus, setChorus] = useState(PRESETS[0].chorus);
  const [dlyTime, setDlyTime] = useState(PRESETS[0].dlyTime);
  const [dlyFb, setDlyFb] = useState(PRESETS[0].dlyFb);
  const [dlyMix, setDlyMix] = useState(PRESETS[0].dlyMix);
  const [revDecay, setRevDecay] = useState(PRESETS[0].revDecay);
  const [revMix, setRevMix] = useState(PRESETS[0].revMix);
  const [lfo1Rate, setLfo1Rate] = useState(PRESETS[0].lfo1Rate);
  const [lfo1Depth, setLfo1Depth] = useState(PRESETS[0].lfo1Depth);
  const [lfo2Rate, setLfo2Rate] = useState(PRESETS[0].lfo2Rate);
  const [lfo2Depth, setLfo2Depth] = useState(PRESETS[0].lfo2Depth);
  const [flare, setFlare] = useState(PRESETS[0].flare);
  const [evolve, setEvolve] = useState(false);
  const [width, setWidth] = useState(0.7);
  const [vol, setVol] = useState(0.8);
  const [texture, setTexture] = useState<string>('OFF');
  const [texLevel, setTexLevel] = useState(0.4);
  const [texLoading, setTexLoading] = useState(false);
  const [userLoop, setUserLoop] = useState(false);
  const [userName, setUserName] = useState('');
  const [sampling, setSampling] = useState(false);
  const [sampleSec, setSampleSec] = useState(0);
  const [liveReady, setLiveReady] = useState(false);

  /* ── audio node refs ── */
  const busRef = useRef<Tone.Gain | null>(null);
  const oscsRef = useRef<{ osc: Tone.FatOscillator; gain: Tone.Gain }[]>([]);
  const driveRef = useRef<Tone.Distortion | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const delayRef = useRef<Tone.FeedbackDelay | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const widenerRef = useRef<Tone.StereoWidener | null>(null);
  const outRef = useRef<Tone.Gain | null>(null);
  const lfo1Ref = useRef<Tone.LFO | null>(null);
  const lfo2Ref = useRef<Tone.LFO | null>(null);
  const flareRef = useRef<Tone.PitchShift | null>(null);
  const flareGainRef = useRef<Tone.Gain | null>(null);
  const analyserRef = useRef<Tone.Analyser | null>(null);
  const texSamplerRef = useRef<Tone.Sampler | null>(null);
  const texTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const recRef = useRef<Recorder | null>(null);
  const liveBufRef = useRef<AudioBuffer | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ── build the persistent graph once ── */
  useEffect(() => {
    Tone.getContext().lookAhead = 0; // live machine: no scheduling latency

    const out = new Tone.Gain(vol);
    if (engine) out.connect(engine.mixInput);
    else out.toDestination();

    const analyser = new Tone.Analyser('waveform', 512);
    out.connect(analyser);

    const widener = new Tone.StereoWidener(width).connect(out);
    const reverb = new Tone.Reverb({ decay: revDecay, wet: revMix }).connect(widener);
    const delay = new Tone.FeedbackDelay({ delayTime: dlyTime, feedback: dlyFb, wet: dlyMix }).connect(reverb);
    const chorusN = new Tone.Chorus({ frequency: 0.25, depth: 0.7, wet: chorus }).start().connect(delay);
    const filter = new Tone.Filter({ frequency: cutoff, type: 'lowpass', Q: reso }).connect(chorusN);
    const driveN = new Tone.Distortion({ distortion: drive, wet: 0.6 }).connect(filter);
    const bus = new Tone.Gain(1).connect(driveN);

    // SOLAR FLARE — shimmer: delay tap pitched +12 fed into the reverb
    const flareShift = new Tone.PitchShift({ pitch: 12, windowSize: 0.25 });
    const flareGain = new Tone.Gain(0);
    delay.connect(flareShift); flareShift.connect(flareGain); flareGain.connect(reverb);

    // LFO1 → filter sweep · LFO2 → pitch drift (cents) on every voice
    const lfo1 = new Tone.LFO({ frequency: lfo1Rate, min: cutoff * 0.35, max: cutoff * 1.8 }).start();
    lfo1.connect(filter.frequency);
    const lfo2 = new Tone.LFO({ frequency: lfo2Rate, min: -lfo2Depth, max: lfo2Depth }).start();

    // 4 always-running drone voices, muted by their gain (clickless start/stop)
    oscsRef.current = voices.map((v) => {
      const g = new Tone.Gain(0).connect(bus);
      const osc = new Tone.FatOscillator({ frequency: semiToNote(v.semi, v.oct), type: v.wave, count: 3, spread: detune }).start();
      osc.connect(g);
      lfo2.connect(osc.detune);
      return { osc, gain: g };
    });

    busRef.current = bus; driveRef.current = driveN; filterRef.current = filter;
    chorusRef.current = chorusN; delayRef.current = delay; reverbRef.current = reverb;
    widenerRef.current = widener; outRef.current = out; analyserRef.current = analyser;
    lfo1Ref.current = lfo1; lfo2Ref.current = lfo2;
    flareRef.current = flareShift; flareGainRef.current = flareGain;
    if (engine) recRef.current = engine.makeLiveRecorder(12);
    if (process.env.NODE_ENV !== 'production') {
      (window as any).__solar = { tone: Tone, out, bus, oscs: oscsRef.current };
    }

    return () => {
      if (texTimerRef.current) clearInterval(texTimerRef.current);
      oscsRef.current.forEach(({ osc, gain }) => { osc.dispose(); gain.dispose(); });
      texSamplerRef.current?.dispose(); playerRef.current?.dispose();
      [bus, driveN, filter, chorusN, delay, reverb, widener, out, analyser, lfo1, lfo2, flareShift, flareGain].forEach((n) => n.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── live param application ── */
  useEffect(() => { outRef.current?.gain.rampTo(vol, 0.08); }, [vol]);
  useEffect(() => { if (driveRef.current) driveRef.current.distortion = drive; }, [drive]);
  useEffect(() => {
    // filter.frequency is DRIVEN by LFO1 (connected signal) — never rampTo it
    // directly; steer the sweep via the LFO's min/max bounds around the cutoff.
    const f = filterRef.current, l = lfo1Ref.current;
    if (f) f.Q.value = reso;
    if (l) {
      l.min = Math.max(60, cutoff * (1 - 0.65 * lfo1Depth));
      l.max = Math.min(16000, cutoff * (1 + 0.8 * lfo1Depth));
    }
  }, [cutoff, reso, lfo1Depth]);
  useEffect(() => { if (chorusRef.current) chorusRef.current.wet.value = chorus; }, [chorus]);
  useEffect(() => {
    const d = delayRef.current;
    if (d) { d.delayTime.rampTo(dlyTime, 0.2); d.feedback.value = dlyFb; d.wet.value = dlyMix; }
  }, [dlyTime, dlyFb, dlyMix]);
  useEffect(() => {
    const r = reverbRef.current;
    if (r) { r.decay = revDecay; r.wet.rampTo(revMix, 0.1); }
  }, [revDecay, revMix]);
  useEffect(() => { if (widenerRef.current) widenerRef.current.width.value = width; }, [width]);
  useEffect(() => {
    const l = lfo1Ref.current;
    if (l) l.frequency.value = evolve ? 0.02 : lfo1Rate;
  }, [lfo1Rate, evolve]);
  useEffect(() => {
    const l = lfo2Ref.current;
    if (l) { l.frequency.value = lfo2Rate; l.min = -lfo2Depth; l.max = lfo2Depth; }
  }, [lfo2Rate, lfo2Depth]);
  useEffect(() => { flareGainRef.current?.gain.rampTo(flare ? 0.5 : 0, 0.3); }, [flare]);
  useEffect(() => {
    voices.forEach((v, i) => {
      const n = oscsRef.current[i]; if (!n) return;
      n.osc.frequency.value = semiToNote(v.semi, v.oct);
      n.osc.type = v.wave;
      n.osc.spread = detune;
      n.gain.gain.rampTo(v.on ? v.level * 0.55 : 0, 0.4); // slow swell, drone-style
    });
  }, [voices, detune]);

  /* ── oscilloscope ── */
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = canvasRef.current, an = analyserRef.current;
      if (cv && an) {
        const ctx = cv.getContext('2d')!;
        const w = cv.width, h = cv.height;
        const data = an.getValue() as Float32Array;
        ctx.fillStyle = '#120a04'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ff9d2e'; ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff9d2e'; ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * w;
          const y = h / 2 + Math.max(-0.48, Math.min(0.48, (data[i] as number) * 2.2)) * h;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── chord / preset helpers ── */
  const applyChord = useCallback((r: number, o: number, c: keyof typeof CHORDS) => {
    setVoices((vs) => vs.map((v, i) => ({ ...v, semi: r + (CHORDS[c][i] ?? 0), oct: o })));
  }, []);

  const loadPreset = (idx: number) => {
    const p = PRESETS[idx];
    setPresetIdx(idx); setRoot(p.root); setOct(p.oct); setChord(p.chord);
    setDetune(p.detune); setDrive(p.drive); setCutoff(p.cutoff); setReso(p.reso);
    setChorus(p.chorus); setDlyTime(p.dlyTime); setDlyFb(p.dlyFb); setDlyMix(p.dlyMix);
    setRevDecay(p.revDecay); setRevMix(p.revMix);
    setLfo1Rate(p.lfo1Rate); setLfo1Depth(p.lfo1Depth); setLfo2Rate(p.lfo2Rate); setLfo2Depth(p.lfo2Depth);
    setFlare(p.flare);
    setVoices((vs) => vs.map((v, i) => ({
      ...v, semi: p.root + (CHORDS[p.chord][i] ?? 0), oct: p.oct, wave: p.waves[i] ?? 'sine',
    })));
    Tone.start();
  };

  /* ── texture layer (sampled pads following the chord) ── */
  useEffect(() => {
    if (texTimerRef.current) { clearInterval(texTimerRef.current); texTimerRef.current = null; }
    texSamplerRef.current?.dispose(); texSamplerRef.current = null;
    if (texture === 'OFF' || texture === 'LIVE' || texture === 'USER') return;
    const t = TEXTURES[texture]; if (!t || !busRef.current) return;
    setTexLoading(true);
    const s = new Tone.Sampler({
      urls: t.urls, baseUrl: t.baseUrl, release: 4,
      onload: () => {
        setTexLoading(false);
        const trigger = () => {
          const notes = voices.filter((v) => v.on).map((v) => semiToNote(v.semi, v.oct + 1));
          if (notes.length) s.triggerAttackRelease(notes, 7);
        };
        trigger();
        texTimerRef.current = setInterval(trigger, 6000);
      },
    });
    s.volume.value = Tone.gainToDb(texLevel);
    s.connect(busRef.current);
    texSamplerRef.current = s;
    return () => { if (texTimerRef.current) clearInterval(texTimerRef.current); s.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture]);
  useEffect(() => { if (texSamplerRef.current) texSamplerRef.current.volume.value = Tone.gainToDb(texLevel); }, [texLevel]);

  /* ── user sample / live-mix loop pad ── */
  const startLoop = (buf: AudioBuffer, name: string) => {
    playerRef.current?.dispose();
    const p = new Tone.Player({ loop: true, fadeIn: 0.5, fadeOut: 0.5 });
    p.buffer = new Tone.ToneAudioBuffer(buf as any);
    p.volume.value = Tone.gainToDb(0.5);
    if (busRef.current) p.connect(busRef.current);
    p.start();
    playerRef.current = p; setUserLoop(true); setUserName(name);
  };
  const stopLoop = () => { playerRef.current?.stop(); playerRef.current?.dispose(); playerRef.current = null; setUserLoop(false); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const raw = await file.arrayBuffer();
    const ac = (Tone.getContext().rawContext as unknown) as AudioContext;
    const buf = await ac.decodeAudioData(raw);
    Tone.start(); startLoop(buf, file.name);
  };

  const toggleLiveSample = () => {
    const rec = recRef.current; if (!rec || !engine) return;
    if (!sampling) { setSampleSec(0); rec.onProgress = (s) => setSampleSec(s); rec.start(); setSampling(true); }
    else {
      const buf = rec.stop(); setSampling(false);
      if (buf) { liveBufRef.current = buf; setLiveReady(true); startLoop(buf, 'MIX LIVE'); }
    }
  };

  const anyOn = voices.some((v) => v.on);
  const wrapClass = embedded ? 'w-full' : 'w-full min-h-screen flex items-center justify-center';
  const wrapStyle = embedded ? {} : { background: 'radial-gradient(circle at 50% -10%, #1c130a, #070402)', padding: '12px' };

  /* knob-ish slider */
  const S = ({ label, v, min, max, step, set, fmt }: { label: string; v: number; min: number; max: number; step: number; set: (x: number) => void; fmt?: (x: number) => string }) => (
    <label className="flex flex-col gap-0.5 min-w-0">
      <div className="flex justify-between items-baseline gap-1">
        <span className="text-[8px] tracking-wider truncate" style={{ color: '#c9925a' }}>{label}</span>
        <span className="text-[8px] font-mono shrink-0" style={{ color: '#ffb347' }}>{fmt ? fmt(v) : v.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(parseFloat(e.target.value))} className="w-full accent-amber-500 h-1" />
    </label>
  );

  return (
    <div className={wrapClass} style={wrapStyle}>
      <div className="w-full overflow-hidden select-none"
        style={{
          borderRadius: '10px',
          background: 'linear-gradient(180deg,#3d2b18 0%,#2a1d10 6%,#1a1109 50%,#120b05 100%)',
          boxShadow: '0 24px 50px rgba(0,0,0,.8), inset 0 2px 0 rgba(255,170,80,.25), inset 0 -2px 6px rgba(0,0,0,.7)',
          border: '1px solid #0a0603',
        }}>

        {/* ── header ── */}
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2 flex-wrap">
          <div className="flex items-center gap-3">
            {/* sun logo */}
            <div className="w-10 h-10 rounded-full shrink-0"
              style={{ background: 'radial-gradient(circle at 35% 35%, #ffd27a, #ff8c1a 55%, #b3480a)', boxShadow: '0 0 18px rgba(255,140,26,.7)' }} />
            <div className="flex flex-col leading-none">
              <span className="text-2xl font-black tracking-[.12em]" style={{ color: '#ffd9a0', textShadow: '0 2px 4px rgba(0,0,0,.8)' }}>SOLAR 42F</span>
              <span className="text-[8px] tracking-[.3em] mt-1" style={{ color: '#c9925a' }}>DRONE AMBIENT MACHINE</span>
            </div>
          </div>

          {/* LCD */}
          <div className="flex items-center gap-3 rounded px-3 py-1.5 font-mono"
            style={{ background: 'linear-gradient(180deg,#2a1200,#1a0a00)', border: '2px solid #0d0500', boxShadow: 'inset 0 0 14px rgba(255,140,30,.3)' }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: '#ffb347', textShadow: '0 0 8px rgba(255,179,71,.9)' }}>
              {String(presetIdx + 1).padStart(2, '0')}
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] opacity-70" style={{ color: '#ffb347' }}>
                {NOTE_NAMES[root]}{oct + 2} · {chord} · {voices.filter((v) => v.on).length}/4 VOIX
              </span>
              <span className="text-base font-bold tracking-wide" style={{ color: '#ffc873', textShadow: '0 0 6px rgba(255,200,115,.8)' }}>
                {PRESETS[presetIdx].name}
              </span>
            </div>
          </div>

          {/* scope + power */}
          <div className="flex items-center gap-3">
            <canvas ref={canvasRef} width={180} height={44} className="rounded"
              style={{ border: '1px solid #3d2b18', background: '#120a04' }} />
            <div className="flex flex-col items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: anyOn ? '#ff8c1a' : '#5a3a1a', boxShadow: anyOn ? '0 0 10px #ff8c1a' : 'none' }} />
              <span className="text-[7px]" style={{ color: '#c9925a' }}>{anyOn ? 'DRONE' : 'IDLE'}</span>
            </div>
          </div>
        </div>

        {/* ── presets ── */}
        <div className="px-5 pb-2 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {PRESETS.map((p, i) => (
            <button key={p.name} onClick={() => loadPreset(i)}
              className="py-1.5 rounded text-[9px] font-bold tracking-wide"
              style={{
                background: i === presetIdx ? 'linear-gradient(180deg,#b3600f,#7a3d08)' : 'linear-gradient(180deg,#3a2914,#241808)',
                color: i === presetIdx ? '#ffe0b0' : '#c9925a',
                border: '1px solid #0a0603',
                boxShadow: i === presetIdx ? 'inset 0 0 8px rgba(255,170,60,.5), 0 0 8px rgba(255,140,26,.4)' : 'inset 0 1px 0 rgba(255,200,120,.08)',
              }}>
              {p.name}
            </button>
          ))}
        </div>

        {/* ── voice strips ── */}
        <div className="px-5 py-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {voices.map((v, i) => (
            <div key={i} className="rounded-md p-2 flex flex-col gap-1.5"
              style={{ background: 'linear-gradient(180deg,#1c1208,#120b05)', border: '1px solid #0a0603', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold tracking-wider" style={{ color: '#c9925a' }}>GEN {i + 1}</span>
                <button
                  onClick={() => { Tone.start(); setVoices((vs) => vs.map((x, j) => (j === i ? { ...x, on: !x.on } : x))); }}
                  className="w-9 h-9 rounded-full text-[8px] font-black"
                  style={{
                    background: v.on ? 'radial-gradient(circle at 35% 30%, #ffbf5e, #cc6a10)' : 'radial-gradient(circle at 35% 30%, #4a3520, #241505)',
                    color: v.on ? '#3a1c00' : '#8a6a45',
                    border: '2px solid #0a0603',
                    boxShadow: v.on ? '0 0 14px rgba(255,150,40,.8), inset 0 2px 3px rgba(255,230,180,.5)' : 'inset 0 2px 4px rgba(0,0,0,.7)',
                  }}>
                  {v.on ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <select value={((v.semi % 12) + 12) % 12}
                  onChange={(e) => setVoices((vs) => vs.map((x, j) => (j === i ? { ...x, semi: parseInt(e.target.value) + Math.floor(x.semi / 12) * 12 } : x)))}
                  className="rounded bg-black/60 px-1 py-0.5 text-[9px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
                  {NOTE_NAMES.map((n, s) => <option key={n} value={s}>{n}</option>)}
                </select>
                <select value={v.oct}
                  onChange={(e) => setVoices((vs) => vs.map((x, j) => (j === i ? { ...x, oct: parseInt(e.target.value) } : x)))}
                  className="rounded bg-black/60 px-1 py-0.5 text-[9px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
                  {[-1, 0, 1, 2, 3].map((o) => <option key={o} value={o}>OCT {o}</option>)}
                </select>
                <select value={v.wave}
                  onChange={(e) => setVoices((vs) => vs.map((x, j) => (j === i ? { ...x, wave: e.target.value as Wave } : x)))}
                  className="rounded bg-black/60 px-1 py-0.5 text-[9px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
                  {WAVES.map((w) => <option key={w} value={w}>{w === 'sine' ? 'SIN' : w === 'triangle' ? 'TRI' : 'SAW'}</option>)}
                </select>
              </div>
              <S label="NIVEAU" v={v.level} min={0} max={1} step={0.01} set={(x) => setVoices((vs) => vs.map((y, j) => (j === i ? { ...y, level: x } : y)))} fmt={(x) => `${Math.round(x * 100)}`} />
            </div>
          ))}
        </div>

        {/* ── tuning + FX ── */}
        <div className="px-5 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 rounded-md mx-5 mb-2 p-3"
          style={{ background: 'linear-gradient(180deg,#160e06,#0d0703)', border: '1px solid #0a0603', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.7)' }}>
          {/* chord row */}
          <label className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-wider" style={{ color: '#c9925a' }}>FONDAMENTALE</span>
            <select value={root} onChange={(e) => { const r = parseInt(e.target.value); setRoot(r); applyChord(r, oct, chord); }}
              className="rounded bg-black/60 px-1 py-1 text-[10px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
              {NOTE_NAMES.map((n, s) => <option key={n} value={s}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-wider" style={{ color: '#c9925a' }}>OCTAVE</span>
            <select value={oct} onChange={(e) => { const o = parseInt(e.target.value); setOct(o); applyChord(root, o, chord); }}
              className="rounded bg-black/60 px-1 py-1 text-[10px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
              {[-1, 0, 1, 2].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-wider" style={{ color: '#c9925a' }}>ACCORD</span>
            <select value={chord} onChange={(e) => { const c = e.target.value as keyof typeof CHORDS; setChord(c); applyChord(root, oct, c); }}
              className="rounded bg-black/60 px-1 py-1 text-[10px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
              {Object.keys(CHORDS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <S label="DETUNE" v={detune} min={0} max={40} step={1} set={setDetune} fmt={(x) => `${x}ct`} />
          <S label="DRIVE" v={drive} min={0} max={0.8} step={0.01} set={setDrive} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="LARGEUR" v={width} min={0} max={1} step={0.01} set={setWidth} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="CUTOFF" v={cutoff} min={100} max={8000} step={20} set={setCutoff} fmt={(x) => `${(x / 1000).toFixed(1)}k`} />
          <S label="RESONANCE" v={reso} min={0.3} max={12} step={0.1} set={setReso} fmt={(x) => x.toFixed(1)} />
          <S label="CHORUS" v={chorus} min={0} max={1} step={0.01} set={setChorus} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="DELAY TPS" v={dlyTime} min={0.1} max={2} step={0.05} set={setDlyTime} fmt={(x) => `${x.toFixed(2)}s`} />
          <S label="DELAY FB" v={dlyFb} min={0} max={0.85} step={0.01} set={setDlyFb} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="DELAY MIX" v={dlyMix} min={0} max={1} step={0.01} set={setDlyMix} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="REVERB TPS" v={revDecay} min={2} max={15} step={0.5} set={setRevDecay} fmt={(x) => `${x.toFixed(0)}s`} />
          <S label="REVERB MIX" v={revMix} min={0} max={0.9} step={0.01} set={setRevMix} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="LFO FILTRE" v={lfo1Rate} min={0.02} max={2} step={0.01} set={setLfo1Rate} fmt={(x) => `${x.toFixed(2)}Hz`} />
          <S label="LFO F. DEPTH" v={lfo1Depth} min={0} max={1} step={0.01} set={setLfo1Depth} fmt={(x) => `${Math.round(x * 100)}`} />
          <S label="LFO PITCH" v={lfo2Rate} min={0.02} max={2} step={0.01} set={setLfo2Rate} fmt={(x) => `${x.toFixed(2)}Hz`} />
          <S label="LFO P. DEPTH" v={lfo2Depth} min={0} max={30} step={1} set={setLfo2Depth} fmt={(x) => `${x}ct`} />
          <S label="VOLUME" v={vol} min={0} max={1} step={0.01} set={setVol} fmt={(x) => `${Math.round(x * 100)}`} />
        </div>

        {/* ── special + sampling row ── */}
        <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
          <button onClick={() => setFlare((f) => !f)}
            className="px-3 py-1.5 rounded text-[10px] font-black tracking-wider"
            style={{
              background: flare ? 'radial-gradient(circle at 40% 30%, #ffd27a, #cc6a10)' : 'linear-gradient(180deg,#3a2914,#241808)',
              color: flare ? '#3a1c00' : '#c9925a', border: '1px solid #0a0603',
              boxShadow: flare ? '0 0 14px rgba(255,160,40,.8)' : 'none',
            }}>
            ☀ SOLAR FLARE
          </button>
          <button onClick={() => setEvolve((e) => !e)}
            className="px-3 py-1.5 rounded text-[10px] font-black tracking-wider"
            style={{
              background: evolve ? 'linear-gradient(180deg,#b3600f,#7a3d08)' : 'linear-gradient(180deg,#3a2914,#241808)',
              color: evolve ? '#ffe0b0' : '#c9925a', border: '1px solid #0a0603',
              boxShadow: evolve ? '0 0 10px rgba(255,140,26,.5)' : 'none',
            }}>
            ∿ SLOW EVOLVE
          </button>

          <span className="mx-1 h-6 w-px" style={{ background: '#3a2914' }} />

          {/* texture layer */}
          <label className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold" style={{ color: '#c9925a' }}>TEXTURE</span>
            <select value={texture} onChange={(e) => setTexture(e.target.value)}
              className="rounded bg-black/60 px-1.5 py-1 text-[10px]" style={{ color: '#ffb347', border: '1px solid #3a2914' }}>
              <option value="OFF">OFF</option>
              {Object.keys(TEXTURES).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {texture !== 'OFF' && (
            <div className="w-24"><S label="TEX NIVEAU" v={texLevel} min={0} max={1} step={0.01} set={setTexLevel} fmt={(x) => `${Math.round(x * 100)}`} /></div>
          )}
          {texLoading && <span className="animate-pulse text-[9px]" style={{ color: '#ffb347' }}>chargement…</span>}

          <span className="mx-1 h-6 w-px" style={{ background: '#3a2914' }} />

          {/* sample pad */}
          <button onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded text-[10px] font-bold"
            style={{ background: 'linear-gradient(180deg,#e6b365, #b37a2e)', color: '#2a1808' }}>
            📁 SAMPLE EN BOUCLE
          </button>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
          {engine && (
            <button onClick={toggleLiveSample}
              className="px-3 py-1.5 rounded text-[10px] font-bold text-white"
              style={{ background: sampling ? 'linear-gradient(180deg,#ff4d3d,#b32010)' : 'linear-gradient(180deg,#8a4a2f,#5a2c1c)' }}>
              {sampling ? `⏺ STOP ${sampleSec.toFixed(1)}s` : '🎙 SAMPLER LE MIX'}
            </button>
          )}
          {liveReady && !userLoop && (
            <button onClick={() => liveBufRef.current && startLoop(liveBufRef.current, 'MIX LIVE')}
              className="px-3 py-1.5 rounded text-[10px] font-bold"
              style={{ background: '#3a2914', color: '#ffb347', border: '1px solid #0a0603' }}>
              ↻ REJOUER MIX
            </button>
          )}
          {userLoop && (
            <button onClick={stopLoop}
              className="px-3 py-1.5 rounded text-[10px] font-bold"
              style={{ background: 'linear-gradient(180deg,#b3600f,#7a3d08)', color: '#ffe0b0', boxShadow: '0 0 10px rgba(255,140,26,.5)' }}>
              ■ STOP BOUCLE {userName && `· ${userName.slice(0, 18)}`}
            </button>
          )}
          {engine && <span className="ml-auto text-[9px]" style={{ color: '#8fae60' }}>◆ mix DJ-AVA</span>}
        </div>
      </div>
    </div>
  );
}
