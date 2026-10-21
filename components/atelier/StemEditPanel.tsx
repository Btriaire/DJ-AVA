"use client";

import { useState } from "react";
import * as se from "@/lib/atelier/stemEdit";
import * as ed from "@/lib/atelier/edit";
import type { Region } from "@/lib/atelier/types";
import { Knob } from "../Knob";

type Tab = "decoupe" | "niveaux" | "dynamique" | "son";

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
  const [tab, setTab] = useState<Tab>("decoupe");
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

  const renderCompressorCurve = () => {
    const points: string[] = [];
    for (let x = -60; x <= 0; x += 0.5) {
      const y = x < compThreshold ? x : compThreshold + (x - compThreshold) / compRatio + compMakeup;
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  };

  const renderFadeCurve = (type: "lin" | "exp" | "log" | "s") => {
    const points: string[] = [];
    for (let x = 0; x <= 1; x += 0.05) {
      let y: number;
      switch (type) {
        case "lin": y = x; break;
        case "exp": y = x * x; break;
        case "log": y = Math.sqrt(x); break;
        case "s": y = 0.5 - 0.5 * Math.cos(Math.PI * x); break;
      }
      points.push(`${x * 100},${(1 - y) * 100}`);
    }
    return points.join(" ");
  };

  const renderEqCurve = () => {
    const points: string[] = [];
    for (let x = 0; x <= 100; x += 1) {
      const freq = 20 + (20000 - 20) * (x / 100);
      const lowGain = eqLow * Math.exp(-Math.pow((Math.log(freq) - Math.log(100)) / Math.log(2), 2));
      const midGain = eqMid * Math.exp(-Math.pow((Math.log(freq) - Math.log(1000)) / Math.log(2), 2));
      const highGain = eqHigh * Math.exp(-Math.pow((Math.log(freq) - Math.log(8000)) / Math.log(2), 2));
      const y = 50 + (lowGain + midGain + highGain);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
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
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${canUndo && !busy ? "hw-btn-on" : ""}`}
          disabled={!canUndo || busy}
          onClick={onUndo}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          ANNULER
        </button>
      </div>

      <div className="hw-well flex gap-1 p-1">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${tab === "decoupe" ? "hw-btn-on" : ""}`}
          onClick={() => setTab("decoupe")}
        >
          DÉCOUPE
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${tab === "niveaux" ? "hw-btn-on" : ""}`}
          onClick={() => setTab("niveaux")}
        >
          NIVEAUX
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${tab === "dynamique" ? "hw-btn-on" : ""}`}
          onClick={() => setTab("dynamique")}
        >
          DYNAMIQUE
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${tab === "son" ? "hw-btn-on" : ""}`}
          onClick={() => setTab("son")}
        >
          SON
        </button>
      </div>

      {tab === "decoupe" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-2">
          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Répéter</p>
            <div className="flex justify-center gap-2">
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Répéter 1/2", (b) => se.beatRepeat(b, r, 2))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <rect x="3" y="3" width="6" height="18" />
                  <rect x="15" y="3" width="6" height="18" />
                </svg>
                <span className="text-[9px]">1/2</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Répéter 1/4", (b) => se.beatRepeat(b, r, 4))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <rect x="3" y="3" width="3" height="18" />
                  <rect x="9" y="3" width="3" height="18" />
                  <rect x="15" y="3" width="3" height="18" />
                  <rect x="21" y="3" width="3" height="18" />
                </svg>
                <span className="text-[9px]">1/4</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Répéter 1/8", (b) => se.beatRepeat(b, r, 8))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <rect x="3" y="3" width="2" height="18" />
                  <rect x="7" y="3" width="2" height="18" />
                  <rect x="11" y="3" width="2" height="18" />
                  <rect x="15" y="3" width="2" height="18" />
                  <rect x="19" y="3" width="2" height="18" />
                </svg>
                <span className="text-[9px]">1/8</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Répéter 1/16", (b) => se.beatRepeat(b, r, 16))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <rect x="3" y="3" width="1" height="18" />
                  <rect x="6" y="3" width="1" height="18" />
                  <rect x="9" y="3" width="1" height="18" />
                  <rect x="12" y="3" width="1" height="18" />
                  <rect x="15" y="3" width="1" height="18" />
                  <rect x="18" y="3" width="1" height="18" />
                  <rect x="21" y="3" width="1" height="18" />
                </svg>
                <span className="text-[9px]">1/16</span>
              </button>
            </div>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Décalage</p>
            <div className="flex justify-center gap-2">
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy || bpm <= 0}
                onClick={() => onEdit("Décaler −1 temps", (b) => se.shift(b, -(60 / bpm)))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-[9px]">−1 temps</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Décaler −10 ms", (b) => se.shift(b, -0.01))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-[9px]">−10 ms</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy}
                onClick={() => onEdit("Décaler +10 ms", (b) => se.shift(b, 0.01))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-[9px]">+10 ms</span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                disabled={busy || bpm <= 0}
                onClick={() => onEdit("Décaler +1 temps", (b) => se.shift(b, 60 / bpm))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-[9px]">+1 temps</span>
              </button>
            </div>
          </div>

          <div className="col-span-1 sm:col-span-2 flex justify-center gap-4">
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Rogner", (b) => se.keepOnly(b, r))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
              </svg>
              <span className="text-[9px]">ROGNER</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Couper", (b) => se.silence(b, r))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12" />
              </svg>
              <span className="text-[9px]">COUPER</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Inverser", (b) => se.reverse(b, r))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
                <path d="M12 6l-4 4 4-4zM12 18l4-4-4 4z" />
              </svg>
              <span className="text-[9px]">INVERSER</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Polarité", (b) => se.invertPolarity(b, r))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
                <path d="M12 6l-4 4 4-4zM12 18l4-4-4 4z" />
              </svg>
              <span className="text-[9px]">POLARITÉ</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Mono", (b) => se.mono(b, r))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
                <path d="M12 6l-4 4 4-4zM12 18l4-4-4 4z" />
              </svg>
              <span className="text-[9px]">MONO</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("DC", (b) => se.removeDC(b))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
                <path d="M12 6l-4 4 4-4zM12 18l4-4-4 4z" />
              </svg>
              <span className="text-[9px]">DC</span>
            </button>
            <button
              className="flex flex-col items-center gap-1"
              disabled={busy}
              onClick={() => onEdit("Normaliser", (b) => se.normalize(b, r, -1))}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v12M18 12H6" />
                <path d="M12 6l-4 4 4-4zM12 18l4-4-4 4z" />
              </svg>
              <span className="text-[9px]">NORMALISER</span>
            </button>
          </div>
        </div>
      )}

      {tab === "niveaux" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-2">
          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Gain</p>
            <div className="flex justify-center">
              <Knob
                label="Gain"
                value={gain}
                min={-24}
                max={24}
                defaultValue={0}
                onChange={setGain}
                color={color}
                size={48}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
            </div>
            <svg width="100" height="30" viewBox="0 0 100 30" className="mx-auto">
              <rect x="0" y="0" width="100" height="30" fill="#333" rx="2" />
              <rect x="0" y={15 - (gain / 24) * 15} width="100" height={gain / 24 * 15} fill={color} />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Gain", (b) => se.gain(b, r, gain))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Fondu</p>
            <div className="flex justify-center gap-1 mb-2">
              <button
                className={`hw-btn px-1 py-0.5 text-[9px] ${fade === "lin" ? "hw-btn-on" : ""}`}
                onClick={() => setFade("lin")}
              >
                Linéaire
              </button>
              <button
                className={`hw-btn px-1 py-0.5 text-[9px] ${fade === "exp" ? "hw-btn-on" : ""}`}
                onClick={() => setFade("exp")}
              >
                Expo
              </button>
              <button
                className={`hw-btn px-1 py-0.5 text-[9px] ${fade === "log" ? "hw-btn-on" : ""}`}
                onClick={() => setFade("log")}
              >
                Log
              </button>
              <button
                className={`hw-btn px-1 py-0.5 text-[9px] ${fade === "s" ? "hw-btn-on" : ""}`}
                onClick={() => setFade("s")}
              >
                En S
              </button>
            </div>
            <svg width="100" height="60" viewBox="0 0 100 100" className="mx-auto">
              <path d="M0,100 L100,0" stroke="#555" strokeWidth="1" strokeDasharray="2,2" />
              <path d={`M${renderFadeCurve(fade)}`} stroke={color} strokeWidth="2" fill="none" />
            </svg>
            <div className="flex gap-1">
              <button
                className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-1/2 ${!busy ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: color, color } as React.CSSProperties}
                disabled={busy}
                onClick={() => onEdit("Fondu entrée", (b) => se.fade(b, r, "in", fade))}
              >
                FONDU ENTRÉE
              </button>
              <button
                className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-1/2 ${!busy ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: color, color } as React.CSSProperties}
                disabled={busy}
                onClick={() => onEdit("Fondu sortie", (b) => se.fade(b, r, "out", fade))}
              >
                FONDU SORTIE
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "dynamique" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-2">
          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Gate</p>
            <div className="flex justify-center">
              <Knob
                label="Seuil"
                value={gate}
                min={-80}
                max={0}
                defaultValue={-40}
                onChange={setGate}
                color={color}
                size={48}
                format={(x) => `${x.toFixed(0)} dB`}
                led
              />
            </div>
            <svg width="100" height="40" viewBox="0 0 100 40" className="mx-auto">
              <path d="M0,20 Q20,0 40,20 T80,20 T100,20" stroke={color} strokeWidth="2" fill="none" />
              <line x1="0" y1={40 - (gate + 80) / 80 * 40} x2="100" y2={40 - (gate + 80) / 80 * 40} stroke="#555" strokeWidth="1" strokeDasharray="2,2" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Gate", (b) => se.gate(b, r, gate))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Suppr. silences</p>
            <div className="flex justify-center">
              <Knob
                label="Seuil"
                value={strip}
                min={-80}
                max={-20}
                defaultValue={-50}
                onChange={setStrip}
                color={color}
                size={48}
                format={(x) => `${x.toFixed(0)} dB`}
                led
              />
            </div>
            <svg width="100" height="40" viewBox="0 0 100 40" className="mx-auto">
              <path d="M0,20 Q20,0 40,20 T80,20 T100,20" stroke={color} strokeWidth="2" fill="none" />
              <line x1="0" y1={40 - (strip + 80) / 80 * 40} x2="100" y2={40 - (strip + 80) / 80 * 40} stroke="#555" strokeWidth="1" strokeDasharray="2,2" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Supprimer silences", (b) => se.stripSilence(b, strip, 250))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Compresseur</p>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Seuil"
                value={compThreshold}
                min={-60}
                max={0}
                defaultValue={-24}
                onChange={setCompThreshold}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(0)} dB`}
                led
              />
              <Knob
                label="Ratio"
                value={compRatio}
                min={1}
                max={20}
                defaultValue={4}
                onChange={setCompRatio}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)}`}
                led
              />
              <Knob
                label="Gain"
                value={compMakeup}
                min={0}
                max={12}
                defaultValue={3}
                onChange={setCompMakeup}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
            </div>
            <svg width="100" height="60" viewBox="-60 -60 120 120" className="mx-auto">
              <path d="M-60,0 L0,0 M0,-60 L0,60" stroke="#555" strokeWidth="0.5" />
              <path d={`M-60,0 L${renderCompressorCurve()} L0,0`} stroke={color} strokeWidth="2" fill="none" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Compresseur", (b) => se.compress(b, r, { thresholdDb: compThreshold, ratio: compRatio, attackMs: 10, releaseMs: 120, makeupDb: compMakeup }))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Limiteur</p>
            <div className="flex justify-center">
              <Knob
                label="Plafond"
                value={limit}
                min={-12}
                max={0}
                defaultValue={-1}
                onChange={setLimit}
                color={color}
                size={48}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
            </div>
            <svg width="100" height="40" viewBox="0 0 100 40" className="mx-auto">
              <path d="M0,20 Q20,0 40,20 T80,20 T100,20" stroke={color} strokeWidth="2" fill="none" />
              <line x1="0" y1={40 - (limit + 12) / 12 * 40} x2="100" y2={40 - (limit + 12) / 12 * 40} stroke="#555" strokeWidth="1" strokeDasharray="2,2" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Limiteur", (b) => se.limit(b, r, limit))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Transitoires</p>
            <div className="grid grid-cols-2 gap-2">
              <Knob
                label="Attaque"
                value={transientAttack}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setTransientAttack}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
              <Knob
                label="Maintien"
                value={transientSustain}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setTransientSustain}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
            </div>
            <svg width="100" height="60" viewBox="0 0 100 100" className="mx-auto">
              <path d="M0,100 L100,0" stroke="#555" strokeWidth="1" strokeDasharray="2,2" />
              <path d={`M0,100 Q25,${100 - (transientAttack + 12) / 24 * 100} 50,${100 - (transientSustain + 12) / 24 * 100} T100,0`} stroke={color} strokeWidth="2" fill="none" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Transitoires", (b) => se.transient(b, r, transientAttack, transientSustain))}
            >
              APPLIQUER
            </button>
          </div>
        </div>
      )}

      {tab === "son" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-2">
          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Hauteur</p>
            <div className="flex justify-center">
              <Knob
                label="Hauteur"
                value={pitch}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setPitch}
                color={color}
                size={48}
                format={(x) => `${x.toFixed(1)} demi-tons`}
                led
              />
            </div>
            <svg width="100" height="60" viewBox="0 0 100 100" className="mx-auto">
              <circle cx="50" cy="50" r="45" stroke="#555" strokeWidth="1" fill="none" />
              {[...Array(12)].map((_, i) => (
                <line
                  key={i}
                  x1={50 + 45 * Math.cos((i * 30 - 90) * Math.PI / 180)}
                  y1={50 + 45 * Math.sin((i * 30 - 90) * Math.PI / 180)}
                  x2={50 + 40 * Math.cos((i * 30 - 90) * Math.PI / 180)}
                  y2={50 + 40 * Math.sin((i * 30 - 90) * Math.PI / 180)}
                  stroke="#555"
                  strokeWidth="1"
                />
              ))}
              <line
                x1={50}
                y1={50}
                x2={50 + 40 * Math.cos((pitch * 15 - 90) * Math.PI / 180)}
                y2={50 + 40 * Math.sin((pitch * 15 - 90) * Math.PI / 180)}
                stroke={color}
                strokeWidth="2"
              />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Hauteur", (b) => se.withRegion(b, r, (p) => ed.pitchKeep(p, pitch)))}
            >
              APPLIQUER
            </button>
          </div>

          <div className="hw-strip p-2 flex h-full flex-col gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">Égaliseur</p>
            <div className="grid grid-cols-3 gap-2">
              <Knob
                label="Graves"
                value={eqLow}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setEqLow}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
              <Knob
                label="Médiums"
                value={eqMid}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setEqMid}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
              <Knob
                label="Aigus"
                value={eqHigh}
                min={-12}
                max={12}
                defaultValue={0}
                onChange={setEqHigh}
                color={color}
                size={40}
                format={(x) => `${x.toFixed(1)} dB`}
                led
              />
            </div>
            <svg width="100" height="60" viewBox="0 0 100 100" className="mx-auto">
              <path d="M0,50 L100,50" stroke="#555" strokeWidth="1" />
              <path d={`M${renderEqCurve()}`} stroke={color} strokeWidth="2" fill="none" />
            </svg>
            <button
              className={`hw-btn px-2 py-1.5 text-[11px] font-bold w-full mt-auto ${!busy ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color } as React.CSSProperties}
              disabled={busy}
              onClick={() => onEdit("Égaliseur", (b) => se.withRegion(b, r, (p) => ed.eq(p, { low: eqLow, mid: eqMid, high: eqHigh, hp: 80, lp: 16000 })))}
            >
              APPLIQUER
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-neutral-500">
        Les outils gardent la durée du stem : il reste calé sur les autres pistes. Sans sélection dans le zoom, ils portent sur tout le stem. ANNULER revient d&apos;un pas.
      </p>
    </div>
  );
}
