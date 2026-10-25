"use client";
import { Fragment } from "react";
import { BpmChip, Cover, Icon, KeyChip, StemPill, fmtDur, keyCompat, type StemInfo } from "../prep/parts";
import type { LibTrack, TransitionType } from "@/lib/library";
import { STEP_LABEL, type MixStep } from "@/lib/mixPlan";
import { STEM_TECH_LABEL, STEM_TECH_NOTE, type StemTech } from "@/lib/stemMix";

export interface OrderPreviewProps {
  tracks: LibTrack[];
  onMove?: (index: number, dir: -1 | 1) => void;
  onRemove?: (index: number) => void;
  maxHeight?: string;
  plan?: MixStep[]; // the DJ plan: one step per transition, shown (and editable) on the connector rows
  onStepType?: (index: number, type: TransitionType) => void;
  onStepSec?: (index: number, sec: number) => void; // length of one transition, up to a minute
  stemOf?: (trackId: string) => StemInfo; // stem state of each song (pill on every row)
  onPrepareStem?: (trackId: string) => void;
  stemTech?: (index: number) => StemTech | null; // the stem technique this transition will use, when the stems are ready
}

export function OrderPreview({ tracks, onMove, onRemove, maxHeight = "46vh", plan, onStepType, onStepSec, stemOf, onPrepareStem, stemTech }: OrderPreviewProps) {
  const hasControls = onMove !== undefined && onRemove !== undefined;

  if (tracks.length === 0) {
    return <div className="text-[12px] text-neutral-500">Aucun titre.</div>;
  }

  const bpmValues = tracks.map(t => t.bpm).filter((bpm): bpm is number => bpm !== undefined);
  const minBpm = bpmValues.length > 0 ? Math.min(...bpmValues) : 0;
  const maxBpm = bpmValues.length > 0 ? Math.max(...bpmValues) : 0;

  return (
    <div className="flex flex-col gap-2">
      {tracks.length >= 2 && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full">
          <title>Courbe des BPM du set</title>
          {tracks.slice(0, -1).map((a, i) => {
            const b = tracks[i + 1];
            if (a.bpm === undefined || b.bpm === undefined) return null;
            const x1 = (i * 100) / (tracks.length - 1);
            const x2 = ((i + 1) * 100) / (tracks.length - 1);
            const y1 = 5 + ((maxBpm - a.bpm) / Math.max(maxBpm - minBpm, 1)) * 30;
            const y2 = 5 + ((maxBpm - b.bpm) / Math.max(maxBpm - minBpm, 1)) * 30;
            const compat = keyCompat(a.camelot, b.camelot);
            return (
              <line
                key={`${a.id}-${b.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={compat.color}
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      )}
      <ol className="flex flex-col overflow-y-auto" style={{ maxHeight }}>
        {tracks.map((t, i) => (
          <Fragment key={t.id}>
            <li className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[.03]">
              <span className="w-5 shrink-0 text-right font-mono text-[10px] text-neutral-600">
                {i + 1}
              </span>
              <Cover art={t.art} name={t.name} camelot={t.camelot} size={30} rounded={5} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-neutral-100" title={t.name}>
                  {t.name}
                </div>
                {t.group && (
                  <div className="truncate text-[10px] text-neutral-500" title={t.group}>
                    {t.group}
                  </div>
                )}
              </div>
              <BpmChip bpm={t.bpm} estimated={t.bpmEstimated} />
              <KeyChip camelot={t.camelot} />
              {stemOf && <StemPill info={stemOf(t.id)} onPrepare={onPrepareStem ? () => onPrepareStem(t.id) : undefined} />}
              <div className="hidden font-mono text-[10px] text-neutral-500 sm:block">
                {fmtDur(t.durationSec)}
              </div>
              {hasControls && (
                <>
                  <button
                    type="button"
                    className="p-1 text-neutral-500 hover:text-white disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => onMove!(i, -1)}
                    aria-label="Monter"
                    title="Monter"
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="p-1 text-neutral-500 hover:text-white disabled:opacity-30"
                    disabled={i === tracks.length - 1}
                    onClick={() => onMove!(i, 1)}
                    aria-label="Descendre"
                    title="Descendre"
                  >
                    <Icon name="chevron" />
                  </button>
                  <button
                    type="button"
                    className="p-1 text-neutral-500 hover:text-white disabled:opacity-30"
                    onClick={() => onRemove!(i)}
                    aria-label="Retirer"
                    title="Retirer"
                  >
                    <Icon name="x" />
                  </button>
                </>
              )}
            </li>
            {i < tracks.length - 1 && (
              <li aria-hidden={!plan?.[i]} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-9 pr-2">
                <div
                  className="h-3 w-2.5 shrink-0"
                  style={{ backgroundColor: keyCompat(t.camelot, tracks[i + 1].camelot).color }}
                />
                {(() => {
                  const nb = tracks[i + 1].bpm;
                  const d = t.bpm && nb ? ((nb - t.bpm) / t.bpm) * 100 : null;
                  const col = d === null ? "#9ca3af" : Math.abs(d) <= 3 ? "#34d399" : Math.abs(d) <= 6 ? "#f59e0b" : "#f87171";
                  return (
                    <div className="font-mono text-[10px]" style={{ color: col }}>
                      {d === null ? "? %" : `${d > 0 ? "+" : ""}${d.toFixed(1)} %`}
                    </div>
                  );
                })()}
                <div className="text-[10px]" style={{ color: keyCompat(t.camelot, tracks[i + 1].camelot).color }}>
                  {keyCompat(t.camelot, tracks[i + 1].camelot).label}
                </div>
                {plan?.[i] && (
                  <div className="ml-auto flex items-center gap-1.5 text-[10px] text-neutral-400" title={plan[i].note}>
                    <select
                      className="prep-input px-1.5 py-0.5 text-[10px]"
                      aria-label={`Style de la transition ${i + 1}`}
                      value={plan[i].type}
                      disabled={!onStepType}
                      onChange={(e) => onStepType?.(i, e.target.value as TransitionType)}
                    >
                      {(Object.keys(STEP_LABEL) as TransitionType[]).map((k) => (
                        <option key={k} value={k}>
                          {STEP_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    {plan[i].type === "cut" || !onStepSec ? (
                      <span className="font-mono">{plan[i].type === "cut" ? "net" : `${plan[i].sec} s`}</span>
                    ) : (
                      <select className="prep-input px-1 py-0.5 font-mono text-[10px]" aria-label={`Durée de la transition ${i + 1}`} value={plan[i].sec} onChange={(e) => onStepSec(i, Number(e.target.value))}>
                        {[...new Set([2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, plan[i].sec])].sort((x, y) => x - y).map((v) => (
                          <option key={v} value={v}>{`${v} s`}</option>
                        ))}
                      </select>
                    )}
                    {plan[i].sync && <span className="rounded bg-white/5 px-1">calé</span>}
                    {stemTech?.(i) && (
                      <span className="rounded px-1 font-bold" style={{ background: "color-mix(in srgb, var(--prep-accent) 22%, transparent)", color: "var(--prep-accent)" }} title={STEM_TECH_NOTE[stemTech(i)!]}>
                        {`stems : ${STEM_TECH_LABEL[stemTech(i)!]}`}
                      </span>
                    )}
                    {plan[i].bassSwap && <span className="rounded bg-white/5 px-1">basses</span>}
                  </div>
                )}
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
