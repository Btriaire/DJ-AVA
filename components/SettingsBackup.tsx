"use client";
import { useRef, useState } from "react";
import { collectSettings, restoreSettings } from "@/lib/settingsBackup";

// export / import every setting and preset of the app (modules, Rack, EQ, Lab scenes, layout)
export function SettingsBackup() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = () => {
    const f = collectSettings(localStorage);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(f, null, 1)], { type: "application/json" }));
    a.download = `djsynth-reglages-${f.savedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg(`${Object.keys(f.items).length} réglages exportés.`);
  };
  const load = async (file: File) => {
    const r = restoreSettings(localStorage, await file.text());
    if ("error" in r) return setMsg(r.error);
    setMsg(`${r.count} réglages importés : l'app redémarre pour les appliquer.`);
    setTimeout(() => location.reload(), 1200);
  };
  return (
    <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Mes réglages</span>
      <div className="flex gap-1">
        <button type="button" onClick={save} className="hw-btn flex-1 px-2 py-1 text-[10px] font-bold" title="Un fichier avec tous tes préréglages : modules, Rack, EQ, scènes Lab, disposition">
          EXPORTER
        </button>
        <button type="button" onClick={() => input.current?.click()} className="hw-btn flex-1 px-2 py-1 text-[10px] font-bold" title="Recharge un fichier exporté (remplace les réglages du même nom)">
          IMPORTER
        </button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
      {msg && <span aria-live="polite" className="text-[10px] text-neutral-300">{msg}</span>}
    </div>
  );
}
