"use client";
import { useSyncExternalStore } from "react";
import { getRelayHost, relayHostSkipNow, relayHostSwap, relayHostZap, subscribeRelayHost, type QueueTrack } from "@/lib/relayHost";
import { cleanTitle } from "@/lib/mixPlan";

// The line at the top of the Console: the song that plays and the songs to come. Each one can be sent to the end of the
// set ("passer"), moved earlier or later (exchanged with its neighbour), and the next one can be started now.
// The relay itself runs elsewhere (lib/relayHost.ts); this line only shows it and sends orders.

const Icon = ({ d, size = 12 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICON = {
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  skip: "M5 5l9 7-9 7V5zM18 5v14", // next
  zap: "M6 6l12 12M18 6L6 18", // send to the end of the set
};

const label = (t: QueueTrack) => cleanTitle(t.name) || t.name;

function Btn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded border border-zinc-600 text-zinc-300 hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-zinc-600 disabled:hover:text-zinc-300"
    >
      {children}
    </button>
  );
}

export function NextUpBar() {
  const rh = useSyncExternalStore(subscribeRelayHost, getRelayHost, getRelayHost);
  if (!rh.running || !rh.now) return null;
  const list = rh.upcoming.slice(0, 6);
  return (
    <section className="mb-3 flex items-stretch gap-2 overflow-x-auto rounded-xl border border-zinc-700 bg-[#0d0d10] p-2" aria-label="Prochains titres">
      <div className="flex min-w-[170px] max-w-[230px] shrink-0 flex-col justify-between gap-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">En cours</span>
        <span className="truncate text-[12px] font-bold text-zinc-100" title={rh.now.name}>
          {label(rh.now)}
        </span>
        <button
          type="button"
          onClick={() => relayHostSkipNow()}
          disabled={rh.firstLocked || list.length === 0}
          title="Passer au titre suivant maintenant : l'enchaînement démarre tout de suite"
          className="flex items-center justify-center gap-1 rounded border border-amber-400/60 px-2 py-0.5 text-[10px] font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-30"
        >
          <Icon d={ICON.skip} size={11} />
          Suivant maintenant
        </button>
      </div>
      <div className="flex shrink-0 items-center px-1 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 [writing-mode:vertical-rl]">À suivre</div>
      {list.map((t, i) => {
        const k = i + 1;
        const lockedFirst = rh.firstLocked && k === 1;
        const canEdit = rh.editable && !lockedFirst;
        const prevLocked = rh.firstLocked && k - 1 === 1;
        return (
          <div key={`${t.id}-${k}`} className="flex min-w-[150px] max-w-[210px] shrink-0 flex-col justify-between gap-1 rounded-lg border border-zinc-700 bg-zinc-900/70 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10px] text-zinc-500">{k === 1 ? "1 · prêt" : k}</span>
              <span className="font-mono text-[10px] text-zinc-400">{`${t.bpm ? Math.round(t.bpm) : "—"}${t.camelot ? ` · ${t.camelot}` : ""}`}</span>
            </div>
            <span className="truncate text-[12px] font-semibold text-zinc-100" title={t.name}>
              {label(t)}
            </span>
            <div className="flex items-center gap-1">
              <Btn title="Avancer ce titre (l'échanger avec le précédent)" disabled={!canEdit || k === 1 || prevLocked} onClick={() => relayHostSwap(k, k - 1)}>
                <Icon d={ICON.left} />
              </Btn>
              <Btn title="Reculer ce titre (l'échanger avec le suivant)" disabled={!canEdit || k >= list.length} onClick={() => relayHostSwap(k, k + 1)}>
                <Icon d={ICON.right} />
              </Btn>
              <span className="flex-1" />
              <Btn title="Passer ce titre : il part en fin de set" disabled={!canEdit} onClick={() => relayHostZap(k)}>
                <Icon d={ICON.zap} />
              </Btn>
            </div>
          </div>
        );
      })}
      {!rh.editable && <p className="flex max-w-[180px] shrink-0 items-center text-[10px] leading-snug text-zinc-500">L&apos;ordre ne se change que pour un set lancé en relais.</p>}
    </section>
  );
}
