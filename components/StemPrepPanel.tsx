"use client";
import { useSyncExternalStore, useState, useEffect } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { getPrepState, subscribePrep, cancelPrep, forgetPrep, enqueuePrep, PREP_MODEL, PREP_SHIFTS, PREP_STEMS, type PrepReady } from "@/lib/stemPrep";
import { loadLibrary, idbGetBlob, type LibTrack } from "@/lib/library";

const STEM_FR: Record<string, string> = { vocals: "Voix", drums: "Batterie", bass: "Basse", other: "Autres" };

export function StemPrepPanel({ engine }: { engine: DJEngine }) {
  const prep = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);
  const [library, setLibrary] = useState<LibTrack[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setLibrary(loadLibrary().tracks), 0);
    return () => clearTimeout(t0);
  }, [prep]);

  const flash = (text: string) => {
    setMsg(text);
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  };

  const loadPrepared = async (r: PrepReady, side: "A" | "B") => {
    try {
      const deck = side === "A" ? engine.deckA : engine.deckB;
      deck.setStemModel(PREP_MODEL as Parameters<typeof deck.setStemModel>[0]);
      deck.setStemUltra(true);
      deck.setStemLossless(true);
      deck.setStemsActive(true);

      let ok = false;
      if (r.source === "local") {
        const blob = await idbGetBlob(r.trackId);
        if (blob) ok = await deck.loadStreaming(blob, r.name);
      } else {
        ok = await deck.loadStreamingUrl(`/api/${r.source}/stream?id=${encodeURIComponent(r.url ?? "")}`, r.name);
      }
      flash(ok ? `« ${r.name} » chargé sur ${side} : pistes prêtes, lance la lecture` : "Chargement impossible : fichier introuvable");
    } catch (e) {
      flash(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">PRÉPARATION DES STEMS</span>
        <div
          className="hw-btn px-2 py-1 text-[10px] font-bold hw-btn-on"
          style={{ ["--led" as string]: "#34d399" }}
          title={`Modèle ${PREP_MODEL}, ${PREP_SHIFTS} passes de séparation, pistes WAV sans perte`}
        >
          Qualité max · WAV
        </div>
        <span className="text-[10px] text-neutral-400">
          {prep.jobs.length} en file · {prep.ready.length} prêts
        </span>
      </div>
      <div className="hw-recess flex flex-col gap-1 p-2 text-[11px] text-neutral-300">
        <span>1. Chaque morceau de ta bibliothèque est séparé en 4 pistes : voix, batterie, basse et autres.</span>
        <span>2. Ça se fait en arrière-plan, sans ralentir le morceau que tu écoutes.</span>
        <span>3. Quand un morceau est prêt, charge-le sur la platine A ou B : ses pistes sont disponibles tout de suite.</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
          onClick={() => {
            const n = enqueuePrep(library.filter((t) => t.source === "local" || !!t.url));
            flash(n ? `${n} morceau(x) mis en préparation` : `Tout est déjà prêt`);
          }}
        >
          PRÉPARER TOUTE LA BIBLIOTHÈQUE
        </button>
        <button
          className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
          title="Retire de la file les morceaux qui n'ont pas encore commencé"
          onClick={() => prep.jobs.filter((j) => j.status === "queued").forEach((j) => cancelPrep(j.trackId))}
        >
          VIDER L&apos;ATTENTE
        </button>
      </div>

      {msg && <div className="text-[11px] text-emerald-300">{msg}</div>}

      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">À PRÉPARER</span>
        {prep.jobs.length === 0 ? (
          <p className="text-[11px] text-neutral-400">Aucun morceau en attente.</p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {prep.jobs.map((job) => (
              <div key={job.trackId} className="hw-recess flex items-center gap-2 p-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${job.status === "running" ? "animate-pulse bg-amber-400" : job.status === "error" ? "bg-red-400" : "bg-neutral-500"}`}
                />
                <span className="text-[11px] font-bold truncate flex-1">{job.name}</span>
                <div className="h-1.5 w-28 rounded bg-black ring-1 ring-white/5">
                  <div className="h-full rounded" style={{ width: `${job.progress}%`, background: "#34d399" }} />
                </div>
                <span className="text-[10px] text-neutral-400">
                  {job.status === "queued" ? "dans la file" : job.status === "running" ? `séparation ${job.progress} %` : `échec : ${job.error}`}
                </span>
                {job.status === "error" && (
                  <button
                    className="hw-btn px-2 py-1 text-[10px] font-bold"
                    title="Relancer la préparation de ce morceau"
                    onClick={() => {
                      cancelPrep(job.trackId);
                      const t = library.find((x) => x.id === job.trackId);
                      if (t) enqueuePrep([t]);
                    }}
                  >
                    RELANCER
                  </button>
                )}
                <button
                  className="hw-btn px-2 py-1 text-[10px]"
                  title={job.status === "queued" ? "Retirer de la file" : "Annuler la préparation de ce morceau"}
                  disabled={job.status === "running"}
                  onClick={() => cancelPrep(job.trackId)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">PRÊTS · {prep.ready.length}</span>
        {prep.ready.length === 0 ? (
          <p className="text-[11px] text-neutral-400">
            Aucun stem préparé pour l&apos;instant. Les morceaux que tu charges sont préparés automatiquement.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {prep.ready
              .sort((a, b) => b.preparedAt - a.preparedAt)
              .map((r) => (
                <div key={r.trackId} className="hw-recess flex flex-wrap items-center gap-2 p-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  <span className="text-[12px] font-bold truncate min-w-0 flex-1">{r.name}</span>
                  {r.durationSec && (
                    <span className="font-mono text-[10px] text-neutral-400">
                      {Math.floor(r.durationSec / 60)}:{String(Math.floor(r.durationSec % 60)).padStart(2, "0")}
                    </span>
                  )}
                  <div className="flex gap-1">
                    {PREP_STEMS.map((stem) => (
                      <span
                        key={stem}
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background:
                            stem === "drums" ? "#fb923c" :
                            stem === "bass" ? "#a78bfa" :
                            stem === "other" ? "#38bdf8" :
                            "#f472b6",
                        }}
                      >
                        {STEM_FR[stem] ?? stem}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
                      style={{ ["--led" as string]: "#38bdf8" }}
                      title="Charge ce morceau et ses pistes sur la platine A"
                      onClick={() => loadPrepared(r, "A")}
                    >
                      CHARGER A
                    </button>
                    <button
                      className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
                      style={{ ["--led" as string]: "#f59e0b" }}
                      onClick={() => loadPrepared(r, "B")}
                    >
                      CHARGER B
                    </button>
                    <button
                      className="hw-btn px-2 py-1 text-[10px]"
                      title="Retirer de la liste (le calcul reste en cache sur le serveur)"
                      onClick={() => forgetPrep(r.trackId)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <p className="text-[9px] text-neutral-600">
        Les stems sont lus depuis le cache serveur : aucun recalcul au chargement.
      </p>
    </div>
  );
}
