"use client";
import { useEffect, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import type { Deck } from "@/lib/audio/Deck";
import { keyCompat, bestShift, camelotHue, type KeyResult } from "@/lib/audio/key";
import { HARMONY_MOVES, applyMove, mashupOn, startMashup, stopMashup, walkHome, walking } from "@/lib/audio/harmonyMoves";

const DeckCard = ({ deck, side, color, onChange }: { deck: Deck; side: "A" | "B"; color: string; onChange: () => void }) => {
  const effKey = deck.effectiveKey;
  const bpm = deck.effectiveBPM;

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">PLATINE {side}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">♩ {bpm ? bpm.toFixed(1) : "—"}</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-[12px] font-bold truncate max-w-full">{deck.name || "— vide —"}</div>
        {effKey ? (
          <>
            <div
              className="h-[54px] w-[54px] rounded-full flex items-center justify-center text-[14px] font-bold"
              style={{ backgroundColor: `hsl(${camelotHue(effKey.camelot)} 75% 52%)` }}
            >
              {effKey.camelot}
            </div>
            <div className="text-[12px] font-bold">{effKey.name}</div>
            {deck.keyShift !== 0 && deck.key && (
              <div className="text-[10px] text-neutral-400">
                (d&apos;origine : {deck.key.name} {deck.key.camelot})
              </div>
            )}
          </>
        ) : (
          <>
            <div className="h-[54px] w-[54px] rounded-full flex items-center justify-center text-[14px] font-bold bg-neutral-700">—</div>
            <div className="text-[10px] text-neutral-400">Tonalité non détectée</div>
          </>
        )}
      </div>
      <div className="hw-recess flex flex-wrap gap-1 justify-center">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift === -2 ? "hw-btn-on" : ""}`}
          onClick={() => { deck.setKeyShift(-2); onChange(); }}
          style={{ ["--led" as string]: color }}
        >
          −2
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift === -1 ? "hw-btn-on" : ""}`}
          onClick={() => { deck.setKeyShift(-1); onChange(); }}
          style={{ ["--led" as string]: color }}
        >
          −1
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift === 0 ? "hw-btn-on" : ""}`}
          onClick={() => { deck.setKeyShift(0); onChange(); }}
          style={{ ["--led" as string]: color }}
        >
          0
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift === 1 ? "hw-btn-on" : ""}`}
          onClick={() => { deck.setKeyShift(1); onChange(); }}
          style={{ ["--led" as string]: color }}
        >
          +1
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift === 2 ? "hw-btn-on" : ""}`}
          onClick={() => { deck.setKeyShift(2); onChange(); }}
          style={{ ["--led" as string]: color }}
        >
          +2
        </button>
      </div>
      <div className="hw-recess flex gap-1 justify-center">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift <= -6 ? "text-neutral-300" : ""}`}
          onClick={() => { deck.setKeyShift(deck.keyShift - 1); onChange(); }}
          disabled={deck.keyShift <= -6}
          style={{ ["--led" as string]: color }}
        >
          −
        </button>
        <span className="text-[11px] font-bold px-2 py-1">
          {deck.keyShift > 0 ? `+${deck.keyShift}` : deck.keyShift} demi-ton(s)
        </span>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyShift >= 6 ? "text-neutral-300" : ""}`}
          onClick={() => { deck.setKeyShift(deck.keyShift + 1); onChange(); }}
          disabled={deck.keyShift >= 6}
          style={{ ["--led" as string]: color }}
        >
          +
        </button>
      </div>
      <button
        className={`hw-btn px-2 py-1 text-[11px] font-bold ${deck.keyLock ? "hw-btn-on" : ""}`}
        onClick={() => { deck.toggleKeyLock(); onChange(); }}
        style={{ ["--led" as string]: color }}
        title="Garde la hauteur du morceau quand tu changes le tempo"
      >
        KEY LOCK
      </button>
    </div>
  );
};

export function HarmonyPanel({ engine }: { engine: DJEngine }) {
  const [, setV] = useState(0);
  const [mover, setMover] = useState<"A" | "B">("B");
  const [note, setNote] = useState<string | null>(null);
  const force = () => setV((n) => n + 1);

  useEffect(() => {
    const iv = setInterval(force, 400);
    return () => clearInterval(iv);
  }, [engine]);

  const sector = (r0: number, r1: number, a0: number, a1: number): string => {
    const x0 = Math.cos(a0) * r0;
    const y0 = Math.sin(a0) * r0;
    const x1 = Math.cos(a1) * r0;
    const y1 = Math.sin(a1) * r0;
    const x2 = Math.cos(a1) * r1;
    const y2 = Math.sin(a1) * r1;
    const x3 = Math.cos(a0) * r1;
    const y3 = Math.sin(a0) * r1;
    return `M ${x0} ${y0} A ${r0} ${r0} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1} ${r1} 0 0 0 ${x3} ${y3} Z`;
  };

  const camelotCell = (k: KeyResult): { n: number; letter: "A" | "B" } => ({
    n: parseInt(k.camelot, 10),
    letter: k.camelot.endsWith("A") ? "A" : "B"
  });

  const isCompat = (n: number, letter: "A" | "B", eff: KeyResult | null): boolean => {
    if (!eff) return false;
    const cell = camelotCell(eff);
    const dn = Math.min(Math.abs(n - cell.n), 12 - Math.abs(n - cell.n));
    return dn === 0 || (dn === 1 && letter === cell.letter);
  };

  const effA = engine.deckA.effectiveKey;
  const effB = engine.deckB.effectiveKey;
  const compat = effA && effB ? keyCompat(effA, effB) : null;

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">HARMONIE</span>
        <span className="text-[10px] text-neutral-400">Tonalité des morceaux · compatibilité Camelot · décalage en demi-tons</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <DeckCard deck={engine.deckA} side="A" color="#38bdf8" onChange={force} />
        <DeckCard deck={engine.deckB} side="B" color="#f59e0b" onChange={force} />
      </div>
      {compat ? (
        <div className="hw-recess flex flex-col gap-2 p-2">
          <div className="flex items-center gap-2">
            <div
              className="h-[20px] w-[20px] rounded-full"
              style={{ backgroundColor: compat.level === 3 ? "#4ade80" : compat.level === 2 ? "#a3e635" : compat.level === 1 ? "#fbbf24" : "#f87171" }}
            />
            <span className="text-[12px] font-bold">{compat.label}</span>
            <span className="text-[10px] text-neutral-400">A {effA!.camelot} ↔ B {effB!.camelot}</span>
          </div>
          <div className="flex gap-2">
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => {
                const extra = bestShift(effB!, effA!);
                engine.deckB.setKeyShift(engine.deckB.keyShift + extra);
                force();
              }}
              style={{ ["--led" as string]: "#f59e0b" }}
            >
              ACCORDER B SUR A
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => {
                const extra = bestShift(effA!, effB!);
                engine.deckA.setKeyShift(engine.deckA.keyShift + extra);
                force();
              }}
              style={{ ["--led" as string]: "#38bdf8" }}
            >
              ACCORDER A SUR B
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-neutral-400">Charge un morceau sur chaque platine pour comparer les tonalités</div>
      )}
      <div className="hw-recess flex flex-col gap-2 p-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Mouvements d&apos;énergie</span>
        <span className="text-[10px] text-neutral-400">Transpose un deck pour qu&apos;il tombe juste à côté de l&apos;autre sur la roue : même case, un cran plus haut (ça monte), plus bas (ça se calme), ou deux crans (boost).</span>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-neutral-400">Bouger le deck</span>
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={mover === s} onClick={() => setMover(s)} className={`hw-btn px-2 py-1 text-[11px] font-bold ${mover === s ? "hw-btn-on" : ""}`} style={{ ["--led" as string]: s === "A" ? "#38bdf8" : "#f59e0b" }}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {HARMONY_MOVES.map(([id, name, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              disabled={!effA || !effB}
              onClick={() => {
                const d = mover === "A" ? engine.deckA : engine.deckB, o = mover === "A" ? engine.deckB : engine.deckA;
                const sh = applyMove(d, o, id);
                setNote(sh === null ? "Tonalité inconnue sur un des decks." : `Deck ${mover} transposé de ${sh > 0 ? "+" : ""}${sh} demi-ton(s) : ${d.effectiveKey?.camelot ?? ""}`);
                force();
              }}
              className="hw-btn px-2 py-1 text-[11px] font-bold disabled:opacity-40"
              style={{ ["--led" as string]: "#4ade80" }}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            title="Revient à la tonalité d'origine un demi-ton toutes les 2 mesures : on ne l'entend pas glisser"
            onClick={() => { walkHome(mover === "A" ? engine.deckA : engine.deckB); force(); }}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${walking(mover === "A" ? engine.deckA : engine.deckB) ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: "#4ade80" }}
          >
            RETOUR EN DOUCEUR
          </button>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">A cappella</span>
        <span className="text-[10px] text-neutral-400">La voix d&apos;un deck sur l&apos;instrumental de l&apos;autre, transposée dans sa tonalité et calée sur son tempo (stems nécessaires des deux côtés).</span>
        <div className="flex flex-wrap gap-1">
          {mashupOn(engine) ? (
            <button type="button" onClick={() => { stopMashup(engine); setNote("Mashup fini : tout est revenu comme avant."); force(); }} className="hw-btn hw-btn-on px-2 py-1 text-[11px] font-bold" style={{ ["--led" as string]: "#4ade80" }}>
              FIN DU MASHUP
            </button>
          ) : (
            (["A", "B"] as const).map((s) => (
              <button key={s} type="button" onClick={() => { setNote(startMashup(engine, s) ?? `Voix de ${s} sur l'instrumental de ${s === "A" ? "B" : "A"}.`); force(); }} className="hw-btn px-2 py-1 text-[11px] font-bold" style={{ ["--led" as string]: s === "A" ? "#38bdf8" : "#f59e0b" }}>
                VOIX DE {s} SUR {s === "A" ? "B" : "A"}
              </button>
            ))
          )}
        </div>
        {note && <span aria-live="polite" className="text-[10px] text-neutral-200">{note}</span>}
      </div>
      <svg viewBox="-100 -100 200 200" className="mx-auto h-[190px] w-[190px]">
        {Array.from({ length: 24 }, (_, i) => {
          const n = (i % 12) + 1;
          const letter = i < 12 ? "B" : "A";
          const angle = ((n % 12) * 30 - 90) * (Math.PI / 180);
          const r0 = i < 12 ? 34 : 62;
          const r1 = i < 12 ? 60 : 92;
          const compatA = isCompat(n, letter, effA);
          const compatB = isCompat(n, letter, effB);
          return (
            <g key={i}>
              <path
                d={sector(r0, r1, angle - 0.24, angle + 0.24)}
                fill={`hsl(${(n - 1) * 30} 55% 28%)`}
                stroke={compatA ? "#10b981" : compatB ? "#fbbf24" : "#000"}
                strokeWidth={compatA || compatB ? 2 : 1}
              />
              <text
                x={Math.cos(angle) * (r0 + r1) / 2}
                y={Math.sin(angle) * (r0 + r1) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ddd"
                fontSize="7"
              >
                {n}
              </text>
              <text
                x={Math.cos(angle) * (r0 + r1) / 2}
                y={Math.sin(angle) * (r0 + r1) / 2 + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ddd"
                fontSize="7"
              >
                {letter}
              </text>
              {effA && n === camelotCell(effA).n && letter === camelotCell(effA).letter && (
                <circle
                  cx={Math.cos(angle) * (r0 + r1) / 2}
                  cy={Math.sin(angle) * (r0 + r1) / 2}
                  r={7}
                  fill="#38bdf8"
                />
              )}
              {effB && n === camelotCell(effB).n && letter === camelotCell(effB).letter && (
                <circle
                  cx={Math.cos(angle) * (r0 + r1) / 2}
                  cy={Math.sin(angle) * (r0 + r1) / 2}
                  r={7}
                  fill="#f59e0b"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="text-[10px] text-neutral-400">
        Le décalage change la hauteur du morceau sans changer son tempo (qualité maximale jusqu&apos;à ±3 demi-tons).
      </div>
    </div>
  );
}
