"use client";
import { useState } from "react";
import type { EqView } from "@/lib/audio/Rack";
import { EQ_FREQS } from "@/lib/audio/Rack";
import { EQ_PRESETS, presetGains } from "@/lib/audio/eqPresets";
import { GESTURES, MOVES, type EqLab, balanceCurve, makeRoomCurve, matchCurve, unmaskCurve } from "@/lib/audio/eqLab";
import { Knob } from "./Knob";

export function EqLabControls({ lab, curve, otherView, spectra, prepared, stemNames, color, flashLcd, onChanged }: { lab: EqLab; curve: number; otherView: EqView | null; spectra: (c: (number | "other")[]) => Promise<number[][]>; prepared: boolean; stemNames: string[]; color: string; flashLcd: (t: string) => void; onChanged: () => void }) {
  const [bars, setBars] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [held, setHeld] = useState<number[] | null>(null);
  const [heldGroup, setHeldGroup] = useState<string | null>(null);
  const ls = lab.loopState(curve);

  const btn = (on: boolean) => on ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" };

  const run = async (name: string, fn: () => Promise<number[] | null>) => {
    setBusy(name);
    try {
      const t = await fn();
      if (t) {
        lab.morph(curve, t, 1);
        flashLcd(name.toUpperCase());
      } else flashLcd("RIEN À CORRIGER");
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded p-2 ring-1 ring-neutral-800">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400" title="Un bouton bouge les 15 bandes d’un coup">Gestes</span>
        {GESTURES.map(g => (
          <div key={g.id} title={g.title}>
            <Knob
              label={g.label}
              value={lab.gesture(curve, g.id)}
              min={-1}
              max={1}
              defaultValue={0}
              size={40}
              color={color}
              led
              format={v => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}
              onChange={v => { lab.setGesture(curve, g.id, v); flashLcd(`${g.label.toUpperCase()} ${Math.round(v * 100)}%`); onChanged(); }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400" title={prepared ? "Analyse du morceau prête : calcul instantané sur tout le morceau" : "Morceau pas encore analysé : l’EQ écoute 1,5 s"}>Intelligent{prepared ? " ·" : ""}</span>
        <button
          className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
          style={btn(false)}
          disabled={busy !== null}
          onClick={() => run("Équilibrer", async () => {
            const [e] = await spectra([curve]);
            return balanceCurve(e);
          })}
          title="Corrige à moitié ce qui dépasse d’un mix équilibré (sur tout le morceau quand il est préparé, sinon après 1,5 s d’écoute)"
        >
          {busy === "Équilibrer" ? (prepared ? "Calcul…" : "J’écoute…") : "Équilibrer"}
        </button>
        <button
          className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
          style={btn(false)}
          disabled={busy !== null || !otherView}
          onClick={() => run("Copier l’autre deck", async () => {
            const [self, other] = await spectra([curve, "other"]);
            return matchCurve(self, other);
          })}
          title="Donne à ce son la couleur de l’autre deck, pour une transition invisible"
        >
          {busy === "Copier l’autre deck" ? "J’écoute…" : "Copier l’autre deck"}
        </button>
        <button
          className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
          style={btn(false)}
          disabled={busy !== null || !otherView}
          onClick={() => run("Place à l’autre deck", async () => {
            const [self, other] = await spectra([curve, "other"]);
            const cur = lab.read(curve);
            return makeRoomCurve(self, other).map((g, i) => Math.min(cur[i], g));
          })}
          title="Creuse les graves et le bas-médium là où l’autre deck joue"
        >
          {busy === "Place à l’autre deck" ? "J’écoute…" : "Place à l’autre deck"}
        </button>
        {curve >= 0 && stemNames[curve] !== "vocals" && stemNames.includes("vocals") && (
          <button
            className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
            style={btn(false)}
            disabled={busy !== null}
            onClick={() => run("Dégager la voix", async () => {
              const [focus, self] = await spectra([stemNames.indexOf("vocals"), curve]);
              const cur = lab.read(curve);
              const cut = unmaskCurve(focus, self);
              return cut.every(c => c === 0) ? null : cur.map((g, i) => g + cut[i]);
            })}
            title="Creuse ce stem là où la voix chante, pour qu’elle passe devant"
          >
            {busy === "Dégager la voix" ? "J’écoute…" : "Dégager la voix"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
          Durée
        </span>
        {[1, 2, 4, 8, 16].map(n => (
          <button
            key={n}
            className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
            style={btn(bars === n)}
            onClick={() => setBars(n)}
            title="Durée des mouvements, des morphings et de la boucle, en mesures"
          >
            {`${n} mes.`}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
          Mouvements
        </span>
        {MOVES.map(m => (
          <button
            key={m.id}
            className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
            style={btn(lab.moving(curve) === m.id)}
            onClick={() => {
              if (lab.moving(curve) === m.id) {
                lab.stopMove(curve);
                flashLcd("MOUVEMENT STOP");
              } else {
                lab.startMove(curve, m.id, bars);
                flashLcd(`${m.label.toUpperCase()} ${bars} MES.`);
              }
              onChanged();
            }}
            title={m.title}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
          Morphing
        </span>
        <select
          className="rounded bg-neutral-900 px-1 py-1 text-[10px] text-neutral-200"
          aria-label="Courbe d’arrivée du morphing"
          value=""
          onChange={e => {
            const p = EQ_PRESETS.find(p => p.id === e.target.value);
            if (p) {
              lab.morph(curve, presetGains(p.pts, EQ_FREQS), bars);
              flashLcd(`MORPH ${p.name.toUpperCase()} ${bars} MES.`);
              onChanged();
            }
          }}
        >
          <option value="">Vers…</option>
          {EQ_PRESETS.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-neutral-400">
          glisse de la courbe actuelle vers celle choisie, calé sur le tempo
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
          Boucle
        </span>
        <button
          className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40"
          style={btn(ls !== "off")}
          onClick={() => {
            if (ls === "off") {
              lab.record(curve, bars);
            } else {
              lab.stopLoop(curve);
            }
            onChanged();
          }}
          title="Enregistre tes gestes sur la durée choisie, puis les rejoue en boucle calée sur les mesures"
        >
          {ls === "off" ? "REC" : ls === "armed" ? "ATTEND LA MESURE" : ls === "rec" ? "ENREGISTRE…" : "STOP BOUCLE"}
        </button>
        <span className="text-[10px] text-neutral-400">
          bouge les bandes ou les gestes pendant l’enregistrement
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400" title="Tiens appuyé pour couper, comme une table de mixage">
          Coupures
        </span>
        {["LOW", "MID", "HIGH"].map(group => (
          <button
            key={group}
            className="rounded px-2 py-1 text-[10px] font-bold disabled:opacity-40 select-none touch-none"
            style={btn(!!held && heldGroup === group)}
            onPointerDown={() => {
              const saved = lab.read(curve);
              setHeld(saved);
              setHeldGroup(group);
              lab.apply(curve, saved.map((g, i) => {
                const inGroup = group === "LOW" ? EQ_FREQS[i] <= 250 :
                                group === "MID" ? EQ_FREQS[i] >= 400 && EQ_FREQS[i] <= 2500 :
                                EQ_FREQS[i] >= 4000;
                return inGroup ? -18 : g;
              }));
              onChanged();
            }}
            onPointerUp={() => {
              if (held) {
                lab.apply(curve, held);
                setHeld(null);
                setHeldGroup(null);
                onChanged();
              }
            }}
            onPointerLeave={() => {
              if (held) {
                lab.apply(curve, held);
                setHeld(null);
                setHeldGroup(null);
                onChanged();
              }
            }}
            onPointerCancel={() => {
              if (held) {
                lab.apply(curve, held);
                setHeld(null);
                setHeldGroup(null);
                onChanged();
              }
            }}
          >
            {group}
          </button>
        ))}
      </div>
    </div>
  );
}
