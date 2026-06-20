"use client";
import { useEffect, useRef, useState } from "react";

// YouTube playback deck. Plays via the IFrame API — audio stays inside
// YouTube's player, so it CANNOT be routed through Web Audio (no EQ / filter /
// FX / crossfader). This is a hard YouTube limitation (no PCM access). Use
// Audius or uploads for anything you want to process live.

let apiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) {
      resolve();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function parseId(u: string): string | null {
  if (/^[\w-]{11}$/.test(u)) return u;
  try {
    const url = new URL(u);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12) || null;
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const m = url.pathname.match(/\/(embed|shorts)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {}
  return null;
}

interface YTPlayer {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
}

export function YouTubeDeck() {
  const [url, setUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(70);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadYTApi().then(() => setReady(true));
  }, []);

  function load() {
    const id = parseId(url.trim());
    if (!id) {
      alert("Lien YouTube invalide. Colle une URL ou un ID de vidéo.");
      return;
    }
    if (!ready || !divRef.current) {
      alert("API YouTube en cours de chargement, réessaie dans un instant.");
      return;
    }
    setCurrentId(id);
    if (playerRef.current) {
      playerRef.current.loadVideoById(id);
      setPlaying(true);
      return;
    }
    const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, opts: object) => YTPlayer } }).YT;
    playerRef.current = new YT.Player(divRef.current, {
      videoId: id,
      width: "100%",
      height: "100%",
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          e.target.setVolume(vol);
          e.target.playVideo();
          setPlaying(true);
        },
        onStateChange: (e: { data: number }) => setPlaying(e.data === 1),
      },
    });
  }

  // download the audio of a video (id or url) as MP3 via the server converter
  function convertToMp3(target: string) {
    const t = target.trim();
    const id = parseId(t);
    if (!id && !/^https?:\/\//.test(t)) {
      alert("Colle un lien YouTube valide à convertir.");
      return;
    }
    const param = id ? `id=${encodeURIComponent(id)}` : `url=${encodeURIComponent(t)}`;
    setConverting(true);
    const a = document.createElement("a");
    a.href = `/api/youtube/stream?${param}&dl=1`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // server-side extraction takes a few seconds; clear the hint after a bit
    setTimeout(() => setConverting(false), 6000);
  }

  // start the MP3 export of the currently-playing video
  function convertCurrent() {
    if (!currentId) {
      alert("Charge d'abord une vidéo dans le lecteur.");
      return;
    }
    convertToMp3(currentId);
  }

  function toggle() {
    const p = playerRef.current;
    if (!p) return;
    playing ? p.pauseVideo() : p.playVideo();
  }

  return (
    <div className="hw-panel flex flex-col gap-3 p-4 lg:col-span-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black tracking-tight">
          <span className="hw-led text-red-400">YOUTUBE</span>{" "}
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            lecture simple
          </span>
        </h2>
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
          ⚠ hors mixeur / effets (limitation YouTube)
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="hw-screen aspect-video w-full overflow-hidden md:w-72 md:shrink-0">
          <div ref={divRef} className="h-full w-full" />
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Colle un lien YouTube (ou un ID vidéo)…"
              className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-red-500"
            />
            <button
              onClick={load}
              className="hw-btn hw-btn-on px-4 py-2 text-sm"
              style={{ ["--led" as string]: "#ef4444" }}
            >
              Charger
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              disabled={!playerRef.current}
              className="hw-btn px-4 py-2 text-sm text-red-300 disabled:opacity-40"
              style={{ ["--led" as string]: "#ef4444" }}
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <div className="flex flex-1 items-center gap-2">
              <span className="text-[10px] uppercase text-neutral-500">Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setVol(v);
                  playerRef.current?.setVolume(v);
                }}
                className="dj-fader flex-1"
              />
            </div>
          </div>
          {/* quick export of the currently-playing video — the full converter
              lives under the effects (BOSS) unit in the mixer column */}
          <button
            onClick={convertCurrent}
            disabled={!currentId}
            className="hw-btn px-3 py-2 text-xs text-emerald-300 disabled:opacity-40"
            style={{ ["--led" as string]: "#34d399" }}
            title="Télécharge l'audio de la vidéo en cours en MP3"
          >
            {converting ? "conversion en cours…" : "⤓ Convertir cette vidéo en MP3"}
          </button>

          <p className="text-[10px] text-neutral-600">
            Le lecteur vidéo reste hors mixeur. Pour appliquer EQ, filtre et effets en direct, charge
            l&apos;audio via la bibliothèque (onglet YouTube). Le convertisseur MP3 (coller un lien)
            se trouve sous les effets spéciaux, dans la colonne du mixeur.
          </p>
        </div>
      </div>
    </div>
  );
}
