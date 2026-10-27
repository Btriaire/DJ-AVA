"use client";
import { useEffect, useState } from "react";
import { Cover, BpmChip, KeyChip, Icon, fmtDur } from "../prep/parts";
import StemMapView from "../StemMapView";
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
  const state = onAir ? "En antenne" : live.playing ? "En lecture" : loaded ? "En pause" : "Vide";

  return (
    <div
      className="prep-card flex min-w-0 flex-col gap-2 p-2.5"
      style={{ boxShadow: `inset 3px 0 0 ${color}`, borderColor: onAir ? color : undefined }}
    >
      <div className="flex items-center gap-3">
        <Cover art={info.art} name={info.title ?? "Deck"} camelot={info.camelot} size={52} rounded={8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color }}>
              Deck {side}
            </span>
            <span className="text-[10px] text-neutral-400">{state}</span>
          </div>
          <div className="truncate text-[13px] font-bold text-neutral-100" title={info.title ?? undefined}>
            {info.title ?? "Aucun titre chargé"}
          </div>
          {loaded && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
              <BpmChip bpm={info.bpm} />
              <KeyChip camelot={info.camelot} />
              {info.setName && (
                <>
                  <span className="max-w-[140px] truncate">{info.setName}</span>
                  {info.trackNo !== undefined && info.trackCount !== undefined && (
                    <span className="font-mono">
                      {info.trackNo}/{info.trackCount}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="pl-icon-btn" onClick={onPrev} disabled={!loaded} aria-label={`Titre précédent du deck ${side}`}>
            <Icon name="prev" size={16} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
            style={{ background: color, color: "#05070a" }}
            onClick={onToggle}
            disabled={!loaded}
            aria-label={live.playing ? `Pause du deck ${side}` : `Lecture du deck ${side}`}
          >
            <Icon name={live.playing ? "pause" : "play"} size={16} />
          </button>
          <button type="button" className="pl-icon-btn" onClick={onNext} disabled={!loaded} aria-label={`Titre suivant du deck ${side}`}>
            <Icon name="next" size={16} />
          </button>
        </div>
      </div>

      {loaded && info.stemMap && <StemMapView map={info.stemMap} position={pos} height={72} label={`Carte du titre du deck ${side}`} />}
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-neutral-500">{loaded ? fmtDur(pos) : "—"}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Position du deck ${side}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="h-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-neutral-500">{loaded ? `-${fmtDur(Math.max(0, dur - pos))}` : "—"}</span>
        <button
          type="button"
          className="prep-btn-ghost flex min-h-9 shrink-0 items-center gap-1 px-2.5 text-[10px] font-black tracking-wider"
          onClick={onToggleLive}
          aria-pressed={info.live}
          style={info.live ? { borderColor: color, color } : undefined}
          title="LIVE : enchaîne en boucle les titres de la file du deck"
        >
          {info.live && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />}
          LIVE
        </button>
      </div>

      {info.next && (
        <div className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1">
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
            À suivre
          </span>
          <Cover art={info.next.art} name={info.next.title} size={22} rounded={4} />
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
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setLive({ A: readLive("A"), B: readLive("B") }), 250);
    return () => clearInterval(id);
  }, [readLive]);

  const sides = ["A", "B"] as const;
  return (
    <section className="flex flex-col gap-2" aria-label="Platines">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Platines</h2>
        <button
          type="button"
          aria-pressed={props.relay}
          onClick={props.onToggleRelay}
          className="prep-btn-ghost flex min-h-9 items-center gap-2 px-3 text-xs"
          title="Automix A→B→A : le deck A joue, fondu vers le B en fin de titre, puis retour sur le A, en boucle"
          style={
            props.relay
              ? { borderColor: "var(--prep-accent)", background: "color-mix(in srgb, var(--prep-accent) 14%, transparent)" }
              : undefined
          }
        >
          <span style={{ color: DECK_COLOR.A }}>A</span>
          <Icon name="swap" size={14} />
          <span style={{ color: DECK_COLOR.B }}>B</span>
          <span className="text-[10px] font-black uppercase tracking-wider">Relais</span>
          {props.relay && (
            <span className="text-[10px]" style={{ color: DECK_COLOR[props.relayFg] }}>
              en antenne : <span className="underline underline-offset-4">{props.relayFg}</span>
            </span>
          )}
        </button>
        {!open && (
          <p className="hidden min-w-0 flex-1 truncate text-[11px] text-neutral-500 md:block">
            {sides.map((s) => `${s} : ${props.decks[s].title ?? "vide"}${live[s].playing ? " (lecture)" : ""}`).join("   ·   ")}
          </p>
        )}
        <button
          type="button"
          className="pl-icon-btn ml-auto"
          aria-expanded={open}
          aria-label={open ? "Replier les platines" : "Déplier les platines"}
          onClick={() => setOpen(!open)}
        >
          <Icon name="chevron" size={16} className={open ? "rotate-180" : ""} />
        </button>
      </div>
      {open && (
        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((s) => (
            <DeckCard
              key={s}
              side={s}
              info={props.decks[s]}
              live={live[s]}
              onAir={props.relay ? props.relayFg === s : false}
              onPrev={() => props.onPrev(s)}
              onToggle={() => props.onToggle(s)}
              onNext={() => props.onNext(s)}
              onToggleLive={() => props.onToggleLive(s)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
