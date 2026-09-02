import { useMemo, useRef, useState } from "react";
import MahjongGlyph, { isPiege } from "../components/MahjongTiles";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { freeIds, newGame, reshuffle, type Tile } from "../lib/mahjong";
import { useGameSession } from "../lib/useGameSession";
import { useEffect } from "react";

const CW = 42;
const CH = 50;
const TW = 40;
const TH = 48;
const OX = 8;
const OY = 10;
const PAD = 14;
const FOG_MS = 1600;
const BANNER_MS = 2600;

export default function Mahjong() {
  const [seed, setSeed] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>(() => newGame());
  const [gone, setGone] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [history, setHistory] = useState<[number, number][]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [foggy, setFoggy] = useState(false);
  const session = useGameSession("mahjong", "");
  const timers = useRef<number[]>([]);

  function after(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setTiles(newGame());
    setGone([]);
    setSel(null);
    setHint([]);
    setHistory([]);
    setBanner(null);
    setFoggy(false);
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    session.reset();
  }

  useEffect(() => {
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

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
    if (won || foggy || gone.includes(id) || !free.has(id)) return;
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
      const matchedSym = tiles[sel].sym;
      const newGone = [...gone, sel, id];
      setGone(newGone);
      setHistory((h) => [...h, [sel, id]]);
      setSel(null);
      if (matchedSym === "piege-tornade") {
        const goneSet = new Set(newGone);
        setTiles((t) => reshuffle(t, goneSet));
        setBanner("Piège tornade ! Le plateau a été mélangé.");
        after(BANNER_MS, () => setBanner(null));
      } else if (matchedSym === "piege-brume") {
        setFoggy(true);
        setBanner("Piège brume ! Les symboles se voilent un instant.");
        after(FOG_MS, () => setFoggy(false));
        after(BANNER_MS, () => setBanner(null));
      }
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
    const pairs = Object.values(bySym).filter((ids) => ids.length >= 2);
    const safe = pairs.find((ids) => !isPiege(tiles[ids[0]].sym));
    const pair = safe ?? pairs[0];
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

      {banner && <p className="mj-banner">{banner}</p>}

      <div className="chrono-row">
        <Chrono running={!won} resetKey={key} />
      </div>

      <WinReward game="mahjong" show={session.won} />

      <div ref={wrapRef} className="mj-wrap" style={{ height: height * scale }}>
      <div
        className={`mj-board${foggy ? " foggy" : ""}`}
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top center" }}
        role="grid"
        aria-label="Plateau de mahjong"
      >
        {tiles.map((t) => {
          if (gone.includes(t.id)) return null;
          const left = t.x * CW - t.z * OX + PAD;
          const top = t.y * CH - t.z * OY + PAD;
          const isFree = free.has(t.id);
          const piege = isPiege(t.sym);
          const cls = [
            "mj-tile",
            isFree ? "free" : "blocked",
            sel === t.id ? "sel" : "",
            hint.includes(t.id) ? "hint" : "",
            t.z > 0 ? "up" : "",
            piege ? "piege" : "",
          ].join(" ");
          return (
            <button
              key={t.id}
              className={cls}
              style={{ left, top, width: TW, height: TH, zIndex: t.z * 100 + t.y }}
              onClick={() => click(t.id)}
              aria-label={isFree ? (piege ? `tuile piège ${t.sym}` : t.sym) : "tuile bloquée"}
            >
              <MahjongGlyph className="mj-glyph" sym={t.sym} size={30} />
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
