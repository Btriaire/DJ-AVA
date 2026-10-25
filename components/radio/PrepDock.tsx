"use client";
import { Icon } from "../prep/parts";

// Everything a radio show needs before it is played, in one big card that follows the page:
// songs copied to the disk cache, the DJ voice clips, the stems. Each line has its own large bar.

export interface PrepRow {
  key: string;
  label: string;
  done: number;
  total: number;
  state: "running" | "done" | "warn";
  color: string;
  detail: string; // what is happening now, in a sentence
}

export interface PrepDockProps {
  rows: PrepRow[];
  wait: string | null; // why the stems are waiting, if they are
  canPrepare: boolean; // some show has not been prepared yet
  onPrepareAll: () => void;
  queuedStems: number;
  onCancelStems: () => void;
}

export function PrepDock({ rows, wait, canPrepare, onPrepareAll, queuedStems, onCancelStems }: PrepDockProps) {
  if (rows.length === 0 && !canPrepare) return null;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const done = rows.reduce((s, r) => s + Math.min(r.done, r.total), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const running = rows.some((r) => r.state === "running");
  const finished = rows.length > 0 && !running && rows.every((r) => r.state !== "running");

  return (
    <section
      aria-label="Préparation de l'émission"
      aria-live="polite"
      className="prep-card sticky top-2 z-30 flex flex-col gap-3 p-4"
      style={{ borderColor: running ? "var(--prep-accent)" : undefined, boxShadow: running ? "0 0 0 1px var(--prep-accent), 0 12px 40px color-mix(in srgb, var(--prep-accent) 22%, transparent)" : undefined }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#05070a]" style={{ background: finished ? "#34d399" : "var(--prep-accent)" }}>
          <Icon name={finished ? "check" : "bolt"} size={20} className={running ? "animate-pulse" : ""} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-black text-neutral-100">{rows.length === 0 ? "Préparer l'émission" : running ? "Préparation en cours" : "Émission préparée"}</h2>
          <p className="text-[12px] text-neutral-400">
            {rows.length === 0
              ? "Télécharge les titres, fabrique la voix du DJ : l'émission démarre ensuite sans attente."
              : running
                ? "Tu peux continuer à travailler, la préparation tourne en arrière-plan."
                : "Tout est prêt : lance le relais quand tu veux."}
          </p>
        </div>
        {rows.length > 0 && <div className="font-mono text-3xl font-black tabular-nums" style={{ color: finished ? "#34d399" : "var(--prep-accent)" }}>{`${pct} %`}</div>}
        {canPrepare && (
          <button type="button" className="prep-btn-accent flex items-center gap-1.5 px-4 py-2 text-xs font-black" onClick={onPrepareAll}>
            <Icon name="bolt" size={14} />
            Tout préparer
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const share = r.total ? Math.min(1, r.done / r.total) : 0;
            const col = r.state === "warn" ? "#f87171" : r.state === "done" ? "#34d399" : r.color;
            return (
              <li key={r.key} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold text-neutral-100">{r.label}</span>
                  <span className="ml-auto font-mono text-[13px] font-black tabular-nums" style={{ color: col }}>{`${Math.min(r.done, r.total)} / ${r.total}`}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--prep-line)]" role="progressbar" aria-label={r.label} aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={Math.min(r.done, r.total)}>
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ${r.state === "running" ? "animate-pulse" : ""}`}
                    style={{ width: `${Math.max(share * 100, r.state === "running" ? 4 : 0)}%`, background: col }}
                  />
                </div>
                <div className="text-[11px]" style={{ color: r.state === "warn" ? "#f87171" : "#9ca3af" }}>{r.detail}</div>
              </li>
            );
          })}
        </ul>
      )}

      {wait && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          <Icon name="refresh" size={13} />
          {wait}
        </div>
      )}
      {queuedStems > 0 && (
        <button type="button" className="prep-btn-ghost flex items-center gap-1.5 self-start px-3 py-1.5 text-[11px]" onClick={onCancelStems}>
          <Icon name="x" size={12} />
          {`Annuler les ${queuedStems} stems en file`}
        </button>
      )}
    </section>
  );
}
