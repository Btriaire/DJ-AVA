"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LibTrack } from "@/lib/library";
import { Icon, Mosaic } from "../prep/parts";

// The set's poster in the Sets header: click it to choose an image, take a title's art, or go back to the mosaic.
// Images are cut square and shrunk to 320 px JPEG (about 20-40 KB), so they fit in the sets' own small storage key.
const SIDE = 320;

function squareJpeg(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      if (!s) return reject(new Error("image vide"));
      const c = document.createElement("canvas");
      c.width = c.height = SIDE;
      const g = c.getContext("2d");
      if (!g) return reject(new Error("canvas"));
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIDE, SIDE);
      try {
        resolve(c.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        reject(e); // a remote image without CORS: the canvas is tainted
      }
    };
    img.onerror = () => reject(new Error("image illisible"));
    img.src = src;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function SetPoster({ tracks, cover, size = 112, onCover }: { tracks: LibTrack[]; cover?: string; size?: number; onCover: (cover: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const withArt = tracks.filter((t) => t.art).filter((t, i, a) => a.findIndex((x) => x.art === t.art) === i).slice(0, 12);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = async (src: string, keepIfFails: boolean) => {
    setError(null);
    try {
      onCover(await squareJpeg(src));
      setOpen(false);
    } catch {
      // a remote art that cannot be redrawn is kept as its URL (small already)
      if (keepIfFails && !src.startsWith("data:")) {
        onCover(src);
        setOpen(false);
      } else setError("Image illisible : essaie un JPEG ou un PNG.");
    }
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group relative block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prep-accent)]"
        aria-label="Changer l'affichette du set"
        aria-expanded={open}
        title="Changer l'affichette du set"
      >
        <Mosaic tracks={tracks} size={size} accent="var(--prep-accent)" cover={cover} />
        <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-md bg-black/55 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <Icon name="edit" size={13} /> Affichette
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label="Affichette du set" className="prep-card absolute left-0 top-full z-30 mt-2 flex w-72 flex-col gap-2.5 p-3 shadow-2xl">
          <button type="button" className="prep-btn-accent flex min-h-9 items-center justify-center gap-1.5 px-3 text-xs" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={14} /> Choisir une image…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) pick(await readFile(f), false);
            }}
          />
          {withArt.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">Pochette d&apos;un titre</p>
              <div className="grid grid-cols-6 gap-1.5">
                {withArt.map((t) => (
                  <button key={t.id} type="button" onClick={() => pick(t.art!, true)} title={t.name} aria-label={`Prendre la pochette de « ${t.name} »`} className="overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prep-accent)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- track thumbnails */}
                    <img src={t.art} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}
          {cover && (
            <button type="button" className="prep-btn-ghost flex min-h-9 items-center justify-center px-3 text-xs" onClick={() => { onCover(undefined); setOpen(false); }}>
              Revenir à la mosaïque des titres
            </button>
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// The set's name in the Sets header: click to rename, Enter or leaving the field saves, Escape cancels.
export function SetTitle({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const v = (draft ?? "").trim();
    if (v && v !== name) onRename(v);
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") setDraft(null);
  };
  if (draft !== null) {
    return (
      <input
        className="prep-input w-full max-w-xl bg-black/30 px-2 py-0.5 text-3xl font-black tracking-tight text-white"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={save}
        autoFocus
        maxLength={80}
        aria-label="Nom du set"
      />
    );
  }
  return (
    <button type="button" onClick={() => setDraft(name)} className="group flex min-w-0 items-center gap-3 text-left" title="Renommer le set" aria-label={`Renommer le set « ${name} »`}>
      <span className="truncate">{name}</span>
      <Icon name="edit" size={18} className="shrink-0 text-neutral-500 group-hover:text-neutral-200" />
    </button>
  );
}
