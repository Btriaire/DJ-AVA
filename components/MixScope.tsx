"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";

interface Props {
  deckA: Deck;
  deckB: Deck;
  colorA: string;
  colorB: string;
  crossfade: number; // 0 = full A, 1 = full B
  onCrossfade: (x: number) => void; // drag (live views) to blend the two tracks
}

type Mode = "area" | "bars" | "wave" | "waterfall";
const MODES: [Mode, string, string][] = [
  ["area", "Aire", "Enveloppe spectrale pleine, lisse et lisible"],
  ["bars", "Barres", "Analyseur à barres classique"],
  ["wave", "Onde", "Oscilloscope — forme d'onde des 2 morceaux"],
  ["waterfall", "Cascade", "Spectrogramme défilant — fige + glisse pour explorer"],
];

const HCOLS = 1536; // spectrogram history width (px) — room to scrub back
const VIEW = 1024; // canvas backing width
const HEIGHT = 140;
const SCRUB_SECONDS = 24; // dragging the full width seeks ~24 s in that track

function magAt(data: Uint8Array, i: number, count: number) {
  const frac = Math.pow(i / count, 1.6);
  const bin = Math.min(data.length - 1, Math.floor(frac * data.length * 0.75));
  return data[bin] / 255;
}

// Edjay-style master screen: the two playing tracks overlaid in one window —
// deck A upward, deck B downward — with several render modes. You can FREEZE the
// spectra and, in Cascade (spectrogram) mode, drag slowly to scrub back through
// what was playing. In the live views, dragging blends the crossfader instead.
export function MixScope({ deckA, deckB, colorA, colorB, crossfade, onCrossfade }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("waterfall");
  const [frozen, setFrozen] = useState(false);
  const [beats, setBeats] = useState(true); // beat-grid / sync lines on the cascade

  const xfRef = useRef(crossfade);
  xfRef.current = crossfade;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  const panRef = useRef(0); // columns scrubbed back in the spectrogram
  const scrubbingRef = useRef(false); // pause auto-scroll while dragging the cascade
  const advanceRef = useRef(0); // columns to push forward when scrubbing past the live edge

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqA = new Uint8Array(deckA.fftBins);
    const freqB = new Uint8Array(deckB.fftBins);
    const timeA = new Uint8Array(deckA.fftSize);
    const timeB = new Uint8Array(deckB.fftSize);

    // offscreen spectrogram history (persists scroll between frames)
    const hist = document.createElement("canvas");
    hist.width = HCOLS;
    hist.height = HEIGHT;
    const hctx = hist.getContext("2d")!;
    hctx.fillStyle = "#070708";
    hctx.fillRect(0, 0, HCOLS, HEIGHT);

    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;
    let raf = 0;
    let frame = 0;
    // last beat index seen per deck — lets us paint a tick the instant a deck
    // crosses a beat boundary, so the grid scrolls with the spectrogram
    let beatA = -1;
    let beatB = -1;
    // running (EMA) average of beat energy per deck — each beat tick is coloured
    // by how its punch compares to this average: quiet → base, around average →
    // yellow, louder → orange/red, ≥2× the average → white-hot
    let avgA = 0;
    let avgB = 0;

    // bass-weighted punch of a spectrum (kick/bass live in the low bins) → 0..1
    const beatEnergy = (data: Uint8Array) => {
      const n = Math.max(1, Math.floor(data.length * 0.18));
      let sum = 0;
      for (let i = 0; i < n; i++) sum += data[i];
      return sum / n / 255;
    };

    // intensity tier from energy/average ratio → tick colour, alpha and the
    // fraction of the half-height it fills (louder = taller + hotter)
    const beatTier = (ratio: number, base: string) => {
      if (ratio >= 2.0) return { color: "#ffffff", alpha: 0.95, frac: 1, glow: 10 };
      if (ratio >= 1.5) return { color: "#ff3b30", alpha: 0.92, frac: 0.95, glow: 7 };
      if (ratio >= 1.18) return { color: "#ffcc00", alpha: 0.85, frac: 0.82, glow: 0 };
      if (ratio >= 0.88) return { color: "#facc15", alpha: 0.72, frac: 0.62, glow: 0 };
      return { color: base, alpha: 0.4, frac: 0.42, glow: 0 };
    };

    const gains = () => {
      const x = xfRef.current;
      return [Math.cos((x * Math.PI) / 2), Math.cos(((1 - x) * Math.PI) / 2)];
    };
    const centerRail = () => {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(0, mid - 0.5, w, 1);
    };

    const drawBars = () => {
      const [gA, gB] = gains();
      deckA.getSpectrum(freqA);
      deckB.getSpectrum(freqB);
      ctx.clearRect(0, 0, w, h);
      centerRail();
      const BARS = 72;
      const bw = w / BARS;
      for (let i = 0; i < BARS; i++) {
        const a = magAt(freqA, i, BARS) * gA;
        const b = magAt(freqB, i, BARS) * gB;
        const bhA = a * (h / 2) * 0.96;
        const bhB = b * (h / 2) * 0.96;
        const bx = i * bw;
        const gradA = ctx.createLinearGradient(0, mid, 0, mid - bhA);
        gradA.addColorStop(0, colorA + "22");
        gradA.addColorStop(1, colorA);
        ctx.fillStyle = gradA;
        ctx.fillRect(bx, mid - bhA, bw - 1, bhA);
        const gradB = ctx.createLinearGradient(0, mid, 0, mid + bhB);
        gradB.addColorStop(0, colorB + "22");
        gradB.addColorStop(1, colorB);
        ctx.fillStyle = gradB;
        ctx.fillRect(bx, mid, bw - 1, bhB);
        if (a > 0.28 && b > 0.28) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(bx, mid - 2, bw - 1, 4);
        }
      }
    };

    const drawArea = () => {
      const [gA, gB] = gains();
      deckA.getSpectrum(freqA);
      deckB.getSpectrum(freqB);
      ctx.clearRect(0, 0, w, h);
      centerRail();
      const N = 128;
      const envelope = (data: Uint8Array, g: number, color: string, up: boolean) => {
        ctx.beginPath();
        ctx.moveTo(0, mid);
        for (let i = 0; i <= N; i++) {
          const m = magAt(data, i, N) * g;
          const y = up ? mid - m * (h / 2) * 0.98 : mid + m * (h / 2) * 0.98;
          ctx.lineTo((i / N) * w, y);
        }
        ctx.lineTo(w, mid);
        ctx.closePath();
        const grad = up
          ? ctx.createLinearGradient(0, mid, 0, 0)
          : ctx.createLinearGradient(0, mid, 0, h);
        grad.addColorStop(0, color + "10");
        grad.addColorStop(1, color + "cc");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      };
      envelope(freqA, gA, colorA, true);
      envelope(freqB, gB, colorB, false);
    };

    // robust waveform: min/max peaks per column (always visible, moves clearly)
    const drawWave = () => {
      const [gA, gB] = gains();
      deckA.getWaveform(timeA);
      deckB.getWaveform(timeB);
      ctx.clearRect(0, 0, w, h);
      centerRail();
      const COLS = 256;
      const scope = (data: Uint8Array, g: number, color: string, cy: number, amp: number) => {
        const n = data.length;
        const per = Math.max(1, Math.floor(n / COLS));
        ctx.fillStyle = color;
        for (let c = 0; c < COLS; c++) {
          let mn = 1;
          let mx = -1;
          for (let k = 0; k < per; k++) {
            const v = (data[c * per + k] - 128) / 128;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          const y1 = cy - mx * g * amp;
          const y2 = cy - mn * g * amp;
          const bx = (c / COLS) * w;
          ctx.fillRect(bx, Math.min(y1, y2), Math.max(1, w / COLS - 0.4), Math.max(1.2, Math.abs(y2 - y1)));
        }
      };
      scope(timeA, gA, colorA, h * 0.27, h * 0.24);
      scope(timeB, gB, colorB, h * 0.73, h * 0.24);
    };

    const appendSpectrogramColumn = () => {
      const [gA, gB] = gains();
      deckA.getSpectrum(freqA);
      deckB.getSpectrum(freqB);
      hctx.drawImage(hist, -1, 0); // scroll history left
      hctx.fillStyle = "#070708";
      hctx.fillRect(HCOLS - 1, 0, 1, HEIGHT);
      for (let y = 0; y < HEIGHT; y++) {
        let m: number;
        let color: string;
        if (y < mid) {
          const frac = (mid - y) / mid;
          const bin = Math.min(freqA.length - 1, Math.floor(Math.pow(frac, 1.4) * freqA.length * 0.75));
          m = (freqA[bin] / 255) * gA;
          color = colorA;
        } else {
          const frac = (y - mid) / mid;
          const bin = Math.min(freqB.length - 1, Math.floor(Math.pow(frac, 1.4) * freqB.length * 0.75));
          m = (freqB[bin] / 255) * gB;
          color = colorB;
        }
        if (m <= 0.02) continue;
        hctx.globalAlpha = Math.min(1, m * 1.3);
        hctx.fillStyle = color;
        hctx.fillRect(HCOLS - 1, y, 1, 1);
      }
      hctx.globalAlpha = 1;
      hctx.fillStyle = "rgba(255,255,255,0.16)";
      hctx.fillRect(HCOLS - 1, mid, 1, 1);
      markBeats();
    };

    // beat grid: when a deck crosses a beat, paint a tick into the fresh column.
    // A on top half, B on bottom half. If BOTH land in the same column they're
    // in phase → draw a bright full-height white sync line instead.
    const markBeats = () => {
      if (!beatsRef.current) return;
      let hitA = false;
      let hitB = false;
      let ratioA = 1;
      let ratioB = 1;
      if (deckA.bpm && deckA.playing) {
        const i = Math.floor(deckA.position() / (60 / deckA.bpm));
        if (i !== beatA) {
          beatA = i;
          hitA = true;
          const e = beatEnergy(freqA);
          avgA = avgA === 0 ? e : avgA * 0.86 + e * 0.14;
          ratioA = avgA > 0.001 ? e / avgA : 1;
        }
      }
      if (deckB.bpm && deckB.playing) {
        const i = Math.floor(deckB.position() / (60 / deckB.bpm));
        if (i !== beatB) {
          beatB = i;
          hitB = true;
          const e = beatEnergy(freqB);
          avgB = avgB === 0 ? e : avgB * 0.86 + e * 0.14;
          ratioB = avgB > 0.001 ? e / avgB : 1;
        }
      }
      // both decks land in the same column → bright full-height sync line, but
      // tint it by the loudest of the two beats so a big shared hit reads hotter
      if (hitA && hitB) {
        const t = beatTier(Math.max(ratioA, ratioB), "#ffffff");
        hctx.globalAlpha = Math.max(0.9, t.alpha);
        hctx.shadowBlur = t.glow;
        hctx.shadowColor = t.color;
        hctx.fillStyle = t.glow ? t.color : "#ffffff";
        hctx.fillRect(HCOLS - 1, 0, 1, HEIGHT);
        hctx.shadowBlur = 0;
        hctx.globalAlpha = 1;
        return;
      }
      if (hitA) {
        const t = beatTier(ratioA, colorA);
        const ht = Math.max(2, t.frac * mid);
        hctx.globalAlpha = t.alpha;
        hctx.shadowBlur = t.glow;
        hctx.shadowColor = t.color;
        hctx.fillStyle = t.color;
        hctx.fillRect(HCOLS - 1, mid - ht, 1, ht); // grow up from centre rail
        hctx.shadowBlur = 0;
      }
      if (hitB) {
        const t = beatTier(ratioB, colorB);
        const ht = Math.max(2, t.frac * mid);
        hctx.globalAlpha = t.alpha;
        hctx.shadowBlur = t.glow;
        hctx.shadowColor = t.color;
        hctx.fillStyle = t.color;
        hctx.fillRect(HCOLS - 1, mid, 1, ht); // grow down from centre rail
        hctx.shadowBlur = 0;
      }
      hctx.globalAlpha = 1;
    };

    const blitSpectrogram = () => {
      // The live edge (now) sits on the centre line: fresh spectrum is born in
      // the middle and trails toward the LEFT (the start of the strip). The right
      // half is "not yet played" — only the deck-split rail runs across it.
      const HALF = VIEW / 2;
      const pan = Math.max(0, Math.min(HCOLS - HALF, panRef.current));
      const srcX = HCOLS - HALF - pan;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(hist, srcX, 0, HALF, HEIGHT, 0, 0, w / 2, h);
      // keep the A/B split line continuous over the empty right half
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(w / 2, mid - 0.5, w / 2, 1);
      // "NOW" marker on the centre line
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.fillRect(w / 2 - 0.5, 0, 1, h);
    };

    const draw = () => {
      frame++;
      if (mode === "waterfall") {
        // slide slowly on its own — but hand control to the drag while scrubbing
        if (!frozenRef.current && !scrubbingRef.current && frame % 2 === 0) appendSpectrogramColumn();
        // forward scrub past the live edge pushes fresh columns in
        let adv = Math.min(8, Math.floor(advanceRef.current));
        while (adv-- > 0) {
          appendSpectrogramColumn();
          advanceRef.current -= 1;
        }
        blitSpectrogram();
      } else if (!frozenRef.current) {
        if (mode === "bars") drawBars();
        else if (mode === "wave") drawWave();
        else drawArea();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [deckA, deckB, colorA, colorB, mode]);

  // --- pointer ---
  // In every mode (Cascade included), grab a spectrum to scrub THAT track only —
  // top half = deck A, bottom half = deck B — drag right = forward, left =
  // backward. The other deck never moves. A vertical bar tracks the grab point.
  const dragging = useRef(false);
  const lastX = useRef(0);
  const scrubDeck = useRef<Deck | null>(null);
  const [bar, setBar] = useState<{ x: number; color: string } | null>(null);

  const onMove = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setBar((b) => (b ? { ...b, x: ((clientX - rect.left) / rect.width) * 100 } : b));
    const deck = scrubDeck.current;
    if (!deck) return;
    const dxCss = clientX - lastX.current;
    lastX.current = clientX;
    // Cascade: scroll the spectrogram with the drag — back through captured
    // history, or push new live columns forward once we reach the live edge.
    if (mode === "waterfall") {
      let p = panRef.current - dxCss * (VIEW / rect.width);
      if (p < 0) {
        advanceRef.current += -p;
        p = 0;
      }
      panRef.current = Math.min(HCOLS - VIEW / 2, Math.max(0, p));
    }
    if (!deck.duration) return;
    const deltaSec = (dxCss / rect.width) * SCRUB_SECONDS;
    deck.seek(Math.max(0, Math.min(deck.duration, deck.position() + deltaSec)));
  };

  // phase nudge: slide a deck by a 1/16-beat step so its cascade ticks walk into
  // alignment with the other deck, tick by tick (white line = locked in phase)
  const nudge = (deck: Deck, dir: -1 | 1) => {
    if (!deck.bpm || !deck.duration) return;
    const step = (60 / deck.bpm) / 16;
    deck.seek(Math.max(0, Math.min(deck.duration, deck.position() + dir * step)));
  };

  return (
    <div>
      {/* header: track names + render-mode selector + freeze */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-[10px] font-bold">
          <span style={{ color: colorA }}>A</span>
          <span className="max-w-[84px] truncate text-neutral-400">{deckA.name || "—"}</span>
          <button
            onClick={() => nudge(deckA, -1)}
            title="Décaler A en arrière (1/16 de temps) — aligne les ticks"
            className="hw-btn px-1 py-0.5 text-[10px] leading-none"
            style={{ ["--led" as string]: colorA, color: colorA }}
          >
            ‹
          </button>
          <button
            onClick={() => nudge(deckA, 1)}
            title="Décaler A en avant (1/16 de temps) — aligne les ticks"
            className="hw-btn px-1 py-0.5 text-[10px] leading-none"
            style={{ ["--led" as string]: colorA, color: colorA }}
          >
            ›
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1" data-no-zoom>
          {MODES.map(([m, label, title]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={title}
              className={`hw-btn px-2 py-0.5 text-[10px] ${mode === m ? "hw-btn-on" : "text-neutral-300"}`}
              style={{ ["--led" as string]: "#ffcc00" }}
            >
              {label}
            </button>
          ))}
          {mode === "waterfall" && (
            <button
              onClick={() => setBeats((b) => !b)}
              title="Grille de beats colorée par intensité — jaune ≈ moyenne, orange/rouge = plus fort, blanc = ≥2× la moyenne (ou 2 decks calés)"
              className={`hw-btn px-2 py-0.5 text-[10px] ${beats ? "hw-btn-on" : "text-neutral-300"}`}
              style={{ ["--led" as string]: "#ffffff" }}
            >
              ♪ Sync
            </button>
          )}
          <button
            onClick={() => setFrozen((f) => !f)}
            title={frozen ? "Reprendre le défilement" : "Figer les spectres"}
            className={`hw-btn px-2 py-0.5 text-[10px] ${frozen ? "hw-btn-on" : "text-neutral-300"}`}
            style={{ ["--led" as string]: "#ffcc00" }}
          >
            {frozen ? "▶ Live" : "⏸ Geler"}
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1 text-[10px] font-bold">
          <button
            onClick={() => nudge(deckB, -1)}
            title="Décaler B en arrière (1/16 de temps) — aligne les ticks"
            className="hw-btn px-1 py-0.5 text-[10px] leading-none"
            style={{ ["--led" as string]: colorB, color: colorB }}
          >
            ‹
          </button>
          <button
            onClick={() => nudge(deckB, 1)}
            title="Décaler B en avant (1/16 de temps) — aligne les ticks"
            className="hw-btn px-1 py-0.5 text-[10px] leading-none"
            style={{ ["--led" as string]: colorB, color: colorB }}
          >
            ›
          </button>
          <span className="max-w-[84px] truncate text-neutral-400">{deckB.name || "—"}</span>
          <span style={{ color: colorB }}>B</span>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={VIEW}
          height={HEIGHT}
          className="h-32 w-full cursor-ew-resize rounded bg-neutral-950 ring-1 ring-neutral-800"
          onPointerDown={(e) => {
            dragging.current = true;
            scrubbingRef.current = true;
            lastX.current = e.clientX;
            const rect = e.currentTarget.getBoundingClientRect();
            // top half drives deck A, bottom half drives deck B
            const topHalf = e.clientY - rect.top < rect.height / 2;
            scrubDeck.current = topHalf ? deckA : deckB;
            setBar({
              x: ((e.clientX - rect.left) / rect.width) * 100,
              color: topHalf ? colorA : colorB,
            });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragging.current) onMove(e.clientX, e.currentTarget);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            scrubbingRef.current = false;
            scrubDeck.current = null;
            // snap the spectrogram back to the live edge so it resumes updating
            panRef.current = 0;
            advanceRef.current = 0;
            setBar(null);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {}
          }}
        />
        {/* vertical grab bar — coloured to the deck being scrubbed */}
        {bar && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] -translate-x-1/2"
            style={{ left: `${bar.x}%`, background: bar.color, boxShadow: `0 0 8px ${bar.color}` }}
          />
        )}
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.25em] text-neutral-600">
          ◄ glisser un spectre = recul / avance ►
        </div>
      </div>
    </div>
  );
}
