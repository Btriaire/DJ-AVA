"use client";
import { useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { AudiusTrack } from "@/lib/audius";

interface Props {
  engine: DJEngine;
  onClose: () => void;
  onLoaded: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

type Source = "audius" | "youtube";

// Library overlay: search Audius or YouTube (audio only, both proxied so we can
// apply live FX) or upload a local file, then send the track to deck A or B —
// even while a deck is playing.
export function LibraryPanel({ engine, onClose, onLoaded }: Props) {
  const [tab, setTab] = useState<"audius" | "youtube" | "upload">("audius");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AudiusTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSide = useRef<"A" | "B">("A");

  async function search() {
    if (!q.trim() || tab === "upload") return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/${tab}/search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (j.error) setErr(j.error);
      setResults(j.tracks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrack(side: "A" | "B", track: AudiusTrack, src: Source) {
    setBusy(track.id + side);
    setErr(null);
    try {
      const res = await fetch(`/api/${src}/stream?id=${track.id}`);
      if (!res.ok) throw new Error("Flux indisponible");
      const buf = await res.arrayBuffer();
      const deck = side === "A" ? engine.deckA : engine.deckB;
      await deck.load(buf, `${track.title} — ${track.artist}`);
      // keep the YouTube origin so the deck can send it to the MP3 converter
      deck.sourceLink = src === "youtube" ? `https://www.youtube.com/watch?v=${track.id}` : "";
      onLoaded();
    } catch (e) {
      setErr(`Chargement deck ${side} : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadFile(side: "A" | "B", file: File) {
    setBusy("file" + side);
    setErr(null);
    try {
      const deck = side === "A" ? engine.deckA : engine.deckB;
      await deck.load(file, file.name.replace(/\.[^.]+$/, ""));
      onLoaded();
    } catch (e) {
      setErr(`Décodage impossible : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="hw-panel flex max-h-[85vh] w-full max-w-2xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => { setTab("audius"); setResults([]); }}
              className={`hw-btn px-3 py-1 text-sm ${tab === "audius" ? "hw-btn-on" : "text-neutral-300"}`}
              style={{ ["--led" as string]: "#4dff84" }}
            >
              ♫ Audius
            </button>
            <button
              onClick={() => { setTab("youtube"); setResults([]); }}
              className={`hw-btn px-3 py-1 text-sm ${tab === "youtube" ? "hw-btn-on" : "text-neutral-300"}`}
              style={{ ["--led" as string]: "#ef4444" }}
            >
              ▶ YouTube
            </button>
            <button
              onClick={() => setTab("upload")}
              className={`hw-btn px-3 py-1 text-sm ${tab === "upload" ? "hw-btn-on" : "text-neutral-300"}`}
              style={{ ["--led" as string]: "#4dff84" }}
            >
              ⤓ Mes fichiers
            </button>
          </div>
          <button onClick={onClose} className="hw-btn px-2 py-1 text-neutral-400">
            ✕
          </button>
        </div>

        {err && <div className="bg-red-500/15 px-4 py-2 text-xs text-red-300">{err}</div>}

        {tab !== "upload" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-2 p-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={tab === "youtube" ? "Rechercher une chanson sur YouTube…" : "Rechercher un titre, un artiste…"}
                className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-[#4dff84]"
              />
              <button
                onClick={search}
                disabled={loading}
                className="hw-btn hw-btn-on px-4 py-2 text-sm disabled:opacity-50"
                style={{ ["--led" as string]: tab === "youtube" ? "#ef4444" : "#4dff84" }}
              >
                {loading ? "…" : "Chercher"}
              </button>
            </div>
            {tab === "youtube" && (
              <p className="px-4 pb-1 text-[10px] text-amber-300/80">
                ▶ Audio seul, importé via un proxy → passe dans le mixeur, l&apos;EQ et les effets (selon la dispo des serveurs).
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {results.length === 0 && !loading && (
                <p className="py-8 text-center text-sm text-neutral-600">
                  {tab === "youtube"
                    ? "Cherche une chanson : l'audio YouTube est chargé sur la platine (sans vidéo)."
                    : "Tape une recherche pour explorer le catalogue libre Audius."}
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {results.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded bg-neutral-800/50 p-2 hover:bg-neutral-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.artwork ?? ""}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded bg-neutral-700 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-100">{t.title}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {t.artist} · {fmt(t.duration)}
                        {t.bpm ? ` · ${t.bpm} BPM` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => loadTrack("A", t, tab as Source)}
                      disabled={busy !== null}
                      className="hw-btn px-2 py-1 text-xs text-[#ff8a1e] disabled:opacity-40"
                      style={{ ["--led" as string]: "#ff8a1e" }}
                    >
                      {busy === t.id + "A" ? "…" : "→ A"}
                    </button>
                    <button
                      onClick={() => loadTrack("B", t, tab as Source)}
                      disabled={busy !== null}
                      className="hw-btn px-2 py-1 text-xs text-[#4dff84] disabled:opacity-40"
                      style={{ ["--led" as string]: "#4dff84" }}
                    >
                      {busy === t.id + "B" ? "…" : "→ B"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-8">
            <p className="text-center text-sm text-neutral-400">
              Charge un fichier audio depuis ton ordi vers un deck. Possible pendant qu&apos;un autre
              morceau joue.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  pendingSide.current = "A";
                  fileRef.current?.click();
                }}
                disabled={busy !== null}
                className="hw-btn hw-btn-on px-5 py-3 disabled:opacity-50"
                style={{ ["--led" as string]: "#ff8a1e" }}
              >
                {busy === "fileA" ? "…" : "⤓ Charger sur A"}
              </button>
              <button
                onClick={() => {
                  pendingSide.current = "B";
                  fileRef.current?.click();
                }}
                disabled={busy !== null}
                className="hw-btn hw-btn-on px-5 py-3 disabled:opacity-50"
                style={{ ["--led" as string]: "#4dff84" }}
              >
                {busy === "fileB" ? "…" : "⤓ Charger sur B"}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(pendingSide.current, f);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
