import { useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { freeIds, newGame, reshuffle, type Tile } from "../lib/mahjong";
import { useGameSession } from "../lib/useGameSession";
import { useEffect } from "react";

const CW = 38;
const CH = 46;
const TW = 36;
const TH = 44;
const OX = 7;
const OY = 9;
const PAD = 12;

export default function Mahjong() {
  const [seed, setSeed] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>(() => newGame());
  const [gone, setGone] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [history, setHistory] = useState<[number, number][]>([]);
  const session = useGameSession("mahjong", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setTiles(newGame());
    setGone([]);
    setSel(null);
    setHint([]);
    setHistory([]);
    session.reset();
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const goneSet = useMemo(() => new Set(gone), [gone]);
  const free = useMemo(() => freeIds(tiles, goneSet), [tiles, goneSet]);
  const won = gone.length === tiles.length;

  useEffect(() => {
    if (won) session.record("success");
  }, [won, session]);

  // tuiles libres restantes qui n'ont plus de partenaire jouable -> blocage
  const stuck = useMemo(() => {
    if (won) return false;
    const counts: Record<string, number> = {};
    free.forEach((id) => {
      const t = tiles[id];
      counts[t.sym] = (counts[t.sym] ?? 0) + 1;
    });
    return !Object.values(counts).some((c) => c >= 2);
  }, [free, tiles, won]);

  function click(id: number) {
    if (won || gone.includes(id) || !free.has(id)) return;
    setHint([]);
    if (sel == null) {
      setSel(id);
      return;
    }
    if (sel === id) {
      setSel(null);
      return;
    }
    if (tiles[sel].sym === tiles[id].sym) {
      setGone((g) => [...g, sel, id]);
      setHistory((h) => [...h, [sel, id]]);
      setSel(null);
    } else {
      setSel(id);
    }
  }

  function showHint() {
    const bySym: Record<string, number[]> = {};
    for (const id of free) {
      const s = tiles[id].sym;
      (bySym[s] ||= []).push(id);
    }
    const pair = Object.values(bySym).find((ids) => ids.length >= 2);
    if (pair) setHint([pair[0], pair[1]]);
  }

  function undo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setGone((g) => g.filter((x) => x !== last[0] && x !== last[1]));
    setSel(null);
    setHint([]);
  }

  function mix() {
    setTiles((t) => reshuffle(t, goneSet));
    setSel(null);
    setHint([]);
  }

  const cols = tiles.reduce((m, t) => Math.max(m, t.x), 0) + 1;
  const rows = tiles.reduce((m, t) => Math.max(m, t.y), 0) + 1;
  const width = cols * CW + PAD * 2;
  const height = rows * CH + OY + PAD * 2;
  const remaining = tiles.length - gone.length;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      setScale(Math.min(1.7, Math.max(0.6, avail / width)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div>
      <div className="controls mj-controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle partie
        </button>
        <button className="btn btn-ghost" onClick={undo} disabled={!history.length}>
          Annuler
        </button>
        <button className="btn btn-ghost" onClick={showHint} disabled={won}>
          Indice
        </button>
        <button className="btn btn-ghost" onClick={mix} disabled={won}>
          Mélanger
        </button>
      </div>

      <p className={won ? "status win" : "status"}>
        {won
          ? "Bravo, tablier vidé !"
          : stuck
          ? "Plus de paire jouable — touchez « Mélanger »."
          : `Tuiles restantes : ${remaining}`}
      </p>

      <div className="chrono-row">
        <Chrono running={!won} resetKey={key} />
      </div>

      <WinReward game="mahjong" show={session.won} />

      <div ref={wrapRef} className="mj-wrap" style={{ height: height * scale }}>
      <div
        className="mj-board"
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top center" }}
        role="grid"
        aria-label="Plateau de mahjong"
      >
        {tiles.map((t) => {
          if (gone.includes(t.id)) return null;
          const left = t.x * CW - t.z * OX + PAD;
          const top = t.y * CH - t.z * OY + PAD;
          const isFree = free.has(t.id);
          const cls = [
            "mj-tile",
            isFree ? "free" : "blocked",
            sel === t.id ? "sel" : "",
            hint.includes(t.id) ? "hint" : "",
            t.z > 0 ? "up" : "",
          ].join(" ");
          return (
            <button
              key={t.id}
              className={cls}
              style={{ left, top, width: TW, height: TH, zIndex: t.z * 100 + t.y }}
              onClick={() => click(t.id)}
              aria-label={isFree ? t.sym : "tuile bloquée"}
            >
              <Icon name={t.sym} size={24} />
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
