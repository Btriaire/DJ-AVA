"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
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


// ---- posters drawn from the set itself: its name in big letters on a few looks ----------------------------
type Look = { key: string; label: string; draw: (g: CanvasRenderingContext2D) => { ink: string; sub: string } };

const LOOKS: Look[] = [
  {
    key: "neon",
    label: "Néon",
    draw: (g) => {
      g.fillStyle = "#07080c";
      g.fillRect(0, 0, SIDE, SIDE);
      for (const [x, y, c] of [[60, 60, "rgba(34,211,238,.55)"], [270, 250, "rgba(217,70,239,.55)"]] as const) {
        const r = g.createRadialGradient(x, y, 0, x, y, 220);
        r.addColorStop(0, c);
        r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, SIDE, SIDE);
      }
      g.shadowColor = "#22d3ee";
      g.shadowBlur = 18;
      return { ink: "#ffffff", sub: "#a5f3fc" };
    },
  },
  {
    key: "sunset",
    label: "Coucher de soleil",
    draw: (g) => {
      const l = g.createLinearGradient(0, 0, 0, SIDE);
      l.addColorStop(0, "#f97316");
      l.addColorStop(0.55, "#db2777");
      l.addColorStop(1, "#3b0764");
      g.fillStyle = l;
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "rgba(255,237,160,.9)";
      g.beginPath();
      g.arc(SIDE / 2, SIDE * 0.78, 70, Math.PI, 0);
      g.fill();
      return { ink: "#ffffff", sub: "#fde68a" };
    },
  },
  {
    key: "vinyl",
    label: "Vinyle",
    draw: (g) => {
      g.fillStyle = "#facc15";
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "#0a0a0a";
      g.beginPath();
      g.arc(SIDE * 0.72, SIDE * 0.72, 150, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,.08)";
      for (let r = 60; r < 150; r += 7) {
        g.beginPath();
        g.arc(SIDE * 0.72, SIDE * 0.72, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = "#facc15";
      g.beginPath();
      g.arc(SIDE * 0.72, SIDE * 0.72, 28, 0, Math.PI * 2);
      g.fill();
      return { ink: "#0a0a0a", sub: "#3f3f46" };
    },
  },
  {
    key: "mono",
    label: "Minimal",
    draw: (g) => {
      g.fillStyle = "#f5f5f4";
      g.fillRect(0, 0, SIDE, SIDE);
      g.fillStyle = "#ef4444";
      g.fillRect(24, 24, 10, SIDE - 48);
      return { ink: "#0a0a0a", sub: "#57534e" };
    },
  },
];

// splits the name into at most 3 lines that fit the width, at the biggest size that works
function fitLines(g: CanvasRenderingContext2D, text: string, maxW: number): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = 64; size >= 22; size -= 2) {
    g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lines: string[] = [];
    let cur = "";
    let ok = true;
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width <= maxW) cur = next;
      else {
        if (!cur || g.measureText(w).width > maxW) { ok = false; break; }
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (ok && lines.length <= 3) return { lines, size };
  }
  g.font = `900 22px system-ui, sans-serif`;
  return { lines: [text.slice(0, 40)], size: 22 };
}

export function drawPoster(look: Look, name: string, subtitle: string): string {
  const c = document.createElement("canvas");
  c.width = c.height = SIDE;
  const g = c.getContext("2d");
  if (!g) return "";
  const { ink, sub } = look.draw(g);
  const left = look.key === "mono" ? 50 : 26;
  const { lines, size } = fitLines(g, name.toUpperCase(), SIDE - left - 26);
  g.fillStyle = ink;
  g.textBaseline = "alphabetic";
  const lineH = size * 1.02;
  const top = look.key === "vinyl" || look.key === "sunset" ? 40 + size : SIDE - 64 - lineH * (lines.length - 1);
  lines.forEach((l, i) => g.fillText(l, left, top + i * lineH));
  g.shadowBlur = 0;
  g.font = `700 15px system-ui, sans-serif`;
  g.fillStyle = sub;
  g.fillText(subtitle, left, top + (lines.length - 1) * lineH + 30);
  return c.toDataURL("image/jpeg", 0.85);
}

export function SetPoster({ tracks, cover, name, subtitle, size = 112, onCover }: { tracks: LibTrack[]; cover?: string; name: string; subtitle: string; size?: number; onCover: (cover: string | undefined) => void }) {
  const [dropping, setDropping] = useState(false);
  const [designs, setDesigns] = useState<{ key: string; label: string; src: string }[]>([]);
  const [open, setOpen] = useState(false);
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
          if (!open) setDesigns(LOOKS.map((l) => ({ key: l.key, label: l.label, src: drawPoster(l, name, subtitle) })));
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
          <div className="grid grid-cols-4 gap-1.5">
            {designs.map((d) => (
              <button key={d.key} type="button" onClick={() => { onCover(d.src); setOpen(false); }} title={d.label} aria-label={`Affichette « ${d.label} »`} className="overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prep-accent)]">
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
              <a
                href={cover}
                download={`${name.replace(/[\\/:*?"<>|]+/g, "-")}.jpg`}
                className="prep-btn-ghost flex min-h-9 flex-1 items-center justify-center px-2 text-xs"
                title="Enregistrer l'affichette en image (pour la partager)"
              >
                Télécharger
              </a>
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
