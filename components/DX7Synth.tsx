'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import type { DJEngine } from '@/lib/audio/engine';
import type { Recorder } from '@/lib/audio/Recorder';

/* ---------- Keyboard geometry — 61 keys (C1 → C6), like a real DX7 ---------- */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PC = new Set([1, 3, 6, 8, 10]);

type Key = { midi: number; name: string; black: boolean };
const KEYS: Key[] = [];
for (let m = 36; m <= 96; m++) {
  const pc = m % 12;
  const oct = Math.floor(m / 12) - 1;
  KEYS.push({ midi: m, name: `${NAMES[pc]}${oct}`, black: BLACK_PC.has(pc) });
}
const WHITE = KEYS.filter((k) => !k.black);
const whiteIndexBefore = (midi: number) => WHITE.findIndex((w) => w.midi === midi - 1);
const midiToNote = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/* ---------- Voices: 32 like the DX7 ROM cartridge (samples + FM patches) ---------- */
type Voice = {
  id: string;
  name: string;
  kind: 'sampler' | 'fm';
  smp?: boolean;
  baseUrl?: string;
  urls?: Record<string, string>;
  fm?: any;
};

const NB = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
const env = (a: number, d: number, s: number, r: number) => ({ attack: a, decay: d, sustain: s, release: r });
const fm = (harmonicity: number, modulationIndex: number, e: any, me: any, osc = 'sine') =>
  ({ harmonicity, modulationIndex, oscillator: { type: osc }, envelope: e, modulationEnvelope: me });

const VOICES: Voice[] = [
  /* --- sampled instruments (◆SMP) --- */
  {
    id: 'piano', name: 'GRAND PIANO', kind: 'sampler', smp: true,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    urls: {
      A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3',
      C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3',
      C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3',
      C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3',
      C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3',
      C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3', C7: 'C7.mp3', C8: 'C8.mp3',
    },
  },
  { id: 'casio', name: 'SAMPLE KIT', kind: 'sampler', smp: true, baseUrl: 'https://tonejs.github.io/audio/casio/', urls: { A1: 'A1.mp3', A2: 'A2.mp3', 'A#1': 'As1.mp3', B1: 'B1.mp3', C2: 'C2.mp3', 'C#2': 'Cs2.mp3', D2: 'D2.mp3', 'D#2': 'Ds2.mp3', E2: 'E2.mp3', F2: 'F2.mp3', 'F#2': 'Fs2.mp3', G2: 'G2.mp3', 'G#1': 'Gs1.mp3' } },
  { id: 'guitar', name: 'GUITAR', kind: 'sampler', smp: true, baseUrl: NB + 'guitar-acoustic/', urls: { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3', 'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3' } },
  { id: 'cello', name: 'CELLO', kind: 'sampler', smp: true, baseUrl: NB + 'cello/', urls: { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', E2: 'E2.mp3', E3: 'E3.mp3', E4: 'E4.mp3', G2: 'G2.mp3', G3: 'G3.mp3' } },
  { id: 'violin', name: 'VIOLIN', kind: 'sampler', smp: true, baseUrl: NB + 'violin/', urls: { A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', E4: 'E4.mp3', E5: 'E5.mp3', G4: 'G4.mp3', G5: 'G5.mp3' } },
  { id: 'flute', name: 'FLUTE', kind: 'sampler', smp: true, baseUrl: NB + 'flute/', urls: { A4: 'A4.mp3', A5: 'A5.mp3', A6: 'A6.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', E4: 'E4.mp3', E5: 'E5.mp3', E6: 'E6.mp3' } },
  { id: 'xylo', name: 'XYLOPHON', kind: 'sampler', smp: true, baseUrl: NB + 'xylophone/', urls: { C5: 'C5.mp3', C6: 'C6.mp3', C7: 'C7.mp3', C8: 'C8.mp3', G4: 'G4.mp3', G5: 'G5.mp3', G6: 'G6.mp3', G7: 'G7.mp3' } },
  { id: 'sax', name: 'SAX', kind: 'sampler', smp: true, baseUrl: NB + 'saxophone/', urls: { 'D#4': 'Ds4.mp3', 'D#5': 'Ds5.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3', 'F#5': 'Fs5.mp3', A3: 'A3.mp3', A4: 'A4.mp3', C4: 'C4.mp3', C5: 'C5.mp3', E3: 'E3.mp3' } },
  { id: 'organS', name: 'ORGAN', kind: 'sampler', smp: true, baseUrl: NB + 'organ/', urls: { C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', 'D#1': 'Ds1.mp3', 'D#2': 'Ds2.mp3', 'F#3': 'Fs3.mp3', A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3' } },
  { id: 'harpS', name: 'HARP', kind: 'sampler', smp: true, baseUrl: NB + 'harp/', urls: { A2: 'A2.mp3', A4: 'A4.mp3', A6: 'A6.mp3', C3: 'C3.mp3', C5: 'C5.mp3', E3: 'E3.mp3', E5: 'E5.mp3' } },
  { id: 'trumpet', name: 'TRUMPET', kind: 'sampler', smp: true, baseUrl: NB + 'trumpet/', urls: { C4: 'C4.mp3', C6: 'C6.mp3', D5: 'D5.mp3', 'D#4': 'Ds4.mp3', F3: 'F3.mp3', F4: 'F4.mp3', F5: 'F5.mp3', G4: 'G4.mp3', A3: 'A3.mp3', A5: 'A5.mp3' } },
  { id: 'contrabass', name: 'CONTRABASS', kind: 'sampler', smp: true, baseUrl: NB + 'contrabass/', urls: { C2: 'C2.mp3', 'C#3': 'Cs3.mp3', D2: 'D2.mp3', E2: 'E2.mp3', 'F#1': 'Fs1.mp3', G1: 'G1.mp3', 'G#2': 'Gs2.mp3', A2: 'A2.mp3', 'A#1': 'As1.mp3', B3: 'B3.mp3' } },

  /* --- FM voices — the classic DX7 factory patches (2-op approximations) --- */
  { id: 'ep1', name: 'E.PIANO 1', kind: 'fm', fm: fm(1, 3.2, env(0.001, 1.6, 0.15, 1.4), env(0.001, 0.35, 0, 0.3)) },
  { id: 'ep2', name: 'E.PIANO 2', kind: 'fm', fm: fm(2, 5, env(0.001, 1.2, 0.1, 1.1), env(0.001, 0.3, 0, 0.25)) },
  { id: 'woodp', name: 'WOOD PIANO', kind: 'fm', fm: fm(1, 2, env(0.001, 1.0, 0.05, 0.9), env(0.001, 0.25, 0, 0.2)) },
  { id: 'tines', name: 'FULL TINES', kind: 'fm', fm: fm(1, 4, env(0.001, 2.0, 0.3, 1.6), env(0.001, 0.5, 0.1, 0.4)) },
  { id: 'bells', name: 'TUB BELLS', kind: 'fm', fm: fm(3.01, 14, env(0.001, 2.5, 0, 2.5), env(0.001, 0.4, 0, 0.4)) },
  { id: 'vibe', name: 'VIBRAPHON', kind: 'fm', fm: fm(4, 3, env(0.001, 1.5, 0, 1.4), env(0.001, 0.3, 0, 0.3)) },
  { id: 'celeste', name: 'CELESTE', kind: 'fm', fm: fm(7, 2, env(0.001, 1.0, 0, 0.9), env(0.001, 0.2, 0, 0.2)) },
  { id: 'marimba', name: 'MARIMBA', kind: 'fm', fm: fm(4, 6, env(0.001, 0.6, 0, 0.6), env(0.001, 0.2, 0, 0.2)) },
  { id: 'kalimba', name: 'KALIMBA', kind: 'fm', fm: fm(5, 4, env(0.001, 0.5, 0, 0.5), env(0.001, 0.15, 0, 0.15)) },
  { id: 'eorgan', name: 'E.ORGAN', kind: 'fm', fm: fm(2, 1, env(0.01, 0.1, 1, 0.3), env(0.01, 0.1, 1, 0.2)) },
  { id: 'pipes', name: 'PIPE ORGAN', kind: 'fm', fm: fm(1, 0.5, env(0.02, 0.1, 1, 0.4), env(0.02, 0.1, 1, 0.3)) },
  { id: 'harpsi', name: 'HARPSICH', kind: 'fm', fm: fm(2, 6, env(0.001, 0.8, 0, 0.7), env(0.001, 0.2, 0, 0.2)) },
  { id: 'clav', name: 'CLAV', kind: 'fm', fm: fm(3, 8, env(0.001, 0.5, 0.1, 0.4), env(0.001, 0.15, 0, 0.15)) },
  { id: 'lead', name: 'SYN LEAD', kind: 'fm', fm: fm(1, 4, env(0.01, 0.2, 0.8, 0.3), env(0.01, 0.2, 0.6, 0.3), 'sawtooth') },
  { id: 'sbass', name: 'SYN BASS', kind: 'fm', fm: fm(0.5, 5, env(0.001, 0.4, 0.5, 0.3), env(0.001, 0.1, 0.2, 0.2)) },
  { id: 'slap', name: 'SLAP BASS', kind: 'fm', fm: fm(1, 10, env(0.001, 0.3, 0.2, 0.25), env(0.001, 0.08, 0, 0.1)) },
  { id: 'brass', name: 'SYN BRASS', kind: 'fm', fm: fm(1, 6, env(0.06, 0.2, 0.8, 0.4), env(0.05, 0.2, 0.7, 0.4)) },
  { id: 'horns', name: 'HORNS', kind: 'fm', fm: fm(1, 4, env(0.1, 0.2, 0.85, 0.5), env(0.08, 0.2, 0.7, 0.4)) },
  { id: 'strings', name: 'STR PAD', kind: 'fm', fm: fm(1, 2, env(0.4, 0.3, 0.9, 1.2), env(0.3, 0.3, 0.6, 0.8)) },
  { id: 'koto', name: 'KOTO', kind: 'fm', fm: fm(3, 5, env(0.001, 1.2, 0, 1.0), env(0.001, 0.3, 0, 0.3)) },
];

const QWERTY: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75,
};

type Props = { engine?: DJEngine; embedded?: boolean };

export default function DX7Synth({ engine, embedded = false }: Props) {
  const [voiceId, setVoiceId] = useState('piano');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Set<number>>(new Set());
  const [octave, setOctave] = useState(0);

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

  const [userLoaded, setUserLoaded] = useState(false);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [sampleSec, setSampleSec] = useState(0);
  const [showEdit, setShowEdit] = useState(false);

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

  const voice = VOICES.find((v) => v.id === voiceId);
  const voiceNum = Math.max(0, VOICES.findIndex((v) => v.id === voiceId)) + 1;

  /* persistent chain: filter → vibrato → reverb → gain → out */
  useEffect(() => {
    const out = new Tone.Gain(vol);
    if (engine) out.connect(engine.mixInput);
    else out.toDestination();
    const reverb = new Tone.Reverb({ decay: 2.2, wet: revWet }).connect(out);
    const vib = new Tone.Vibrato(vibRate, vibDepth).connect(reverb);
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(vib);
    outRef.current = out; reverbRef.current = reverb; vibRef.current = vib; filterRef.current = filter;
    if (engine) recRef.current = engine.makeLiveRecorder(12);
    return () => { out.dispose(); reverb.dispose(); vib.dispose(); filter.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (outRef.current) outRef.current.gain.rampTo(vol, 0.05); }, [vol]);
  useEffect(() => { if (filterRef.current) filterRef.current.frequency.rampTo(cutoff, 0.05); }, [cutoff]);
  useEffect(() => { if (reverbRef.current) reverbRef.current.wet.rampTo(revWet, 0.05); }, [revWet]);
  useEffect(() => { if (vibRef.current) { vibRef.current.frequency.value = vibRate; vibRef.current.depth.rampTo(vibDepth, 0.05); } }, [vibRate, vibDepth]);

  const applyVoiceParams = useCallback(() => {
    const inst = instRef.current;
    if (!inst) return;
    if (inst instanceof Tone.PolySynth) {
      inst.set({ harmonicity: harm, modulationIndex: modIdx, portamento: glide, envelope: { attack: atk, decay: dec, sustain: sus, release: rel } } as any);
    } else if (inst instanceof Tone.Sampler) {
      inst.attack = atk; inst.release = Math.max(0.2, rel);
    }
  }, [harm, modIdx, glide, atk, dec, sus, rel]);
  useEffect(() => { applyVoiceParams(); }, [applyVoiceParams]);

  /* pitch-bend wheel → detune (FM voices) */
  const applyPitchBend = useCallback((semis: number) => {
    const inst = instRef.current;
    if (inst instanceof Tone.PolySynth) inst.set({ detune: semis * 100 } as any);
  }, []);

  /* (re)build instrument on voice change */
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    instRef.current?.dispose();
    const chainIn = filterRef.current!;
    const finish = (inst: Tone.Sampler | Tone.PolySynth) => {
      inst.connect(chainIn); instRef.current = inst; applyVoiceParams();
      if (!disposed) setLoading(false);
    };
    if (voiceId === 'user' || voiceId === 'live') {
      const buf = voiceId === 'user' ? userBufRef.current : liveBufRef.current;
      if (buf) { const s = new Tone.Sampler(); s.add('C4' as any, buf as any); finish(s); }
      else setLoading(false);
    } else if (voice?.kind === 'sampler') {
      const s = new Tone.Sampler({ urls: voice.urls, baseUrl: voice.baseUrl, release: 1, onload: () => { if (!disposed) finish(s); } });
    } else if (voice?.kind === 'fm') {
      const p = new Tone.PolySynth(Tone.FMSynth); p.maxPolyphony = 16;
      setHarm(voice.fm.harmonicity); setModIdx(voice.fm.modulationIndex);
      setAtk(voice.fm.envelope.attack); setDec(voice.fm.envelope.decay);
      setSus(voice.fm.envelope.sustain); setRel(voice.fm.envelope.release);
      p.set(voice.fm); finish(p);
    }
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceId]);

  const noteOn = useCallback((midi: number) => {
    const inst = instRef.current; if (!inst || loading) return;
    const m = midi + octave * 12;
    if (heldRef.current.has(m)) return;
    heldRef.current.add(m); Tone.start(); inst.triggerAttack(midiToNote(m)); setActive(new Set(heldRef.current));
  }, [loading, octave]);
  const noteOff = useCallback((midi: number) => {
    const inst = instRef.current; if (!inst) return;
    const m = midi + octave * 12;
    if (!heldRef.current.has(m)) return;
    heldRef.current.delete(m); inst.triggerRelease(midiToNote(m)); setActive(new Set(heldRef.current));
  }, [octave]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.repeat || e.metaKey || e.ctrlKey) return; const m = QWERTY[e.key.toLowerCase()]; if (m !== undefined) noteOn(m); };
    const up = (e: KeyboardEvent) => { const m = QWERTY[e.key.toLowerCase()]; if (m !== undefined) noteOff(m); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [noteOn, noteOff]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const raw = await file.arrayBuffer();
    const ac = (Tone.getContext().rawContext as unknown) as AudioContext;
    const buf = await ac.decodeAudioData(raw);
    userBufRef.current = buf; setUserLoaded(true); setVoiceId('user');
  };

  const toggleLiveSample = () => {
    const rec = recRef.current; if (!rec || !engine) return;
    if (!sampling) { setSampleSec(0); rec.onProgress = (sec) => setSampleSec(sec); rec.start(); setSampling(true); }
    else { const buf = rec.stop(); setSampling(false); if (buf) { liveBufRef.current = buf; setLiveLoaded(true); setVoiceId('live'); } }
  };

  const whiteW = 100 / WHITE.length;
  const lcdName = loading ? 'LOADING…' : voiceId === 'user' ? 'USER SAMPLE' : voiceId === 'live' ? 'LIVE SAMPLE' : voice?.name ?? '';
  const lcdNum = voiceId === 'user' ? 'U1' : voiceId === 'live' ? 'L1' : String(voiceNum).padStart(2, '0');

  const wrapClass = embedded ? 'w-full' : 'w-full min-h-screen flex items-center justify-center';
  const wrapStyle = embedded ? {} : { background: 'radial-gradient(circle at 50% -10%, #241f18, #0a0806)', padding: '12px' };

  return (
    <div className={wrapClass} style={wrapStyle}>
      <div className="w-full overflow-hidden"
        style={{
          borderRadius: '10px',
          background: 'linear-gradient(180deg,#6a5a45 0%,#5a4c39 3%,#403426 8%,#2b2318 100%)',
          boxShadow: '0 24px 50px rgba(0,0,0,.75), inset 0 2px 0 rgba(214,188,140,.35), inset 0 -2px 6px rgba(0,0,0,.6)',
          border: '1px solid #1a140d',
        }}>

        {/* ============ CONTROL SURFACE (bronze) ============ */}
        <div className="flex items-stretch gap-3 px-3 pt-3 pb-4"
          style={{ background: 'linear-gradient(180deg,#5c4e3a 0%,#463a2a 40%,#33291d 100%)', borderBottom: '4px solid #0c0906' }}>

          {/* ---- LEFT WELL: pitch + mod wheels ---- */}
          <div className="flex gap-2 rounded-md p-2 shrink-0"
            style={{ background: 'linear-gradient(180deg,#17120c,#0b0806)', border: '1px solid #000', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.8)' }}>
            <Wheel label="PITCH" spring onChange={(t) => applyPitchBend((t - 0.5) * 4)} onRelease={() => applyPitchBend(0)} />
            <Wheel label="MOD" onChange={(t) => setVibDepth(t * 0.6)} value={vibDepth / 0.6} />
          </div>

          {/* ---- MAIN PANEL ---- */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* header: branding + LCD */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-3">
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] tracking-[.45em]" style={{ color: '#e9dcc0' }}>YAMAHA</span>
                  <span className="text-3xl font-black italic tracking-tight" style={{ color: '#f3ead3', textShadow: '0 2px 3px rgba(0,0,0,.7)' }}>DX7</span>
                </div>
                <span className="text-[7px] tracking-[.18em] max-w-[130px] leading-tight" style={{ color: '#b7a37c' }}>
                  DIGITAL PROGRAMMABLE ALGORITHM SYNTHESIZER
                </span>
              </div>

              {/* green fluorescent LCD */}
              <div className="flex items-center gap-3 rounded px-3 py-1.5 font-mono"
                style={{ background: 'linear-gradient(180deg,#04250a,#031a06)', border: '2px solid #020d03', boxShadow: 'inset 0 0 14px rgba(40,255,110,.35)' }}>
                <div className="text-3xl font-bold tabular-nums" style={{ color: '#63ffa0', textShadow: '0 0 8px rgba(99,255,160,.9)' }}>{lcdNum}</div>
                <div className="flex flex-col">
                  <span className="text-[8px] opacity-70" style={{ color: '#63ffa0' }}>VOICE{octave !== 0 ? `  OCT ${octave > 0 ? '+' : ''}${octave}` : ''}</span>
                  <span className="text-base font-bold tracking-wide" style={{ color: '#7dffb0', textShadow: '0 0 6px rgba(99,255,160,.8)' }}>{lcdName}</span>
                </div>
              </div>

              {/* octave + power */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-1">
                    <button onClick={() => setOctave((o) => Math.max(-2, o - 1))} className="w-6 h-6 rounded text-sm font-bold" style={{ background: '#2a2118', color: '#e9dcc0', border: '1px solid #000' }}>−</button>
                    <button onClick={() => setOctave((o) => Math.min(2, o + 1))} className="w-6 h-6 rounded text-sm font-bold" style={{ background: '#2a2118', color: '#e9dcc0', border: '1px solid #000' }}>+</button>
                  </div>
                  <span className="text-[7px]" style={{ color: '#b7a37c' }}>OCTAVE</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#ff4d3d', boxShadow: '0 0 8px #ff4d3d' }} />
                  <span className="text-[7px]" style={{ color: '#b7a37c' }}>ON</span>
                </div>
              </div>
            </div>

            {/* 32 membrane voice buttons (2 rows × 16) */}
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0,1fr))' }}>
              {VOICES.map((v, i) => {
                const selected = v.id === voiceId;
                return (
                  <button key={v.id} onClick={() => setVoiceId(v.id)} title={v.name}
                    className="relative rounded-sm py-1 px-0.5 flex flex-col items-center justify-center leading-none"
                    style={{
                      minHeight: '34px',
                      background: selected ? 'linear-gradient(180deg,#2f7d3f,#17501f)' : 'linear-gradient(180deg,#6e5f49,#4a3d2c)',
                      color: selected ? '#d8ffdc' : '#efe6d0',
                      border: '1px solid #1a140d',
                      boxShadow: selected ? 'inset 0 0 8px rgba(120,255,140,.5), 0 0 6px rgba(50,200,80,.5)' : 'inset 0 1px 0 rgba(255,240,200,.15), 0 1px 2px rgba(0,0,0,.5)',
                    }}>
                    <span className="text-[7px] opacity-70 font-mono">{i + 1}</span>
                    <span className="text-[6.5px] font-bold tracking-tight text-center" style={{ fontSize: '6.5px' }}>{v.name}</span>
                    {v.smp && <span className="absolute top-0 right-0.5 text-[5px]" style={{ color: '#ffd27a' }}>◆</span>}
                  </button>
                );
              })}
            </div>

            {/* dynamic sample slots + edit toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background: 'linear-gradient(180deg,#e6c98a,#c9a95f)', color: '#2a2118' }}>
                📁 CHARGER SAMPLE
              </button>
              <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
              <button onClick={() => userLoaded && setVoiceId('user')} disabled={!userLoaded}
                className="px-3 py-1.5 rounded text-[10px] font-bold disabled:opacity-40"
                style={{ background: voiceId === 'user' ? 'linear-gradient(180deg,#a8763f,#7a4f22)' : '#463a2a', color: '#ffd9a8', border: '1px solid #1a140d' }}>
                USER SMP
              </button>
              {engine && (
                <>
                  <button onClick={toggleLiveSample}
                    className="px-3 py-1.5 rounded text-[10px] font-bold text-white"
                    style={{ background: sampling ? 'linear-gradient(180deg,#ff4d5e,#c31d2e)' : 'linear-gradient(180deg,#8a2f6b,#5a1c47)' }}>
                    {sampling ? `⏺ STOP ${sampleSec.toFixed(1)}s` : '🎙 SAMPLER LE MIX'}
                  </button>
                  <button onClick={() => liveLoaded && setVoiceId('live')} disabled={!liveLoaded}
                    className="px-3 py-1.5 rounded text-[10px] font-bold disabled:opacity-40"
                    style={{ background: voiceId === 'live' ? 'linear-gradient(180deg,#a83f8f,#7a2266)' : '#463a2a', color: '#ffb8e6', border: '1px solid #1a140d' }}>
                    LIVE SMP
                  </button>
                  <span className="text-[9px]" style={{ color: '#8fe0a0' }}>◆ mix DJ-AVA</span>
                </>
              )}
              <button onClick={() => setShowEdit((s) => !s)}
                className="ml-auto px-3 py-1.5 rounded text-[10px] font-bold"
                style={{ background: showEdit ? 'linear-gradient(180deg,#2f7d3f,#17501f)' : '#463a2a', color: showEdit ? '#d8ffdc' : '#efe6d0', border: '1px solid #1a140d' }}>
                ⚙ EDIT
              </button>
            </div>

            {/* EDIT strip — hidden by default, DX7-style recessed panel */}
            {showEdit && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 rounded-md p-3"
                style={{ background: 'linear-gradient(180deg,#17120c,#0c0906)', border: '1px solid #000', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.7)' }}>
                <Slider label="VOLUME" value={vol} min={0} max={1} step={0.01} onChange={setVol} fmt={(v) => `${Math.round(v * 100)}`} />
                <Slider label="CUTOFF" value={cutoff} min={200} max={18000} step={50} onChange={setCutoff} fmt={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Slider label="REVERB" value={revWet} min={0} max={0.9} step={0.01} onChange={setRevWet} fmt={(v) => `${Math.round(v * 100)}`} />
                <Slider label="GLIDE" value={glide} min={0} max={0.4} step={0.005} onChange={setGlide} fmt={(v) => `${Math.round(v * 1000)}`} />
                <Slider label="VIB RATE" value={vibRate} min={0.5} max={12} step={0.1} onChange={setVibRate} fmt={(v) => v.toFixed(1)} />
                <Slider label="VIB DEP" value={vibDepth} min={0} max={0.6} step={0.01} onChange={setVibDepth} fmt={(v) => `${Math.round(v * 100)}`} />
                <Slider label="ATTACK" value={atk} min={0.001} max={2} step={0.001} onChange={setAtk} fmt={(v) => `${Math.round(v * 1000)}`} />
                <Slider label="DECAY" value={dec} min={0.01} max={3} step={0.01} onChange={setDec} fmt={(v) => `${Math.round(v * 1000)}`} />
                <Slider label="SUSTAIN" value={sus} min={0} max={1} step={0.01} onChange={setSus} fmt={(v) => `${Math.round(v * 100)}`} />
                <Slider label="RELEASE" value={rel} min={0.05} max={4} step={0.01} onChange={setRel} fmt={(v) => `${Math.round(v * 1000)}`} />
                <Slider label="FM HARM" value={harm} min={0.1} max={8} step={0.01} onChange={setHarm} fmt={(v) => v.toFixed(2)} />
                <Slider label="FM IDX" value={modIdx} min={0} max={30} step={0.1} onChange={setModIdx} fmt={(v) => v.toFixed(1)} />
              </div>
            )}
          </div>
        </div>

        {/* ============ KEYBOARD (61 keys, full width) ============ */}
        <div className="relative w-full" style={{ height: '170px', background: 'linear-gradient(180deg,#0d0b09,#000)', paddingTop: '6px' }}>
          <div className="absolute top-0 left-0 w-full h-1.5" style={{ background: 'linear-gradient(90deg,#6a1717,#9c2b2b,#6a1717)' }} />
          <div className="relative w-full h-full">
            <div className="flex w-full h-full">
              {WHITE.map((k) => {
                const on = active.has(k.midi + octave * 12) || active.has(k.midi);
                return (
                  <div key={k.midi}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                    onPointerUp={() => noteOff(k.midi)} onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }} onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
                    className="flex-1 relative cursor-pointer"
                    style={{
                      borderLeft: '1px solid #bbb', borderRight: '1px solid #999', borderBottom: '4px solid #8a8a8a', borderRadius: '0 0 4px 4px',
                      background: on ? 'linear-gradient(180deg,#d9e6ff,#a9c4f0)' : 'linear-gradient(180deg,#fff 0%,#f2f2f2 80%,#dcdcdc 100%)',
                      boxShadow: on ? 'inset 0 -6px 10px rgba(70,120,220,.35)' : 'inset 0 -8px 8px rgba(0,0,0,.06)',
                    }}>
                    {k.name.startsWith('C') && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-neutral-400 pointer-events-none">{k.name}</span>}
                  </div>
                );
              })}
            </div>
            {KEYS.filter((k) => k.black).map((k) => {
              const wi = whiteIndexBefore(k.midi); const left = (wi + 1) * whiteW;
              const on = active.has(k.midi + octave * 12) || active.has(k.midi);
              return (
                <div key={k.midi}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                  onPointerUp={() => noteOff(k.midi)} onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }} onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
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
    </div>
  );
}

/* ---------- Pitch / Mod wheel (vertical drag) ---------- */
function Wheel({ label, spring, value, onChange, onRelease }: {
  label: string; spring?: boolean; value?: number; onChange: (t: number) => void; onRelease?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(spring ? 0.5 : value ?? 0);
  useEffect(() => { if (!spring && value !== undefined) setPos(value); }, [value, spring]);
  const move = (clientY: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let t = 1 - (clientY - r.top) / r.height;
    t = Math.max(0, Math.min(1, t));
    setPos(t); onChange(t);
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={ref}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientY); }}
        onPointerMove={(e) => { if (e.buttons) move(e.clientY); }}
        onPointerUp={() => { if (spring) { setPos(0.5); onRelease?.(); } }}
        className="relative cursor-ns-resize rounded-full"
        style={{ width: '20px', height: '92px', background: 'linear-gradient(90deg,#0a0806,#2a2118,#0a0806)', border: '1px solid #000', boxShadow: 'inset 0 0 6px #000' }}>
        <div className="absolute left-1/2 -translate-x-1/2 rounded-sm"
          style={{ bottom: `calc(${pos * 100}% - 8px)`, width: '24px', height: '16px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(180deg,#8a7a5f,#4a3d2c)', border: '1px solid #000', boxShadow: '0 1px 3px #000' }} />
      </div>
      <span className="text-[7px]" style={{ color: '#b7a37c' }}>{label}</span>
    </div>
  );
}

/* ---------- Small labelled slider (DX7 edit style) ---------- */
function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[8px] tracking-wider" style={{ color: '#b7a37c' }}>{label}</span>
        <span className="text-[8px] font-mono" style={{ color: '#63ffa0' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-emerald-500 h-1" />
    </label>
  );
}
