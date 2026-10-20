"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { detectBPM } from "@/lib/audio/bpm";
import { detectKey } from "@/lib/audio/key";

type YTTrack = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork: string | null;
  views?: string;
  published?: string;
};

type FileInfo = {
  type: string;
  size: number;
  dur: number;
  channels: number;
  header: ReturnType<typeof mp3Header>;
  bpm: number;
  key: string;
};

const DUR_FILTERS = [
  { key: "all", label: "Toutes", min: 0, max: 0 },
  { key: "1", label: "<1min", min: 0, max: 60 },
  { key: "3", label: "<3min", min: 0, max: 180 },
  { key: "5", label: "<5min", min: 0, max: 300 },
  { key: "8", label: "<8min", min: 0, max: 480 },
  { key: "15", label: "<15min", min: 0, max: 900 },
  { key: "15+", label: ">15min", min: 900, max: 0 }
];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mp3Header(bytes: ArrayBuffer): {
  version: string;
  layer: string;
  kbps: number;
  rate: number;
  mode: string;
} | null {
  const view = new Uint8Array(bytes);
  let offset = 0;

  // Skip ID3v2 tag if present
  if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
    const size = ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) |
                 ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
    offset = 10 + size;
  }

  // Find first frame
  for (let i = offset; i < Math.min(offset + 65536, view.length - 4); i++) {
    if (view[i] === 0xff && (view[i+1] & 0xe0) === 0xe0) {
      const b1 = view[i+1];
      const b2 = view[i+2];
      const b3 = view[i+3];

      const version = (b1 >> 3) & 3;
      const layer = (b1 >> 1) & 3;
      const bitrateIndex = b2 >> 4;
      const freqIndex = (b2 >> 2) & 3;
      const mode = b3 >> 6;

      if (version === 1 || layer === 0 || freqIndex === 3) continue;

      const versionStr = version === 3 ? "MPEG-1" :
                         version === 2 ? "MPEG-2" : "MPEG-2.5";
      const layerStr = layer === 1 ? "Layer III" :
                       layer === 2 ? "Layer II" : "Layer I";

      const bitrateTable = version === 3 ?
        [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] :
        [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

      const freqTable = version === 3 ? [44100, 48000, 32000] :
                        version === 2 ? [22050, 24000, 16000] :
                        [11025, 12000, 8000];

      const kbps = layer === 1 ? bitrateTable[bitrateIndex] : 0;
      const rate = freqTable[freqIndex];
      const modeStr = mode === 0 ? "Stéréo" :
                      mode === 1 ? "Joint stéréo" :
                      mode === 2 ? "Double mono" : "Mono";

      return { version: versionStr, layer: layerStr, kbps, rate, mode: modeStr };
    }
  }
  return null;
}

export function YouTubeSearch({ ctx, color, busy, onOpen }: {
  ctx: BaseAudioContext;
  color: string;
  busy: boolean;
  onOpen: (name: string, bytes: ArrayBuffer, info: { label: string; value: string }[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YTTrack[]>([]);
  const [filteredResults, setFilteredResults] = useState<YTTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<YTTrack | null>(null);
  const [fileInfo, setFileInfo] = useState<Record<string, FileInfo>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, boolean>>({});
  const [artworkFallback, setArtworkFallback] = useState(0);
  const [analysing, setAnalysing] = useState("");
  const [durKey, setDurKey] = useState("all");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, { bytes: ArrayBuffer; type: string }>>(new Map());

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");

    try {
      const filter = DUR_FILTERS.find(f => f.key === durKey);
      const n = durKey === "all" ? 24 : 40;
      let url = `/api/youtube/search?q=${encodeURIComponent(query)}&n=${n}`;

      if (filter) {
        if (filter.min > 0) url += `&min=${filter.min}`;
        if (filter.max > 0) url += `&max=${filter.max}`;
      }

      const res = await fetch(url);
      const data = (await res.json()) as { tracks?: YTTrack[]; error?: string };

      if (data.error) {
        setError(data.error);
        setResults([]);
        setFilteredResults([]);
      } else {
        const tracks = data.tracks ?? [];
        setResults(tracks);

        if (filter && filter.key !== "all") {
          const filtered = tracks.filter(t =>
            (!t.duration || t.duration === 0) ||
            (filter.min <= t.duration && (filter.max === 0 || t.duration <= filter.max))
          );
          setFilteredResults(filtered);
        } else {
          setFilteredResults(tracks);
        }
      }
    } catch {
      setError("Erreur de connexion");
      setResults([]);
      setFilteredResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (id: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (previewId === id) {
      setPreviewId("");
      return;
    }
    setPreviewId(id);
    audioRef.current = new Audio(`/api/youtube/stream?id=${id}`);
    audioRef.current.play().catch(() => setPreviewId(""));
    audioRef.current.onended = () => setPreviewId("");
    audioRef.current.onerror = () => setPreviewId("");
  };

  const fetchBytes = async (t: YTTrack): Promise<ArrayBuffer> => {
    if (cacheRef.current.has(t.id)) {
      return cacheRef.current.get(t.id)!.bytes;
    }

    setDownloadProgress(prev => ({ ...prev, [t.id]: true }));
    try {
      const res = await fetch(`/api/youtube/stream?id=${t.id}`);
      if (!res.ok) throw new Error("Téléchargement impossible");
      const type = res.headers.get("Content-Type") || "audio/mpeg";
      const bytes = await res.arrayBuffer();
      cacheRef.current.set(t.id, { bytes, type });
      while (cacheRef.current.size > 6) cacheRef.current.delete(cacheRef.current.keys().next().value as string);
      return bytes;
    } catch {
      setError(`Erreur pour ${t.title}`);
      throw new Error("Téléchargement impossible");
    } finally {
      setDownloadProgress(prev => ({ ...prev, [t.id]: false }));
    }
  };

  const analyse = async (t: YTTrack) => {
    setAnalysing(t.id);
    try {
      const bytes = await fetchBytes(t);
      const buf = await ctx.decodeAudioData(bytes.slice(0));
      const header = mp3Header(bytes);
      const key = detectKey(buf);
      const bpm = detectBPM(buf);

      setFileInfo(prev => ({
        ...prev,
        [t.id]: {
          type: cacheRef.current.get(t.id)!.type,
          size: bytes.byteLength,
          dur: buf.duration,
          channels: buf.numberOfChannels,
          header,
          bpm,
          key: key ? `${key.camelot} · ${key.name}` : "—",
        }
      }));
    } catch {
      setError("Analyse impossible");
    } finally {
      setAnalysing("");
    }
  };

  const rows = (t: YTTrack): { label: string; value: string }[] => {
    const info = fileInfo[t.id];
    const baseRows = [
      { label: "Titre", value: t.title },
      { label: "Chaîne", value: t.artist },
      { label: "Durée", value: fmt(t.duration) },
      ...(t.views ? [{ label: "Vues", value: t.views }] : []),
      ...(t.published ? [{ label: "Publiée", value: t.published }] : []),
      { label: "Identifiant", value: t.id },
      { label: "Lien", value: `https://www.youtube.com/watch?v=${t.id}` },
    ];

    if (!info) return baseRows;

    const headerRows = info.header ? [
      { label: "Format", value: `${info.type} · ${info.header.version} ${info.header.layer}` },
      { label: "Débit", value: `${info.header.kbps} kb/s` },
      { label: "Fréquence", value: `${info.header.rate} Hz` },
      { label: "Canaux", value: info.header.mode },
    ] : [
      { label: "Débit", value: `${Math.round(info.size * 8 / info.dur / 1000)} kb/s` },
      { label: "Canaux", value: `${info.channels}` },
    ];

    return [
      ...baseRows,
      ...headerRows,
      { label: "Taille", value: `${(info.size / 1048576).toFixed(2)} Mo` },
      { label: "Durée exacte", value: `${info.dur.toFixed(2)} s` },
      { label: "BPM", value: `${info.bpm.toFixed(1)}` },
      { label: "Tonalité", value: info.key },
    ];
  };

  const open = async (t: YTTrack) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPreviewId("");
    try {
      const bytes = await fetchBytes(t);
      await onOpen(t.title, bytes.slice(0), rows(t));
      setSelectedTrack(null);
    } catch {
      setError("Téléchargement impossible");
    }
  };

  useEffect(() => {
    if (!selectedTrack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTrack(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTrack]);

  const handleDurationFilter = (key: string) => {
    setDurKey(key);
    if (query.trim()) {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Titre, artiste…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="hw-btn px-2 py-1 text-[11px] flex-1 min-w-[180px] bg-transparent"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="hw-btn px-2 py-1 text-[11px] font-bold"
        >
          {loading ? "…" : "CHERCHER"}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <div className="text-[10px] text-neutral-500">
        Clic sur OUVRIR pour travailler le morceau ; double-clic sur la pochette pour la voir en grand avec tous ses paramètres.
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        <div className="text-[10px] text-neutral-500 mr-2">Durée :</div>
        {DUR_FILTERS.map(filter => (
          <button
            key={filter.key}
            onClick={() => handleDurationFilter(filter.key)}
            className={`hw-btn px-2 py-1 text-[10px] ${durKey === filter.key ? "hw-btn-on" : ""}`}
            style={durKey === filter.key ? { ["--led" as string]: color } : {}}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {results.length > 0 && (
        <div className="text-[10px] text-neutral-500 mb-2">
          {filteredResults.length} résultat{filteredResults.length !== 1 ? "s" : ""}
          {filteredResults.length === 0 && results.length > 0 && (
            <span className="text-red-400 ml-2">Aucun morceau dans cette durée — essaie un autre filtre</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {filteredResults.map((t) => (
          <div key={t.id} className="hw-strip flex gap-2 p-1.5">
            <div
              className="hw-cover shrink-0 cursor-zoom-in"
              style={{ width: 96, height: 54 }}
              onDoubleClick={() => {
                setArtworkFallback(0);
                setSelectedTrack(t);
              }}
              title="Double-clic : pochette en grand et paramètres du fichier"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.artwork || `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`}
                alt=""
                className="object-cover h-full w-full"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="text-[11px] font-bold line-clamp-2">{t.title}</div>
              <div className="text-[10px] text-neutral-400">
                {t.artist} · {fmt(t.duration)}
                {t.views && ` · ${t.views}`}
              </div>
              <div className="flex gap-1 mt-auto">
                <button
                  onClick={() => handlePreview(t.id)}
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${previewId === t.id ? "hw-btn-on" : ""}`}
                  style={previewId === t.id ? { ["--led" as string]: color } : {}}
                >
                  {previewId === t.id ? "■ STOP" : "▶ ÉCOUTER"}
                </button>
                <button
                  onClick={() => open(t)}
                  disabled={busy || downloadProgress[t.id]}
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                >
                  {downloadProgress[t.id] ? "…" : "OUVRIR"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedTrack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setSelectedTrack(null)}
        >
          <div
            className="hw-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto p-3 flex flex-col gap-3 md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hw-cover w-full md:w-[560px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  artworkFallback === 0 ? `https://i.ytimg.com/vi/${selectedTrack.id}/maxresdefault.jpg` :
                  artworkFallback === 1 ? `https://i.ytimg.com/vi/${selectedTrack.id}/hqdefault.jpg` :
                  selectedTrack.artwork || `https://i.ytimg.com/vi/${selectedTrack.id}/mqdefault.jpg`
                }
                alt=""
                className="w-full h-auto"
                onError={() => setArtworkFallback(prev => prev + 1)}
              />
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <div className="text-sm font-black" style={{ color }}>
                {selectedTrack.title}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {rows(selectedTrack).map((row, i) => (
                  <Fragment key={i}>
                    <div className="text-neutral-500">{row.label}</div>
                    <div className="text-neutral-200 break-all">
                      {row.label === "Lien" ? (
                        <a
                          href={row.value}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
                FICHIER AUDIO
              </div>
              {!fileInfo[selectedTrack.id] && (
                <>
                  <button
                    onClick={() => analyse(selectedTrack)}
                    disabled={downloadProgress[selectedTrack.id] || analysing === selectedTrack.id}
                    className="hw-btn px-2 py-1 text-[11px] font-bold"
                  >
                    {analysing === selectedTrack.id ? "ANALYSE…" : "ANALYSER LE FICHIER"}
                  </button>
                  <div className="text-[10px] text-neutral-400">
                    Télécharge le son pour lire son format, son débit, sa fréquence, son tempo et sa tonalité.
                  </div>
                </>
              )}
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => open(selectedTrack)}
                  disabled={busy || downloadProgress[selectedTrack.id]}
                  className="hw-btn px-2 py-1 text-[11px] font-bold hw-btn-on"
                  style={{ ["--led" as string]: color }}
                >
                  OUVRIR DANS L&apos;ATELIER
                </button>
                <button
                  onClick={() => setSelectedTrack(null)}
                  className="hw-btn px-2 py-1 text-[11px] font-bold"
                >
                  FERMER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
