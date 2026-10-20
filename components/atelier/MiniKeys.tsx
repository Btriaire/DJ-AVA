"use client";
import { useEffect, useRef, useState } from "react";
import { Knob } from "../Knob";
import type { SampleKeys } from "@/lib/atelier/players";
import { midiName } from "@/lib/audio/theory";

const KEYMAP = "awsedftgyhujkolp;'";
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

export function MiniKeys({
  keys,
  color,
  active,
  current,
}: {
  keys: SampleKeys;
  color: string;
  active: boolean;
  current?: { name: string; load: () => void } | null;
}) {
  const [octs] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 2 : 4));
  const keyWidth = 100 / (octs * 7 + 1);
  const [base, setBase] = useState(() => (octs === 2 ? 48 : 36));
  const [transpose, setTranspose] = useState(0);
  const [kbOct, setKbOct] = useState(1);
  const [vel, setVel] = useState(0.8);
  const [volume, setVolume] = useState(0.9);
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(() => typeof window !== "undefined" && (window.innerWidth < 640 || window.innerHeight < 760));
  const [down, setDown] = useState(new Set<number>());
  const [last, setLast] = useState<{ midi: number; vel: number } | null>(null);
  const [, setTick] = useState(0);

  const pointers = useRef(new Map<number, { shown: number; played: number; vel: number }>());
  const kbHeld = useRef(new Map<string, { shown: number; played: number }>());
  const cfg = useRef({ base, kbOct, transpose, vel, octs });

  const kbBase = base + 12 * kbOct;

  useEffect(() => {
    cfg.current = { base, kbOct, transpose, vel, octs };
  });

  useEffect(() => {
    const unsubscribe = keys.onLoad((name) => {
      setFolded(false);
    });
    return () => unsubscribe();
  }, [keys]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!keys.loaded) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-midi]") as HTMLElement | null;
    if (!target) return;

    const shown = Number(target.dataset.midi);
    const rect = target.getBoundingClientRect();
    const vel = 0.3 + 0.7 * Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    const played = shown + transpose;

    keys.noteOn(played, vel);
    pointers.current.set(e.pointerId, { shown, played, vel });
    setDown((d) => { const n = new Set(d); n.add(shown); return n; });
    setLast({ midi: played, vel });
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-midi]") as HTMLElement | null;
    if (!target) return;

    const shown = Number(target.dataset.midi);
    const old = pointers.current.get(e.pointerId);
    if (!old || old.shown === shown) return;

    keys.noteOff(old.played);
    keys.noteOn(shown + transpose, old.vel);
    pointers.current.set(e.pointerId, { shown, played: shown + transpose, vel: old.vel });
    setDown((d) => { const n = new Set(d); n.delete(old.shown); n.add(shown); return n; });
    setLast({ midi: shown + transpose, vel: old.vel });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const { shown, played } = pointers.current.get(e.pointerId)!;
    keys.noteOff(played);
    pointers.current.delete(e.pointerId);
    setDown((d) => { const n = new Set(d); n.delete(shown); return n; });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!active || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
           e.target.tagName === "INPUT" ||
           e.target.tagName === "SELECT" ||
           e.target.tagName === "TEXTAREA")) return;

      const key = e.key.toLowerCase();
      if (key === "z") {
        setKbOct((o) => Math.max(0, o - 1));
        return;
      }
      if (key === "x") {
        setKbOct((o) => Math.min(cfg.current.octs - 1, o + 1));
        return;
      }
      if (key === "c") {
        setVel((v) => Math.max(0.1, v - 0.1));
        return;
      }
      if (key === "v") {
        setVel((v) => Math.min(1, v + 0.1));
        return;
      }

      const index = KEYMAP.indexOf(key);
      if (index === -1) return;

      const shown = cfg.current.base + 12 * cfg.current.kbOct + index;
      if (shown < cfg.current.base || shown > cfg.current.base + cfg.current.octs * 12) return;

      const played = shown + cfg.current.transpose;
      keys.noteOn(played, cfg.current.vel);
      kbHeld.current.set(key, { shown, played });
      setDown((d) => { const n = new Set(d); n.add(shown); return n; });
      setLast({ midi: played, vel: cfg.current.vel });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (kbHeld.current.has(key)) {
        const { shown, played } = kbHeld.current.get(key)!;
        keys.noteOff(played);
        kbHeld.current.delete(key);
        setDown((d) => { const n = new Set(d); n.delete(shown); return n; });
      }
    };

    const cleanup = () => {
      keys.allOff();
      pointers.current.clear();
      kbHeld.current.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cleanup();
    };
  }, [active, keys]);

  const renderKeys = () => {
    const whiteKeys: React.ReactElement[] = [];
    const blackKeys: React.ReactElement[] = [];
    let whiteCount = 0;

    for (let i = 0; i <= octs * 12; i++) {
      const shown = base + i;
      const semi = i % 12;
      const isWhite = WHITE_KEYS.includes(semi);
      const isDown = down.has(shown);
      const isRoot = shown + transpose === keys.root;

      if (isWhite) {
        whiteKeys.push(
          <div
            key={shown}
            data-midi={shown}
            className={`hw-key-w ${isDown ? "is-down" : ""}`}
            style={{
              ["--led" as string]: color,
              left: `${whiteCount * keyWidth}%`,
              width: `${keyWidth}%`,
            }}
          >
            {isRoot && (
              <div
                className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
              />
            )}
            {semi === 0 && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-neutral-500">
                {midiName(shown + transpose)}
              </div>
            )}
            {shown >= kbBase && shown < kbBase + 18 && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] text-neutral-600">
                {KEYMAP[shown - kbBase].toUpperCase()}
              </div>
            )}
          </div>
        );
        whiteCount++;
      } else {
        blackKeys.push(
          <div
            key={shown}
            data-midi={shown}
            className={`hw-key-b ${isDown ? "is-down" : ""}`}
            style={{
              ["--led" as string]: color,
              left: `${whiteCount * keyWidth - (keyWidth * 0.62) / 2}%`,
              width: `${keyWidth * 0.62}%`,
            }}
          >
            {shown >= kbBase && shown < kbBase + 18 && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] text-neutral-400">
                {KEYMAP[shown - kbBase].toUpperCase()}
              </div>
            )}
          </div>
        );
      }
    }

    return [...whiteKeys, ...blackKeys];
  };

  const filterFreq = 80 * Math.pow(20000 / 80, keys.cutoff);
  const filterDisplay = filterFreq >= 1000 ? `${(filterFreq / 1000).toFixed(1)}k` : `${Math.round(filterFreq)}`;

  const handleConfigure = (params: Partial<{
    root: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    loop: boolean;
    reverse: boolean;
    start: number;
    glide: number;
    mono: boolean;
    cutoff: number;
    reso: number;
  }>) => {
    keys.configure(params);
    setTick((n) => n + 1);
  };

  return (
    <div className="hw-panel flex flex-col gap-1.5">
      <div className="hw-brushed rounded-lg flex flex-wrap items-center gap-1.5 p-1.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">CLAVIER</div>
        <div className="hw-screen px-2 py-1 font-mono text-[10px] min-w-[180px]">
          <div>{keys.name || <span className="text-neutral-500">aucun son</span>}</div>
          <div>NOTE {last?.midi ? midiName(last.midi) : "—"} · VÉL {Math.round(vel * 100)} % · TRANSP {transpose >= 0 ? "+" : ""}{transpose}</div>
        </div>
        {current && (
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            title="Charger le son en cours dans le clavier"
            onClick={current.load}
          >
            ← {current.name.length > 24 ? `${current.name.slice(0, 21)}…` : current.name}
          </button>
        )}
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setBase((b) => Math.max(24, b - 12))}
        >
          OCT −
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setBase((b) => Math.min(72, b + 12))}
        >
          OCT +
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setTranspose((t) => Math.max(-12, t - 1))}
        >
          TRANSP −
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setTranspose((t) => Math.min(12, t + 1))}
        >
          TRANSP +
        </button>
        <div className="text-[10px] text-neutral-400">NOTE DE BASE</div>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => handleConfigure({ root: Math.max(24, keys.root - 1) })}
        >
          ◄
        </button>
        <div className="text-[10px] text-neutral-400">{midiName(keys.root)}</div>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => handleConfigure({ root: Math.min(96, keys.root + 1) })}
        >
          ►
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.mono ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => handleConfigure({ mono: !keys.mono })}
        >
          MONO
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.hold ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => { keys.setHold(!keys.hold); setTick((n) => n + 1); }}
        >
          HOLD
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.loop ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => handleConfigure({ loop: !keys.loop })}
        >
          BOUCLE
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.reverse ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => handleConfigure({ reverse: !keys.reverse })}
        >
          INVERSÉ
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold ml-auto"
          title="Afficher / masquer les réglages"
          onClick={() => setOpen(!open)}
        >
          OPTIONS {open ? "▾" : "▴"}
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          title={folded ? "Déplier le clavier" : "Replier le clavier"}
          onClick={() => setFolded(!folded)}
        >
          {folded ? "▴" : "▾"}
        </button>
      </div>

      {!keys.loaded && (
        <div className="text-[11px] text-neutral-500 p-1.5">
          Aucun son : touche CLAVIER sur un son, un stem ou un son de la banque.
        </div>
      )}

      {!folded && (
        <>
          {open && (
            <div className="hw-recess flex flex-wrap items-center gap-2 p-1.5">
              <Knob
                label="Vélocité"
                value={vel}
                min={0.1}
                max={1}
                defaultValue={0.8}
                onChange={(v) => setVel(v)}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 100)} %`}
              />
              <Knob
                label="Attaque"
                value={keys.attack}
                min={0}
                max={2}
                defaultValue={0.005}
                onChange={(v) => handleConfigure({ attack: v })}
                color={color}
                size={34}
                led
                format={(v) => v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`}
              />
              <Knob
                label="Déclin"
                value={keys.decay}
                min={0.01}
                max={3}
                defaultValue={0.3}
                onChange={(v) => handleConfigure({ decay: v })}
                color={color}
                size={34}
                led
                format={(v) => `${v.toFixed(2)} s`}
              />
              <Knob
                label="Maintien"
                value={keys.sustain}
                min={0}
                max={1}
                defaultValue={1}
                onChange={(v) => handleConfigure({ sustain: v })}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 100)} %`}
              />
              <Knob
                label="Relâche"
                value={keys.release}
                min={0.005}
                max={4}
                defaultValue={0.25}
                onChange={(v) => handleConfigure({ release: v })}
                color={color}
                size={34}
                led
                format={(v) => v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`}
              />
              <Knob
                label="Filtre"
                value={keys.cutoff}
                min={0}
                max={1}
                defaultValue={1}
                onChange={(v) => handleConfigure({ cutoff: v })}
                color={color}
                size={34}
                led
                format={() => filterDisplay}
              />
              <Knob
                label="Réso"
                value={keys.reso}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => handleConfigure({ reso: v })}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 100)} %`}
              />
              <Knob
                label="Glide"
                value={keys.glide}
                min={0}
                max={1}
                defaultValue={0}
                onChange={(v) => handleConfigure({ glide: v })}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 1000)} ms`}
              />
              <Knob
                label="Début"
                value={keys.start}
                min={0}
                max={0.95}
                defaultValue={0}
                onChange={(v) => handleConfigure({ start: v })}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 100)} %`}
              />
              <Knob
                label="Volume"
                value={volume}
                min={0}
                max={1.5}
                defaultValue={0.9}
                onChange={(v) => { setVolume(v); keys.setVolume(v); }}
                color={color}
                size={34}
                led
                format={(v) => `${Math.round(v * 100)} %`}
              />
              <div className="text-[9px] text-neutral-500">
                Clavier d&apos;ordinateur : A W S E D F T G Y H U J K O L P ; &apos; · Z / X octave · C / V vélocité · plus bas sur la touche = plus fort
              </div>
            </div>
          )}

          <div className="flex gap-1">
            <div className="hw-cheek w-[14px] shrink-0" />
            <div
              className="hw-keybed relative flex-1 select-none touch-none"
              style={{ height: 120 }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
            >
              {renderKeys()}
            </div>
            <div className="hw-cheek w-[14px] shrink-0" />
          </div>
        </>
      )}
    </div>
  );
}
