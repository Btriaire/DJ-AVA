import { useState } from "react";
import { Knob } from "../Knob";
import * as ed from "@/lib/atelier/edit";
import type { Region } from "@/lib/atelier/types";

export type ApplyResult = { buf: AudioBuffer; sel?: Region | null; bpm?: number };

export function EditTools({ buf, sel, bpm, color, busy, canUndo, onApply, onUndo, onExport }: {
  buf: AudioBuffer;
  sel: Region | null;
  bpm: number;
  color: string;
  busy: boolean;
  canUndo: boolean;
  onApply: (label: string, run: () => Promise<ApplyResult>) => void;
  onUndo: () => void;
  onExport: (fmt: "wav" | "mp3") => void;
}) {
  const r = sel ?? { a: 0, b: buf.duration };
  const [gain, setGain] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [keepPitch, setKeepPitch] = useState(true);
  const [bpmSeen, setBpmSeen] = useState(bpm);
  const [targetBpm, setTargetBpm] = useState(Math.round(bpm));
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0, hp: 20, lp: 20000 });

  if (bpm !== bpmSeen) {
    setBpmSeen(bpm);
    setTargetBpm(Math.round(bpm));
  }

  return (
    <div className="hw-panel flex flex-col gap-2 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
        OUTILS
      </div>

      <div className="text-[9px] text-neutral-500">
        {sel ? `Sélection ${r.a.toFixed(2)} → ${r.b.toFixed(2)} s` : "Tout le morceau"}
      </div>

      <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
        <Knob
          label="GAIN"
          value={gain}
          min={-24}
          max={24}
          defaultValue={0}
          onChange={setGain}
          color={color}
          size={36}
          led
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
        />
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Gain", async () => ({ buf: ed.gain(buf, r, gain) }))}
        >
          APPLIQUER LE GAIN
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Normaliser", async () => ({ buf: ed.normalize(buf, r, -1) }))}
        >
          NORMALISER
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Fondu entrée", async () => ({ buf: ed.fade(buf, r, "in") }))}
        >
          FONDU ENTRÉE
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Fondu sortie", async () => ({ buf: ed.fade(buf, r, "out") }))}
        >
          FONDU SORTIE
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Inverser", async () => ({ buf: ed.reverse(buf, r) }))}
        >
          INVERSER
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onApply("Silence", async () => ({ buf: ed.silence(buf, r) }))}
        >
          SILENCE
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy || !sel}
          onClick={() => onApply("Rogner", async () => ({ buf: ed.slice(buf, r), sel: null }))}
        >
          ROGNER
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy || !sel}
          onClick={() => onApply("Couper", async () => ({ buf: ed.cut(buf, r), sel: null }))}
        >
          COUPER
        </button>
      </div>

      <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
        <Knob
          label="HAUTEUR"
          value={pitch}
          min={-24}
          max={24}
          defaultValue={0}
          onChange={setPitch}
          color={color}
          size={36}
          led
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
        />
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${keepPitch ? "hw-btn-on" : ""}`}
          disabled={busy}
          onClick={() => setKeepPitch(!keepPitch)}
        >
          GARDER LA DURÉE
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy || pitch === 0}
          onClick={() => onApply("Hauteur", async () => ({
            buf: keepPitch ? await ed.pitchKeep(buf, pitch) : await ed.repitch(buf, pitch),
            sel: null,
            bpm: keepPitch ? bpm : bpm * 2 ** (pitch / 12)
          }))}
        >
          APPLIQUER LA HAUTEUR
        </button>

        <div className="flex items-center gap-1.5">
          <label className="text-[9px] text-neutral-500">BPM CIBLE</label>
          <input
            type="number"
            min={40}
            max={240}
            value={targetBpm}
            onChange={(e) => setTargetBpm(Math.max(40, Math.min(240, Number(e.target.value))))}
            className="w-16 text-[10px] px-1 py-0.5 border border-neutral-700 bg-neutral-800 rounded"
          />
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy || bpm <= 0}
            onClick={() => onApply("Tempo", async () => ({
              buf: await ed.tempo(buf, bpm / targetBpm),
              sel: null,
              bpm: targetBpm
            }))}
          >
            APPLIQUER LE TEMPO
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Knob
            label="GRAVES"
            value={eq.low}
            min={-12}
            max={12}
            defaultValue={0}
            onChange={(v) => setEq({ ...eq, low: v })}
            color={color}
            size={36}
            led
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Knob
            label="MÉDIUMS"
            value={eq.mid}
            min={-12}
            max={12}
            defaultValue={0}
            onChange={(v) => setEq({ ...eq, mid: v })}
            color={color}
            size={36}
            led
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Knob
            label="AIGUS"
            value={eq.high}
            min={-12}
            max={12}
            defaultValue={0}
            onChange={(v) => setEq({ ...eq, high: v })}
            color={color}
            size={36}
            led
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Knob
            label="PASSE-HAUT"
            value={eq.hp}
            min={20}
            max={1000}
            defaultValue={20}
            onChange={(v) => setEq({ ...eq, hp: v })}
            color={color}
            size={36}
            led
            format={(v) => `${v.toFixed(0)} Hz`}
          />
          <Knob
            label="PASSE-BAS"
            value={eq.lp}
            min={1000}
            max={20000}
            defaultValue={20000}
            onChange={(v) => setEq({ ...eq, lp: v })}
            color={color}
            size={36}
            led
            format={(v) => `${v.toFixed(0)} Hz`}
          />
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            disabled={busy}
            onClick={() => onApply("Égaliseur", async () => ({
              buf: await ed.eq(buf, eq),
              sel: null
            }))}
          >
            APPLIQUER L&apos;ÉGALISEUR
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={!canUndo || busy}
          onClick={onUndo}
        >
          ANNULER
        </button>

        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onExport("wav")}
        >
          ⤓ WAV
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          disabled={busy}
          onClick={() => onExport("mp3")}
        >
          ⤓ MP3
        </button>
        <span className="text-[9px] text-neutral-500">
          ({sel ? "sélection" : "morceau entier"})
        </span>
      </div>
    </div>
  );
}
