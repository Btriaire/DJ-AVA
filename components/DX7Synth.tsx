'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

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
const whiteIndexBefore = (midi: number) =>
  WHITE.findIndex((w) => w.midi === midi - 1);

/* ---------- Sound banks ---------- */
type Bank = {
  id: string;
  name: string;
  kind: 'sampler' | 'fm';
  baseUrl?: string;
  urls?: Record<string, string>;
  fm?: any;
};

const BANKS: Bank[] = [
  {
    id: 'piano',
    name: 'GRAND PIANO',
    kind: 'sampler',
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
    id: 'casio',
    name: 'SAMPLE KIT',
    kind: 'sampler',
    baseUrl: 'https://tonejs.github.io/audio/casio/',
    urls: { A1: 'A1.mp3', A2: 'A2.mp3', 'A#1': 'As1.mp3', B1: 'B1.mp3', C2: 'C2.mp3', 'C#2': 'Cs2.mp3', D2: 'D2.mp3', 'D#2': 'Ds2.mp3', E2: 'E2.mp3', F2: 'F2.mp3', 'F#2': 'Fs2.mp3', G2: 'G2.mp3', 'G#1': 'Gs1.mp3' },
  },
  {
    id: 'epiano',
    name: 'E.PIANO 1',
    kind: 'fm',
    fm: {
      harmonicity: 3, modulationIndex: 10,
      oscillator: { type: 'sine' }, modulation: { type: 'sine' },
      envelope: { attack: 0.001, decay: 1.2, sustain: 0.1, release: 1.2 },
      modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
    },
  },
  {
    id: 'bells',
    name: 'TUB BELLS',
    kind: 'fm',
    fm: {
      harmonicity: 3.01, modulationIndex: 14,
      envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.5 },
      modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 },
    },
  },
  {
    id: 'bass',
    name: 'SYN BASS',
    kind: 'fm',
    fm: {
      harmonicity: 0.5, modulationIndex: 5,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.5, release: 0.3 },
      modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0.2, release: 0.2 },
    },
  },
  {
    id: 'brass',
    name: 'SYN BRASS',
    kind: 'fm',
    fm: {
      harmonicity: 1, modulationIndex: 6,
      envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.4 },
      modulationEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.4 },
    },
  },
  {
    id: 'harp',
    name: 'DX HARP',
    kind: 'fm',
    fm: {
      harmonicity: 2, modulationIndex: 8,
      envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 1.8 },
      modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 },
    },
  },
  {
    id: 'marimba',
    name: 'MARIMBA',
    kind: 'fm',
    fm: {
      harmonicity: 4, modulationIndex: 6,
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 },
      modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
    },
  },
];

/* QWERTY → note mapping (one octave from C4) */
const QWERTY: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75,
};
const midiToNote = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export default function DX7Synth() {
  const [bankId, setBankId] = useState('piano');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Set<number>>(new Set());

  const instRef = useRef<Tone.Sampler | Tone.PolySynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const heldRef = useRef<Set<number>>(new Set());

  const bank = BANKS.find((b) => b.id === bankId)!;

  /* build the reverb once */
  useEffect(() => {
    const rev = new Tone.Reverb({ decay: 1.6, wet: 0.18 }).toDestination();
    reverbRef.current = rev;
    return () => {
      rev.dispose();
    };
  }, []);

  /* (re)build instrument on bank change */
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    instRef.current?.dispose();

    const rev = reverbRef.current!;
    if (bank.kind === 'sampler') {
      const s = new Tone.Sampler({
        urls: bank.urls,
        baseUrl: bank.baseUrl,
        release: 1,
        onload: () => {
          if (!disposed) setLoading(false);
        },
      }).connect(rev);
      instRef.current = s;
    } else {
      const p = new Tone.PolySynth(Tone.FMSynth).connect(rev);
      p.maxPolyphony = 16;
      p.set(bank.fm as any);
      instRef.current = p;
      setLoading(false);
    }

    return () => {
      disposed = true;
    };
  }, [bankId]);

  const noteOn = useCallback((midi: number) => {
    const inst = instRef.current;
    if (!inst || loading) return;
    if (heldRef.current.has(midi)) return;
    heldRef.current.add(midi);
    Tone.start();
    inst.triggerAttack(midiToNote(midi));
    setActive(new Set(heldRef.current));
  }, [loading]);

  const noteOff = useCallback((midi: number) => {
    const inst = instRef.current;
    if (!inst) return;
    if (!heldRef.current.has(midi)) return;
    heldRef.current.delete(midi);
    inst.triggerRelease(midiToNote(midi));
    setActive(new Set(heldRef.current));
  }, []);

  /* physical keyboard */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const m = QWERTY[e.key.toLowerCase()];
      if (m) noteOn(m);
    };
    const up = (e: KeyboardEvent) => {
      const m = QWERTY[e.key.toLowerCase()];
      if (m) noteOff(m);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [noteOn, noteOff]);

  const whiteW = 100 / WHITE.length;

  return (
    <div className="w-full min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4 gap-4"
      style={{ background: 'radial-gradient(circle at 50% 0%, #2a2320, #0c0a09)' }}>

      {/* ===== DX-7 body (full width) ===== */}
      <div className="w-full max-w-[1600px] rounded-xl overflow-hidden select-none"
        style={{
          boxShadow: '0 30px 60px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08)',
        }}>

        {/* Control surface */}
        <div className="relative px-6 py-5"
          style={{
            background: 'linear-gradient(180deg,#3a3632 0%,#211e1b 55%,#171412 100%)',
            borderBottom: '3px solid #000',
          }}>
          <div className="flex items-center justify-between gap-6 flex-wrap">
            {/* Branding */}
            <div className="flex flex-col leading-none">
              <span className="text-[11px] tracking-[.35em] text-neutral-400 mb-1">YAMAHA</span>
              <span className="text-4xl font-black italic text-neutral-100 tracking-tight"
                style={{ textShadow: '0 2px 4px rgba(0,0,0,.6)' }}>
                DX7
              </span>
              <span className="text-[8px] tracking-[.2em] text-neutral-500 mt-1">
                DIGITAL PROGRAMMABLE ALGORITHM SYNTHESIZER
              </span>
            </div>

            {/* Green LCD */}
            <div className="flex-1 min-w-[220px] max-w-[360px] rounded px-4 py-2 font-mono"
              style={{
                background: 'linear-gradient(180deg,#0a2e0a,#062006)',
                border: '2px solid #041504',
                boxShadow: 'inset 0 0 12px rgba(0,255,80,.25)',
                color: '#4dff7a',
                textShadow: '0 0 6px rgba(77,255,122,.8)',
              }}>
              <div className="text-[10px] opacity-70">VOICE / BANK</div>
              <div className="text-lg font-bold tracking-wide">
                {loading ? 'LOADING…' : bank.name}
              </div>
            </div>

            {/* Data entry + power */}
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3 h-16 rounded-full bg-neutral-800 relative" style={{ boxShadow: 'inset 0 0 6px #000' }}>
                  <div className="absolute left-1/2 -translate-x-1/2 top-3 w-6 h-3 rounded-sm bg-neutral-500"
                    style={{ boxShadow: '0 1px 2px #000' }} />
                </div>
                <span className="text-[7px] text-neutral-500 tracking-wider">DATA</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full"
                  style={{ background: '#ff4d3d', boxShadow: '0 0 10px #ff4d3d' }} />
                <span className="text-[7px] text-neutral-500">POWER</span>
              </div>
            </div>
          </div>

          {/* Membrane voice buttons */}
          <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-2">
            {BANKS.map((b, i) => {
              const selected = b.id === bankId;
              return (
                <button
                  key={b.id}
                  onClick={() => setBankId(b.id)}
                  className="relative py-2 rounded text-[10px] font-bold tracking-wide transition-all"
                  style={{
                    background: selected
                      ? 'linear-gradient(180deg,#2f6b2f,#1c4d1c)'
                      : 'linear-gradient(180deg,#4a4540,#2b2723)',
                    color: selected ? '#c9ffcf' : '#b9b2a8',
                    border: '1px solid #000',
                    boxShadow: selected
                      ? 'inset 0 0 8px rgba(120,255,120,.4), 0 0 8px rgba(60,200,60,.4)'
                      : 'inset 0 1px 0 rgba(255,255,255,.06)',
                  }}
                >
                  <span className="absolute top-1 left-1.5 text-[7px] opacity-60">{i + 1}</span>
                  {b.name}
                  {b.kind === 'sampler' && (
                    <span className="absolute bottom-0.5 right-1 text-[6px] text-amber-300/80">◆SMP</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Keyboard (full width) ===== */}
        <div className="relative w-full"
          style={{
            height: '190px',
            background: 'linear-gradient(180deg,#111,#000)',
            paddingTop: '6px',
          }}>
          {/* felt strip */}
          <div className="absolute top-0 left-0 w-full h-1.5"
            style={{ background: 'linear-gradient(90deg,#7a1f1f,#a63030,#7a1f1f)' }} />

          <div className="relative w-full h-full">
            {/* white keys */}
            <div className="flex w-full h-full">
              {WHITE.map((k) => {
                const on = active.has(k.midi);
                return (
                  <div
                    key={k.midi}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                    onPointerUp={() => noteOff(k.midi)}
                    onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }}
                    onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
                    className="flex-1 relative cursor-pointer"
                    style={{
                      borderLeft: '1px solid #bbb',
                      borderRight: '1px solid #999',
                      borderBottom: '3px solid #999',
                      borderRadius: '0 0 4px 4px',
                      background: on
                        ? 'linear-gradient(180deg,#d9e6ff,#a9c4f0)'
                        : 'linear-gradient(180deg,#fff 0%,#f0f0f0 82%,#dcdcdc 100%)',
                      boxShadow: on ? 'inset 0 -6px 10px rgba(70,120,220,.35)' : 'inset 0 -8px 8px rgba(0,0,0,.06)',
                    }}
                  >
                    {k.name.startsWith('C') && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-neutral-400 pointer-events-none">
                        {k.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* black keys */}
            {KEYS.filter((k) => k.black).map((k) => {
              const wi = whiteIndexBefore(k.midi);
              const left = (wi + 1) * whiteW;
              const on = active.has(k.midi);
              return (
                <div
                  key={k.midi}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(k.midi); }}
                  onPointerUp={() => noteOff(k.midi)}
                  onPointerLeave={(e) => { if (e.buttons) noteOff(k.midi); }}
                  onPointerEnter={(e) => { if (e.buttons) noteOn(k.midi); }}
                  className="absolute top-1.5 cursor-pointer z-10"
                  style={{
                    left: `${left}%`,
                    transform: 'translateX(-50%)',
                    width: `${whiteW * 0.62}%`,
                    height: '62%',
                    borderRadius: '0 0 3px 3px',
                    background: on
                      ? 'linear-gradient(180deg,#3a5ea8,#22407a)'
                      : 'linear-gradient(180deg,#2a2a2a 0%,#050505 90%)',
                    boxShadow: on
                      ? 'inset 0 -4px 8px rgba(90,140,240,.5), 0 2px 4px #000'
                      : '0 3px 5px rgba(0,0,0,.6), inset 0 -3px 4px rgba(255,255,255,.08)',
                    border: '1px solid #000',
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* hint */}
      <div className="text-center text-neutral-400 text-sm max-w-2xl">
        🎹 Clique les touches ou joue au clavier <span className="font-mono text-amber-300">A W S E D F T G Y H U J K</span> (octave C4).
        Les banques <span className="text-amber-300">◆SMP</span> chargent de vrais samples ; les autres sont des voix FM style DX7.
      </div>
    </div>
  );
}
