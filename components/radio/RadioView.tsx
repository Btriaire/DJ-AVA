"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadLibrary, uid, type LibTrack } from "@/lib/library";
import { enqueuePrep, getPrepState, getPrepWait, subscribePrep } from "@/lib/stemPrep";
import {
  cancelRadio,
  getRadioState,
  loadStations,
  prepareShow,
  radioBusy,
  recomposeRadio,
  renameShow,
  resetRadio,
  saveShow,
  setStep,
  saveStations,
  startRadio,
  subscribeRadio,
  suggestArtists,
  updateShow,
  wantedCount,
  DEFAULT_PREFS,
  type RadioPrefs,
  type StationsData,
} from "@/lib/radio";
import { ARC_LABEL, durationLabel } from "@/lib/setWizard";
import { Icon, StatTile, stemInfoFrom } from "../prep/parts";
import { Journey, type JourneyStep } from "../prep/Journey";
import { AdvancedPanel } from "./AdvancedPanel";
import { ArtistsPanel } from "./ArtistsPanel";
import { StationBar } from "./StationBar";
import { ProgramPanel } from "./ProgramPanel";
import { RunPanel } from "./RunPanel";
import { ShowCard } from "./ShowCard";

const ACCENTS = [
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#ffcc00",
  "#f97316",
  "#f472b6",
];

export type RadioDest = "relay" | "A" | "B" | "open";

// Radio-AVA: favourite artists in, ready-to-play sets out. The search and the analysis run in the background
// (lib/radio.ts), so leaving this view does not stop them.
export default function RadioView({
  onLaunchSet,
}: {
  onLaunchSet?: (dest: RadioDest, playlistId: string) => void;
}) {
  // several radios: each station has its own artists and settings; `prefs` is the one on screen
  const [book, setBook] = useState<StationsData>(() => loadStations());
  const station = book.stations.find((st) => st.id === book.current) ?? book.stations[0];
  const prefs = station.prefs;
  const commit = (next: StationsData) => {
    setBook(next);
    saveStations(next);
  };
  const radio = useSyncExternalStore(
    subscribeRadio,
    getRadioState,
    getRadioState,
  );
  const prep = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);

  // a short message that confirms what a click did
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 7000);
  };

  const busy = radio.phase === "search" || radio.phase === "analyze";
  // once a radio has been launched the setup folds into a one-line summary, the results take the screen
  const [folded, setFolded] = useState(false);
  const setupVisible = !folded || radio.phase === "idle";

  // a finished radio brings its sets into view
  useEffect(() => {
    if (radio.phase !== "done") return;
    const t = setTimeout(
      () =>
        document
          .getElementById("radio-shows")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      200,
    );
    return () => clearTimeout(t);
  }, [radio.phase]);
  const launch = (fresh = false) => {
    setFolded(true);
    void startRadio(prefs, { fresh });
    setTimeout(
      () =>
        document
          .getElementById("radio-run")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );
  };
  // Cmd/Ctrl + Enter launches the radio from anywhere on the page
  useEffect(() => {
    if (!setupVisible || busy || prefs.artists.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        launch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupVisible, busy, prefs]);
  // the library changes under our feet while the radio runs: read it again on every radio update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lib = useMemo(() => loadLibrary(), [radio]);
  const byId = useMemo(() => new Map(lib.tracks.map((t) => [t.id, t])), [lib]);

  const change = (patch: Partial<RadioPrefs>) =>
    commit({ ...book, stations: book.stations.map((st) => (st.id === station.id ? { ...st, prefs: { ...st.prefs, ...patch } } : st)) });

  const selectStation = (id: string) => {
    if (busy) return;
    if (radio.phase !== "idle") resetRadio(); // the results belong to the radio that made them
    setFolded(false);
    commit({ ...book, current: id });
  };
  const addStation = () => {
    const id = uid();
    commit({ current: id, stations: [...book.stations, { id, name: `Radio ${book.stations.length + 1}`, prefs: { ...DEFAULT_PREFS, dj: { ...prefs.dj } } }] });
    resetRadio();
    setFolded(false);
  };
  const duplicateStation = (id: string) => {
    const src = book.stations.find((st) => st.id === id);
    if (!src) return;
    const copy = uid();
    commit({ current: copy, stations: [...book.stations, { id: copy, name: `${src.name} (copie)`, prefs: JSON.parse(JSON.stringify(src.prefs)) as RadioPrefs }] });
    resetRadio();
  };
  const deleteStation = (id: string) => {
    if (book.stations.length < 2) return;
    const left = book.stations.filter((st) => st.id !== id);
    commit({ current: left[0].id, stations: left });
    resetRadio();
  };

  // quick moods: one click sets the shape, the length and the advanced options together
  const MOODS: { key: string; label: string; hint: string; patch: Partial<RadioPrefs> }[] = [
    { key: "party", label: "Soirée", hint: "Monte jusqu'au pic, 1 h 30", patch: { arc: "peak", durationMin: 90, tempoSpread: 15, tempoMin: 0, tempoMax: 0, harmony: "balanced", maxShows: 2 } },
    { key: "warm", label: "Échauffement", hint: "Tempo qui monte, 45 min", patch: { arc: "rise", durationMin: 45, tempoSpread: 8, tempoMin: 0, tempoMax: 0, harmony: "balanced" } },
    { key: "chill", label: "Chill", hint: "Doux et accordé, 1 h", patch: { arc: "flow", durationMin: 60, tempoSpread: 4, tempoMin: 0, tempoMax: 115, harmony: "strict" } },
    { key: "sport", label: "Sport", hint: "120 à 160 BPM qui montent", patch: { arc: "rise", durationMin: 45, tempoSpread: 15, tempoMin: 120, tempoMax: 160, harmony: "free" } },
    { key: "discover", label: "Découverte", hint: "Des titres pas encore rangés", patch: { avoidUsed: true, version: "any", maxShows: 3, mixArtists: "alternate" } },
  ];
  const applyMood = (m: (typeof MOODS)[number]) => {
    change(m.patch);
    flash(`Ambiance « ${m.label} » appliquée`);
  };

  // several names typed in one go are added one after the other: each call must see the previous ones
  const addMany = (names: string[]) => {
    const have = new Set(prefs.artists.map((a) => a.name.toLowerCase()));
    const fresh = names
      .map((n) => n.replace(/\s+/g, " ").trim().slice(0, 60))
      .filter(
        (n) => n && !have.has(n.toLowerCase()) && have.add(n.toLowerCase()),
      )
      .slice(0, 24 - prefs.artists.length);
    if (fresh.length)
      change({
        artists: [
          ...prefs.artists,
          ...fresh.map((name) => ({ id: uid(), name, love: 2 as const })),
        ],
      });
  };

  // the radio looks for 2 spare songs per artist: the sets keep the best chains among them
  const wantedTotal = prefs.artists.reduce(
    (sum, a) => sum + wantedCount(a, prefs.perArtist) + 2,
    0,
  );
  const suggestions = useMemo(
    () =>
      suggestArtists(
        lib.tracks,
        prefs.artists.map((a) => a.name),
      ),
    [lib.tracks, prefs.artists],
  );

  const stemReady = (id: string) => prep.ready.some((r) => r.trackId === id);
  // state of the stems of a song, from the preparation queue
  const stemOf = (id: string) => {
    const job = prep.jobs.find((j) => j.trackId === id);
    if (!job) return stemInfoFrom(stemReady(id) ? "done" : "none");
    if (job.status === "error") return stemInfoFrom("error", job.error);
    if (job.status === "running") return stemInfoFrom(job.phase === "download" ? "download" : `separate ${Math.round(job.progress)}`);
    return stemInfoFrom("queued");
  };

  const items = radio.items.filter((i) => !(i.spare && i.status === "found"));
  const analysed = items.filter((i) => i.status === "ready").length;
  const scrollTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const flags = [
    prefs.artists.length > 0,
    radio.phase !== "idle",
    radio.phase === "done" || radio.phase === "cancelled",
    radio.shows.length > 0,
  ];
  const current = flags.findIndex((f) => !f);
  const st = (k: number): JourneyStep["state"] =>
    flags[k] ? "done" : k === current ? "current" : "todo";
  const steps: JourneyStep[] = [
    {
      key: "artists",
      label: "Tes artistes",
      detail: prefs.artists.length
        ? `${prefs.artists.length} artiste(s)`
        : "qui aimes-tu ?",
      state: st(0),
      onClick: () => setFolded(false),
    },
    {
      key: "program",
      label: "Programme",
      detail: `${ARC_LABEL[prefs.arc]} · ${durationLabel(prefs.durationMin)}`,
      state: st(1),
      onClick: () => setFolded(false),
    },
    {
      key: "run",
      label: "Recherche et analyse",
      detail: items.length
        ? `${analysed}/${items.length} analysés`
        : "YouTube, tempo, tonalité",
      state: st(2),
      onClick: radio.phase === "idle" ? undefined : () => scrollTo("radio-run"),
    },
    {
      key: "shows",
      label: "Émissions",
      detail: radio.shows.length
        ? `${radio.shows.length} set(s) composé(s)`
        : "sets qui s'enchaînent",
      state: st(3),
      onClick: radio.shows.length ? () => scrollTo("radio-shows") : undefined,
    },
  ];

  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
  const move = (key: string, ids: string[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    updateShow(key, next);
  };
  const send = (key: string, dest: RadioDest) => {
    const id = saveShow(key);
    if (id) onLaunchSet?.(dest, id);
  };

  return (
    <div className="prep hw-screwed hw-panel flex flex-1 flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-[220px]">
          <h1 className="text-base font-black uppercase tracking-[0.25em] text-neutral-100">
            Radio-AVA
          </h1>
          <p className="mt-0.5 max-w-xl text-[11px] text-neutral-500">
            Donne tes artistes préférés : la radio cherche leurs titres sur
            YouTube, analyse le tempo et la tonalité, puis compose des sets qui
            s&apos;enchaînent bien.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[640px] xl:flex-1">
          <StatTile
            label="Artistes"
            value={String(prefs.artists.length)}
            sub={prefs.artists.length ? "dans ta radio" : "à ajouter"}
            color="var(--prep-accent)"
          />
          <StatTile
            label="Titres trouvés"
            value={String(items.length)}
            sub="sur YouTube"
            color="#a78bfa"
          />
          <StatTile
            label="Analysés"
            value={`${analysed}/${items.length}`}
            sub="tempo et tonalité"
            color="#34d399"
            meter={items.length ? analysed / items.length : 0}
          />
          <StatTile
            label="Émissions"
            value={String(radio.shows.length)}
            sub={
              radio.shows.length ? "prêtes à jouer" : "aucune pour l'instant"
            }
            color="#ffcc00"
          />
        </div>
      </header>

      <StationBar
        stations={book.stations.map((st) => ({ id: st.id, name: st.name, artistCount: st.prefs.artists.length }))}
        currentId={station.id}
        locked={busy}
        onSelect={selectStation}
        onCreate={addStation}
        onRename={(id, name) => commit({ ...book, stations: book.stations.map((st) => (st.id === id ? { ...st, name: name.slice(0, 40) } : st)) })}
        onDuplicate={duplicateStation}
        onDelete={deleteStation}
      />

      <Journey steps={steps} />

      {setupVisible ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-stretch gap-2" role="group" aria-label="Ambiances rapides">
            <span className="flex items-center px-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Ambiances</span>
            {MOODS.map((m) => (
              <button key={m.key} type="button" disabled={busy} onClick={() => applyMood(m)} title={m.hint} className="prep-btn-ghost flex flex-col items-start px-3 py-1.5 text-left disabled:opacity-40">
                <span className="text-xs font-bold text-neutral-100">{m.label}</span>
                <span className="text-[10px] text-neutral-500">{m.hint}</span>
              </button>
            ))}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ArtistsPanel
              artists={prefs.artists}
              suggestions={suggestions}
              locked={busy}
              onAdd={addMany}
              onRemove={(id) =>
                change({ artists: prefs.artists.filter((a) => a.id !== id) })
              }
              onLove={(id, love) =>
                change({
                  artists: prefs.artists.map((a) =>
                    a.id === id ? { ...a, love } : a,
                  ),
                })
              }
              onClear={() => change({ artists: [] })}
            />
            <ProgramPanel
              arc={prefs.arc}
              durationMin={prefs.durationMin}
              perArtist={prefs.perArtist}
              soloSets={prefs.soloSets}
              busy={busy}
              onArc={(arc) => change({ arc })}
              onDuration={(durationMin) => change({ durationMin })}
              onPerArtist={(perArtist) => change({ perArtist })}
              onSolo={(soloSets) => change({ soloSets })}
            />
          </div>
          <AdvancedPanel prefs={prefs} busy={busy} onChange={change} />
          {/* always in reach: the launch button follows the page */}
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--prep-accent)] bg-[var(--prep-surface)] p-3 shadow-[0_10px_30px_rgba(0,0,0,.6)]">
            <div className="min-w-0 flex-1 text-[12px] text-neutral-300">
              {prefs.artists.length === 0
                ? "Ajoute au moins un artiste pour lancer la radio."
                : `${prefs.artists.length} artiste(s) · ${ARC_LABEL[prefs.arc]} · ${durationLabel(prefs.durationMin)} · ${wantedTotal} titres à chercher, environ ${Math.max(1, Math.round((wantedTotal * 3.5) / 60))} min (presque instantané pour les titres déjà connus)`}
            </div>
            {busy ? (
              <button type="button" className="prep-btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs font-bold" onClick={cancelRadio}>
                <Icon name="x" size={14} />
                Arrêter la radio
              </button>
            ) : (
              <button type="button" className="prep-btn-accent flex items-center gap-2 px-5 py-2.5 text-sm font-black" onClick={() => launch()} disabled={prefs.artists.length === 0} title="Raccourci : Cmd ou Ctrl + Entrée">
                <Icon name="play" size={15} />
                {radio.phase === "done" || radio.phase === "cancelled" ? "Relancer la radio" : "Lancer la radio"}
                <kbd className="hidden rounded bg-black/30 px-1.5 py-px font-mono text-[10px] font-normal sm:inline">⌘↵</kbd>
              </button>
            )}
          </div>
        </div>
      ) : (
        <section
          className="prep-card flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
          aria-label="Résumé de la radio"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {prefs.artists.slice(0, 6).map((a) => (
              <span
                key={a.id}
                className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-neutral-200"
              >
                {a.name}
              </span>
            ))}
            {prefs.artists.length > 6 && (
              <span className="text-[11px] text-neutral-500">{`+${prefs.artists.length - 6}`}</span>
            )}
            <span className="text-[11px] text-neutral-500">{`${ARC_LABEL[prefs.arc]} · ${durationLabel(prefs.durationMin)} · ${prefs.perArtist} titres par artiste${prefs.dj.auto ? " · DJ intelligent" : ""}`}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={() => setFolded(false)}
              disabled={busy}
            >
              <Icon name="edit" size={13} />
              Modifier
            </button>
            <button
              type="button"
              className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={() => launch(false)}
              disabled={busy}
              title="Recompose avec les titres déjà connus : presque instantané"
            >
              <Icon name="refresh" size={13} />
              Relancer
            </button>
            <button
              type="button"
              className="prep-btn-accent flex items-center gap-1.5 px-3 py-1.5 text-xs"
              onClick={() => launch(true)}
              disabled={busy}
              title="Cherche des titres que tu n'as pas encore"
            >
              <Icon name="search" size={13} />
              Nouveaux titres
            </button>
          </div>
        </section>
      )}

      <div id="radio-run" className="scroll-mt-4 empty:hidden">
        <RunPanel state={radio} onCancel={cancelRadio} />
      </div>

      {radio.shows.length > 0 && (
        <section
          id="radio-shows"
          className="flex scroll-mt-4 flex-col gap-3"
          aria-label="Émissions composées"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">
              Émissions
            </h2>
            <span className="rounded-full bg-white/5 px-2 py-px font-mono text-[10px] text-neutral-400">
              {radio.shows.length}
            </span>
            <span className="text-[10px] text-neutral-500">
              chaque set enchaîne tempos et tonalités compatibles
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={recomposeRadio}
                disabled={radioBusy()}
                title="Recompose les sets avec les mêmes titres, dans un autre ordre"
              >
                <Icon name="refresh" size={13} />
                Recomposer
              </button>
              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                onClick={resetRadio}
                disabled={radioBusy()}
                title="Efface le résultat (les titres restent dans ta bibliothèque)"
              >
                <Icon name="x" size={13} />
                Effacer
              </button>
            </div>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {radio.shows.map((show, i) => (
              <ShowCard
                key={show.key}
                show={show}
                tracks={tracksOf(show.trackIds)}
                saved={radio.savedShows[show.key] !== undefined}
                accent={ACCENTS[i % ACCENTS.length]}
                isStemReady={stemReady}
                canSend={!!onLaunchSet}
                defaultOpen={i === 0}
                onMove={(idx, dir) => move(show.key, show.trackIds, idx, dir)}
                onRemove={(idx) =>
                  updateShow(
                    show.key,
                    show.trackIds.filter((_, k) => k !== idx),
                  )
                }
                onSave={() => void saveShow(show.key)}
                onSend={(dest) => send(show.key, dest)}
                onPrepareStems={(ids) => {
                  const list = tracksOf(ids);
                  const n = list.length ? enqueuePrep(list) : 0;
                  flash(n > 0 ? `Stems : ${n} titre(s) mis en file, la séparation prend quelques minutes par titre` : "Ces stems sont déjà prêts ou en file");
                }}
                stemOf={stemOf}
                stemWait={getPrepWait()}
                onRename={(name) => renameShow(show.key, name)}
                prep={radio.prep[show.key]}
                onPrepare={() => void prepareShow(show.key)}
                onStepType={(idx, type) =>
                  setStep(
                    show.key,
                    idx,
                    type === "cut"
                      ? { type, sec: 0, sync: false, bassSwap: false }
                      : { type, sec: show.plan[idx]?.sec || 8 },
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {radio.phase === "done" && radio.shows.length === 0 && (
        <div className="prep-card px-4 py-6 text-center text-[12px] text-neutral-400">
          Pas assez de titres analysés pour composer un set (il en faut au moins
          2). Essaie d&apos;autres artistes, ou relance la radio.
        </div>
      )}
      {notice && (
        <div role="status" className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-4 py-2.5 text-xs font-semibold text-neutral-100" style={{ background: "var(--prep-surface-2)", border: "1px solid var(--prep-accent)", boxShadow: "0 10px 30px rgba(0,0,0,.6)" }}>
          {notice}
        </div>
      )}
    </div>
  );
}
