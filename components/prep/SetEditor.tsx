"use client";
import { useState, useRef, ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { SetArt } from "./SetArt";
import { SET_ARTS, SET_COLORS, dominantAccent, type SetLook } from "@/lib/setLook";
import { resolveArt } from "@/lib/setLook";
import { fileToCoverDataUrl } from "@/lib/imageResize";
import type { LibTrack } from "@/lib/library";

export function SetEditor({ name, cover, look, tracks, accent, taken, onSave, onCancel }: { name: string; cover?: string; look?: SetLook; tracks: LibTrack[]; accent: string; taken: string[]; onSave: (name: string, cover: string | undefined, look: SetLook | undefined) => void; onCancel: () => void }) {
  const [draftName, setDraftName] = useState(name);
  const [draftCover, setDraftCover] = useState<string | undefined>(cover);
  const [draftLook, setDraftLook] = useState<SetLook>(look ?? {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<SetLook>) => {
    setDraftLook((l) => ({ ...l, ...p }));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const coverDataUrl = await fileToCoverDataUrl(file);
      setDraftCover(coverDataUrl);
      if (draftLook.art && draftLook.art !== "image") {
        patch({ art: "image" });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue lors du traitement de l'image.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleDrop = async (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    setBusy(true);
    try {
      const coverDataUrl = await fileToCoverDataUrl(file);
      setDraftCover(coverDataUrl);
      if (draftLook.art && draftLook.art !== "image") {
        patch({ art: "image" });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue lors du traitement de l'image.");
    } finally {
      setBusy(false);
    }
  };

  const colorFromImage = async () => {
    if (!draftCover) return;
    const img = new Image();
    img.src = draftCover;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 48, 48);
    const data = ctx.getImageData(0, 0, 48, 48);
    const c = dominantAccent(data.data);
    if (c) {
      patch({ color: c });
    } else {
      setError("Pas de couleur nette dans cette image");
    }
  };

  const handleSave = () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("Donne un titre au set");
      return;
    }
    if (taken.some(takenName => takenName.toLowerCase() === trimmedName.toLowerCase())) {
      setError("Ce titre existe déjà");
      return;
    }
    onSave(trimmedName, draftCover, Object.values(draftLook).some((v) => v !== undefined) ? draftLook : undefined);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const resolved = resolveArt({ cover: draftCover, look: draftLook });

  return (
    <div className="p-3 flex flex-col gap-3" role="group" aria-label="Modifier le set">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          aria-label="Changer l'image du set"
          className="rounded-[10px] focus-visible:outline focus-visible:outline-2"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <SetArt set={{ name: draftName || name, cover: draftCover, look: draftLook }} tracks={tracks} accent={draftLook.color ?? accent} size={112} rounded={10} />
        </button>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="prep-btn-accent prep-tap px-3 py-1.5 text-[12px]"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Choisir une image
          </button>
          {draftCover && (
            <button
              type="button"
              className="prep-btn-ghost prep-tap px-3 py-1.5 text-[12px]"
              onClick={() => {
                setDraftCover(undefined);
                if (draftLook.art === "image") {
                  patch({ art: undefined });
                }
              }}
              disabled={busy}
            >
              {"Retirer l'image"}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
            Titre du set
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={80}
              autoFocus
              className="prep-input prep-tap w-full px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <div role="group" aria-label="Pochette">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">Pochette</p>
        <div className="flex flex-wrap gap-2">
          {SET_ARTS.filter(a => a.id !== "image" || draftCover).map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={resolved === a.id}
              aria-label={a.label}
              className="prep-tap flex flex-col items-center gap-1 rounded-lg p-1 text-neutral-300"
              style={resolved === a.id ? { boxShadow: `0 0 0 2px ${draftLook.color ?? accent}` } : {}}
              onClick={() => patch({ art: a.id })}
            >
              <SetArt set={{ name: draftName || name, cover: draftCover, look: { art: a.id, color: draftLook.color } }} tracks={tracks} accent={draftLook.color ?? accent} size={52} rounded={6} />
              <span className="text-[10px]">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Couleur du set">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">Couleur</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={!draftLook.color}
            className="prep-btn-ghost prep-tap px-2 py-1 text-[11px]"
            onClick={() => patch({ color: undefined })}
          >
            Auto
          </button>
          {SET_COLORS.map((c) => (
            <button
              key={c.css}
              type="button"
              aria-label={c.label}
              title={c.label}
              aria-pressed={draftLook.color === c.css}
              className="prep-tap h-7 w-7 rounded-full"
              style={{ background: c.css, boxShadow: draftLook.color === c.css ? "0 0 0 2px #0b0d10, 0 0 0 4px #fff" : "inset 0 0 0 1px rgba(255,255,255,.2)" }}
              onClick={() => patch({ color: c.css })}
            />
          ))}
          {draftCover && (
            <button
              type="button"
              className="prep-btn-ghost prep-tap px-2 py-1 text-[11px]"
              onClick={colorFromImage}
            >
              {"Depuis l'image"}
            </button>
          )}
          <input
            type="color"
            aria-label="Couleur libre"
            className="h-7 w-9 cursor-pointer rounded bg-transparent"
            value={draftLook.color?.startsWith("#") ? draftLook.color : "#22d3ee"}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-neutral-300">
        <input
          type="checkbox"
          checked={!!draftLook.showTitle}
          onChange={(e) => patch({ showTitle: e.target.checked })}
        />
        {"Écrire le titre sur la pochette"}
      </label>
      {error && (
        <p role="alert" className="text-[11px] text-[#f87171]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="prep-btn-ghost prep-tap px-3 py-1.5 text-[12px]"
          onClick={onCancel}
          disabled={busy}
        >
          Annuler
        </button>
        <button
          type="button"
          className="prep-btn-accent prep-tap px-3 py-1.5 text-[12px]"
          onClick={handleSave}
          disabled={busy}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
