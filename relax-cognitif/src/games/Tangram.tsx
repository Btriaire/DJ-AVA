import { useEffect, useMemo, useRef, useState } from "react";
import {
  bbox,
  FIGURES,
  pointInPolygon,
  rotatePoints,
  rotationalSymmetry,
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

function PieceSvg({ piece, size, rotation = 0 }: { piece: Piece; size: number; rotation?: number }) {
  const pts = rotation ? rotatePoints(piece.points, rotation) : piece.points;
  const b = bbox(pts);
  const pad = 0.6;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}`}
    >
      <polygon
        points={toPath(pts)}
        fill={piece.color}
        stroke="#0f380f"
        strokeWidth="0.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Vignette de la figure entière (silhouette) pour le sélecteur. */
function FigureThumb({ figIdx, size = 40 }: { figIdx: number; size?: number }) {
  const fig = FIGURES[figIdx];
  return (
    <svg width={size} height={size} viewBox={`-0.4 -0.4 ${fig.w + 0.8} ${fig.h + 0.8}`}>
      {fig.pieces.map((p) => (
        <polygon key={p.id} points={toPath(p.points)} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}

type TangramLevel = "facile" | "moyen" | "difficile";
const LEVELS: { id: TangramLevel; label: string; hint: string }[] = [
  { id: "facile", label: "Facile", hint: "repères + pièces droites" },
  { id: "moyen", label: "Moyen", hint: "silhouette pleine, sans repères" },
  { id: "difficile", label: "Difficile", hint: "silhouette pâle, pièces tournées" },
];

function makeRotations(pieces: Piece[], lvl: TangramLevel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pieces) {
    if (lvl === "facile") {
      out[p.id] = 0;
      continue;
    }
    const sym = rotationalSymmetry(p.points);
    const pool = (lvl === "moyen" ? [45, 90, 270, 315] : [45, 90, 135, 180, 225, 270, 315])
      .filter((a) => a % sym !== 0);
    out[p.id] = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 0;
  }
  return out;
}

export default function Tangram() {
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState<TangramLevel>("facile");
  const fig = FIGURES[idx];

  const [placed, setPlaced] = useState<string[]>([]);
  const [rotations, setRotations] = useState<Record<string, number>>(() => makeRotations(fig.pieces, level));
  const [selId, setSelId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [turnHint, setTurnHint] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("tangram", `${fig.title}-${level}`);

  const svgRef = useRef<SVGSVGElement>(null);
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const rotRef = useRef(rotations);
  rotRef.current = rotations;

  const tray = useMemo(() => shuffle(fig.pieces), [fig, idx]);
  const symmetry = useMemo(
    () => Object.fromEntries(fig.pieces.map((p) => [p.id, rotationalSymmetry(p.points)])),
    [fig]
  );

  const key = `${idx}-${level}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPlaced([]);
    setRotations(makeRotations(fig.pieces, level));
    setSelId(null);
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

  function flashTurn() {
    setTurnHint(true);
    setTimeout(() => setTurnHint(false), 1200);
  }

  function rotate(id: string) {
    if (won || abandoned || placedRef.current.includes(id)) return;
    setRotations((r) => ({ ...r, [id]: ((r[id] ?? 0) + 45) % 360 }));
    setSelId(id);
  }

  function placePiece(id: string) {
    setPlaced((p) => [...p, id]);
    setRotations((r) => ({ ...r, [id]: 0 }));
    if (selId === id) setSelId(null);
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
    const target = fig.pieces.find((p) => p.id === id);
    if (!target || placedRef.current.includes(id)) return;
    // Zone de dépôt généreuse : à l'intérieur de la pièce OU assez proche de
    // son emplacement d'origine. Chaque pièce n'a qu'une seule place, donc on
    // n'a pas besoin d'exiger une visée au pixel près.
    const b = bbox(target.points);
    const cx = b.minX + b.w / 2;
    const cy = b.minY + b.h / 2;
    const dist = Math.hypot(loc.x - cx, loc.y - cy);
    const tol = Math.max(b.w, b.h) * 0.7 + 0.8;
    const near = pointInPolygon(loc.x, loc.y, target.points) || dist <= tol;
    if (near) {
      const sym = symmetry[id] ?? 360;
      const rot = rotRef.current[id] ?? 0;
      if (rot % sym === 0) placePiece(id);
      else flashTurn(); // bonne zone, mauvaise orientation
    } else {
      flashWrong();
    }
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
    setSelId(piece.id);
    setDrag({ id: piece.id, x: e.clientX, y: e.clientY });
  }

  function giveHint() {
    if (won || !session.useHint()) return;
    const next = fig.pieces.find((p) => !placed.includes(p.id));
    if (next) placePiece(next.id);
  }

  function abandon() {
    session.record("abandon");
    setPlaced(fig.pieces.map((p) => p.id));
    setAbandoned(true);
  }

  const dragPiece = drag ? fig.pieces.find((p) => p.id === drag.id) : null;
  const showGuides = level === "facile";

  return (
    <div>
      <div className="controls">
        <div className="seg seg-scroll tg-figs">
          {FIGURES.map((f, i) => (
            <button
              key={i}
              className={`tg-figbtn ${idx === i ? "active" : ""}`}
              onClick={() => setIdx(i)}
            >
              <FigureThumb figIdx={i} />
              <span>{f.title}</span>
            </button>
          ))}
        </div>
        <div className="tg-levels">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`tg-levelbtn ${level === l.id ? "active" : ""}`}
              onClick={() => setLevel(l.id)}
            >
              <span className="tg-level-name">{l.label}</span>
              <span className="tg-level-hint">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <p className={won && !abandoned ? "status win" : "status"}>
        {abandoned
          ? "Voici la figure complète."
          : won
          ? "Bravo, figure reconstituée !"
          : turnHint
          ? "Bonne place — tournez la pièce pour l'emboîter !"
          : level === "facile"
          ? "Glissez chaque pièce vers son emplacement."
          : "Tournez (double-clic ou ⟳) puis glissez chaque pièce dans la silhouette."}
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

      <div className={`tangram-board ${wrongFlash ? "flash" : ""} ${turnHint ? "turn" : ""}`}>
        <svg ref={svgRef} viewBox={`-0.4 -0.4 ${fig.w + 0.8} ${fig.h + 0.8}`}>
          {/* Silhouette de la figure à reconstituer (sans repères internes) */}
          {fig.pieces.map((p) => (
            <polygon
              key={`sil-${p.id}`}
              points={toPath(p.points)}
              fill="var(--surface-alt)"
              fillOpacity={level === "difficile" ? 0.3 : 1}
              stroke="none"
            />
          ))}
          {/* Repères de découpe : uniquement en mode facile */}
          {showGuides &&
            fig.pieces.map((p) => (
              <polygon
                key={`out-${p.id}`}
                points={toPath(p.points)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={0.07}
                strokeDasharray="0.35 0.3"
                strokeOpacity={0.9}
              />
            ))}
          {/* Pièces déjà placées (couleur réelle) */}
          {fig.pieces.filter((p) => placed.includes(p.id)).map((p) => (
            <polygon
              key={`pl-${p.id}`}
              points={toPath(p.points)}
              fill={p.color}
              stroke="#0f380f"
              strokeWidth="0.06"
              strokeLinejoin="round"
              className="slot placed"
            />
          ))}
          {/* Repère de la cible en cours de glisser (facile uniquement) */}
          {showGuides && drag && !placed.includes(drag.id) && (
            <polygon
              points={toPath(fig.pieces.find((p) => p.id === drag.id)!.points)}
              className="slot target"
              fill="transparent"
            />
          )}
        </svg>
      </div>

      {!won && !abandoned && (
        <div className="tray">
          {remaining.map((p) => {
            const needTurn = level !== "facile";
            return (
              <div
                key={p.id}
                data-id={p.id}
                className={`tray-piece ${drag?.id === p.id ? "dragging" : ""} ${selId === p.id ? "sel" : ""}`}
                onPointerDown={(e) => startDrag(p, e)}
                onDoubleClick={() => rotate(p.id)}
                aria-label="pièce à glisser"
              >
                <PieceSvg piece={p} size={56} rotation={rotations[p.id] ?? 0} />
                {needTurn && (
                  <button
                    className="tray-rotate"
                    aria-label="Tourner la pièce"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      rotate(p.id);
                    }}
                  >
                    ⟳
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drag && dragPiece && (
        <div className="tangram-ghost" style={{ left: drag.x, top: drag.y }}>
          <PieceSvg piece={dragPiece} size={64} rotation={rotations[dragPiece.id] ?? 0} />
        </div>
      )}
    </div>
  );
}
