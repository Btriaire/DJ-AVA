"use client";

import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { SfxId } from "@/lib/audio/SoundFX";
import { Knob } from "./Knob";
import { PerfPad } from "./PerfPad";

type Deck = DJEngine["deckA"];
type Side = "A" | "B";
type Ingredients = { filter: boolean; riser: boolean; bass: boolean; kick: boolean; roll: boolean; vocal: boolean; wash: boolean; gate: boolean; cymbal: boolean; snare: boolean };
type DropStyle = "classic" | "silence" | "brake" | "echo" | "reverse" | "stutter" | "slam" | "swap" | "double";
const KICK_HP = 0.42;
const STORE = "djsynth.montee.v1";
const INGREDIENTS: { id: keyof Ingredients; label: string; title: string; stems?: boolean }[] = [
  { id: "filter", label: "FILTRE", title: "Le filtre de la platine monte en passe-haut : le grave s'en va" },
  { id: "riser", label: "SOUFFLE", title: "Un souffle (riser) monte en fréquence et en volume jusqu'au drop" },
  { id: "bass", label: "BASSE", title: "Le stem basse est coupé pendant la montée et revient sur le drop", stems: true },
  { id: "kick", label: "KICK", title: "Le kick disparaît pendant la montée (passe-haut sur le stem batterie) et revient sur le drop", stems: true },
  { id: "roll", label: "ROULEMENT", title: "Fin de montée en roulement qui accélère : la batterie seule si les stems sont actifs, sinon tout le son" },
  { id: "vocal", label: "VOIX", title: "La voix se répète en boucles de plus en plus courtes sur la fin de la montée", stems: true },
  { id: "wash", label: "LAVAGE", title: "La réverbération monte jusqu'au drop puis se coupe net (sa queue continue)" },
  { id: "gate", label: "HACHÉ", title: "Le son est haché en doubles-croches sur la deuxième moitié de la montée" },
  { id: "cymbal", label: "CYMBALE", title: "Une cymbale inversée qui monte et finit pile sur le drop" },
  { id: "snare", label: "CAISSE CLAIRE", title: "Un roulement de caisse claire qui accélère jusqu'au drop" },
];
const DROPS: { id: DropStyle; label: string; title: string }[] = [
  { id: "classic", label: "CLASSIQUE", title: "Tout revient d'un coup, pile sur le temps" },
  { id: "silence", label: "SILENCE", title: "Le dernier temps est muet : le drop frappe plus fort" },
  { id: "brake", label: "FREIN", title: "Frein vinyle sur le dernier temps, puis le drop" },
  { id: "echo", label: "ÉCHO", title: "Le son s'arrête et ses échos remplissent le dernier temps" },
  { id: "reverse", label: "REVERSE", title: "Le dernier temps est rejoué à l'envers, comme un rembobinage" },
  { id: "stutter", label: "BÉGAIEMENT", title: "Le dernier temps bégaie en doubles-croches, puis le drop" },
  { id: "slam", label: "SLAM", title: "Le son s'étouffe sur le dernier temps puis s'ouvre d'un coup sur le drop" },
  { id: "swap", label: "BASCULE", title: "Le drop part sur l'autre platine : crossfader d'un coup ; elle démarre à son CUE si elle est arrêtée" },
  { id: "double", label: "DOUBLE", title: "L'autre platine part en même temps (à son CUE si elle est arrêtée), crossfader au centre" },
];
const LENGTHS = [4, 8, 16, 32] as const;
type Len = (typeof LENGTHS)[number];
const RISER_BEAT: Record<Len, number> = { 4: 7, 8: 8, 16: 9, 32: 9 };
const FILTER_TOP = 0.7;
const RISER_LEVEL = 0.7;
const RELEASES = [0.25, 0.5, 1] as const;
const SIDE_COLOR: Record<Side, string> = { A: "#38bdf8", B: "#f59e0b" };
type DropFx = "none" | "impact" | Extract<SfxId, "subdrop" | "explosion" | "airhorn" | "siren" | "laser">;
type Settings = { len: Len; ing: Ingredients; drop: DropStyle; dropFx: DropFx; autoDrop: boolean; pumpDepth: number; pumpRel: (typeof RELEASES)[number]; pumpOnDrop: boolean };
const DROP_FX: { id: DropFx; label: string; title: string }[] = [
  { id: "none", label: "AUCUN", title: "Pas de son ajouté sur le drop" },
  { id: "impact", label: "IMPACT", title: "Boum de sub et souffle pile sur le drop" },
  { id: "subdrop", label: "SUB", title: "Sub qui plonge" },
  { id: "explosion", label: "EXPLOSION", title: "Explosion de bruit" },
  { id: "airhorn", label: "CORNE", title: "Corne de brume" },
  { id: "siren", label: "SIRÈNE", title: "Sirène" },
  { id: "laser", label: "LASER", title: "Laser" },
];
const OFF_ING: Ingredients = { filter: false, riser: false, bass: false, kick: false, roll: false, vocal: false, wash: false, gate: false, cymbal: false, snare: false };
const RECIPES: { id: string; label: string; title: string; len: Len; ing: Partial<Ingredients>; drop: DropStyle; dropFx: DropFx }[] = [
  { id: "house", label: "HOUSE", title: "Filtre, souffle et basse coupée sur 8 temps, retour classique avec impact", len: 8, ing: { filter: true, riser: true, bass: true }, drop: "classic", dropFx: "impact" },
  { id: "techno", label: "TECHNO", title: "Kick coupé, son haché et souffle sur 16 temps, dernier temps muet, sub", len: 16, ing: { kick: true, gate: true, riser: true }, drop: "silence", dropFx: "subdrop" },
  { id: "edm", label: "EDM", title: "Filtre, souffle, roulement, caisse claire et basse coupée sur 8 temps, explosion", len: 8, ing: { filter: true, riser: true, roll: true, snare: true, bass: true }, drop: "classic", dropFx: "explosion" },
  { id: "trance", label: "TRANCE", title: "Lavage de réverbération, souffle, filtre et cymbale sur 32 temps, slam", len: 32, ing: { wash: true, riser: true, filter: true, cymbal: true }, drop: "slam", dropFx: "impact" },
  { id: "hiphop", label: "HIP-HOP", title: "Voix en boucle et basse coupée sur 4 temps, frein vinyle et corne", len: 4, ing: { vocal: true, bass: true }, drop: "brake", dropFx: "airhorn" },
];
const DEFAULTS: Settings = { len: 8, ing: { filter: true, riser: true, bass: true, kick: false, roll: false, vocal: false, wash: false, gate: false, cymbal: false, snare: false }, drop: "classic", dropFx: "none", autoDrop: true, pumpDepth: 0.6, pumpRel: 0.5, pumpOnDrop: false };
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<Settings> & { impact?: boolean };
    const len: Len = s.len !== undefined && (LENGTHS as readonly number[]).includes(s.len) ? s.len : DEFAULTS.len;
    const dropFx = s.impact && !s.dropFx ? "impact" : s.dropFx ?? DEFAULTS.dropFx;
    return { ...DEFAULTS, ...s, len, dropFx, ing: { ...DEFAULTS.ing, ...(s.ing ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}
type Snapshot = { filter: number; riserBeat: number; rollBeat: number; bassIdx: number; bassVol: number; drumsIdx: number; drumsFilter: number; echoBeat: number; echoP1: number; brakeP1: number; reverseBeat: number; vocalsIdx: number; washWet: number; gateWet: number; gateBeat: number };
type Run = { deck: Deck; other: Deck; t0: number; spb: number; beats: number; snap: Snapshot; timers: number[]; use: Ingredients; drop: DropStyle; dropFx: DropFx; pumpOnDrop: boolean; stemRoll: boolean; fxRoll: boolean; vocalRoll: boolean };

const hasPreDrop = (d: DropStyle) => d !== "classic" && d !== "swap" && d !== "double";
const sameIng = (a: Ingredients, b: Ingredients) => INGREDIENTS.every(({ id }) => a[id] === b[id]);

function restore(run: Run) {
  run.timers.forEach((t) => clearTimeout(t));
  run.timers = [];
  const { deck, snap, use } = run;
  const rack = deck.fxRack;
  if (use.filter || run.drop === "slam") deck.setFilter(snap.filter);
  if (use.riser) {
    rack.setWet("noise", 0);
    rack.setBeat("noise", snap.riserBeat);
  }
  if (run.fxRoll || run.drop === "stutter") {
    rack.setWet("roll", 0);
    rack.setBeat("roll", snap.rollBeat);
  }
  if (use.bass && snap.bassIdx >= 0) deck.setStemVol(snap.bassIdx, snap.bassVol);
  if (snap.drumsIdx >= 0) {
    if (use.kick) deck.setStemFilter(snap.drumsIdx, snap.drumsFilter);
    if (run.stemRoll) deck.clearStemLoop(snap.drumsIdx);
  }
  if (run.vocalRoll && snap.vocalsIdx >= 0) deck.clearStemLoop(snap.vocalsIdx);
  if (use.wash) rack.setWet("reverb", snap.washWet);
  if (use.gate) {
    rack.setWet("gate", snap.gateWet);
    rack.setBeat("gate", snap.gateBeat);
  }
  if (run.drop === "silence") deck.setHold("out", false);
  if (run.drop === "brake") {
    rack.setWet("brake", 0);
    rack.setParam("brake", "p1", snap.brakeP1);
  }
  if (run.drop === "echo") {
    deck.setHold("fxin", false);
    rack.setWet("echo", 0);
    rack.setBeat("echo", snap.echoBeat);
    rack.setParam("echo", "p1", snap.echoP1);
  }
  if (run.drop === "reverse") {
    rack.setWet("reverse", 0);
    rack.setBeat("reverse", snap.reverseBeat);
  }
}

function preDrop(run: Run) {
  const { deck } = run;
  const rack = deck.fxRack;
  if (run.drop === "silence") deck.setHold("out", true);
  else if (run.drop === "brake") {
    rack.setParam("brake", "p1", Math.min(1, Math.max(0, (run.spb * 1000 - 250) / 2250)));
    rack.setWet("brake", 1);
  } else if (run.drop === "echo") {
    rack.setBeat("echo", 3);
    rack.setParam("echo", "p1", 0.55);
    rack.setWet("echo", 0.9);
    deck.setHold("fxin", true);
  } else if (run.drop === "reverse") {
    rack.setBeat("reverse", 5);
    rack.setWet("reverse", 1);
  } else if (run.drop === "stutter") {
    rack.setBeat("roll", 0);
    rack.setWet("roll", 1);
  } else if (run.drop === "slam") {
    deck.rampFilter(-0.85, run.spb);
  }
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
  const [cfg, setCfg] = useState<Settings>(loadSettings);
  const [pumpOn, setPumpOn] = useState(false);
  const [phase, setPhase] = useState<"idle" | "armed" | "build" | "pre" | "top" | "drop">("idle");
  const [view, setView] = useState({ done: 0, beat: -1, playing: false, bpm: 0 });
  const run = useRef<Run | null>(null);
  const deck = side === "A" ? engine.deckA : engine.deckB;
  const other = side === "A" ? engine.deckB : engine.deckA;
  const color = SIDE_COLOR[side];

  const update = (patch: Partial<Settings>) => setCfg((c) => ({ ...c, ...patch }));
  const toggleIng = (id: keyof Ingredients) => setCfg((c) => ({ ...c, ing: { ...c.ing, [id]: !c.ing[id] } }));
  const flip = (k: "autoDrop") => setCfg((c) => ({ ...c, [k]: !c[k] }));

  // remember the settings
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(cfg));
    } catch {}
  }, [cfg]);

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
    deck.setStemPump(pumpOn, cfg.pumpDepth, cfg.pumpRel);
    return () => deck.setStemPump(false);
  }, [deck, pumpOn, cfg.pumpDepth, cfg.pumpRel]);

  useEffect(() => () => stopRun(run), [deck]);

  const dropNow = () => {
    const r = run.current;
    stopRun(run);
    if (r && r.dropFx !== "none") {
      if (r.dropFx === "impact") engine.keyPad.impact();
      else engine.soundFx.trigger(r.dropFx);
    }
    if ((r?.drop === "swap" || r?.drop === "double") && r.other.audioBuffer) {
      if (!r.other.playing) {
        r.other.seek(r.other.cuePoint);
        r.other.play();
      }
      engine.setCrossfade(r.drop === "double" ? 0.5 : r.deck === engine.deckA ? 1 : 0);
    }
    if (r?.pumpOnDrop && r.deck.stemsActive) setPumpOn(true);
    setPhase("drop");
    window.setTimeout(() => setPhase((p) => (p === "drop" ? "idle" : p)), 600);
  };

  const startBuild = () => {
    const c = deck.fxClock();
    if (!c || !c.playing || !c.bpm) return;
    const spb = 60 / c.bpm;
    const rack = deck.fxRack;
    const bassIdx = deck.stemsActive ? deck.stemNames.indexOf("bass") : -1;
    const drumsIdx = deck.stemsActive ? deck.stemNames.indexOf("drums") : -1;
    const vocalsIdx = deck.stemsActive ? deck.stemNames.indexOf("vocals") : -1;
    const r: Run = {
      deck,
      other,
      t0: performance.now() + c.toNextBeat * 1000,
      spb,
      beats: cfg.len,
      snap: {
        filter: deck.filterPos,
        riserBeat: rack.getBeat("noise"),
        rollBeat: rack.getBeat("roll"),
        bassIdx,
        bassVol: bassIdx >= 0 ? (deck.stemVol[bassIdx] ?? 1) : 1,
        drumsIdx,
        drumsFilter: drumsIdx >= 0 ? (deck.stemFilterX[drumsIdx] ?? 0) : 0,
        echoBeat: rack.getBeat("echo"),
        echoP1: rack.getParam("echo", "p1"),
        brakeP1: rack.getParam("brake", "p1"),
        reverseBeat: rack.getBeat("reverse"),
        vocalsIdx,
        washWet: rack.getWet("reverb"),
        gateWet: rack.getWet("gate"),
        gateBeat: rack.getBeat("gate"),
      },
      timers: [],
      use: { ...cfg.ing },
      drop: cfg.drop,
      dropFx: cfg.dropFx,
      pumpOnDrop: cfg.pumpOnDrop,
      stemRoll: cfg.ing.roll && drumsIdx >= 0,
      fxRoll: cfg.ing.roll && drumsIdx < 0,
      vocalRoll: cfg.ing.vocal && vocalsIdx >= 0,
    };
    const auto = cfg.autoDrop;
    const n = cfg.len;
    const at = (beats: number, fn: () => void) => {
      r.timers.push(window.setTimeout(fn, Math.max(0, c.toNextBeat + beats * spb) * 1000));
    };

    at(0, () => {
      if (r.use.bass && bassIdx >= 0) deck.setStemVol(bassIdx, 0);
      if (r.use.kick && drumsIdx >= 0) deck.setStemFilter(drumsIdx, KICK_HP);
      if (r.use.filter) deck.rampFilter(FILTER_TOP, n * spb);
      setPhase("build");
    });

    if (r.use.riser) {
      const riserAt = n > 16 ? n - 16 : 0;
      at(riserAt, () => {
        rack.setBeat("noise", RISER_BEAT[n]);
        rack.setWet("noise", 0);
        rack.setWet("noise", RISER_LEVEL);
      });
    }

    if (r.use.wash) {
      for (let k = 0; k < n; k++) {
        at(k, () => rack.setWet("reverb", 0.15 + (0.6 * k) / n));
      }
    }

    if (r.use.gate) {
      at(Math.floor(n / 2), () => {
        rack.setBeat("gate", 0);
        rack.setWet("gate", 0.9);
      });
    }

    if (r.vocalRoll) {
      const vStages = n >= 8 ? [1, 0.5, 0.25] : [0.5, 0.25];
      vStages.forEach((b, k) => at(n - vStages.length + k, () => deck.setStemBeatLoop(vocalsIdx, b, { quantize: true })));
    }

    if (r.use.roll) {
      if (r.stemRoll) {
        const stages = n >= 8 ? [0.5, 0.25, 0.125] : [0.25, 0.125];
        stages.forEach((b, k) => at(n - stages.length + k, () => deck.setStemBeatLoop(drumsIdx, b, { quantize: true })));
      } else if (r.fxRoll) {
        rack.setBeat("roll", 1);
        at(n - 2, () => rack.setWet("roll", 1));
        at(n - 1, () => {
          rack.setBeat("roll", 0);
          rack.setWet("roll", 0);
          rack.setWet("roll", 1);
        });
      }
    }

    if (r.use.cymbal) {
      const dropAt = (c.toNextBeat + n * spb) * 1000;
      r.timers.push(window.setTimeout(() => engine.soundFx.trigger("revcymbal"), Math.max(0, dropAt - 1500)));
    }

    if (r.use.snare) {
      const dropAt = (c.toNextBeat + n * spb) * 1000;
      r.timers.push(window.setTimeout(() => engine.soundFx.trigger("snarebuild"), Math.max(0, dropAt - 2000)));
    }

    if (r.use && auto && hasPreDrop(r.drop)) {
      at(n - 1, () => {
        preDrop(r);
        setPhase("pre");
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
    let wait = c && c.playing ? c.toNextBeat : 0;
    if (wait < 0.15 * r.spb) wait += r.spb;
    if (hasPreDrop(r.drop)) {
      preDrop(r);
      setPhase("pre");
    }
    r.timers = [window.setTimeout(dropNow, wait * 1000)];
  };

  const changeSide = (s: Side) => {
    cancelBuild();
    setPumpOn(false);
    setSide(s);
  };

  const running = phase === "armed" || phase === "build" || phase === "pre" || phase === "top";
  const canBuild = view.playing && view.bpm > 0;
  const beatsShown = running ? view.done : 0;

  const stateText = (() => {
    switch (phase) {
      case "idle": return canBuild ? "Prêt" : "Lance la platine (tempo requis)";
      case "armed": return "Départ au prochain temps";
      case "build": return `Montée · temps ${Math.min(cfg.len, Math.floor(view.done) + 1)} / ${cfg.len}`;
      case "pre": return "DROP au prochain temps";
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
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">RECETTES</div>
        {RECIPES.map((x) => (
          <button
            key={x.id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.len === x.len && cfg.drop === x.drop && cfg.dropFx === x.dropFx && sameIng(cfg.ing, { ...OFF_ING, ...x.ing }) ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running}
            title={x.title}
            onClick={() => setCfg((c) => ({ ...c, len: x.len, ing: { ...OFF_ING, ...x.ing }, drop: x.drop, dropFx: x.dropFx }))}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="hw-recess p-2 flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">LONGUEUR</div>
        {LENGTHS.map((l) => (
          <button
            key={l}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.len === l ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running}
            onClick={() => update({ len: l })}
          >
            {l}
          </button>
        ))}
        <div className="text-[11px]">temps</div>
        <div className="h-6 w-px bg-white/10" />
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">MONTÉE</div>
        {INGREDIENTS.map(({ id, label, title, stems }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.ing[id] ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running || (stems && !deck.stemsActive)}
            title={stems && !deck.stemsActive ? "Active les stems de la platine pour cet ingrédient" : title}
            onClick={() => toggleIng(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="hw-recess p-2 flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">DROP</div>
        {DROPS.map(({ id, label, title }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.drop === id ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            disabled={running || ((id === "swap" || id === "double") && !other.audioBuffer)}
            title={(id === "swap" || id === "double") && !other.audioBuffer ? `Charge un morceau sur la platine ${side === "A" ? "B" : "A"} pour ${id === "swap" ? "basculer" : "doubler"}` : title}
            onClick={() => update({ drop: id })}
          >
            {label}
          </button>
        ))}
        <div className="h-6 w-px bg-white/10" />
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.autoDrop ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          title="À la fin de la montée, le drop part tout seul sur le temps"
          onClick={() => flip("autoDrop")}
        >
          DROP AUTO
        </button>
      </div>

      <div className="hw-recess p-2 flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">SON AU DROP</div>
        {DROP_FX.map(({ id, label, title }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.dropFx === id ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            onClick={() => update({ dropFx: id })}
            title={title}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-[3px]">
        {Array.from({ length: cfg.len }).map((_, k) => (
          <div
            key={k}
            className="h-3 flex-1 rounded-sm"
            style={{
              backgroundColor: segColor(k, cfg.len),
              opacity: k < Math.floor(beatsShown) ? 1 : k === Math.floor(beatsShown) && running ? 0.55 : 0.1,
            }}
          />
        ))}
        <div className="text-[11px] font-bold w-44 text-right" style={{ color }}>{stateText}</div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <PerfPad
          label={running ? "ANNULER" : "MONTÉE"}
          sub={running ? "tout revient" : `${cfg.len} temps`}
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
          lit={phase === "top" || phase === "pre"}
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
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.pumpOnDrop ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          title="La pompe s'allume toute seule sur le drop"
          onClick={() => setCfg((c) => ({ ...c, pumpOnDrop: !c.pumpOnDrop }))}
        >
          AU DROP
        </button>
        <Knob
          label="Profondeur"
          value={cfg.pumpDepth}
          min={0}
          max={1}
          defaultValue={0.6}
          onChange={(v) => update({ pumpDepth: v })}
          color={color}
          size={40}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500">RELÂCHE</div>
        {RELEASES.map((r) => (
          <button
            key={r}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${cfg.pumpRel === r ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            onClick={() => update({ pumpRel: r })}
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
