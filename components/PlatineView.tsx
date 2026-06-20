"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { Deck } from "@/lib/audio/Deck";
import { FxName } from "@/lib/audio/FXRack";

interface Props {
  engine: DJEngine;
}

// Restrained, realistic hardware palette — graphite metal + a single warm amber
// for status LEDs / the desk lamp. The only tri-colour element is the VU meter.
const AMBER = "#f0a830";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

type PadMode = "loop" | "cue" | "fx";
const LOOP_BEATS = [1, 2, 4, 8];
const FX_PADS: { name: FxName; label: string }[] = [
  { name: "echo", label: "ECHO" },
  { name: "reverb", label: "REV" },
  { name: "flanger", label: "FLNG" },
  { name: "crush", label: "CRSH" },
];

export function PlatineView({ engine }: Props) {
  const { deckA, deckB } = engine;

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => (n + 1) % 1e6), []);

  const [cross, setCross] = useState(engine.getCrossfade());
  const [autoMix, setAutoMix] = useState(false);

  // per-deck pad state (mode selector + hot cues + active loop)
  const [modeA, setModeA] = useState<PadMode>("loop");
  const [modeB, setModeB] = useState<PadMode>("loop");
  const cuesA = useRef<(number | null)[]>([null, null, null, null]);
  const cuesB = useRef<(number | null)[]>([null, null, null, null]);
  const [loopA, setLoopA] = useState(0); // active loop length in beats (0 = none)
  const [loopB, setLoopB] = useState(0);

  const discARef = useRef<HTMLDivElement | null>(null);
  const discBRef = useRef<HTMLDivElement | null>(null);
  const angleA = useRef(0);
  const angleB = useRef(0);
  const lastT = useRef(0);
  const crossRef = useRef(cross);
  crossRef.current = cross;
  const autoMixRef = useRef(autoMix);
  autoMixRef.current = autoMix;
  const fadeRef = useRef<number | null>(null);
  const fadingRef = useRef(false);
  const armedRef = useRef(true);

  const autoFade = useCallback(
    (to: "A" | "B", secs = 4) => {
      const incoming = to === "B" ? deckB : deckA;
      if (incoming.name && !incoming.playing) incoming.play();
      const target = to === "B" ? 1 : 0;
      const start = engine.getCrossfade();
      if (Math.abs(target - start) < 0.001) return;
      const t0 = performance.now();
      if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
      fadingRef.current = true;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / (secs * 1000));
        const x = start + (target - start) * k;
        engine.setCrossfade(x);
        setCross(x);
        if (k < 1) fadeRef.current = requestAnimationFrame(step);
        else {
          fadeRef.current = null;
          fadingRef.current = false;
        }
      };
      fadeRef.current = requestAnimationFrame(step);
    },
    [deckA, deckB, engine]
  );

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const loop = (now: number) => {
      const dt = lastT.current ? now - lastT.current : 16;
      lastT.current = now;
      if (deckA.playing) {
        angleA.current = (angleA.current + dt * 0.18 * (1 + deckA.pitchPct / 100)) % 360;
        if (discARef.current) discARef.current.style.transform = `rotate(${angleA.current}deg)`;
      }
      if (deckB.playing) {
        angleB.current = (angleB.current + dt * 0.18 * (1 + deckB.pitchPct / 100)) % 360;
        if (discBRef.current) discBRef.current.style.transform = `rotate(${angleB.current}deg)`;
      }
      if (autoMixRef.current && !fadingRef.current) {
        const x = crossRef.current;
        const front = x < 0.5 ? deckA : deckB;
        const other = x < 0.5 ? deckB : deckA;
        const frontIsB = x >= 0.5;
        if (front.playing && other.name) {
          const remain = front.duration - front.position();
          if (remain > 0 && remain < 8 && armedRef.current) {
            armedRef.current = false;
            autoFade(frontIsB ? "A" : "B", 6);
          }
        }
        if (x < 0.02 || x > 0.98) armedRef.current = true;
      }
      if (++frame % 6 === 0) rerender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
    };
  }, [deckA, deckB, autoFade, rerender]);

  // Short tap = ENGAGE only (loop on / fx on / cue set+jump). Re-tapping a lit
  // LOOP or FX pad does nothing — no accidental "easy release".
  const shortPad = (side: "A" | "B", i: number) => {
    const deck = side === "A" ? deckA : deckB;
    const mode = side === "A" ? modeA : modeB;
    if (!deck.name) return;
    if (mode === "loop") {
      const beats = LOOP_BEATS[i];
      const active = side === "A" ? loopA : loopB;
      if (active !== beats) {
        deck.setBeatLoop(beats);
        side === "A" ? setLoopA(beats) : setLoopB(beats);
      }
      // already active → keep it; release is a long-press only
    } else if (mode === "cue") {
      const cues = side === "A" ? cuesA.current : cuesB.current;
      if (cues[i] == null) cues[i] = deck.position();
      else deck.seek(cues[i]!);
    } else {
      const fx = FX_PADS[i];
      if (deck.getFxWet(fx.name) === 0) deck.setFxWet(fx.name, 0.45);
      // already on → keep it; release is a long-press only
    }
    rerender();
  };

  // Long-press (≈450 ms) = the deliberate RELEASE: clear the loop / kill the FX /
  // wipe the hot cue. This is the only way to turn LOOP & FX back off.
  const longPad = (side: "A" | "B", i: number) => {
    const deck = side === "A" ? deckA : deckB;
    const mode = side === "A" ? modeA : modeB;
    if (!deck.name) return;
    if (mode === "loop") {
      deck.clearLoop();
      side === "A" ? setLoopA(0) : setLoopB(0);
    } else if (mode === "cue") {
      const cues = side === "A" ? cuesA.current : cuesB.current;
      cues[i] = null;
    } else {
      deck.setFxWet(FX_PADS[i].name, 0);
    }
    rerender();
  };

  const playBoth = () => {
    engine.togglePlayAll();
    rerender();
  };

  return (
    <div className="flex flex-col gap-4">
      <DeskLamp />

      {/* ===== two turntables + side rails + center mixer ===== */}
      <div className="hw-screwed hw-panel grid grid-cols-1 items-start gap-3 p-4 lg:grid-cols-[auto_1fr_auto_1fr_auto]">
        {/* far-left rail: fader + VU for deck A */}
        <SideRail deck={deckA} side="A" />

        <DeckColumn
          deck={deckA}
          side="A"
          discRef={discARef}
          mode={modeA}
          setMode={setModeA}
          onChange={rerender}
        />

        {/* center mixer */}
        <div className="flex flex-col items-center justify-center gap-4 px-1 lg:w-40">
          <button
            onClick={playBoth}
            className="hw-btn hw-btn-on w-full px-3 py-2 text-sm font-bold"
            style={{ ["--led" as string]: AMBER }}
            title="Lancer / arrêter les deux platines"
          >
            {engine.anyPlaying ? "❚❚ A+B" : "► A+B"}
          </button>
          <div className="flex w-full flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Crossfade
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cross}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setCross(v);
                engine.setCrossfade(v);
              }}
              className="dj-fader w-full"
            />
            <div className="flex w-full justify-between text-[10px] font-bold text-neutral-500">
              <span>A</span>
              <span>B</span>
            </div>
          </div>
          <div className="flex w-full gap-1">
            <button
              onClick={() => autoFade("A", 4)}
              className="hw-btn flex-1 px-2 py-1.5 text-xs text-neutral-300"
              style={{ ["--led" as string]: AMBER }}
              title="Fondu automatique vers la platine A (4 s)"
            >
              ⇠ A
            </button>
            <button
              onClick={() => autoFade("B", 4)}
              className="hw-btn flex-1 px-2 py-1.5 text-xs text-neutral-300"
              style={{ ["--led" as string]: AMBER }}
              title="Fondu automatique vers la platine B (4 s)"
            >
              B ⇢
            </button>
          </div>
          <button
            onClick={() => setAutoMix((a) => !a)}
            className={`w-full rounded px-3 py-2 text-xs font-bold ${autoMix ? "hw-btn-on" : "text-neutral-400 ring-1 ring-white/10"}`}
            style={{ ["--led" as string]: AMBER }}
            title="Autoplay : enchaîne automatiquement vers l'autre platine en fin de morceau"
          >
            {autoMix ? "● AUTOPLAY" : "○ AUTOPLAY"}
          </button>
        </div>

        <DeckColumn
          deck={deckB}
          side="B"
          discRef={discBRef}
          mode={modeB}
          setMode={setModeB}
          onChange={rerender}
        />

        {/* far-right rail: VU + fader for deck B (mirrored) */}
        <SideRail deck={deckB} side="B" />
      </div>

      {/* ===== bottom: realistic performance pads (A | B) ===== */}
      <div className="hw-screwed hw-panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <PadBank side="A" deck={deckA} mode={modeA} loop={loopA} cues={cuesA} onShort={shortPad} onLong={longPad} />
        <PadBank side="B" deck={deckB} mode={modeB} loop={loopB} cues={cuesB} onShort={shortPad} onLong={longPad} />
      </div>

      <p className="text-center text-xs text-neutral-600">
        Charge des morceaux (onglet <b>Écoute</b> / <b>Console</b> → Deck A·B), puis joue : platines,
        crossfade, Autofade, Autoplay, pads (LOOP / CUE / FX).
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- desk lamp */
function DeskLamp() {
  return (
    <div className="relative h-12 overflow-visible">
      {/* warm pooled light spilling down over the decks */}
      <div
        className="pointer-events-none absolute left-1/2 top-6 h-44 w-[70%] -translate-x-1/2 rounded-[50%]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(240,168,48,0.16), rgba(240,168,48,0.05) 45%, transparent 70%)",
          filter: "blur(2px)",
        }}
      />
      {/* the lamp itself, top-left */}
      <div className="absolute left-6 top-0 flex items-end gap-0">
        <div className="h-2 w-12 rounded-full bg-neutral-800 shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        <div
          className="relative -ml-7 h-11 w-9 -rotate-12 rounded-t-[14px] rounded-b-[6px]"
          style={{
            background: "linear-gradient(150deg,#2a2a2e,#141416)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 3px 6px rgba(0,0,0,0.5)",
          }}
        >
          {/* glowing bulb under the shade */}
          <div
            className="absolute -bottom-1 left-1/2 h-2.5 w-5 -translate-x-1/2 rounded-full"
            style={{ background: AMBER, boxShadow: `0 0 14px 4px ${AMBER}, 0 0 4px #fff` }}
          />
        </div>
      </div>
      {/* mains LED */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: AMBER, boxShadow: `0 0 6px ${AMBER}` }}
        />
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-neutral-600">power</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- side rail: fader + VU */
function SideRail({ deck, side }: { deck: Deck; side: "A" | "B" }) {
  const [vol, setVol] = useState(1);
  const fader = (
    <div className="relative flex h-44 w-8 items-center justify-center">
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.01}
        value={vol}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setVol(v);
          deck.setVolume(v);
        }}
        className="dj-fader"
        style={{ width: 176, transform: "rotate(-90deg)" }}
        title={`Volume platine ${side}`}
      />
    </div>
  );
  const meter = <VUMeter deck={deck} />;
  return (
    <div className="flex items-start gap-1 pt-6">
      {side === "A" ? (
        <>
          {fader}
          {meter}
        </>
      ) : (
        <>
          {meter}
          {fader}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------- luminous green/yellow/red VU */
function VUMeter({ deck }: { deck: Deck }) {
  const SEG = 16;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const lvl = Math.min(1, deck.getLevel() * 1.7);
      const lit = Math.round(lvl * SEG);
      for (let i = 0; i < SEG; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const fromBottom = SEG - i; // i=0 is the top segment
        const on = fromBottom <= lit;
        // top 3 = red, next 4 = yellow, rest = green
        const base = i < 3 ? "#ff3b30" : i < 7 ? "#ffcc00" : "#33d35e";
        el.style.background = on ? base : "#0e0f0e";
        el.style.boxShadow = on ? `0 0 6px ${base}, inset 0 0 2px rgba(255,255,255,0.5)` : "none";
        el.style.opacity = on ? "1" : "0.55";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deck]);
  return (
    <div
      className="flex h-44 w-5 flex-col gap-[2px] rounded-[3px] p-[3px]"
      style={{
        background: "linear-gradient(#070707,#101010)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 2px 6px rgba(0,0,0,0.8)",
      }}
      title="Niveau de sortie"
    >
      {Array.from({ length: SEG }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="flex-1 rounded-[1px]"
        />
      ))}
    </div>
  );
}

/* ----------------------------------- one deck column: disc + small fn pads */
function DeckColumn({
  deck,
  side,
  discRef,
  mode,
  setMode,
  onChange,
}: {
  deck: Deck;
  side: "A" | "B";
  discRef: React.RefObject<HTMLDivElement | null>;
  mode: PadMode;
  setMode: (m: PadMode) => void;
  onChange: () => void;
}) {
  const loaded = !!deck.name;
  const pos = deck.position();
  const dur = deck.duration;
  const nudge = (d: number) => {
    deck.setPitch(Math.max(-8, Math.min(8, deck.pitchPct + d)));
    onChange();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-sm font-black text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: AMBER, boxShadow: `0 0 5px ${AMBER}` }} />
          PLATINE {side}
        </span>
        <span className="font-mono text-xs text-neutral-500">
          {deck.effectiveBPM ? `${deck.effectiveBPM} BPM` : "— BPM"}
        </span>
      </div>

      {/* the vinyl — neutral graphite, no theme colour */}
      <div className="relative aspect-square w-full max-w-[460px] select-none">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 50%, #1c1c1f 0%, #0c0c0e 60%, #050506 100%)",
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.05), 0 0 0 6px #0a0a0b, 0 18px 44px rgba(0,0,0,0.7), inset 0 0 30px rgba(0,0,0,0.85)",
          }}
        />
        <div
          ref={discRef}
          className="absolute inset-[5%] rounded-full will-change-transform"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, #0a0a0a 0px, #151515 2px, #0a0a0a 4px)",
            boxShadow: "inset 0 0 26px rgba(0,0,0,0.9)",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-1/2 w-[2px] -translate-x-1/2 -translate-y-full rounded-full"
            style={{ background: "linear-gradient(rgba(255,255,255,0.5), transparent)" }}
          />
          <div className="absolute left-1/2 top-1/2 aspect-square w-[40%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-2 ring-black/60">
            {deck.coverArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deck.coverArt} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-3xl text-neutral-600">
                ♪
              </div>
            )}
            <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 ring-1 ring-white/20" />
          </div>
        </div>
        <div
          className="absolute right-[6%] top-[8%] h-[44%] w-1.5 origin-top rounded-full"
          style={{
            background: "linear-gradient(#3a3a3e,#1c1c20)",
            transform: deck.playing ? "rotate(18deg)" : "rotate(2deg)",
            transition: "transform 0.5s ease",
          }}
        />
      </div>

      {/* track meta + seek */}
      <div className="min-h-[2rem] w-full text-center">
        <div className="truncate text-sm font-bold text-neutral-200">{deck.name || "— vide —"}</div>
        <div className="font-mono text-[11px] text-neutral-500">
          {fmt(pos)} / {fmt(dur)}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.1}
        value={Math.min(pos, dur || 1)}
        disabled={!loaded}
        onChange={(e) => {
          deck.seek(parseFloat(e.target.value));
          onChange();
        }}
        className="dj-fader w-full disabled:opacity-40"
      />

      {/* transport */}
      <div className="flex items-center gap-2">
        <button onClick={() => { deck.seek(0); onChange(); }} disabled={!loaded}
          className="hw-btn px-3 py-2 text-sm text-neutral-300 disabled:opacity-40"
          style={{ ["--led" as string]: AMBER }} title="Retour au début">⏮</button>
        <button onClick={() => { deck.toggle(); onChange(); }} disabled={!loaded}
          className="hw-btn hw-btn-on px-5 py-2 text-lg disabled:opacity-40"
          style={{ ["--led" as string]: AMBER }} title="Lecture / Pause">
          {deck.playing ? "❚❚" : "►"}</button>
        <button onClick={() => nudge(-1)} disabled={!loaded}
          className="hw-btn px-2 py-2 text-xs text-neutral-300 disabled:opacity-40"
          style={{ ["--led" as string]: AMBER }} title="Tempo −1 %">−</button>
        <span className="w-12 text-center font-mono text-[11px] text-neutral-500">
          {deck.pitchPct >= 0 ? "+" : ""}{deck.pitchPct.toFixed(1)}%</span>
        <button onClick={() => nudge(1)} disabled={!loaded}
          className="hw-btn px-2 py-2 text-xs text-neutral-300 disabled:opacity-40"
          style={{ ["--led" as string]: AMBER }} title="Tempo +1 %">＋</button>
      </div>

      {/* small function-select pads with voyant (choose what the big pads do) */}
      <div className="flex w-full items-center justify-center gap-2 pt-1">
        {(["loop", "cue", "fx"] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="relative flex h-9 w-16 flex-col items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide"
              style={{
                background: "linear-gradient(#202024,#121214)",
                color: on ? "#f5d9a8" : "#8a8a8e",
                boxShadow: on
                  ? `inset 0 0 0 1px ${AMBER}66, 0 0 8px ${AMBER}55`
                  : "inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 3px rgba(0,0,0,0.5)",
              }}
              title={`Mode pads : ${m.toUpperCase()}`}
            >
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: on ? AMBER : "#3a3a3e", boxShadow: on ? `0 0 5px ${AMBER}` : "none" }}
              />
              {m}
            </button>
          );
        })}
        <button
          onClick={() => { deck.toggleRepeat(); onChange(); }}
          className="relative flex h-9 w-16 flex-col items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide"
          style={{
            background: "linear-gradient(#202024,#121214)",
            color: deck.repeat ? "#f5d9a8" : "#8a8a8e",
            boxShadow: deck.repeat
              ? `inset 0 0 0 1px ${AMBER}66, 0 0 8px ${AMBER}55`
              : "inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 3px rgba(0,0,0,0.5)",
          }}
          title="Répétition du morceau"
        >
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: deck.repeat ? AMBER : "#3a3a3e", boxShadow: deck.repeat ? `0 0 5px ${AMBER}` : "none" }}
          />
          rpt
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------- bottom bank: 4 realistic perf pads */
function PadBank({
  side,
  deck,
  mode,
  loop,
  cues,
  onShort,
  onLong,
}: {
  side: "A" | "B";
  deck: Deck;
  mode: PadMode;
  loop: number;
  cues: React.RefObject<(number | null)[]>;
  onShort: (side: "A" | "B", i: number) => void;
  onLong: (side: "A" | "B", i: number) => void;
}) {
  const labelFor = (i: number) =>
    mode === "loop" ? `${LOOP_BEATS[i]}` : mode === "cue" ? `CUE ${i + 1}` : FX_PADS[i].label;
  const isLit = (i: number) => {
    if (mode === "loop") return loop === LOOP_BEATS[i];
    if (mode === "cue") return cues.current?.[i] != null;
    return deck.getFxWet(FX_PADS[i].name) > 0;
  };
  const sub = mode === "loop" ? "BEATS" : mode === "cue" ? "HOT CUE" : "EFFET";

  // press = engage; hold ≈450 ms = release. A single tap can never turn a lit
  // LOOP / FX pad off, so it won't release by accident.
  const hold = useRef<{ i: number; t: number; fired: boolean } | null>(null);
  const [holding, setHolding] = useState(-1); // pad index showing the "releasing" ring
  const onDown = (i: number) => {
    const entry = { i, t: 0, fired: false };
    entry.t = window.setTimeout(() => {
      entry.fired = true;
      setHolding(-1);
      onLong(side, i);
    }, 450);
    hold.current = entry;
    setHolding(i);
  };
  const onUp = (i: number) => {
    const e = hold.current;
    hold.current = null;
    setHolding(-1);
    if (!e || e.i !== i) return;
    clearTimeout(e.t);
    if (!e.fired) onShort(side, i);
  };
  const onCancel = () => {
    const e = hold.current;
    if (e) clearTimeout(e.t);
    hold.current = null;
    setHolding(-1);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} />
          PADS {side}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
          {mode} · {sub}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => {
          const lit = isLit(i);
          const releasing = holding === i && lit;
          return (
            <button
              key={i}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onDown(i); }}
              onPointerUp={() => onUp(i)}
              onPointerLeave={onCancel}
              onPointerCancel={onCancel}
              className="relative aspect-square touch-none select-none rounded-lg text-xs font-bold transition-transform active:translate-y-px"
              style={{
                background: lit
                  ? `radial-gradient(circle at 50% 35%, ${AMBER}cc, ${AMBER}55 55%, #1a1611 100%)`
                  : "radial-gradient(circle at 50% 30%, #2a2a2e, #141416 70%)",
                color: lit ? "#1a120a" : "#9a9a9e",
                boxShadow: releasing
                  ? `inset 0 0 0 2px #ff3b30, 0 0 16px ${AMBER}88`
                  : lit
                  ? `inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 6px rgba(0,0,0,0.4), 0 0 16px ${AMBER}88`
                  : "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -4px 8px rgba(0,0,0,0.6), 0 3px 5px rgba(0,0,0,0.5)",
              }}
              title={
                mode === "cue"
                  ? `${labelFor(i)} — appui = pose/saut, appui long = efface`
                  : `${labelFor(i)} — appui = active, appui long = désactive`
              }
            >
              <span className="absolute inset-x-0 top-2 text-[9px] uppercase tracking-wider opacity-70">
                {sub}
              </span>
              <span className="text-base">{labelFor(i)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
