"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { LibTrack } from "@/lib/library";
import { Icon, Mosaic } from "../prep/parts";
import { HD_SIDE, LOOKS, SIDE, drawPoster, posterSubtitle } from "@/lib/setPoster";

// The set's poster in the Sets header: click it to choose an image, take a title's art, or go back to the mosaic.
// Images are cut square and shrunk to 320 px JPEG (about 20-40 KB), so they fit in the sets' own small storage key.


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


export interface SetPosterProps {
  tracks: LibTrack[];
  name: string;
  cover?: string;
  look?: string; // the generated look the cover was drawn with (it follows renames and is downloaded in HD)
  line?: string; // the DJ's line under the name (date, place); empty = the set's figures
  size?: number;
  onCover: (cover: string | undefined, look?: string) => void;
  onLine: (line: string) => void;
}

export function SetPoster({ tracks, cover, name, look, line, size = 112, onCover, onLine }: SetPosterProps) {
  const [dropping, setDropping] = useState(false);
  const [open, setOpen] = useState(false);
  const [lineDraft, setLineDraft] = useState(line ?? "");
  const subtitle = posterSubtitle(tracks, lineDraft);
  // the four looks, redrawn as the line is typed (only while the panel is open: it needs a canvas)
  const designs = useMemo(
    () => (open ? LOOKS.map((l) => ({ key: l.key, label: l.label, src: drawPoster(l.key, name, subtitle) })) : []),
    [name, subtitle, open]
  );
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 }); // the panel sits on top of the page, under the poster
  const withArt = tracks.filter((t) => t.art).filter((t, i, a) => a.findIndex((x) => x.art === t.art) === i).slice(0, 12);

  const pick = useCallback(async (src: string, keepIfFails: boolean) => {
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
  }, [onCover]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // an image copied elsewhere can be pasted while the panel is open
    const paste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        readFile(f).then((src) => pick(src, false));
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("paste", paste);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, pick]);


  const onDropFile = async (e: DragEvent) => {
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    setDropping(false);
    if (!f) return;
    e.preventDefault();
    pick(await readFile(f), false);
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          // the posters at the set's name are drawn when the panel opens (the name may have just changed)
          if (!open) {
            const r = boxRef.current?.getBoundingClientRect();
            if (r) setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top: Math.min(r.bottom + 8, window.innerHeight - 440) });
          }
          if (!open) setLineDraft(line ?? "");
          setOpen(!open);
        }}
        className="group relative block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prep-accent)]"
        aria-label="Changer l'affichette du set"
        aria-expanded={open}
        title="Changer l'affichette du set (ou glisse une image dessus)"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDropFile}
      >
        <Mosaic tracks={tracks} size={size} accent="var(--prep-accent)" cover={cover} />
        <span className={`absolute inset-0 flex items-center justify-center gap-1 rounded-md bg-black/55 text-[11px] font-bold text-white transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none ${dropping ? "opacity-100 ring-2 ring-[var(--prep-accent)]" : "opacity-0"}`}>
          {dropping ? "Déposer l'image" : <><Icon name="edit" size={13} /> Affichette</>}
        </span>
      </button>

      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Affichette du set" className="prep fixed z-[60] flex w-72 flex-col gap-2.5 rounded-xl border border-[var(--prep-line)] bg-[var(--prep-surface)] p-3 shadow-2xl" style={{ left: at.left, top: Math.max(8, at.top) }}>
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
          <p className="-mt-1 text-[10px] text-neutral-500">ou glisse une image sur l&apos;affichette, ou colle-la (Ctrl/⌘ V)</p>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">Affichette au nom du set</p>
          <input
            className="prep-input min-h-9 px-2.5 text-xs"
            value={lineDraft}
            onChange={(e) => setLineDraft(e.target.value)}
            onBlur={() => lineDraft.trim() !== (line ?? "") && onLine(lineDraft.trim())}
            placeholder="Date, lieu… (sinon : titres et BPM)"
            maxLength={48}
            aria-label="Ligne sous le nom de l'affichette"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {designs.map((d) => (
              <button key={d.key} type="button" onClick={() => { if (lineDraft.trim() !== (line ?? "")) onLine(lineDraft.trim()); onCover(d.src, d.key); setOpen(false); }} title={d.label} aria-label={`Affichette « ${d.label} »`} className="overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prep-accent)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
                <img src={d.src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
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
            <div className="flex gap-1.5">
              <button
                type="button"
                className="prep-btn-ghost flex min-h-9 flex-1 items-center justify-center px-2 text-xs"
                title={look ? `Enregistrer l'affichette en ${HD_SIDE}×${HD_SIDE} (pour la partager)` : "Enregistrer l'affichette en image"}
                onClick={async () => {
                  const src = look ? drawPoster(look, name, posterSubtitle(tracks, line), HD_SIDE) : cover;
                  // through a blob URL: the file keeps the set's name (a data URL link is saved as "download")
                  let href = src;
                  try {
                    href = URL.createObjectURL(await (await fetch(src)).blob());
                  } catch {
                    // a remote cover that cannot be fetched: let the browser handle the link itself
                  }
                  const a = document.createElement("a");
                  a.href = href;
                  a.download = `${name.replace(/[\\/:*?"<>|]+/g, "-")}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  if (href !== src) setTimeout(() => URL.revokeObjectURL(href), 1000);
                }}
              >
                Télécharger{look ? " (HD)" : ""}
              </button>
              <button type="button" className="prep-btn-ghost flex min-h-9 flex-1 items-center justify-center px-2 text-xs" onClick={() => { onCover(undefined); setOpen(false); }}>
                Mosaïque
              </button>
            </div>
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>,
        document.body
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
