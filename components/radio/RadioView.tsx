"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadLibrary, uid, type LibTrack } from "@/lib/library";
import { OneClick } from "./OneClick";
import {
  cancelPrep,
  enqueuePrep,
  getPrepState,
  getPrepWait,
  subscribePrep,
} from "@/lib/stemPrep";
import {
  cancelRadio,
  getRadioState,
  loadStations,
  prepareShow,
  regenerateArtist,
  moreOfArtist,
  canExtendArtist,
  analyzeAndRecompose,
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
import { ClassicalPanel } from "./ClassicalPanel";
import { CatalogPanel } from "./CatalogPanel";
import { TopicBox } from "./TopicBox";
import { curatedFor } from "@/lib/styles";
import { PrepDock, type PrepRow } from "./PrepDock";
import { findComposer } from "@/lib/classical";
import { pickTech } from "@/lib/stemMix";
import { useStemsShared } from "@/lib/stemsShared";
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
  const station =
    book.stations.find((st) => st.id === book.current) ?? book.stations[0];
  const prefs = station.prefs;
  const classical = prefs.mode === "classical";
  const gentleCatalog = prefs.mode === "zen" || prefs.mode === "calm"; // soft radios: titles by name, soft blends, almost no DJ effect
  // leaving zen / calm: the DJ goes back to its normal force, blends and style
  const normalDj = (dj: RadioPrefs["dj"]): RadioPrefs["dj"] => (dj.genre === "zen" || dj.genre === "calm" ? { ...dj, genre: "auto", force: 3, blend: "normal", stems: "punchy" } : dj);
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
    commit({
      ...book,
      stations: book.stations.map((st) =>
        st.id === station.id ? { ...st, prefs: { ...st.prefs, ...patch } } : st,
      ),
    });

  const selectStation = (id: string) => {
    if (busy) return;
    if (radio.phase !== "idle") resetRadio(); // the results belong to the radio that made them
    setFolded(false);
    commit({ ...book, current: id });
  };
  const addStation = () => {
    const id = uid();
    commit({
      current: id,
      stations: [
        ...book.stations,
        {
          id,
          name: `Radio ${book.stations.length + 1}`,
          prefs: { ...DEFAULT_PREFS, dj: { ...prefs.dj } },
        },
      ],
    });
    resetRadio();
    setFolded(false);
  };
  const duplicateStation = (id: string) => {
    const src = book.stations.find((st) => st.id === id);
    if (!src) return;
    const copy = uid();
    commit({
      current: copy,
      stations: [
        ...book.stations,
        {
          id: copy,
          name: `${src.name} (copie)`,
          prefs: JSON.parse(JSON.stringify(src.prefs)) as RadioPrefs,
        },
      ],
    });
    resetRadio();
  };
  const deleteStation = (id: string) => {
    if (book.stations.length < 2) return;
    const left = book.stations.filter((st) => st.id !== id);
    commit({ current: left[0].id, stations: left });
    resetRadio();
  };

  // quick moods: one click sets the shape, the length and the advanced options together
  const MOODS: {
    key: string;
    label: string;
    hint: string;
    patch: Partial<RadioPrefs>;
  }[] = [
    {
      key: "party",
      label: "Soirée",
      hint: "Monte jusqu'au pic, 1 h 30",
      patch: {
        arc: "peak",
        durationMin: 90,
        tempoSpread: 15,
        tempoMin: 0,
        tempoMax: 0,
        harmony: "balanced",
        maxShows: 2,
      },
    },
    {
      key: "warm",
      label: "Échauffement",
      hint: "Tempo qui monte, 45 min",
      patch: {
        arc: "rise",
        durationMin: 45,
        tempoSpread: 8,
        tempoMin: 0,
        tempoMax: 0,
        harmony: "balanced",
      },
    },
    {
      key: "chill",
      label: "Chill",
      hint: "Doux et accordé, 1 h",
      patch: {
        arc: "flow",
        durationMin: 60,
        tempoSpread: 4,
        tempoMin: 0,
        tempoMax: 115,
        harmony: "strict",
      },
    },
    {
      key: "sport",
      label: "Sport",
      hint: "120 à 160 BPM qui montent",
      patch: {
        arc: "rise",
        durationMin: 45,
        tempoSpread: 15,
        tempoMin: 120,
        tempoMax: 160,
        harmony: "free",
      },
    },
    {
      key: "discover",
      label: "Découverte",
      hint: "Des titres pas encore rangés",
      patch: {
        avoidUsed: true,
        version: "any",
        maxShows: 3,
        mixArtists: "alternate",
      },
    },
  ];
  const MOODS_CLASSICAL: typeof MOODS = [
    {
      key: "focus",
      label: "Concentration",
      hint: "Piano et cordes calmes, 1 h",
      patch: {
        arc: "flow",
        durationMin: 60,
        classical: { ...prefs.classical, mood: "calme", instrument: "all" },
      },
    },
    {
      key: "dinner",
      label: "Dîner",
      hint: "Calme et joyeux, 1 h",
      patch: {
        arc: "flow",
        durationMin: 60,
        classical: { ...prefs.classical, mood: "joyeux", instrument: "all" },
      },
    },
    {
      key: "drama",
      label: "Grand frisson",
      hint: "Dramatique et intense qui monte",
      patch: {
        arc: "rise",
        durationMin: 45,
        classical: {
          ...prefs.classical,
          mood: "intense",
          instrument: "orchestre",
        },
      },
    },
    {
      key: "sleep",
      label: "Sommeil",
      hint: "Calme qui descend, 45 min",
      patch: {
        arc: "fall",
        durationMin: 45,
        classical: { ...prefs.classical, mood: "calme", instrument: "piano" },
      },
    },
  ];
  const moods = classical ? MOODS_CLASSICAL : MOODS;
  const applyMood = (m: (typeof MOODS)[number]) => {
    change(m.patch);
    flash(`Ambiance « ${m.label} » appliquée`);
  };

  // several names typed in one go are added one after the other: each call must see the previous ones
  const addMany = (names: string[], extra: Partial<RadioPrefs> = {}) => {
    const have = new Set(prefs.artists.map((a) => a.name.toLowerCase()));
    const fresh = names
      .map((n) => n.replace(/\s+/g, " ").trim().slice(0, 60))
      .filter(
        (n) => n && !have.has(n.toLowerCase()) && have.add(n.toLowerCase()),
      )
      .slice(0, 24 - prefs.artists.length);
    if (fresh.length || Object.keys(extra).length)
      change({
        ...extra,
        artists: [
          ...prefs.artists,
          ...fresh.map((name) => ({ id: uid(), name, love: 2 as const })),
        ],
      });
  };

  // the settings of a zen or calm radio: soft blends, one decision for the whole set, almost no DJ effect, no analysis
  const gentlePatch = (m: "zen" | "calm"): Partial<RadioPrefs> => ({
    mode: m,
    content: "studio",
    arc: "flow",
    maxTrackMin: 12,
    mixArtists: "alternate",
    analysis: "none",
    dj: { ...prefs.dj, genre: m, force: 1, blend: m === "zen" ? "xlong" : "long", stems: "off", voice: "off" },
  });
  // A style or a mood typed instead of an artist. A style the app knows brings its best-known songs or artists (lists
  // made for that); any other word is searched by popularity.
  const addTopic = (name: string) => {
    const hit = curatedFor(name);
    if (hit.collections.length) {
      const kind = hit.collections[0].genre;
      const labels = hit.collections.map((c) => c.label);
      addMany(labels, kind === "zen" || kind === "calm" ? gentlePatch(kind) : { dj: { ...prefs.dj, genre: kind } });
      flash(`« ${name} » : ${labels.length} liste(s) des titres les plus connus ajoutée(s)`);
      return;
    }
    if (hit.style) {
      addMany(hit.style.artists.slice(0, 5), { dj: { ...prefs.dj, genre: hit.style.genre } });
      flash(`« ${hit.style.label} » : ses artistes les plus connus sont ajoutés`);
      return;
    }
    if (prefs.artists.some((a) => a.name.toLowerCase() === name.toLowerCase()) || prefs.artists.length >= 24) return;
    change({ artists: [...prefs.artists, { id: uid(), name: name.slice(0, 60), love: 2 as const, topic: true }] });
    flash(`« ${name} » ajouté : la radio prendra les titres les plus écoutés pour ce style`);
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

  // stems made anywhere (the preparation, a deck of the Console, the Playlist) count here too
  const shared = useStemsShared();
  const stemReady = (id: string) => shared.has(byId.get(id));
  // state of the stems of a song, from the preparation queue
  const stemOf = (id: string) => {
    const job = prep.jobs.find((j) => j.trackId === id);
    if (!job) return stemInfoFrom(stemReady(id) ? "done" : "none");
    if (job.status === "error") return stemInfoFrom("error", job.error);
    if (job.status === "running")
      return stemInfoFrom(
        job.phase === "download"
          ? "download"
          : `separate ${Math.round(job.progress)}`,
      );
    return stemInfoFrom("queued");
  };

  const items = radio.items.filter((i) => !(i.spare && i.status === "found"));
  const analysed = items.filter((i) => i.status === "ready").length;
  const scrollTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  // ---- the preparation dock: songs on disk, DJ voice clips, stems, each with its own bar ----
  const allIds = [...new Set(radio.shows.flatMap((sh) => sh.trackIds))];
  const preps = Object.values(radio.prep);
  const dockRows: PrepRow[] = [];
  if (preps.length) {
    const warmed = preps.reduce((n, pp) => n + pp.warmed, 0);
    const wTotal = preps.reduce((n, pp) => n + pp.total, 0);
    dockRows.push({
      key: "audio",
      label: "Titres téléchargés",
      done: warmed,
      total: wTotal,
      state: warmed < wTotal ? "running" : "done",
      color: "#38bdf8",
      detail:
        warmed < wTotal
          ? `Copie sur le disque pour un démarrage instantané : encore ${wTotal - warmed} titre(s)`
          : "Tous les titres démarrent sans attente",
    });
    const vTotal = preps.reduce((n, pp) => n + pp.voiceTotal, 0);
    if (vTotal > 0) {
      const voiced = preps.reduce((n, pp) => n + pp.voiced, 0);
      const failed = preps.some((pp) => pp.voiceFailed);
      const left = vTotal - voiced;
      dockRows.push({
        key: "voice",
        label: "Voix du DJ (anglais)",
        done: voiced,
        total: vTotal,
        state: failed ? "warn" : left > 0 ? "running" : "done",
        color: "#e879f9",
        detail: failed
          ? "Le serveur de voix ne répond pas : l'émission jouera sans annonces"
          : left > 0
            ? `Fabriquée sur le serveur MaRuche : encore ${left} phrase(s), environ ${Math.ceil((left * 105) / 60)} min`
            : "Toutes les annonces sont prêtes",
      });
    }
  }
  const stemJobs = prep.jobs.filter((j) => allIds.includes(j.trackId));
  const stemsDone = allIds.filter(stemReady).length;
  if (
    allIds.length &&
    (stemJobs.length > 0 || stemsDone > 0) &&
    (preps.length > 0 || stemJobs.length > 0)
  ) {
    const running = stemJobs.find((j) => j.status === "running");
    const queuedN = stemJobs.filter((j) => j.status === "queued").length;
    const errorsN = stemJobs.filter((j) => j.status === "error").length;
    dockRows.push({
      key: "stems",
      label: "Stems (batterie, basse, voix, autres)",
      done: stemsDone,
      total: allIds.length,
      state: running || queuedN > 0 ? "running" : errorsN > 0 ? "warn" : "done",
      color: "#ffcc00",
      detail: running
        ? `En cours : ${running.name.slice(0, 48)} · ${running.phase === "download" ? "téléchargement" : `séparation ${Math.round(running.progress)} %`}${queuedN ? ` · ${queuedN} en file` : ""}`
        : queuedN > 0
          ? `${queuedN} titre(s) en file`
          : errorsN > 0
            ? `${errorsN} titre(s) en erreur : relance « Préparer les stems »`
            : "Tous les stems sont prêts",
    });
  }
  const dockTotal = dockRows.reduce((n, r) => n + r.total, 0);
  const dockPct = dockTotal
    ? Math.round(
        (dockRows.reduce((n, r) => n + Math.min(r.done, r.total), 0) /
          dockTotal) *
          100,
      )
    : 0;
  const dockDone =
    dockRows.length > 0 && dockRows.every((r) => r.state === "done");
  const waitMsg = getPrepWait();
  const prepareAll = async () => {
    for (const sh of radio.shows)
      if (!radio.prep[sh.key]) await prepareShow(sh.key);
  };
  const regen = async (artistId: string) => {
    const name =
      prefs.artists.find((a) => a.id === artistId)?.name ?? "cet artiste";
    flash(`${name} : recherche de nouveaux titres…`);
    const n = await regenerateArtist(artistId);
    flash(
      n > 0
        ? `${name} : ${n} nouveau(x) titre(s), les sets sont recomposés`
        : `${name} : aucun nouveau titre trouvé pour l'instant`,
    );
  };
  const more = async (artistId: string) => {
    const name = prefs.artists.find((a) => a.id === artistId)?.name ?? "cet artiste";
    flash(`${name} : recherche de titres supplémentaires…`);
    const n = await moreOfArtist(artistId);
    flash(n > 0 ? `${name} : ${n} titre(s) ajouté(s)` : `${name} : aucun autre titre trouvé pour l'instant`);
  };
  const flags = [
    prefs.artists.length > 0,
    radio.phase !== "idle",
    radio.phase === "done" || radio.phase === "cancelled",
    radio.shows.length > 0,
    dockDone,
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
    {
      key: "prep",
      label: "Préparation",
      detail: dockRows.length
        ? dockDone
          ? "tout est prêt"
          : `${dockPct} % prêt`
        : "audio, voix, stems",
      state: st(4),
      onClick: radio.shows.length ? () => scrollTo("radio-prep") : undefined,
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

      <OneClick tracks={lib.tracks} onLaunch={onLaunchSet ? (id) => onLaunchSet("relay", id) : undefined} />

      <StationBar
        stations={book.stations.map((st) => ({
          id: st.id,
          name: st.name,
          artistCount: st.prefs.artists.length,
        }))}
        currentId={station.id}
        locked={busy}
        onSelect={selectStation}
        onCreate={addStation}
        onRename={(id, name) =>
          commit({
            ...book,
            stations: book.stations.map((st) =>
              st.id === id ? { ...st, name: name.slice(0, 40) } : st,
            ),
          })
        }
        onDuplicate={duplicateStation}
        onDelete={deleteStation}
      />

      <Journey steps={steps} />

      {setupVisible ? (
        <div className="flex flex-col gap-4">
          <div className="prep-card flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                Type de radio
              </span>
              <div className="prep-seg" role="group" aria-label="Type de radio">
                <button type="button" aria-pressed={prefs.mode === "artists"} disabled={busy} onClick={() => change({ mode: "artists", dj: normalDj(prefs.dj) })}>
                  Artistes
                </button>
                <button
                  type="button"
                  aria-pressed={prefs.mode === "style"}
                  disabled={busy}
                  onClick={() => {
                    change({ mode: "style", dj: normalDj(prefs.dj) });
                    flash("Radio par style : touche un style pour ajouter ses artistes");
                  }}
                  title="Un style de musique apporte ses artistes typiques"
                >
                  Style
                </button>
                <button
                  type="button"
                  aria-pressed={prefs.mode === "collection"}
                  disabled={busy}
                  onClick={() => {
                    change({ mode: "collection", dj: normalDj(prefs.dj) });
                    flash("Radio par collection : choisis des listes de titres");
                  }}
                  title="Des listes de titres précis : hits d'une époque, soirée disco..."
                >
                  Collection
                </button>
                <button
                  type="button"
                  aria-pressed={prefs.mode === "zen"}
                  disabled={busy}
                  onClick={() => {
                    change(gentlePatch("zen"));
                    flash("Radio Zen : choisis des ambiances. Fondus très longs, presque aucun effet.");
                  }}
                  title="Ambient et méditation : des titres très calmes, enchaînés par de longs fondus, presque sans effet DJ"
                >
                  Zen
                </button>
                <button
                  type="button"
                  aria-pressed={prefs.mode === "calm"}
                  disabled={busy}
                  onClick={() => {
                    change(gentlePatch("calm"));
                    flash("Radio Calm : choisis un style de piano. Fondus doux, réverb légère seulement.");
                  }}
                  title="Piano calme : fondus doux, juste une réverb ou un écho léger"
                >
                  Calm
                </button>
                <button
                  type="button"
                  aria-pressed={classical}
                  disabled={busy}
                  onClick={() => {
                    change({
                      mode: "classical",
                      content: "studio",
                      arc: "flow",
                      maxTrackMin: 12,
                      mixArtists: "alternate",
                      dj: normalDj(prefs.dj),
                    });
                    flash(
                      "Radio classique : choisis des compositeurs (la liste d'artistes actuelle est conservée)",
                    );
                  }}
                  title="Compositeurs et leurs pièces les plus connues, enchaînées en douceur"
                >
                  Musique classique
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Création de la liste</span>
              <div className="prep-seg" role="group" aria-label="Création de la liste">
                <button type="button" aria-pressed={prefs.analysis === "full"} disabled={busy} onClick={() => change({ analysis: "full" })} title="Mesure le tempo et la tonalité : les sets s'enchaînent au mieux">
                  Avec analyse
                </button>
                <button type="button" aria-pressed={prefs.analysis === "none"} disabled={busy} onClick={() => change({ analysis: "none" })} title="Instantané : les titres sont alternés entre artistes, sans mesurer tempo ni tonalité (tu peux analyser après)">
                  Sans analyse
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                Type de titres
              </span>
              <div
                className="prep-seg"
                role="group"
                aria-label="Type de titres"
              >
                {(
                  [
                    ["studio", "Studio"],
                    ["live", "Live / concert"],
                    ["instrumental", "Instrumental"],
                    ["acapella", "Voix seule"],
                    ["acoustic", "Acoustique"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={prefs.content === k}
                    disabled={busy}
                    onClick={() => change({ content: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">
              {prefs.content === "live"
                ? "Enregistrements de concerts : plus longs, le tempo est moins régulier, l'analyse est moins sûre."
                : prefs.content === "instrumental"
                  ? "Versions sans chant (les karaokés sont écartés)."
                  : prefs.content === "acapella"
                    ? "Voix seule, sans musique : pas de tempo fiable, les enchaînements se font surtout à la tonalité."
                    : prefs.content === "acoustic"
                      ? "Versions acoustiques et unplugged."
                      : "Versions studio officielles."}
            </p>
          </div>
          <div
            className={`${gentleCatalog ? "hidden" : "flex"} flex-wrap items-stretch gap-2`}
            role="group"
            aria-label="Ambiances rapides"
          >
            <span className="flex items-center px-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
              Ambiances
            </span>
            {moods.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={busy}
                onClick={() => applyMood(m)}
                title={m.hint}
                className="prep-btn-ghost flex flex-col items-start px-3 py-1.5 text-left disabled:opacity-40"
              >
                <span className="text-xs font-bold text-neutral-100">
                  {m.label}
                </span>
                <span className="text-[10px] text-neutral-500">{m.hint}</span>
              </button>
            ))}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              {!classical && (
                <TopicBox mode={prefs.mode as "artists" | "style" | "collection" | "zen" | "calm"} chosen={prefs.artists.map((a) => a.name)} locked={busy} onAdd={addTopic} />
              )}
              <ArtistsPanel
                variant={classical ? "composer" : prefs.mode === "collection" || gentleCatalog ? "collection" : "artist"}
                onRegenerate={
                  radio.phase === "done" || radio.phase === "cancelled"
                    ? (id) => void regen(id)
                    : undefined
                }
                onMore={
                  radio.phase === "done" || radio.phase === "cancelled"
                    ? (id) => void more(id)
                    : undefined
                }
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
              {(prefs.mode === "style" || prefs.mode === "collection" || gentleCatalog) && (
                <CatalogPanel
                  kind={prefs.mode as "style" | "collection" | "zen" | "calm"}
                  chosen={prefs.artists.map((a) => a.name)}
                  locked={busy}
                  onToggleStyle={(names, on, genre) => {
                    if (on) addMany(names, { dj: { ...prefs.dj, genre } }); // the DJ plays the effects of that style
                    else change({ artists: prefs.artists.filter((a) => !names.some((n) => n.toLowerCase() === a.name.toLowerCase())) });
                  }}
                  onToggleCollection={(label, genre) => {
                    const have = prefs.artists.find((a) => a.name.toLowerCase() === label.toLowerCase());
                    if (have) change({ artists: prefs.artists.filter((a) => a.id !== have.id) });
                    else addMany([label], { dj: { ...prefs.dj, genre } });
                  }}
                />
              )}
              {classical && (
                <ClassicalPanel
                  chosen={prefs.artists.map((a) => a.name)}
                  eras={prefs.classical.eras}
                  instrument={prefs.classical.instrument}
                  mood={prefs.classical.mood}
                  locked={busy}
                  onToggleComposer={(name) => {
                    const have = prefs.artists.find(
                      (a) => a.name.toLowerCase() === name.toLowerCase(),
                    );
                    change({
                      artists: have
                        ? prefs.artists.filter((a) => a.id !== have.id)
                        : [
                            ...prefs.artists,
                            {
                              id: uid(),
                              name: findComposer(name)?.name ?? name,
                              love: 2,
                            },
                          ],
                    });
                  }}
                  onEras={(eras) =>
                    change({ classical: { ...prefs.classical, eras } })
                  }
                  onInstrument={(instrument) =>
                    change({ classical: { ...prefs.classical, instrument } })
                  }
                  onMood={(mood) =>
                    change({ classical: { ...prefs.classical, mood } })
                  }
                />
              )}
            </div>
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
              <button
                type="button"
                className="prep-btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
                onClick={cancelRadio}
              >
                <Icon name="x" size={14} />
                Arrêter la radio
              </button>
            ) : (
              <button
                type="button"
                className="prep-btn-accent flex items-center gap-2 px-5 py-2.5 text-sm font-black"
                onClick={() => launch()}
                disabled={prefs.artists.length === 0}
                title="Raccourci : Cmd ou Ctrl + Entrée"
              >
                <Icon name="play" size={15} />
                {radio.phase === "done" || radio.phase === "cancelled"
                  ? "Relancer la radio"
                  : "Lancer la radio"}
                <kbd className="hidden rounded bg-black/30 px-1.5 py-px font-mono text-[10px] font-normal sm:inline">
                  ⌘↵
                </kbd>
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
                className="flex items-center gap-1 rounded-full bg-white/5 py-1 pl-2.5 pr-1 text-[11px] font-semibold text-neutral-200"
              >
                {a.name}
                {(radio.phase === "done" || radio.phase === "cancelled") && (
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
                    onClick={() => void regen(a.id)}
                    aria-label={`Régénérer la liste de ${a.name}`}
                    title={`Régénérer : une nouvelle liste de titres pour ${a.name}`}
                  >
                    <Icon name="refresh" size={11} />
                  </button>
                )}
              </span>
            ))}
            {prefs.artists.length > 6 && (
              <span className="text-[11px] text-neutral-500">{`+${prefs.artists.length - 6}`}</span>
            )}
            <span className="text-[11px] text-neutral-500">{`${ARC_LABEL[prefs.arc]} · ${durationLabel(prefs.durationMin)} · ${prefs.perArtist} ${classical ? "pièces par compositeur" : "titres par artiste"}${prefs.content !== "studio" ? ` · ${prefs.content}` : ""}${prefs.dj.auto ? " · DJ intelligent" : ""}`}</span>
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
        <RunPanel
          state={radio}
          onCancel={cancelRadio}
          onRegenerate={(id) => void regen(id)}
          onMore={(id) => void more(id)}
          canExtend={canExtendArtist}
          onAnalyze={() => void analyzeAndRecompose()}
        />
      </div>

      {radio.shows.length > 0 && (
        <div id="radio-prep" className="scroll-mt-4">
          <PrepDock
            rows={dockRows}
            wait={
              waitMsg === "memory"
                ? "Les stems attendent : la mémoire est presque pleine, ils repartent dès qu'elle se libère."
                : waitMsg === "playback"
                  ? "Les stems attendent : une platine joue, la séparation reprend à l'arrêt de la lecture."
                  : null
            }
            canPrepare={radio.shows.some((sh) => !radio.prep[sh.key])}
            onPrepareAll={() => void prepareAll()}
            queuedStems={stemJobs.filter((j) => j.status === "queued").length}
            onCancelStems={() =>
              stemJobs
                .filter((j) => j.status === "queued")
                .forEach((j) => cancelPrep(j.trackId))
            }
          />
        </div>
      )}

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
                  flash(
                    n > 0
                      ? `Stems : ${n} titre(s) mis en file, la séparation prend quelques minutes par titre`
                      : "Ces stems sont déjà prêts ou en file",
                  );
                }}
                onStepSec={(idx, sec) => setStep(show.key, idx, { sec })}
                stemOf={stemOf}
                stemTech={(i) => {
                  const a = byId.get(show.trackIds[i]);
                  const b = byId.get(show.trackIds[i + 1]);
                  const step = show.plan[i];
                  // the first song plays before it can be switched to stems: it only leaves with its stems from the second song on
                  return a && b && step ? pickTech({ outStems: i > 0 && stemReady(a.id), inStems: stemReady(b.id), index: i, mode: prefs.dj.stems ?? "punchy", type: step.type, sec: step.sec, rules: prefs.dj.rules }) : null;
                }}
                stemWait={getPrepWait()}
                onRename={(name) => renameShow(show.key, name)}
                onRegenerate={
                  show.artist
                    ? () => {
                        const a = prefs.artists.find(
                          (x) => x.name === show.artist,
                        );
                        if (a) void regen(a.id);
                      }
                    : undefined
                }
                prep={radio.prep[show.key]}
                onPrepare={() => {
                  void prepareShow(show.key);
                  setTimeout(() => scrollTo("radio-prep"), 150);
                }}
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
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-4 py-2.5 text-xs font-semibold text-neutral-100"
          style={{
            background: "var(--prep-surface-2)",
            border: "1px solid var(--prep-accent)",
            boxShadow: "0 10px 30px rgba(0,0,0,.6)",
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
