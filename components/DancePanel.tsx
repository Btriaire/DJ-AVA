import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { Knob } from "./Knob";
import { PerfPad } from "./PerfPad";

type Deck = DJEngine["deckA"];
type Side = "A" | "B";
type Ingredients = { filter: boolean; riser: boolean; bass: boolean; roll: boolean };
const LENGTHS = [4, 8, 16] as const;
type Len = (typeof LENGTHS)[number];
const RISER_BEAT: Record<Len, number> = { 4: 7, 8: 8, 16: 9 };
const FILTER_TOP = 0.7;
const RISER_LEVEL = 0.7;
const RELEASES = [0.25, 0.5, 1] as const;
const SIDE_COLOR: Record<Side, string> = { A: "#38bdf8", B: "#f59e0b" };
const INGREDIENTS: { id: keyof Ingredients; label: string; title: string }[] = [
  { id: "filter", label: "FILTRE", title: "Le filtre de la platine monte en passe-haut : le grave s'en va" },
  { id: "riser", label: "SOUFFLE", title: "Un souffle (riser) monte en fréquence et en volume jusqu'au drop" },
  { id: "bass", label: "BASSE", title: "Le stem basse est coupé pendant la montée et revient sur le drop (stems actifs)" },
  { id: "roll", label: "ROULEMENT", title: "Les 2 derniers temps se répètent en accélérant (1/8 puis 1/16)" },
];
type Snapshot = { filter: number; riserBeat: number; rollBeat: number; bassIdx: number; bassVol: number };
type Run = { deck: Deck; t0: number; spb: number; beats: number; snap: Snapshot; timers: number[] };

function restore(run: Run) {
  run.timers.forEach((t) => clearTimeout(t));
  run.timers = [];
  const { deck, snap } = run;
  const rack = deck.fxRack;
  deck.setFilter(snap.filter);
  rack.setWet("noise", 0);
  rack.setBeat("noise", snap.riserBeat);
  rack.setWet("roll", 0);
  rack.setBeat("roll", snap.rollBeat);
  if (snap.bassIdx >= 0) deck.setStemVol(snap.bassIdx, snap.bassVol);
}

function stopRun(ref: { current: Run | null }) {
  const r = ref.current;
  if (!r) return;
  ref.current = null;
  restore(r);
}

function segColor(k: number, n: number): string {
  const t = n > 1 ? k / (n - 1) : 1;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(245, 239)}, ${mix(158, 68)}, ${mix(11, 68)})`;
}

export function DancePanel({ engine }: { engine: DJEngine }) {
  const [side, setSide] = useState<Side>("A");
  const [len, setLen] = useState<Len>(8);
  const [ing, setIng] = useState<Ingredients>({ filter: true, riser: true, bass: true, roll: false });
  const [autoDrop, setAutoDrop] = useState(true);
  const [pumpOn, setPumpOn] = useState(false);
  const [pumpDepth, setPumpDepth] = useState(0.6);
  const [pumpRel, setPumpRel] = useState<typeof RELEASES[number]>(0.5);
  const [phase, setPhase] = useState<"idle" | "armed" | "build" | "top" | "drop">("idle");
  const [view, setView] = useState({ done: 0, beat: -1, playing: false, bpm: 0 });
  const run = useRef<Run | null>(null);
  const deck = side === "A" ? engine.deckA : engine.deckB;
  const color = SIDE_COLOR[side];

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = deck.fxClock();
      const r = run.current;
      setView({
        done: r ? Math.max(0, Math.min(r.beats, (performance.now() - r.t0) / (r.spb * 1000))) : 0,
        beat: c && c.playing ? ((((c.nextBeat ?? 1) - 1) % 4) + 4) % 4 : -1,
        playing: !!c?.playing,
        bpm: c ? c.bpm : 0,
      });
    }, 60);
    return () => clearInterval(id);
  }, [deck]);

  useEffect(() => {
    deck.setStemPump(pumpOn, pumpDepth, pumpRel);
    return () => deck.setStemPump(false);
  }, [deck, pumpOn, pumpDepth, pumpRel]);

  useEffect(() => () => stopRun(run), [deck]);

  const dropNow = () => {
    stopRun(run);
    setPhase("drop");
    window.setTimeout(() => setPhase((p) => (p === "drop" ? "idle" : p)), 600);
  };

  const startBuild = () => {
    const c = deck.fxClock();
    if (!c || !c.playing || !c.bpm) return;
    const spb = 60 / c.bpm;
    const rack = deck.fxRack;
    const bassIdx = deck.stemsActive ? deck.stemNames.indexOf("bass") : -1;
    const r: Run = {
      deck,
      t0: performance.now() + c.toNextBeat * 1000,
      spb,
      beats: len,
      snap: { filter: deck.filterPos, riserBeat: rack.getBeat("noise"), rollBeat: rack.getBeat("roll"), bassIdx, bassVol: bassIdx >= 0 ? (deck.stemVol[bassIdx] ?? 1) : 1 },
      timers: [],
    };
    const use = { ...ing };
    const auto = autoDrop;
    const n = len;
    const at = (beats: number, fn: () => void) => {
      r.timers.push(window.setTimeout(fn, Math.max(0, c.toNextBeat + beats * spb) * 1000));
    };
    if (use.roll) rack.setBeat("roll", 1);
    at(0, () => {
      if (use.bass && bassIdx >= 0) deck.setStemVol(bassIdx, 0);
      if (use.riser) {
        rack.setBeat("noise", RISER_BEAT[n]);
        rack.setWet("noise", 0);
        rack.setWet("noise", RISER_LEVEL);
      }
      if (use.filter) deck.rampFilter(FILTER_TOP, n * spb);
      setPhase("build");
    });
    if (use.roll) {
      at(n - 2, () => rack.setWet("roll", 1));
      at(n - 1, () => {
        rack.setBeat("roll", 0);
        rack.setWet("roll", 0);
        rack.setWet("roll", 1);
      });
    }
    at(n, () => (auto ? dropNow() : setPhase("top")));
    run.current = r;
    setPhase("armed");
  };

  const cancelBuild = () => {
    stopRun(run);
    setPhase("idle");
  };

  const dropOnBeat = () => {
    const r = run.current;
    if (!r) return;
    r.timers.forEach(clearTimeout);
    const c = r.deck.fxClock();
    r.timers = [window.setTimeout(dropNow, (c && c.playing ? c.toNextBeat : 0) * 1000)];
  };

  const changeSide = (s: Side) => {
    cancelBuild();
    setPumpOn(false);
    setSide(s);
  };

  const running = phase === "armed" || phase === "build" || phase === "top";
  const canBuild = view.playing && view.bpm > 0;
  const beatsShown = running ? view.done : 0;

  const stateText = (() => {
    switch (phase) {
      case "idle": return canBuild ? "Prêt" : "Lance la platine (tempo requis)";
      case "armed": return "Départ au prochain temps";
      case "build": return `Montée · temps ${Math.min(len, Math.floor(view.done) + 1)} / ${len}`;
      case "top": return "En haut · appuie sur DROP";
      case "drop": return "DROP";
      default: return "";
    }
  })();

  return (
    <div className="hw-panel hw-screwed flex flex-col gap-3 p-3">
      <div className="hw-brushed rounded-lg flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <div className="text-xs font-black tracking-[0.25em]" style={{ color }}>MONTÉE & DROP</div>
          <div className="text-[10px] text-neutral-400">Monte la tension sur N temps, puis le drop retombe pile sur le temps.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${side === "A" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: SIDE_COLOR.A }}
            onClick={() => changeSide("A")}
          >
            PLATINE A
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${side === "B" ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: SIDE_COLOR.B }}
            onClick={() => changeSide("B")}
          >
            PLATINE B
          </button>
          <div className="text-[10px] font-mono text-neutral-400">{view.bpm ? view.bpm.toFixed(1) : "--"} BPM</div>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`rounded-full ${i === 0 ? "h-2.5 w-2.5" : "h-2 w-2"}`}
                style={{
                  backgroundColor: view.beat === i ? color : "#26262b",
                  boxShadow: view.beat === i ? `0 0 6px ${color}` : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="hw-recess p-2 flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">LONGUEUR</div>
        {LENGTHS.map((l) => (
          <button
            key={l}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${len === l ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running}
            onClick={() => setLen(l)}
          >
            {l}
          </button>
        ))}
        <div className="text-[11px]">temps</div>
        <div className="h-6 w-px bg-white/10" />
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">INGRÉDIENTS</div>
        {INGREDIENTS.map(({ id, label, title }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${ing[id] ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running || (id === "bass" && !deck.stemsActive)}
            title={id === "bass" && !deck.stemsActive ? "Active les stems de la platine pour couper la basse" : title}
            onClick={() => setIng({ ...ing, [id]: !ing[id] })}
          >
            {label}
          </button>
        ))}
        <div className="h-6 w-px bg-white/10" />
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${autoDrop ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          title="À la fin de la montée, le drop part tout seul sur le temps"
          onClick={() => setAutoDrop(!autoDrop)}
        >
          DROP AUTO
        </button>
      </div>

      <div className="flex gap-[3px]">
        {Array.from({ length: len }).map((_, k) => (
          <div
            key={k}
            className="h-3 flex-1 rounded-sm"
            style={{
              backgroundColor: segColor(k, len),
              opacity: k < Math.floor(beatsShown) ? 1 : k === Math.floor(beatsShown) && running ? 0.55 : 0.1,
            }}
          />
        ))}
        <div className="text-[11px] font-bold w-44 text-right" style={{ color }}>{stateText}</div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <PerfPad
          label={running ? "ANNULER" : "MONTÉE"}
          sub={running ? "tout revient" : `${len} temps`}
          color={color}
          active={running}
          height={54}
          disabled={!running && !canBuild}
          onDown={running ? cancelBuild : startBuild}
        />
        <PerfPad
          label="DROP"
          sub="sur le temps"
          color="#ef4444"
          lit={phase === "top"}
          active={phase === "drop"}
          height={54}
          disabled={!running}
          onDown={dropOnBeat}
        />
      </div>

      <div className="hw-recess p-2 flex flex-wrap items-center gap-3">
        <div className="text-[11px] font-bold">POMPE</div>
        <div className="text-[10px] text-neutral-400">Les stems (sauf la batterie) respirent sur chaque temps</div>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${pumpOn ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          disabled={!deck.stemsActive}
          onClick={() => setPumpOn(!pumpOn)}
        >
          {pumpOn ? "MARCHE" : "ARRÊT"}
        </button>
        <Knob
          label="Profondeur"
          value={pumpDepth}
          min={0}
          max={1}
          defaultValue={0.6}
          onChange={setPumpDepth}
          color={color}
          size={40}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">RELÂCHE</div>
        {RELEASES.map((r) => (
          <button
            key={r}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${pumpRel === r ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            onClick={() => setPumpRel(r)}
          >
            {r === 0.25 ? "1/4" : r === 0.5 ? "1/2" : "1"}
          </button>
        ))}
        {!deck.stemsActive && (
          deck.stemReady ? (
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              style={{ ["--led" as string]: color }}
              onClick={() => deck.setStemsActive(true)}
            >
              ACTIVER LES STEMS
            </button>
          ) : (
            <div className="text-[10px] text-amber-300">Prépare les stems de la platine {side} pour la pompe et la basse</div>
          )
        )}
      </div>
    </div>
  );
}
