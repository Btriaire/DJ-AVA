"use client";

import { useState, useEffect, useRef } from "react";
import { downloadBlob } from "@/lib/atelier/download";
import { listBank, getBankWav, removeFromBank, updateBankItem, type BankItem } from "@/lib/atelier/bank";
import type { DJEngine } from "@/lib/audio/engine";
import type { Previewer } from "@/lib/atelier/players";

const STEM_NAMES: Record<string, string> = {
  drums: "BATTERIE",
  bass: "BASSE",
  other: "AUTRES",
  vocals: "VOIX",
  guitar: "GUITARE",
  piano: "PIANO",
};

export function BankPanel({
  engine,
  version,
  onChanged,
  toKeys,
  preview,
  color,
  onOpen,
}: {
  engine: DJEngine;
  version: number;
  onChanged: () => void;
  toKeys: (buf: AudioBuffer, name: string) => void;
  preview: Previewer;
  color: string;
  onOpen: (buf: AudioBuffer, item: BankItem) => void;
}) {
  const [items, setItems] = useState(() => listBank());
  const [seen, setSeen] = useState(version);
  const [kindFilter, setKindFilter] = useState<"all" | "sample" | "stem">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const messageTimer = useRef<NodeJS.Timeout | null>(null);

  if (version !== seen) {
    setSeen(version);
    setItems(listBank());
  }

  const filteredItems = items.filter(item => {
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.tags.toLowerCase().includes(query) ||
      item.from.toLowerCase().includes(query) ||
      (item.stem && item.stem.toLowerCase().includes(query))
    );
  });

  const showMessage = (msg: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(msg);
    messageTimer.current = setTimeout(() => setMessage(""), 2500);
  };

  const decode = async (item: BankItem): Promise<AudioBuffer | null> => {
    try {
      const blob = await getBankWav(item.id);
      if (!blob) return null;
      return await engine.ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      return null;
    }
  };

  const handlePlay = async (item: BankItem) => {
    const buf = await decode(item);
    if (buf) preview.play(buf);
  };

  const handleOpen = async (item: BankItem) => {
    const buf = await decode(item);
    if (buf) {
      onOpen(buf, item);
      showMessage("Ouvert dans l'éditeur");
    }
  };

  const handleToKeys = async (item: BankItem) => {
    const buf = await decode(item);
    if (buf) toKeys(buf, item.name);
    showMessage("Chargé dans le clavier");
  };

  const handleToSampler = async (item: BankItem) => {
    const buf = await decode(item);
    if (buf) engine.superSampler.setSource(buf, item.name);
    showMessage("Chargé dans le Super Sampler");
  };

  const handleToDeck = async (item: BankItem, deck: "A" | "B") => {
    const blob = await getBankWav(item.id);
    if (blob) {
      const deckObj = deck === "A" ? engine.deckA : engine.deckB;
      await deckObj.load(await blob.arrayBuffer(), item.name);
      showMessage(`Chargé sur la platine ${deck}`);
    }
  };

  const handleDownload = async (item: BankItem) => {
    const blob = await getBankWav(item.id);
    if (blob) downloadBlob(blob, `${item.name}.wav`);
  };

  const handleDelete = async (item: BankItem) => {
    if (confirmDelete === item.id) {
      await removeFromBank(item.id);
      setItems(listBank());
      onChanged();
      setConfirmDelete(null);
      showMessage("Supprimé");
    } else {
      setConfirmDelete(item.id);
    }
  };

  const handleRename = async (item: BankItem, newName: string) => {
    if (newName.trim() && newName !== item.name) {
      updateBankItem(item.id, { name: newName.trim() });
      setItems(listBank());
    }
  };

  const handleUpdateTags = async (item: BankItem, newTags: string) => {
    updateBankItem(item.id, { tags: newTags.trim() });
    setItems(listBank());
  };

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  return (
    <div className="hw-panel flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          Banque
        </h2>
        <span className="text-[10px] text-neutral-400">{filteredItems.length} sons</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${kindFilter === "all" ? "hw-btn-on" : ""}`}
          onClick={() => setKindFilter("all")}
          style={{ ["--led" as string]: color }}
        >
          TOUT
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${kindFilter === "sample" ? "hw-btn-on" : ""}`}
          onClick={() => setKindFilter("sample")}
          style={{ ["--led" as string]: color }}
        >
          SAMPLES
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${kindFilter === "stem" ? "hw-btn-on" : ""}`}
          onClick={() => setKindFilter("stem")}
          style={{ ["--led" as string]: color }}
        >
          STEMS
        </button>
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="hw-btn px-2 py-1 text-[11px] font-bold flex-grow"
        />
      </div>

      {message && (
        <div className="text-[11px] text-neutral-400 text-center py-1">
          {message}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="text-[11px] text-neutral-400 text-center py-4">
          La banque est vide : SAUVE un sample ou un stem pour le retrouver ici et le rejouer sur n&apos;importe quel single.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {filteredItems.map(item => (
            <div key={item.id} className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
              <div className="flex-grow min-w-[150px]">
                <input
                  type="text"
                  defaultValue={item.name}
                  onBlur={(e) => handleRename(item, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="hw-btn px-2 py-1 text-[11px] font-bold w-full"
                />
              </div>
              <span className="text-[10px] text-neutral-400">
                {item.kind === "sample" ? "SAMPLE" : STEM_NAMES[item.stem || ""] || item.stem?.toUpperCase()}
              </span>
              <span className="text-[10px] text-neutral-400">de {item.from}</span>
              <span className="text-[10px] text-neutral-400">{item.dur.toFixed(1)}s</span>
              {item.bpm > 0 && (
                <span className="text-[10px] text-neutral-400">{Math.round(item.bpm)} BPM</span>
              )}
              {item.key && (
                <span className="text-[10px] text-neutral-400">{item.key}</span>
              )}
              <input
                type="text"
                defaultValue={item.tags}
                onBlur={(e) => handleUpdateTags(item, e.target.value)}
                placeholder="tags"
                className="hw-btn px-2 py-1 text-[10px] font-bold"
              />
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleOpen(item)}
                title="Ouvrir ce son dans l&apos;éditeur de l&apos;atelier"
                style={{ ["--led" as string]: color }}
              >
                OUVRIR
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handlePlay(item)}
                title="Écouter"
                style={{ ["--led" as string]: color }}
              >
                ▶
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleToKeys(item)}
                title="Envoyer au clavier"
              >
                CLAVIER
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleToSampler(item)}
                title="Le son devient jouable au clavier et aux pads du Super Sampler, par-dessus n'importe quel single"
              >
                → SAMPLER
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleToDeck(item, "A")}
                title="Charger comme un morceau sur la platine A"
              >
                → A
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleToDeck(item, "B")}
                title="Charger comme un morceau sur la platine B"
              >
                → B
              </button>
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => handleDownload(item)}
                title="Télécharger en WAV"
              >
                ⤓ WAV
              </button>
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${confirmDelete === item.id ? "text-red-500" : ""}`}
                onClick={() => handleDelete(item)}
                title="Supprimer"
              >
                {confirmDelete === item.id ? "SÛR ?" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
