import { useEffect, useMemo, useState } from "react";
import PlayingCard from "../components/PlayingCard";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { makeDeck, shuffle, type Card } from "../lib/cards";
import { useGameSession } from "../lib/useGameSession";

// La valeur d'une carte pour le total de 13 : As=1 … Roi=13.
const value = (c: Card) => c.rank;

// 28 cartes en pyramide (7 rangées : 1,2,…,7).
const ROWS = 7;
const PYRAMID_POS: { r: number; j: number }[] = [];
for (let r = 0; r < ROWS; r++) for (let j = 0; j <= r; j++) PYRAMID_POS.push({ r, j });

type Level = "facile" | "difficile";
const LEVELS: { id: Level; label: string; hint: string; redeals: number }[] = [
  { id: "facile", label: "Facile", hint: "3 redonnes", redeals: 3 },
  { id: "difficile", label: "Difficile", hint: "1 seule passe", redeals: 0 },
];

const CARD_W = 46; // largeur d'une carte de la pyramide (px)
const STEP_Y = 0.52; // chevauchement vertical (× hauteur de carte)

type Sel = { kind: "pyr"; r: number; j: number } | { kind: "waste" } | null;

export default function Pyramide() {
  const [level, setLevel] = useState<Level>("facile");
  const [seed, setSeed] = useState(0);
  const conf = LEVELS.find((l) => l.id === level)!;
  const session = useGameSession("pyramide", level);

  // Distribution : 28 cartes en pyramide, le reste en pioche.
  const dealt = useMemo(() => {
    const deck = shuffle(makeDeck());
    const pyramid: Record<string, Card> = {};
    PYRAMID_POS.forEach((p, i) => (pyramid[`${p.r}-${p.j}`] = deck[i]));
    const stock = deck.slice(PYRAMID_POS.length);
    return { pyramid, stock };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, seed]);

  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [stock, setStock] = useState<Card[]>(dealt.stock);
  const [waste, setWaste] = useState<Card[]>([]);
  const [redeals, setRedeals] = useState(conf.redeals);
  const [sel, setSel] = useState<Sel>(null);
  const [abandoned, setAbandoned] = useState(false);

  const key = `${level}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setRemoved(new Set());
    setStock(dealt.stock);
    setWaste([]);
    setRedeals(conf.redeals);
    setSel(null);
    setAbandoned(false);
    session.reset();
  }

  const wasteTop = waste[waste.length - 1] ?? null;

  // Une carte de pyramide est libre si elle n'est pas couverte par les deux
  // cartes de la rangée du dessous (ou si elle est sur la rangée du bas).
  function isFree(r: number, j: number): boolean {
    if (removed.has(`${r}-${j}`)) return false;
    if (r === ROWS - 1) return true;
    return removed.has(`${r + 1}-${j}`) && removed.has(`${r + 1}-${j + 1}`);
  }

  const won = removed.size === PYRAMID_POS.length;
  const lost = abandoned;

  if (won && !session.won) session.record("success");

  // Détecte un blocage : plus aucune paire possible, pioche vide, plus de redonne.
  const stuck = useMemo(() => {
    if (won || abandoned) return false;
    if (stock.length > 0 || redeals > 0) return false;
    const free: Card[] = [];
    for (const { r, j } of PYRAMID_POS) if (isFree(r, j)) free.push(dealt.pyramid[`${r}-${j}`]);
    if (wasteTop) free.push(wasteTop);
    if (free.some((c) => c.rank === 13)) return false; // un Roi se retire seul
    for (let a = 0; a < free.length; a++)
      for (let b = a + 1; b < free.length; b++)
        if (value(free[a]) + value(free[b]) === 13) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, stock, waste, redeals, won, abandoned]);

  useEffect(() => {
    if (stuck) session.record("failure");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stuck]);

  const finished = won || lost;

  function removeAt(s: Exclude<Sel, null>) {
    if (s.kind === "pyr") {
      setRemoved((prev) => new Set(prev).add(`${s.r}-${s.j}`));
    } else {
      setWaste((w) => w.slice(0, -1));
    }
  }

  function cardOf(s: Exclude<Sel, null>): Card {
    return s.kind === "pyr" ? dealt.pyramid[`${s.r}-${s.j}`] : wasteTop!;
  }

  function sameSel(a: Sel, b: Sel): boolean {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === "pyr" && b.kind === "pyr") return a.r === b.r && a.j === b.j;
    return a.kind === "waste" && b.kind === "waste";
  }

  function tap(s: Exclude<Sel, null>) {
    if (finished) return;
    const card = cardOf(s);
    // Un Roi (13) se retire seul.
    if (card.rank === 13) {
      removeAt(s);
      setSel(null);
      return;
    }
    if (!sel) {
      setSel(s);
      return;
    }
    if (sameSel(sel, s)) {
      setSel(null); // re-toucher la même carte = désélection
      return;
    }
    const other = cardOf(sel);
    if (value(card) + value(other) === 13) {
      removeAt(s);
      removeAt(sel);
      setSel(null);
    } else {
      setSel(s); // mauvaise somme : on bascule la sélection sur la nouvelle carte
    }
  }

  function drawStock() {
    if (finished) return;
    if (stock.length === 0) {
      if (redeals <= 0) return;
      setStock([...waste].reverse());
      setWaste([]);
      setRedeals((n) => n - 1);
      setSel(null);
      return;
    }
    setWaste((w) => [...w, stock[stock.length - 1]]);
    setStock((s) => s.slice(0, -1));
    setSel(null);
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    // Roi libre ?
    for (const { r, j } of PYRAMID_POS)
      if (isFree(r, j) && dealt.pyramid[`${r}-${j}`].rank === 13) {
        removeAt({ kind: "pyr", r, j });
        setSel(null);
        return;
      }
    if (wasteTop?.rank === 13) {
      removeAt({ kind: "waste" });
      setSel(null);
      return;
    }
    // Paire libre qui fait 13 ?
    const spots: Exclude<Sel, null>[] = [];
    for (const { r, j } of PYRAMID_POS) if (isFree(r, j)) spots.push({ kind: "pyr", r, j });
    if (wasteTop) spots.push({ kind: "waste" });
    for (let a = 0; a < spots.length; a++)
      for (let b = a + 1; b < spots.length; b++)
        if (value(cardOf(spots[a])) + value(cardOf(spots[b])) === 13) {
          removeAt(spots[a]);
          removeAt(spots[b]);
          setSel(null);
          return;
        }
    // Sinon : piocher.
    drawStock();
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setSel(null);
  }

  // Géométrie de la pyramide.
  const cardH = Math.round(CARD_W * 1.4);
  const stepY = cardH * STEP_Y;
  const stepX = CARD_W * 0.56;
  const totalW = CARD_W + (ROWS - 1) * (stepX * 2);
  const boardH = cardH + (ROWS - 1) * stepY;

  const left = (r: number, j: number) => totalW / 2 - r * stepX + j * stepX * 2 - CARD_W / 2;

  return (
    <div className="pyr">
      <div className="controls">
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l.id} className={level === l.id ? "active" : ""} onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle donne
        </button>
      </div>

      <p className={won ? "status win" : "status"}>
        {abandoned
          ? "Partie abandonnée."
          : won
          ? "Bravo, pyramide dégagée !"
          : stuck
          ? "Plus de coup possible. Essayez une nouvelle donne."
          : "Associez deux cartes qui font 13. Le Roi se retire seul."}
      </p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="pyramide" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={won}
        abandoned={lost}
      />

      <div className="pyr-board" style={{ height: boardH, maxWidth: totalW }}>
        {PYRAMID_POS.map(({ r, j }) => {
          const id = `${r}-${j}`;
          if (removed.has(id)) return null;
          const card = dealt.pyramid[id];
          const free = isFree(r, j);
          const selected = sel?.kind === "pyr" && sel.r === r && sel.j === j;
          return (
            <div
              key={id}
              className="pyr-slot"
              style={{ left: left(r, j), top: r * stepY, zIndex: r + 1, width: CARD_W }}
            >
              <PlayingCard
                card={card}
                width={CARD_W}
                selected={selected}
                dim={!free}
                onClick={free ? () => tap({ kind: "pyr", r, j }) : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Pioche & défausse */}
      <div className="pyr-stockrow">
        <div className="pyr-pile">
          <span className="pyr-pile-label">Pioche</span>
          {stock.length > 0 ? (
            <PlayingCard faceUp={false} width={52} onClick={drawStock} />
          ) : redeals > 0 ? (
            <button className="pyr-redeal" onClick={drawStock} aria-label="Redonner">
              <span className="pyr-redeal-icon">↻</span>
              <span className="pyr-redeal-n">{redeals}</span>
            </button>
          ) : (
            <div className="pcard back empty" style={{ width: 52, height: Math.round(52 * 1.4) }} />
          )}
          <span className="pyr-pile-count">{stock.length}</span>
        </div>

        <div className="pyr-pile">
          <span className="pyr-pile-label">Défausse</span>
          {wasteTop ? (
            <PlayingCard
              card={wasteTop}
              width={52}
              selected={sel?.kind === "waste"}
              onClick={() => tap({ kind: "waste" })}
            />
          ) : (
            <div className="pcard back empty" style={{ width: 52, height: Math.round(52 * 1.4) }} />
          )}
          <span className="pyr-pile-count">{removed.size}/28</span>
        </div>
      </div>

      {finished && (
        <p className={won ? "status win" : "status"}>
          {won ? "Pyramide réussie !" : abandoned ? "Vous avez abandonné." : "Aucun coup possible."}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Nouvelle donne →
          </button>
        </p>
      )}
    </div>
  );
}
