import { useEffect, useMemo, useRef, useState } from "react";
import {
  bbox,
  FIGURES,
  pointInPolygon,
  toPath,
  type Piece,
} from "../lib/tangram";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PieceSvg({ piece, size }: { piece: Piece; size: number }) {
  const b = bbox(piece.points);
  const pad = 0.6;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}`}
    >
      <polygon
        points={toPath(piece.points)}
        fill={piece.color}
        stroke="#0f380f"
        strokeWidth="0.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type TangramLevel = "facile" | "moyen" | "difficile";
const LEVELS: { id: TangramLevel; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "moyen", label: "Moyen" },
  { id: "difficile", label: "Difficile" },
];

export default function Tangram() {
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState<TangramLevel>("facile");
  const fig = FIGURES[idx];

  const [placed, setPlaced] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("tangram", `${fig.title}-${level}`);

  const svgRef = useRef<SVGSVGElement>(null);
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const tray = useMemo(() => shuffle(fig.pieces), [fig, idx]);

  const key = `${idx}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPlaced([]);
    setDrag(null);
    setAbandoned(false);
    session.reset();
  }

  const won = placed.length === fig.pieces.length;

  useEffect(() => {
    if (won && !abandoned) session.record("success");
  }, [won, abandoned, session]);

  const remaining = tray.filter((p) => !placed.includes(p.id));

  function flashWrong() {
    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 400);
  }

  function drop(clientX: number, clientY: number) {
    const id = dragRef.current?.id;
    setDrag(null);
    if (!id || won || abandoned) return;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    const hit = fig.pieces.find(
      (p) => !placedRef.current.includes(p.id) && pointInPolygon(loc.x, loc.y, p.points)
    );
    if (hit && hit.id === id) setPlaced((p) => [...p, id]);
    else flashWrong();
  }

  // suit le doigt / la souris pendant le glisser
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) =>
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => drop(e.clientX, e.clientY);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  function startDrag(piece: Piece, e: React.PointerEvent) {
    if (won || abandoned) return;
    e.preventDefault();
    setDrag({ id: piece.id, x: e.clientX, y: e.clientY });
  }

  function giveHint() {
    if (won || !session.useHint()) return;
    const next = fig.pieces.find((p) => !placed.includes(p.id));
    if (next) setPlaced((p) => [...p, next.id]);
  }

  function abandon() {
    session.record("abandon");
    setPlaced(fig.pieces.map((p) => p.id));
    setAbandoned(true);
  }

  const dragPiece = drag ? fig.pieces.find((p) => p.id === drag.id) : null;

  return (
    <div>
      <div className="controls">
        <div className="seg seg-scroll">
          {FIGURES.map((f, i) => (
            <button key={i} className={`seg-btn ${idx === i ? "active" : ""}`} onClick={() => setIdx(i)}>
              {f.title}
            </button>
          ))}
        </div>
        <div className="seg" style={{ marginTop: 6 }}>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`seg-btn ${level === l.id ? "active" : ""}`}
              onClick={() => { setLevel(l.id); setPlaced([]); setAbandoned(false); session.reset(); }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <p className={won && !abandoned ? "status win" : "status"}>
        {abandoned
          ? "Voici la figure complète."
          : won
          ? "Bravo, figure reconstituée !"
          : "Glissez chaque pièce vers son emplacement dans la figure."}
      </p>

      <div className="chrono-row">
        <Chrono running={!won && !abandoned} resetKey={key} />
      </div>

      <WinReward game="tangram" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={won}
        abandoned={abandoned}
      />

      <div className={`tangram-board ${wrongFlash ? "flash" : ""}`}>
        <svg ref={svgRef} viewBox={`-0.4 -0.4 ${fig.w + 0.8} ${fig.h + 0.8}`}>
          {/* Silhouette globale pour les niveaux moyen et difficile */}
          {level !== "facile" && fig.pieces.map((p) => (
            <polygon
              key={`sil-${p.id}`}
              points={toPath(p.points)}
              fill="var(--surface-alt)"
              stroke="none"
            />
          ))}
          {fig.pieces.map((p) => {
            const isPlaced = placed.includes(p.id);
            const showOutline = level === "facile" || isPlaced;
            return (
              <polygon
                key={p.id}
                points={toPath(p.points)}
                className={`slot ${isPlaced ? "placed" : ""} ${
                  drag && drag.id === p.id && !isPlaced ? "target" : ""
                } ${!showOutline ? "no-outline" : ""}`}
                fill={isPlaced ? p.color : "transparent"}
              />
            );
          })}
        </svg>
      </div>

      {!won && !abandoned && (
        <div className="tray">
          {remaining.map((p) => (
            <button
              key={p.id}
              data-id={p.id}
              className={`tray-piece ${drag?.id === p.id ? "dragging" : ""}`}
              onPointerDown={(e) => startDrag(p, e)}
              aria-label="pièce à glisser"
            >
              <PieceSvg piece={p} size={56} />
            </button>
          ))}
        </div>
      )}

      {drag && dragPiece && (
        <div className="tangram-ghost" style={{ left: drag.x, top: drag.y }}>
          <PieceSvg piece={dragPiece} size={64} />
        </div>
      )}
    </div>
  );
}
