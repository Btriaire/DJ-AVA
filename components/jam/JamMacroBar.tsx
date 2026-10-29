"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, jamSettings, setJamQuant } from "@/lib/audio/jamModules";
import { JamSeg, useJamRefresh } from "./JamKit";

export function JamMacroBar({ engine }: { engine: DJEngine }) {
  const [, bump] = useReducer((x) => x + 1, 0);
  const mac = jamModules(engine).macro;
  useJamRefresh();

  return (
    <section aria-label="Macro jam" className="hw-panel hw-screwed flex flex-wrap items-center gap-4 p-3">
      <div>
        <div className="text-[13px] font-black uppercase tracking-[0.3em] text-neutral-100">JAM</div>
        <div className="text-[10px] text-neutral-500">les 4 stems ensemble</div>
      </div>

      <JamSeg
        label="Montée"
        options={[["2","2 mes."],["4","4 mes."],["8","8 mes."]]}
        value={String(mac.bars)}
        onChange={(v) => { mac.setBars(Number(v) as 2 | 4 | 8); bump(); }}
        color="#fbbf24"
      />

      <button
        className="relative h-11 rounded-lg px-5 font-black text-[12px] tracking-[0.15em] bg-amber-500 text-neutral-900 disabled:opacity-50"
        disabled={mac.phase !== "idle"}
        onClick={() => { mac.build(); bump(); }}
      >
        {mac.phase === "build" ? (
          <>
            <span className="absolute left-0 inset-y-0 bg-amber-500/35" style={{ width: `${mac.progress() * 100}%` }} />
            <span>BUILD {Math.round(mac.progress() * 100)} %</span>
          </>
        ) : "BUILD"}
      </button>

      <button
        className="h-11 rounded-lg px-5 font-black text-[12px] tracking-[0.15em] bg-rose-500 text-neutral-900 disabled:opacity-50"
        disabled={mac.phase !== "build"}
        onClick={() => { mac.dropNow(); bump(); }}
      >
        <span className="absolute inset-0 rounded-lg animate-pulse motion-reduce:animate-none" style={{ boxShadow: mac.phase === "build" ? "0 0 8px 2px #f43f5e" : "none" }} />
        DROP
      </button>

      <button
        className="h-11 rounded-lg px-5 font-black text-[12px] tracking-[0.15em] bg-sky-500 text-neutral-900 disabled:opacity-50"
        aria-pressed={mac.phase === "break"}
        disabled={mac.phase === "build"}
        onClick={() => { mac.toggleBreak(); bump(); }}
      >
        {mac.phase === "break" ? "REPRISE" : "BREAK"}
      </button>

      <div className="ml-auto">
        <JamSeg
          label="Départ des pads"
          options={[["0","Direct"],["0.25","1/16"],["1","Temps"],["4","Mesure"]]}
          value={String(jamSettings.quant)}
          onChange={(v) => { setJamQuant(Number(v) as 0 | 0.25 | 1 | 4); bump(); }}
          color="#a3a3a3"
        />
      </div>

      <div className="w-full text-[10px] text-neutral-500">
        BUILD monte batterie, écho de voix, filtre de basse et arpège jusqu&apos;à la mesure du drop. BREAK sort batterie et basse, la reprise retombe sur la mesure.
      </div>
    </section>
  );
}
