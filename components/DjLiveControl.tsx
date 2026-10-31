"use client";
import { FORCES, FORCE_HINT, FORCE_LABEL, GENRES, GENRE_HINT, GENRE_LABEL, type Genre } from "@/lib/djForce";
import { setDjLive, useDjLive } from "@/lib/djLive";

// DJ intelligent, always at hand: on / off, its force and the style it plays, in the top bar of every view.
export function DjLiveControl() {
  const live = useDjLive();
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label="DJ intelligent">
      <button
        type="button"
        onClick={() => setDjLive({ on: !live.on })}
        aria-pressed={live.on}
        className={`hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold ${live.on ? "hw-btn-on" : ""}`}
        style={{ ["--led" as string]: "#fbbf24", color: live.on ? "#fbbf24" : undefined }}
        title="DJ intelligent : quand il est actif, il intervient sur les morceaux qui jouent (filtres, échos, réverbs, stems...), sur un set ou sur ce que tu joues à la main. Sa force règle la fréquence et l'intensité."
      >
        DJ {live.on ? "ON" : "OFF"}
      </button>
      <select
        className="hw-btn px-1.5 py-1.5 text-[11px] font-bold"
        value={live.force}
        onChange={(e) => setDjLive({ force: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}
        aria-label="Force du DJ intelligent"
        title={FORCE_HINT[live.force]}
      >
        {FORCES.map((f) => (
          <option key={f} value={f}>{`${f} · ${FORCE_LABEL[f]}`}</option>
        ))}
      </select>
      <select
        className="hw-btn max-w-[150px] px-1.5 py-1.5 text-[11px] font-bold"
        value={live.genre}
        onChange={(e) => setDjLive({ genre: e.target.value as Genre })}
        aria-label="Style joué par le DJ intelligent"
        title={`Style : ${GENRE_HINT[live.genre]}`}
      >
        {GENRES.map((g) => (
          <option key={g} value={g}>{GENRE_LABEL[g]}</option>
        ))}
      </select>
      {live.on && (
        <span
          className="text-[11px] font-bold"
          style={{ color: live.stems > 0 ? "#fbbf24" : live.stemsAvail > 0 ? "#f59e0b" : "#9ca3af" }}
          title={
            live.stems > 0
              ? "Le morceau qui joue est joué par ses stems : le DJ les utilise (batterie, voix, basse...)"
              : live.stemsAvail > 0
                ? "Les stems de ce morceau existent : le DJ les charge et les active au début de la prochaine mesure."
                : "Ce morceau n'a pas de stems : le DJ n'utilise que les effets. Prépare les stems du set (bouton Préparer) avant de le jouer."
          }
        >
          {live.stems > 0 ? "stems actifs" : live.stemsAvail > 0 ? "stems en chargement" : "sans stems"}
        </span>
      )}
      {live.on && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold"
          style={{ color: "#fbbf24", borderColor: live.action ? "#fbbf24" : "var(--prep-line, #3f3f46)", background: live.action ? "color-mix(in srgb, #fbbf24 18%, transparent)" : "transparent", transition: "all .25s" }}
          title="Dernière intervention du DJ et nombre de gestes depuis qu'il est actif"
          aria-live="polite"
        >
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: live.action ? "#fbbf24" : "#52525b", boxShadow: live.action ? "0 0 8px #fbbf24" : "none" }} />
          {live.action ? `DJ : ${live.action}` : "DJ à l'écoute"}
          <span className="font-mono text-[10px] opacity-80">{`${live.moves} geste${live.moves > 1 ? "s" : ""}`}</span>
        </span>
      )}
    </span>
  );
}
