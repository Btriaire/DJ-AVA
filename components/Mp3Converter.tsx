"use client";
import { useState } from "react";

interface Props {
  // controlled link field so other panels (the decks) can push a track in
  link: string;
  onLinkChange: (v: string) => void;
  // bumped by callers to flash the panel when a track is sent in
  flash?: number;
}

// Pull a YouTube video id out of a URL or accept a bare 11-char id.
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

// Standalone YouTube → MP3 converter, tucked under the master-FX (BOSS) unit.
// Server-side yt-dlp + ffmpeg pipeline → downloads a 192 kbps MP3. Compact so it
// fits the narrow mixer column.
export function Mp3Converter({ link, onLinkChange, flash = 0 }: Props) {
  const [converting, setConverting] = useState(false);

  function convert(target: string) {
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

  return (
    <div
      className={`flex w-full flex-col gap-2 rounded-lg bg-black/30 p-2.5 ring-1 transition-shadow ${
        flash ? "ring-amber-400 shadow-[0_0_14px_rgba(52,211,153,.55)]" : "ring-white/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
          ⤓ Convertisseur MP3
        </span>
        {converting && (
          <span className="animate-pulse text-[9px] text-amber-300">conversion…</span>
        )}
      </div>
      <input
        value={link}
        onChange={(e) => onLinkChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && convert(link)}
        placeholder="Lien YouTube…"
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs outline-none ring-1 ring-neutral-700 focus:ring-amber-500"
      />
      <button
        onClick={() => convert(link)}
        className="hw-btn hw-btn-on px-3 py-1.5 text-xs"
        style={{ ["--led" as string]: "#ffcc00" }}
      >
        ⤓ Convertir en MP3
      </button>
      <p className="text-[9px] leading-tight text-neutral-600">
        Serveur yt-dlp + ffmpeg · 192 kbps.
      </p>
    </div>
  );
}
