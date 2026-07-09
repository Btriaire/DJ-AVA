'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import type { DJEngine } from '@/lib/audio/engine';
import type { Recorder } from '@/lib/audio/Recorder';

/* ---------- Keyboard geometry (A0 → C8, 88 keys) ---------- */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PC = new Set([1, 3, 6, 8, 10]);

type Key = { midi: number; name: string; black: boolean };

const KEYS: Key[] = [];
for (let m = 21; m <= 108; m++) {
  const pc = m % 12;
  const oct = Math.floor(m / 12) - 1;
  KEYS.push({ midi: m, name: `${NAMES[pc]}${oct}`, black: BLACK_PC.has(pc) });
}
const WHITE = KEYS.filter((k) => !k.black);
const whiteIndexBefore = (midi: number) => WHITE.findIndex((w) => w.midi === midi - 1);
const midiToNote = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/* ---------- Static sound banks ---------- */
type Bank = {
  id: string;
  name: string;
  kind: 'sampler' | 'fm';
  smp?: boolean;
  baseUrl?: string;
  urls?: Record<string, string>;
  fm?: any;
};

const NB = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';

const BANKS: Bank[] = [
  {
    id: 'piano', name: 'GRAND PIANO', kind: 'sampler', smp: true,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    urls: {
      A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3',
      C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3',
      C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3',
      C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3',
      C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3',
      C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3',
      C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3',
    },
  },
  {
    id: 'casio', name: 'SAMPLE KIT', kind: 'sampler', smp: true,
    baseUrl: 'https://tonejs.github.io/audio/casio/',
    urls: { A1: 'A1.mp3', A2: 'A2.mp3', 'A#1': 'As1.mp3', B1: 'B1.mp3', C2: 'C2.mp3', 'C#2': 'Cs2.mp3', D2: 'D2.mp3', 'D#2': 'Ds2.mp3', E2: 'E2.mp3', F2: 'F2.mp3', 'F#2': 'Fs2.mp3', G2: 'G2.mp3', 'G#1': 'Gs1.mp3' },
  },
  {
    id: 'guitar', name: 'GUITAR', kind: 'sampler', smp: true, baseUrl: NB + 'guitar-acoustic/',
    urls: { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3', 'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3' },
  },
  {
    id: 'cello', name: 'CELLO', kind: 'sampler', smp: true, baseUrl: NB + 'cello/',
    urls: { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', E2: 'E2.mp3', E3: 'E3.mp3', E4: 'E4.mp3', G2: 'G2.mp3', G3: 'G3.mp3' },
  },
  {
    id: 'violin', name: 'VIOLIN', kind: 'sampler', smp: true, baseUrl: NB + 'violin/',
    urls: { A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', E4: 'E4.mp3', E5: 'E5.mp3', G4: 'G4.mp3', G5: 'G5.mp3' },
  },
  {
    id: 'flute', name: 'FLUTE', kind: 'sampler', smp: true, baseUrl: NB + 'flute/',
    urls: { A4: 'A4.mp3', A5: 'A5.mp3', A6: 'A6.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', E4: 'E4.mp3', E5: 'E5.mp3', E6: 'E6.mp3' },
  },
  {
    id: 'xylo', name: 'XYLOPHONE', kind: 'sampler', smp: true, baseUrl: NB + 'xylophone/',
    urls: { C5: 'C5.mp3', C6: 'C6.mp3', C7: 'C7.mp3', C8: 'C8.mp3', G4: 'G4.mp3', G5: 'G5.mp3', G6: 'G6.mp3', G7: 'G7.mp3' },
  },
  {
    id: 'organ', name: 'ORGAN', kind: 'sampler', smp: true, baseUrl: NB + 'organ/',
    urls: { C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', 'D#1': 'Ds1.mp3', 'D#2': 'Ds2.mp3', 'F#3': 'Fs3.mp3', A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3' },
  },
  {
    id: 'harp', name: 'HARP', kind: 'sampler', smp: true, baseUrl: NB + 'harp/',
    urls: { A2: 'A2.mp3', A4: 'A4.mp3', A6: 'A6.mp3', C3: 'C3.mp3', C5: 'C5.mp3', E3: 'E3.mp3', E5: 'E5.mp3' },
  },
  { id: 'epiano', name: 'E.PIANO 1', kind: 'fm', fm: { harmonicity: 3, modulationIndex: 10, envelope: { attack: 0.001, decay: 1.2, sustain: 0.1, release: 1.2 }, modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 } } },
  { id: 'bells', name: 'TUB BELLS', kind: 'fm', fm: { harmonicity: 3.01, modulationIndex: 14, envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.5 }, modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 } } },
  { id: 'bass', name: 'SYN BASS', kind: 'fm', fm: { harmonicity: 0.5, modulationIndex: 5, envelope: { attack: 0.001, decay: 0.4, sustain: 0.5, release: 0.3 }, modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0.2, release: 0.2 } } },
  { id: 'brass', name: 'SYN BRASS', kind: 'fm', fm: { harmonicity: 1, modulationIndex: 6, envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.4 }, modulationEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.4 } } },
  { id: 'dxharp', name: 'DX HARP', kind: 'fm', fm: { harmonicity: 2, modulationIndex: 8, envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 1.8 }, modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 } } },
  { id: 'marimba', name: 'MARIMBA', kind: 'fm', fm: { harmonicity: 4, modulationIndex: 6, envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 }, modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } } },
];

const QWERTY: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75,
};

type Props = { engine?: DJEngine; embedded?: boolean };

export default function DX7Synth({ engine, embedded = false }: Props) {
  const [bankId, setBankId] = useState('piano');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Set<number>>(new Set());
  const [octave, setOctave] = useState(0);

  /* editable synth params */
  const [vol, setVol] = useState(0.85);
  const [cutoff, setCutoff] = useState(14000);
  const [revWet, setRevWet] = useState(0.22);
  const [vibRate, setVibRate] = useState(5);
  const [vibDepth, setVibDepth] = useState(0);
  const [glide, setGlide] = useState(0);
  const [atk, setAtk] = useState(0.01);
  const [dec, setDec] = useState(0.4);
  const [sus, setSus] = useState(0.5);
  const [rel, setRel] = useState(0.8);
  const [harm, setHarm] = useState(3);
  const [modIdx, setModIdx] = useState(10);

  /* live/user sample status */
  const [userLoaded, setUserLoaded] = useState(false);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [sampleSec, setSampleSec] = useState(0);

  const instRef = useRef<Tone.Sampler | Tone.PolySynth | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const vibRef = useRef<Tone.Vibrato | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const outRef = useRef<Tone.Gain | null>(null);
  const heldRef = useRef<Set<number>>(new Set());
  const userBufRef = useRef<AudioBuffer | null>(null);
  const liveBufRef = useRef<AudioBuffer | null>(null);
  const recRef = useRef<Recorder | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const bank = BANKS.find((b) => b.id === bankId);

  /* build the persistent output chain once: filter → vibrato → reverb → gain → out */
  useEffect(() => {
    const out = new Tone.Gain(vol);
    if (engine) out.connect(engine.mixInput);
    else out.toDestination();
    const reverb = new Tone.Reverb({ decay: 2.2, wet: revWet }).connect(out);
    const vib = new Tone.Vibrato(vibRate, vibDepth).connect(reverb);
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(vib);
    outRef.current = out;
    reverbRef.current = reverb;
    vibRef.current = vib;
    filterRef.current = filter;
    if (engine) recRef.current = engine.makeLiveRecorder(12);
    return () => {
      out.dispose(); reverb.dispose(); vib.dispose(); filter.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* apply live-editable params to the chain */
  useEffect(() => { if (outRef.current) outRef.current.gain.rampTo(vol, 0.05); }, [vol]);
  useEffect(() => { if (filterRef.current) filterRef.current.frequency.rampTo(cutoff, 0.05); }, [cutoff]);
  useEffect(() => { if (reverbRef.current) reverbRef.current.wet.rampTo(revWet, 0.05); }, [revWet]);
  useEffect(() => { if (vibRef.current) { vibRef.current.frequency.value = vibRate; vibRef.current.depth.rampTo(vibDepth, 0.05); } }, [vibRate, vibDepth]);

  /* apply envelope / FM params to the current instrument */
  const applyVoiceParams = useCallback(() => {
    const inst = instRef.current;
    if (!inst) return;
    if (inst instanceof Tone.PolySynth) {
      inst.set({
        harmonicity: harm,
        modulationIndex: modIdx,
        portamento: glide,
        envelope: { attack: atk, decay: dec, sustain: sus, release: rel },
      } as any);
    } else if (inst instanceof Tone.Sampler) {
      inst.attack = atk;
      inst.release = Math.max(0.2, rel);
    }
  }, [harm, modIdx, glide, atk, dec, sus, rel]);

  useEffect(() => { applyVoiceParams(); }, [applyVoiceParams]);

  /* (re)build instrument on bank change */
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    instRef.current?.dispose();
    const chainIn = filterRef.current!;

    const finish = (inst: Tone.Sampler | Tone.PolySynth) => {
      inst.connect(chainIn);
      instRef.current = inst;
      applyVoiceParams();
      if (!disposed) setLoading(false);
    };

    if (bankId === 'user' || bankId === 'live') {
      const buf = bankId === 'user' ? userBufRef.current : liveBufRef.current;
      if (buf) {
        const s = new Tone.Sampler();
        s.add('C4' as any, buf as any);
        finish(s);
      } else {
        setLoading(false);
      }
    } else if (bank?.kind === 'sampler') {
      const s = new Tone.Sampler({
        urls: bank.urls,
        baseUrl: bank.baseUrl,
        release: 1,
        onload: () => { if (!disposed) finish(s); },
      });
    } else if (bank?.kind === 'fm') {
      const p = new Tone.PolySynth(Tone.FMSynth);
      p.maxPolyphony = 16;
      // seed editable params from the preset the first time it's picked
      setHarm(bank.fm.harmonicity); setModIdx(bank.fm.modulationIndex);
      setAtk(bank.fm.envelope.attack); setDec(bank.fm.envelope.decay);
      setSus(bank.fm.envelope.sustain); setRel(bank.fm.envelope.release);
      p.set(bank.fm);
      finish(p);
    }

    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankId]);

  const noteOn = useCallback((midi: number) => {
    const inst = instRef.current;
    if (!inst || loading) return;
    const m = midi + octave * 12;
    if (heldRef.current.has(m)) return;
    heldRef.current.add(m);
    Tone.start();
    inst.triggerAttack(midiToNote(m));
    setActive(new Set(heldRef.current));
  }, [loading, octave]);

  const noteOff = useCallback((midi: number) => {
    const inst = instRef.current;
    if (!inst) return;
    const m = midi + octave * 12;
    if (!heldRef.current.has(m)) return;
    heldRef.current.delete(m);
    inst.triggerRelease(midiToNote(m));
    setActive(new Set(heldRef.current));
  }, [octave]);

  /* physical keyboard */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      const m = QWERTY[e.key.toLowerCase()];
      if (m !== undefined) noteOn(m);
    };
    const up = (e: KeyboardEvent) => {
      const m = QWERTY[e.key.toLowerCase()];
      if (m !== undefined) noteOff(m);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [noteOn, noteOff]);

  /* ---- upload a sample file ---- */
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.arrayBuffer();
    const ac = (Tone.getContext().rawContext as unknown) as AudioContext;
    const buf = await ac.decodeAudioData(raw);
    userBufRef.current = buf;
    setUserLoaded(true);
    setBankId('user');
  };

  /* ---- sample the live DJ mix ---- */
  const toggleLiveSample = () => {
    const rec = recRef.current;
    if (!rec || !engine) return;
    if (!sampling) {
      setSampleSec(0);
      rec.onProgress = (sec) => setSampleSec(sec);
      rec.start();
      setSampling(true);
    } else {
      const buf = rec.stop();
      setSampling(false);
      if (buf) {
        liveBufRef.current = buf;
        setLiveLoaded(true);
        setBankId('live');
      }
    }
  };

  const whiteW = 100 / WHITE.length;
  const lcdText = loading ? 'LOADING…'
    : bankId === 'user' ? 'USER SAMPLE'
    : bankId === 'live' ? 'LIVE SAMPLE'
    : bank?.name ?? '';

  const wrapClass = embedded
    ? 'w-full'
    : 'w-full min-h-screen flex flex-col items-center justify-center p-4 gap-4';
  const wrapStyle = embedded ? {} : { background: 'radial-gradient(circle at 50% 0%, #2a2320, #0c0a09)' };

  return (
    <div className={wrapClass} style={wrapStyle}>
      <div className="w-full max-w-[1600px] rounded-xl overflow-hidden select-none mx-auto"
        style={{ boxShadow: '0 30px 60px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08)' }}>

        {/* ===== Control surface ===== */}
        <div className="relative px-6 py-5"
          style={{ background: 'linear-gradient(180deg,#3a3632 0%,#211e1b 55%,#171412 100%)', borderBottom: '3px solid #000' }}>
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex flex-col leading-none">
              <span className="text-[11px] tracking-[.35em] text-neutral-400 mb-1">YAMAHA</span>
              <span className="text-4xl font-black italic text-neutral-100 tracking-tight" style={{ textShadow: '0 2px 4px rgba(0,0,0,.6)' }}>DX7</span>
              <span className="text-[8px] tracking-[.2em] text-neutral-500 mt-1">DIGITAL PROGRAMMABLE ALGORITHM SYNTHESIZER</span>
            </div>

            <div className="flex-1 min-w-[220px] max-w-[360px] rounded px-4 py-2 font-mono"
              style={{ background: 'linear-gradient(180deg,#0a2e0a,#062006)', border: '2px solid #041504', boxShadow: 'inset 0 0 12px rgba(0,255,80,.25)', color: '#4dff7a', textShadow: '0 0 6px rgba(77,255,122,.8)' }}>
              <div className="text-[10px] opacity-70">VOICE / BANK{octave !== 0 ? `  OCT ${octave > 0 ? '+' : ''}${octave}` : ''}</div>
              <div className="text-lg font-bold tracking-wide">{lcdText}</div>
            </div>

            <div className="flex items-center gap-4">
              {/* octave */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <button onClick={() => setOctave((o) => Math.max(-3, o - 1))} className="w-7 h-7 rounded bg-neutral-700 text-neutral-200 text-sm font-bold hover:bg-neutral-600">−</button>
                  <button onClick={() => setOctave((o) => Math.min(3, o + 1))} className="w-7 h-7 rounded bg-neutral-700 text-neutral-200 text-sm font-bold hover:bg-neutral-600">+</button>
                </div>
                <span className="text-[7px] text-neutral-500 tracking-wider">OCTAVE</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#ff4d3d', boxShadow: '0 0 10px #ff4d3d' }} />
                <span className="text-[7px] text-neutral-500">POWER</span>
              </div>
            </div>
          </div>

          {/* Voice buttons */}
          <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-2">
            {BANKS.map((b, i) => {
              const selected = b.id === bankId;
              return (
                <button key={b.id} onClick={() => setBankId(b.id)}
                  className="relative py-2 rounded text-[10px] font-bold tracking-wide transition-all"
                  style={{
                    background: selected ? 'linear-gradient(180deg,#2f6b2f,#1c4d1c)' : 'linear-gradient(180deg,#4a4540,#2b2723)',
                    color: selected ? '#c9ffcf' : '#b9b2a8', border: '1px solid #000',
                    boxShadow: selected ? 'inset 0 0 8px rgba(120,255,120,.4), 0 0 8px rgba(60,200,60,.4)' : 'inset 0 1px 0 rgba(255,255,255,.06)',
                  }}>
                  <span className="absolute top-1 left-1.5 text-[7px] opacity-60">{i + 1}</span>
                  {b.name}
                  {b.smp && <span className="absolute bottom-0.5 right-1 text-[6px] text-amber-300/80">◆SMP</span>}
                </button>
              );
            })}
            {/* dynamic banks */}
            <button onClick={() => userLoaded && setBankId('user')} disabled={!userLoaded}
              className="relative py-2 rounded text-[10px] font-bold tracking-wide transition-all disabled:opacity-40"
              style={{ background: bankId === 'user' ? 'linear-gradient(180deg,#6b4b2f,#4d371c)' : 'linear-gradient(180deg,#4a4540,#2b2723)', color: '#ffd9a8', border: '1px solid #000' }}>
              USER SMP
            </button>
            <button onClick={() => liveLoaded && setBankId('live')} disabled={!liveLoaded}
              className="relative py-2 rounded text-[10px] font-bold tracking-wide transition-all disabled:opacity-40"
              style={{ background: bankId === 'live' ? 'linear-gradient(180deg,#6b2f5a,#4d1c3f)' : 'linear-gradient(180deg,#4a4540,#2b2723)', color: '#ffb8e6', border: '1px solid #000' }}>
              LIVE SMP
            </button>
          </div>

          {/* ===== Parameter panel (the "much more options") ===== */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-3 rounded-lg p-4"
            style={{ background: 'linear-gradient(180deg,#191613,#0e0c0a)', border: '1px solid #000' }}>
            <Slider label="VOLUME" value={vol} min={0} max={1} step={0.01} onChange={setVol} fmt={(v) => `${Math.round(v * 100)}`} />
            <Slider label="CUTOFF" value={cutoff} min={200} max={18000} step={50} onChange={setCutoff} fmt={(v) => `${(v / 1000).toFixed(1)}k`} />
            <Slider label="REVERB" value={revWet} min={0} max={0.9} step={0.01} onChange={setRevWet} fmt={(v) => `${Math.round(v * 100)}`} />
            <Slider label="GLIDE" value={glide} min={0} max={0.4} step={0.005} onChange={setGlide} fmt={(v) => `${Math.round(v * 1000)}`} />
            <Slider label="VIB RATE" value={vibRate} min={0.5} max={12} step={0.1} onChange={setVibRate} fmt={(v) => v.toFixed(1)} />
            <Slider label="VIB DEPTH" value={vibDepth} min={0} max={0.6} step={0.01} onChange={setVibDepth} fmt={(v) => `${Math.round(v * 100)}`} />
            <Slider label="ATTACK" value={atk} min={0.001} max={2} step={0.001} onChange={setAtk} fmt={(v) => `${Math.round(v * 1000)}ms`} />
            <Slider label="DECAY" value={dec} min={0.01} max={3} step={0.01} onChange={setDec} fmt={(v) => `${Math.round(v * 1000)}ms`} />
            <Slider label="SUSTAIN" value={sus} min={0} max={1} step={0.01} onChange={setSus} fmt={(v) => `${Math.round(v * 100)}`} />
            <Slider label="RELEASE" value={rel} min={0.05} max={4} step={0.01} onChange={setRel} fmt={(v) => `${Math.round(v * 1000)}ms`} />
            <Slider label="FM HARM" value={harm} min={0.1} max={8} step={0.01} onChange={setHarm} fmt={(v) => v.toFixed(2)} />
            <Slider label="FM INDEX" value={modIdx} min={0} max={30} step={0.1} onChange={setModIdx} fmt={(v) => v.toFixed(1)} />
          </div>

          {/* ===== Sampling actions ===== */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded text-xs font-bold text-neutral-900"
              style={{ background: 'linear-gradient(180deg,#e6c98a,#c9a95f)' }}>
              📁 CHARGER UN SAMPLE
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
            {engine ? (
              <button onClick={toggleLiveSample}
                className="px-4 py-2 rounded text-xs font-bold text-white transition"
                style={{ background: sampling ? 'linear-gradient(180deg,#ff4d5e,#c31d2e)' : 'linear-gradient(180deg,#8a2f6b,#5a1c47)' }}>
                {sampling ? `⏺ STOP (${sampleSec.toFixed(1)}s)` : '🎙 SAMPLER LE MIX LIVE'}
              </button>
            ) : (
              <span className="text-[10px] text-neutral-500">Le sampling live est dispo dans DJ-AVA (module).</span>
            )}
            {engine && <span className="text-[10px] text-emerald-400/80">◆ connecté au mix DJ-AVA</span>}
          </div>
        </div>

        {/* ===== Keyboard ===== */}
        <div className="relative w-full" style={{ height: '180px', background: 'linear-gradient(180deg,#111,#000)', paddingTop: '6px' }}>
          <div className="absolute top-0 left-0 w-full h-1.5" style={{ background: 'linear-gradient(90deg,#7a1f1f,#a63030,#7a1f1f)' }} />
          <div className="relative w-full h-full">
            <div className="flex w-full h-full">
              {WHITE.map((k) => {
                const on = active.has(k.midi + octave * 12) || active.has(k.midi);
                return (
                  <div key={k.midi}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                    onPointerUp={() => noteOff(k.midi)}
                    onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }}
                    onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
                    className="flex-1 relative cursor-pointer"
                    style={{
                      borderLeft: '1px solid #bbb', borderRight: '1px solid #999', borderBottom: '3px solid #999', borderRadius: '0 0 4px 4px',
                      background: on ? 'linear-gradient(180deg,#d9e6ff,#a9c4f0)' : 'linear-gradient(180deg,#fff 0%,#f0f0f0 82%,#dcdcdc 100%)',
                      boxShadow: on ? 'inset 0 -6px 10px rgba(70,120,220,.35)' : 'inset 0 -8px 8px rgba(0,0,0,.06)',
                    }}>
                    {k.name.startsWith('C') && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-neutral-400 pointer-events-none">{k.name}</span>}
                  </div>
                );
              })}
            </div>
            {KEYS.filter((k) => k.black).map((k) => {
              const wi = whiteIndexBefore(k.midi);
              const left = (wi + 1) * whiteW;
              const on = active.has(k.midi + octave * 12) || active.has(k.midi);
              return (
                <div key={k.midi}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                  onPointerUp={() => noteOff(k.midi)}
                  onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }}
                  onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
                  className="absolute top-1.5 cursor-pointer z-10"
                  style={{
                    left: `${left}%`, transform: 'translateX(-50%)', width: `${whiteW * 0.62}%`, height: '62%', borderRadius: '0 0 3px 3px',
                    background: on ? 'linear-gradient(180deg,#3a5ea8,#22407a)' : 'linear-gradient(180deg,#2a2a2a 0%,#050505 90%)',
                    boxShadow: on ? 'inset 0 -4px 8px rgba(90,140,240,.5), 0 2px 4px #000' : '0 3px 5px rgba(0,0,0,.6), inset 0 -3px 4px rgba(255,255,255,.08)',
                    border: '1px solid #000',
                  }} />
              );
            })}
          </div>
        </div>
      </div>

      {!embedded && (
        <div className="text-center text-neutral-400 text-sm max-w-2xl">
          🎹 Joue aux touches ou au clavier <span className="font-mono text-amber-300">A W S E D F T G Y H U J K</span>.
          Charge tes propres samples, et dans DJ-AVA active le module pour <span className="text-fuchsia-300">sampler le mix live</span>.
        </div>
      )}
    </div>
  );
}

/* ---------- Small labelled slider (DX7 data-entry style) ---------- */
function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[9px] tracking-wider text-neutral-400">{label}</span>
        <span className="text-[9px] font-mono text-emerald-400">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-emerald-500 h-1.5" />
    </label>
  );
}
