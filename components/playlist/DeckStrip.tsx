"use client";
import { useEffect, useState } from "react";
import { Cover, BpmChip, KeyChip, Icon, fmtDur } from "../prep/parts";
import { DECK_COLOR, type DeckInfo, type DeckLive, type Side } from "./types";

export interface DeckStripProps {
  decks: Record<Side, DeckInfo>;
  readLive: (side: Side) => DeckLive;
  relay: boolean;
  relayFg: Side;
  onPrev: (side: Side) => void;
  onToggle: (side: Side) => void;
  onNext: (side: Side) => void;
  onToggleLive: (side: Side) => void;
  onToggleRelay: () => void;
}

function DeckCard({
  side,
  info,
  live,
  onAir,
  onPrev,
  onToggle,
  onNext,
  onToggleLive,
}: {
  side: Side;
  info: DeckInfo;
  live: DeckLive;
  onAir: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  onToggleLive: () => void;
}) {
  const color = DECK_COLOR[side];
  const loaded = info.title !== null;
  const pos = Math.min(live.pos, live.dur || live.pos);
  const dur = live.dur;
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  const trackNo = info.trackNo;
  const trackCount = info.trackCount;

  return (
    <div
      className="prep-card flex flex-col gap-2.5 p-3"
      style={{ boxShadow: `inset 3px 0 0 ${color}`, borderColor: onAir ? color : undefined }}
    >
      <div className="flex items-center gap-3">
        <Cover art={info.art} name={info.title ?? "Deck"} camelot={info.camelot} size={64} rounded={8} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color }}>
            Deck {side}
          </div>
          <div className="text-[10px] text-neutral-400">
            {onAir ? "En antenne" : live.playing ? "En lecture" : loaded ? "En pause" : "Vide"}
          </div>
          <div className="truncate text-[14px] font-bold text-neutral-100" title={info.title ?? undefined}>
            {info.title ?? "Aucun titre chargé"}
          </div>
          {loaded && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
              <BpmChip bpm={info.bpm} />
              <KeyChip camelot={info.camelot} />
              {info.setName && (
                <>
                  <span className="max-w-[160px] truncate">{info.setName}</span>
                  {trackNo !== undefined && trackCount !== undefined && (
                    <span className="font-mono">{trackNo}/{trackCount}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {loaded && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full transition-[width] duration-300"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-neutral-500">
            <span>{fmtDur(pos)}</span>
            <span>-{fmtDur(Math.max(0, dur - pos))}</span>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="prep-btn-ghost p-2 disabled:opacity-40"
          onClick={onPrev}
          disabled={!loaded}
          aria-label={`Titre précédent du deck ${side}`}
        >
          <Icon name="prev" size={16} />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: color, color: "#05070a" }}
          onClick={onToggle}
          disabled={!loaded}
          aria-label={live.playing ? "Pause" : "Lecture"}
        >
          <Icon name={live.playing ? "pause" : "play"} size={16} />
        </button>
        <button
          type="button"
          className="prep-btn-ghost p-2 disabled:opacity-40"
          onClick={onNext}
          disabled={!loaded}
          aria-label={`Titre suivant du deck ${side}`}
        >
          <Icon name="next" size={16} />
        </button>
        <button
          type="button"
          className="prep-btn-ghost ml-auto px-2.5 py-1 text-[10px] font-black tracking-wider"
          onClick={onToggleLive}
          aria-pressed={info.live}
          style={info.live ? { borderColor: color, color } : undefined}
          title="LIVE : enchaîne en boucle les titres de la file du deck"
        >
          {info.live && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />}
          LIVE
        </button>
      </div>

      {info.next && (
        <div className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
            À suivre
          </span>
          <Cover art={info.next.art} name={info.next.title} size={26} rounded={5} />
          <span className="min-w-0 truncate text-[11px] text-neutral-300" title={info.next.title}>
            {info.next.title}
          </span>
        </div>
      )}
    </div>
  );
}

export function DeckStrip(props: DeckStripProps) {
  const { readLive } = props;
  const [live, setLive] = useState(() => ({ A: readLive("A"), B: readLive("B") }));

  useEffect(() => {
    const id = setInterval(() => setLive({ A: readLive("A"), B: readLive("B") }), 250);
    return () => clearInterval(id);
  }, [readLive]);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
      <DeckCard
        side="A"
        info={props.decks.A}
        live={live.A}
        onAir={props.relay ? props.relayFg === "A" : false}
        onPrev={() => props.onPrev("A")}
        onToggle={() => props.onToggle("A")}
        onNext={() => props.onNext("A")}
        onToggleLive={() => props.onToggleLive("A")}
      />
      <button
        type="button"
        aria-pressed={props.relay}
        onClick={props.onToggleRelay}
        className="prep-btn-ghost flex items-center justify-center gap-2 px-3 py-2 md:flex-col md:py-4"
        title="Automix A→B→A : le deck A joue, fondu vers le B en fin de titre, puis retour sur le A, en boucle"
        style={
          props.relay
            ? {
                borderColor: "var(--prep-accent)",
                background: "color-mix(in srgb, var(--prep-accent) 14%, transparent)",
              }
            : undefined
        }
      >
        <span style={{ color: DECK_COLOR.A }}>A</span>
        <Icon name="swap" size={16} />
        <span style={{ color: DECK_COLOR.B }}>B</span>
        <span className="text-[10px] font-black uppercase tracking-wider">Relais</span>
        {props.relay && (
          <span className="text-[10px]" style={{ color: DECK_COLOR[props.relayFg] }}>
            en antenne :{" "}
            <span className="underline underline-offset-4" style={{ color: DECK_COLOR[props.relayFg] }}>
              {props.relayFg}
            </span>
          </span>
        )}
      </button>
      <DeckCard
        side="B"
        info={props.decks.B}
        live={live.B}
        onAir={props.relay ? props.relayFg === "B" : false}
        onPrev={() => props.onPrev("B")}
        onToggle={() => props.onToggle("B")}
        onNext={() => props.onNext("B")}
        onToggleLive={() => props.onToggleLive("B")}
      />
    </div>
  );
}
