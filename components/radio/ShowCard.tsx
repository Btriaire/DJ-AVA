"use client";
import { useState, useMemo } from "react";
import { Icon, Mosaic, fmtDur, type StemInfo } from "../prep/parts";
import type { PrepWait } from "@/lib/stemPrep";
import type { LibTrack } from "@/lib/library";
import type { RadioShow, ShowPrep } from "@/lib/radio";
import type { TransitionType } from "@/lib/library";
import { setHealth, STATUS_LABEL } from "@/lib/setHealth";
import { STATUS_COLOR } from "../playlist/NextStep";
import { OrderPreview } from "../playlist/OrderPreview";

export interface ShowCardProps {
  show: RadioShow;
  tracks: LibTrack[];
  saved: boolean;
  accent: string;
  isStemReady: (id: string) => boolean;
  canSend: boolean;
  defaultOpen?: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onSend: (dest: "relay" | "A" | "B" | "open") => void;
  onPrepareStems: (ids: string[]) => void;
  prep?: ShowPrep; // state of the preparation in advance
  onPrepare: () => void;
  onStepType: (index: number, type: TransitionType) => void;
  stemOf: (trackId: string) => StemInfo;
  stemWait: PrepWait; // why the stems are not moving, if they are not
  onRename: (name: string) => void;
}

export function ShowCard({
  show,
  tracks,
  saved,
  accent,
  isStemReady,
  canSend,
  defaultOpen = false,
  onMove,
  onRemove,
  onSave,
  onSend,
  onPrepareStems,
  prep,
  onPrepare,
  onStepType,
  stemOf,
  stemWait,
  onRename,
}: ShowCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const commitName = () => {
    if (draft.trim() && draft.trim() !== show.name) onRename(draft.trim());
    setEditing(false);
  };
  const health = useMemo(() => setHealth(
    tracks.map(t => t.id),
    new Map(tracks.map(t => [t.id, t])),
    isStemReady
  ), [tracks, isStemReady]);

  const allArtists = useMemo(() => [...new Set(tracks.map(t => t.group).filter((g): g is string => !!g))], [tracks]);
  const artists = allArtists.slice(0, 5);

  const missingStems = useMemo(() => {
    return tracks.filter(t => !isStemReady(t.id)).map(t => t.id);
  }, [tracks, isStemReady]);

  const canPrepareStems = missingStems.length > 0;
  const stemStates = useMemo(() => {
    const c = { run: 0, queued: 0, error: 0 };
    for (const t of tracks) {
      const st = stemOf(t.id).state;
      if (st === "run" || st === "download") c.run++;
      else if (st === "queued") c.queued++;
      else if (st === "error") c.error++;
    }
    return c;
  }, [tracks, stemOf]);

  const planSummary = useMemo(() => {
    const count = (type: TransitionType) => show.plan.filter((st) => st.type === type).length;
    const parts = [
      [count("smooth"), "fondu(s) doux"],
      [count("fade"), "fondu(s)"],
      [count("filter"), "filtre(s)"],
      [count("cut"), "coupe(s)"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, label]) => `${n} ${label}`);
    const synced = show.plan.filter((st) => st.sync).length;
    return `${parts.join(", ")}${synced ? ` · ${synced} calé(s) sur les temps` : ""}`;
  }, [show.plan]);

  return (
    <article className="prep-card flex flex-col gap-3 p-3" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
      <div className="flex items-start gap-3">
        <Mosaic tracks={tracks.slice(0, 4)} size={56} accent={accent} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              className="prep-input w-full px-2 py-1 text-[13px] font-bold"
              aria-label="Nom du set"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <h3 className="min-w-0 text-[14px] font-black text-neutral-100">
              <button
                type="button"
                className="group flex max-w-full items-center gap-1.5 text-left"
                title="Renommer ce set"
                onClick={() => {
                  setDraft(show.name);
                  setEditing(true);
                }}
              >
                <span className="truncate">{show.name}</span>
                <Icon name="edit" size={12} className="shrink-0 text-neutral-600 group-hover:text-neutral-200" />
              </button>
            </h3>
          )}
          <div className="text-[11px] text-neutral-500">
            {`${health.count} titres · ${fmtDur(health.seconds)}`}{health.bpmMin > 0 ? ` · ${health.bpmMin}–${health.bpmMax} BPM` : ""}
          </div>
          <div
            className="mt-1 w-fit rounded-full px-2 py-px text-[10px] font-black uppercase tracking-wider"
            style={{
              backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[health.status]} 18%, transparent)`,
              color: STATUS_COLOR[health.status],
            }}
            title={health.next.detail}
          >
            {STATUS_LABEL[health.status]}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {artists.map(artist => (
              <span key={artist} className="rounded-full bg-white/5 px-2 py-px text-[10px] text-neutral-400">
                {artist}
              </span>
            ))}
            {allArtists.length > artists.length && (
              <span className="rounded-full bg-white/5 px-2 py-px text-[10px] text-neutral-400">
                +{allArtists.length - artists.length}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {health.smooth > 0 && (
          <span className="font-mono text-[#34d399]">{health.smooth} fluides</span>
        )}
        {health.boost > 0 && (
          <span className="font-mono text-[#f59e0b]">{health.boost} montées</span>
        )}
        {health.clash > 0 && (
          <span className="font-mono text-[#f87171]">{health.clash} dissonantes</span>
        )}
        <span className="font-mono" style={{ color: health.stemsReady === health.count ? "#34d399" : "#9ca3af" }}>
          stems {health.stemsReady}/{health.count}
        </span>
        {stemStates.run > 0 && <span className="font-mono text-[#ffcc00]">{`${stemStates.run} en cours`}</span>}
        {stemStates.queued > 0 && <span className="font-mono text-neutral-400">{`${stemStates.queued} en file`}</span>}
        {stemStates.error > 0 && <span className="font-mono text-[#f87171]">{`${stemStates.error} en erreur`}</span>}
        {stemWait && (stemStates.queued > 0 || stemStates.run > 0) && (
          <span className="text-amber-400" title="Les stems repartent dès que possible">
            {stemWait === "memory" ? "en attente : mémoire presque pleine" : "en attente : une platine joue"}
          </span>
        )}
      </div>

      {show.plan.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--prep-line)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Plan de mix DJ</div>
            <div className="text-[12px] text-neutral-200" title="Chaque enchaînement a son style, sa durée et son calage, décidés d'après les tempos et les tonalités. Ouvre l'ordre pour les modifier.">
              {planSummary}
            </div>
          </div>
          <button
            type="button"
            className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={onPrepare}
            disabled={prep?.state === "running" || prep?.state === "done" || tracks.length < 2}
            title="Télécharge les titres dans le cache de l'appli (démarrage instantané, pas de trou) et fabrique les annonces de la voix DJ sur le serveur MaRuche (environ une minute par phrase)"
          >
            <Icon name={prep?.state === "done" ? "check" : "bolt"} />
            {prep?.state === "running"
              ? `Audio ${prep.warmed}/${prep.total}${prep.voiceTotal ? ` · Voix ${prep.voiced}/${prep.voiceTotal}` : ""}`
              : prep?.state === "done"
                ? prep.voiceFailed
                  ? "Prête, sans voix"
                  : "Émission prête"
                : "Préparer l'émission"}
          </button>
        </div>
      )}

      <button
        type="button"
        className="prep-btn-ghost self-start flex items-center gap-1.5 px-3 py-1.5 text-xs"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Masquer l'ordre" : "Voir l'ordre et les transitions"}
        <Icon name="chevron" className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <OrderPreview
          tracks={tracks}
          onMove={onMove}
          onRemove={onRemove}
          maxHeight="40vh"
          plan={show.plan}
          onStepType={onStepType}
          stemOf={stemOf}
          onPrepareStem={(id) => onPrepareStems([id])}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={onSave}
          disabled={saved}
          title={saved ? "Enregistré" : "Enregistrer"}
        >
          {saved ? (
            <>
              <Icon name="check" />
              Enregistré
            </>
          ) : (
            <>
              <Icon name="save" />
              Enregistrer
            </>
          )}
        </button>

        <button
          type="button"
          className="prep-btn-accent flex items-center gap-1.5 px-4 py-2 text-xs"
          onClick={() => onSend("relay")}
          disabled={!canSend || tracks.length < 2}
          title="Automix : les deux decks s'enchaînent seuls"
        >
          <Icon name="play" />
          Relais A→B→A
        </button>

        <button
          type="button"
          className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={() => onSend("A")}
          disabled={!canSend || tracks.length < 2}
          title="Met le set en file sur ce deck, en boucle"
        >
          Deck A
        </button>

        <button
          type="button"
          className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={() => onSend("B")}
          disabled={!canSend || tracks.length < 2}
          title="Met le set en file sur ce deck, en boucle"
        >
          Deck B
        </button>

        <button
          type="button"
          className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={() => onSend("open")}
          disabled={!canSend || tracks.length < 2}
          title="Ouvre le set dans l'onglet Playlist sans le lancer"
        >
          <Icon name="send" />
          Ouvrir dans Playlist
        </button>

        {canPrepareStems && (
          <button
            type="button"
            className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={() => onPrepareStems(missingStems)}
          >
            <Icon name="stems" />
            Préparer les stems
          </button>
        )}
      </div>
    </article>
  );
}
