"use client";

import { useState } from "react";
import * as se from "@/lib/atelier/stemEdit";
import * as ed from "@/lib/atelier/edit";
import type { Region } from "@/lib/atelier/types";

export function StemEditPanel({
  buf,
  region,
  bpm,
  color,
  busy,
  canUndo,
  onEdit,
  onUndo,
}: {
  buf: AudioBuffer;
  region: Region | null;
  bpm: number;
  color: string;
  busy: boolean;
  canUndo: boolean;
  onEdit: (label: string, run: (buf: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer) => void;
  onUndo: () => void;
}) {
  const r: Region = region ?? { a: 0, b: buf.duration };
  const [gain, setGain] = useState(0);
  const [fade, setFade] = useState<"lin" | "exp" | "log" | "s">("lin");
  const [gate, setGate] = useState(-40);
  const [strip, setStrip] = useState(-50);
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio, setCompRatio] = useState(4);
  const [compMakeup, setCompMakeup] = useState(3);
  const [limit, setLimit] = useState(-1);
  const [transientAttack, setTransientAttack] = useState(0);
  const [transientSustain, setTransientSustain] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);

  const formatTime = (s: number) => {
    const minutes = Math.floor(s / 60);
    const seconds = (s % 60).toFixed(1);
    return `${minutes}:${seconds.padStart(4, "0")}`;
  };

  return (
    <div className="hw-well flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">OUTILS DU STEM</p>
          <p className="text-[10px] text-neutral-500">
            Portée : {region ? `${formatTime(r.a)} – ${formatTime(r.b)}` : "tout le stem"}
          </p>
        </div>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={!canUndo || busy}
          onClick={onUndo}
        >
          ANNULER
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">DÉCOUPE · SYNCHRO GARDÉE</p>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Garde la portée, silence ailleurs : le stem reste calé sur les autres"
          onClick={() => onEdit("Rogner", (b) => se.keepOnly(b, r))}
        >
          ROGNER
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Couper", (b) => se.silence(b, r))}
        >
          COUPER
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Comme Beat Repeat d'Ableton"
          onClick={() => onEdit("Répéter 1/2", (b) => se.beatRepeat(b, r, 2))}
        >
          RÉPÉTER 1/2
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Comme Beat Repeat d'Ableton"
          onClick={() => onEdit("Répéter 1/4", (b) => se.beatRepeat(b, r, 4))}
        >
          RÉPÉTER 1/4
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Comme Beat Repeat d'Ableton"
          onClick={() => onEdit("Répéter 1/8", (b) => se.beatRepeat(b, r, 8))}
        >
          RÉPÉTER 1/8
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Comme Beat Repeat d'Ableton"
          onClick={() => onEdit("Répéter 1/16", (b) => se.beatRepeat(b, r, 16))}
        >
          RÉPÉTER 1/16
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy || bpm <= 0}
          onClick={() => onEdit("Décaler −1 temps", (b) => se.shift(b, -(60 / bpm)))}
        >
          −1 TEMPS
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Décaler −10 ms", (b) => se.shift(b, -0.01))}
        >
          −10 MS
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Décaler +10 ms", (b) => se.shift(b, 0.01))}
        >
          +10 MS
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy || bpm <= 0}
          onClick={() => onEdit("Décaler +1 temps", (b) => se.shift(b, 60 / bpm))}
        >
          +1 TEMPS
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" style={{ color }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">NIVEAUX</p>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">GAIN</p>
          <input
            type="range"
            min={-24}
            max={24}
            step={0.5}
            value={gain}
            onChange={(e) => setGain(parseFloat(e.target.value))}
            className="w-24 accent-current"
          />
          <p className="text-[10px]">{gain.toFixed(1)} dB</p>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Gain", (b) => se.gain(b, r, gain))}
          >
            APPLIQUER
          </button>
        </div>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Normaliser", (b) => se.normalize(b, r, -1))}
        >
          NORMALISER
        </button>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">FONDU</p>
          <select
            value={fade}
            onChange={(e) => setFade(e.target.value as "lin" | "exp" | "log" | "s")}
            className="hw-well bg-transparent px-1 py-0.5 text-[10px] text-neutral-200"
          >
            <option value="lin">Linéaire</option>
            <option value="exp">Expo</option>
            <option value="log">Log</option>
            <option value="s">En S</option>
          </select>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Fondu entrée", (b) => se.fade(b, r, "in", fade))}
          >
            FONDU ENTRÉE
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Fondu sortie", (b) => se.fade(b, r, "out", fade))}
          >
            FONDU SORTIE
          </button>
        </div>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Inverser", (b) => se.reverse(b, r))}
        >
          INVERSER
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Polarité", (b) => se.invertPolarity(b, r))}
        >
          POLARITÉ
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onEdit("Mono", (b) => se.mono(b, r))}
        >
          MONO
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          title="Retire le décalage DC (Audition)"
          onClick={() => onEdit("DC", (b) => se.removeDC(b))}
        >
          DC
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" style={{ color }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">DYNAMIQUE</p>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">GATE</p>
          <input
            type="range"
            min={-80}
            max={0}
            step={1}
            value={gate}
            onChange={(e) => setGate(parseInt(e.target.value))}
            className="w-24 accent-current"
          />
          <p className="text-[10px]">{gate} dB</p>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            title="Noise gate : coupe ce qui est sous le seuil"
            onClick={() => onEdit("Gate", (b) => se.gate(b, r, gate))}
          >
            APPLIQUER
          </button>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">SUPPR. SILENCES</p>
          <input
            type="range"
            min={-80}
            max={-20}
            step={1}
            value={strip}
            onChange={(e) => setStrip(parseInt(e.target.value))}
            className="w-24 accent-current"
          />
          <p className="text-[10px]">{strip} dB</p>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            title="Comme Strip Silence de Logic, sans changer la durée"
            onClick={() => onEdit("Supprimer silences", (b) => se.stripSilence(b, strip, 250))}
          >
            APPLIQUER
          </button>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">COMPRESSEUR</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Seuil</p>
              <input
                type="range"
                min={-60}
                max={0}
                step={1}
                value={compThreshold}
                onChange={(e) => setCompThreshold(parseInt(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{compThreshold} dB</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Ratio</p>
              <input
                type="range"
                min={1}
                max={20}
                step={0.1}
                value={compRatio}
                onChange={(e) => setCompRatio(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{compRatio.toFixed(1)}</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Gain</p>
              <input
                type="range"
                min={0}
                max={12}
                step={0.1}
                value={compMakeup}
                onChange={(e) => setCompMakeup(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{compMakeup.toFixed(1)} dB</p>
            </div>
          </div>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Compresseur", (b) => se.compress(b, r, { thresholdDb: compThreshold, ratio: compRatio, attackMs: 10, releaseMs: 120, makeupDb: compMakeup }))}
          >
            APPLIQUER
          </button>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">LIMITEUR</p>
          <input
            type="range"
            min={-12}
            max={0}
            step={0.1}
            value={limit}
            onChange={(e) => setLimit(parseFloat(e.target.value))}
            className="w-24 accent-current"
          />
          <p className="text-[10px]">{limit.toFixed(1)} dB</p>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Limiteur", (b) => se.limit(b, r, limit))}
          >
            APPLIQUER
          </button>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">TRANSITOIRES</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Attaque</p>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.1}
                value={transientAttack}
                onChange={(e) => setTransientAttack(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{transientAttack.toFixed(1)} dB</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Maintien</p>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.1}
                value={transientSustain}
                onChange={(e) => setTransientSustain(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{transientSustain.toFixed(1)} dB</p>
            </div>
          </div>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Transitoires", (b) => se.transient(b, r, transientAttack, transientSustain))}
          >
            APPLIQUER
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" style={{ color }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">SON</p>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">HAUTEUR</p>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.1}
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
            className="w-24 accent-current"
          />
          <p className="text-[10px]">{pitch.toFixed(1)} demi-tons</p>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            title="Change la hauteur sans changer la durée"
            onClick={() => onEdit("Hauteur", (b) => se.withRegion(b, r, (p) => ed.pitchKeep(p, pitch)))}
          >
            APPLIQUER
          </button>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px]">ÉGALISEUR</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Graves</p>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.1}
                value={eqLow}
                onChange={(e) => setEqLow(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{eqLow.toFixed(1)} dB</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Médiums</p>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.1}
                value={eqMid}
                onChange={(e) => setEqMid(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{eqMid.toFixed(1)} dB</p>
            </div>
            <div className="flex items-center gap-1">
              <p className="text-[10px]">Aigus</p>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.1}
                value={eqHigh}
                onChange={(e) => setEqHigh(parseFloat(e.target.value))}
                className="w-24 accent-current"
              />
              <p className="text-[10px]">{eqHigh.toFixed(1)} dB</p>
            </div>
          </div>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onEdit("Égaliseur", (b) => se.withRegion(b, r, (p) => ed.eq(p, { low: eqLow, mid: eqMid, high: eqHigh, hp: 20, lp: 20000 })))}
          >
            APPLIQUER
          </button>
        </div>
      </div>

      <p className="text-[10px] text-neutral-500">
        Les outils gardent la durée du stem : il reste calé sur les autres pistes. Sans sélection dans le zoom, ils portent sur tout le stem. ANNULER revient d&apos;un pas.
      </p>
    </div>
  );
}
