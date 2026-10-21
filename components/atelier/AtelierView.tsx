"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Knob } from "../Knob";
import { SourcePanel } from "./SourcePanel";
import { BankPanel } from "./BankPanel";
import { SessionStrip } from "./SessionStrip";
import { WaveEditor } from "./WaveEditor";
import { EditTools } from "./EditTools";
import { AtelierStems } from "./AtelierStems";
import { MiniKeys } from "./MiniKeys";
import { Previewer, SampleKeys } from "@/lib/atelier/players";
import { StemMixer } from "@/lib/atelier/stemMixer";
import { loadStemsByHash, separateStems } from "@/lib/atelier/separate";
import { FREE_MEMORY_EVENT } from "@/lib/memory";
import { addToBank } from "@/lib/atelier/bank";
import * as ed from "@/lib/atelier/edit";
import { downloadBlob } from "@/lib/atelier/download";
import { DJEngine, encodeWav } from "@/lib/audio/engine";
import { detectBPM } from "@/lib/audio/bpm";
import { detectKey } from "@/lib/audio/key";
import {
  DEFAULT_CTL,
  KIND_FR,
  type Region,
  type SoundKind,
  type StemModel,
  type WorkSample,
} from "@/lib/atelier/types";

const COLOR = "#22d3ee";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function AtelierView({ engine, active }: { engine: DJEngine; active: boolean }) {
  const [preview] = useState(() => new Previewer(engine.ctx, engine.masterIn));
  const [keys] = useState(() => new SampleKeys(engine.ctx, engine.masterIn));
  const [mixer] = useState(() => new StemMixer(engine.ctx, engine.masterIn));
  const [sounds, setSounds] = useState<WorkSample[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [sel, setSel] = useState<Region | null>(null);
  const [cursor, setCursor] = useState(0);
  const [loop, setLoop] = useState(false);
  const [listen, setListen] = useState<"mix" | "orig">("mix");
  const [playing, setPlaying] = useState<"none" | "orig" | "mix">("none");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [bankVersion, setBankVersion] = useState(0);
  const [sens, setSens] = useState(0.5);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sep, setSep] = useState<{ id: string; pct: number | null } | null>(null);
  const [model, setModel] = useState<StemModel>("htdemucs");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const sepAbort = useRef<AbortController | null>(null);
  const curRef = useRef<WorkSample | null>(null);
  const noteTimer = useRef<NodeJS.Timeout | null>(null);

  const cur = sounds.find((s) => s.id === curId) ?? null;
  const hasStems = !!cur?.stems?.length;
  const useMix = hasStems && listen === "mix";
  const marks = cur ? sounds.filter((s) => s.from === cur.name).map((s) => s.at ?? 0) : [];

  useEffect(() => {
    curRef.current = cur;
  });

  useEffect(() => {
    const h = () => {
      setSounds((prev) => prev.map((s) => (s.id === curRef.current?.id ? { ...s, undo: undefined } : { ...s, undo: undefined, stems: s.stemHash ? undefined : s.stems })));
      setNote("Mémoire libérée : historique d'annulation et stems inactifs relâchés");
    };
    window.addEventListener(FREE_MEMORY_EVENT, h);
    return () => window.removeEventListener(FREE_MEMORY_EVENT, h);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const p = mixer.playing ? "mix" : preview.playing ? "orig" : "none";
      setPlaying((x) => (x === p ? x : p));
    }, 200);
    return () => clearInterval(interval);
  }, [mixer, preview]);

  useEffect(() => {
    const c = curRef.current;
    mixer.load(c?.stems ?? [], c?.ctls ?? [], c?.bpm ?? 0);
  }, [mixer, cur?.stems, curId]);

  useEffect(() => {
    if (active) return;
    preview.stop();
    mixer.stop();
    keys.allOff();
  }, [active, preview, mixer, keys]);

  useEffect(() => {
    return () => {
      preview.stop();
      keys.allOff();
      mixer.dispose();
      sepAbort.current?.abort();
    };
  }, [preview, keys, mixer]);

  const playhead = useCallback(() => {
    return mixer.playing ? mixer.position() : preview.playing ? preview.position() : null;
  }, [mixer, preview]);

  const stopAll = () => {
    preview.stop();
    mixer.stop();
    setPlaying("none");
  };

  const addSound = (
    p: {
      name: string;
      buf: AudioBuffer;
      kind: SoundKind;
      from?: string;
      bpm?: number;
      key?: string;
      offset?: number;
      at?: number;
      info?: { label: string; value: string }[];
    },
    select = true
  ): WorkSample => {
    const bpm = p.buf.duration >= 4 ? p.bpm || detectBPM(p.buf) : p.bpm ?? 0;
    const key = p.buf.duration >= 4 ? detectKey(p.buf) : null;
    const offset = p.offset ?? (ed.onsets(p.buf, 0.5)[0] ?? 0);
    const sound: WorkSample = {
      id: newId(),
      name: p.name,
      buf: p.buf,
      kind: p.kind,
      from: p.from ?? "",
      bpm,
      key: p.key ?? (key ? `${key.camelot} · ${key.name}` : ""),
      offset,
      at: p.at,
      info: p.info,
    };
    setSounds((prev) => [...prev, sound]);
    if (select) {
      releaseOthers(sound.id);
      stopAll();
      setCurId(sound.id);
      setSel(null);
      setCursor(0);
    }
    return sound;
  };

  const update = (id: string, patch: Partial<WorkSample>) => {
    setSounds((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const openBytes = async (name: string, bytes: ArrayBuffer, info?: { label: string; value: string }[]) => {
    try {
      setBusy("Décodage…");
      const buf = await engine.ctx.decodeAudioData(bytes);
      addSound({ name, buf, kind: "track", info });
    } catch {
      setErr("Décodage impossible");
    } finally {
      setBusy("");
    }
  };

  const openBuffer = async (name: string, buf: AudioBuffer, bpm: number) => {
    addSound({ name, buf, kind: "track", bpm });
  };

  const openBank = (buf: AudioBuffer, item: { name: string; from: string; bpm: number; key: string }) => {
    addSound({ name: item.name, buf, kind: "bank", from: item.from, bpm: item.bpm, key: item.key });
  };

  const toKeys = (buf: AudioBuffer, name: string) => {
    keys.setSample(buf, name);
    setNote("Chargé dans le clavier");
  };

  // Sounds that are not open drop their undo copies and, when the server still
  // holds their stems (stemHash), their decoded stems: they reload on reopen.
  const releaseOthers = (keepId: string | null) => {
    setSounds((prev) => prev.map((s) => (s.id === keepId ? s : { ...s, undo: undefined, stems: s.stemHash ? undefined : s.stems })));
  };

  const reloadStems = async (s: WorkSample) => {
    if (!s.stemHash || !s.stemModel || !s.stemNames?.length) return;
    try {
      setBusy("Rechargement des stems…");
      const stems = await loadStemsByHash(engine.ctx, s.stemHash, s.stemModel, s.stemNames);
      update(s.id, { stems });
    } catch {
      setErr("Stems indisponibles : relance la séparation");
      update(s.id, { stemHash: undefined, stemNames: undefined, ctls: undefined });
    } finally {
      setBusy("");
    }
  };

  const select = (id: string) => {
    releaseOthers(id);
    stopAll();
    setCurId(id);
    setSel(null);
    setCursor(0);
    const cible = sounds.find((s) => s.id === id);
    if (cible && !cible.stems && cible.stemHash) {
      void reloadStems(cible);
    }
  };

  const remove = (id: string) => {
    if (curId === id) {
      stopAll();
      setCurId(null);
    }
    setSounds((prev) => prev.filter((s) => s.id !== id));
  };

  const clearAll = () => {
    stopAll();
    setSounds([]);
    setCurId(null);
  };

  const playChip = (s: WorkSample) => {
    mixer.stop();
    preview.play(s.buf);
    setPlaying("orig");
  };

  const play = (from = cursor) => {
    if (!cur) return;
    preview.stop();
    mixer.stop();
    if (useMix) {
      mixer.play(from, sel, loop);
      setPlaying("mix");
    } else {
      preview.play(cur.buf, sel ? sel.a : from, sel ? sel.b : cur.buf.duration, loop);
      setPlaying("orig");
    }
  };

  const playFrom = (from: number, region: Region | null, lp: boolean, only: number | null) => {
    preview.stop();
    mixer.play(from, region, lp, only);
    setPlaying("mix");
  };

  const seek = (t: number) => {
    setCursor(t);
    if (playing !== "none") play(t);
  };

  const apply = async (label: string, run: () => Promise<{ buf: AudioBuffer; sel?: Region | null; bpm?: number }>) => {
    if (!cur) return;
    try {
      stopAll();
      setBusy(`${label}…`);
      const res = await run();
      update(cur.id, {
        buf: res.buf,
        bpm: res.bpm ?? cur.bpm,
        undo: [{ buf: cur.buf, bpm: cur.bpm }, ...(cur.undo ?? [])].slice(0, 3),
        stems: undefined,
        ctls: undefined,
        stemModel: undefined,
      });
      if (res.sel !== undefined) setSel(res.sel);
      if (cur.stems) setNote("Le son a changé : sépare-le à nouveau pour retrouver ses stems.");
    } catch {
      setErr(`${label} impossible`);
    } finally {
      setBusy("");
    }
  };

  const undoLast = () => {
    if (!cur || !cur.undo?.length) return;
    const [last, ...rest] = cur.undo;
    update(cur.id, {
      buf: last.buf,
      bpm: last.bpm,
      undo: rest,
      stems: undefined,
      stemHash: undefined,
      stemNames: undefined,
      ctls: undefined,
      stemModel: undefined,
    });
  };

  const exportSound = async (fmt: "wav" | "mp3") => {
    if (!cur) return;
    try {
      const buf = sel ? ed.slice(cur.buf, sel) : cur.buf;
      if (fmt === "wav") {
        downloadBlob(encodeWav(buf, 24), `${cur.name}${sel ? "-selection" : ""}.wav`);
      } else {
        setBusy("Encodage MP3…");
        const res = await fetch("/api/audio/mp3", {
          method: "POST",
          body: encodeWav(buf, 16),
        });
        if (!res.ok) throw new Error("Export MP3 impossible");
        downloadBlob(await res.blob(), `${cur.name}${sel ? "-selection" : ""}.mp3`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setBusy("");
    }
  };

  const part = () => (sel ? ed.slice(cur!.buf, sel) : cur!.buf);
  const partName = () => `${cur!.name}${sel ? " (sélection)" : ""}`;

  const addSample = () => {
    if (!cur || !sel) return;
    const n = sounds.filter((s) => s.from === cur.name).length + 1;
    addSound(
      {
        name: `${cur.name} ${n}`,
        buf: ed.slice(cur.buf, sel),
        kind: "sample",
        from: cur.name,
        bpm: cur.bpm,
        key: cur.key,
        offset: 0,
        at: sel.a,
      },
      false
    );
    setNote("Sample ajouté à la session");
  };

  const sliceBars = (bars: number) => {
    if (!cur || cur.bpm <= 0) return;
    const regions = ed.barRegions(cur.buf.duration, cur.bpm, sel ? sel.a : cur.offset, bars).slice(0, 64);
    regions.forEach((r, i) => {
      addSound(
        {
          name: `${cur.name} ${i + 1}`,
          buf: ed.slice(cur.buf, r),
          kind: "sample",
          from: cur.name,
          bpm: cur.bpm,
          key: cur.key,
          offset: 0,
          at: r.a,
        },
        false
      );
    });
    setNote(`${regions.length} samples ajoutés à la session`);
  };

  const addOnsets = () => {
    if (!cur) return;
    const onsets = ed.onsets(cur.buf, sens);
    const regions: Region[] = [];
    for (let i = 0; i < onsets.length; i++) {
      regions.push({ a: onsets[i], b: i === onsets.length - 1 ? cur.buf.duration : onsets[i + 1] });
    }
    regions.filter(r => r.b - r.a >= 0.05 && r.b - r.a <= 64).slice(0, 64).forEach((r, i) => {
      addSound(
        {
          name: `${cur.name} ${i + 1}`,
          buf: ed.slice(cur.buf, r),
          kind: "sample",
          from: cur.name,
          bpm: cur.bpm,
          key: cur.key,
          offset: 0,
          at: r.a,
        },
        false
      );
    });
    setNote(`${regions.length} samples ajoutés à la session`);
  };

  const separate = async () => {
    if (sep || !cur) return;
    try {
      stopAll();
      const id = cur.id;
      const buf = cur.buf;
      const ac = new AbortController();
      sepAbort.current = ac;
      setSep({ id, pct: 0 });
      const { hash, stems } = await separateStems(engine.ctx, buf, model, ac.signal, (pct) =>
        setSep((s) => (s && s.id === id ? { id, pct } : s))
      );
      update(id, { stems, stemHash: hash, stemNames: stems.map((s) => s.name), stemModel: model, ctls: stems.map(() => DEFAULT_CTL) });
      setListen("mix");
      setNote("Stems prêts : chaque piste se règle comme sur les platines.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setErr(e instanceof Error ? e.message : "Séparation impossible");
      }
    } finally {
      setSep(null);
      sepAbort.current = null;
    }
  };

  const cancelSep = () => {
    sepAbort.current?.abort();
  };

  const saveToBank = async () => {
    if (!cur || busy) return;
    try {
      setBusy("Sauvegarde…");
      await addToBank(encodeWav(part(), 24), {
        name: partName(),
        kind: cur.kind === "stem" ? "stem" : "sample",
        from: cur.from || cur.name,
        bpm: cur.bpm,
        key: cur.key,
        dur: part().duration,
        tags: "",
      });
      setSavedIds((prev) => new Set(prev).add(cur.id));
      setBankVersion((v) => v + 1);
      setNote("Sauvé dans la banque");
    } catch {
      setErr("Sauvegarde impossible");
    } finally {
      setBusy("");
    }
  };

  const loadToDeck = async (side: "A" | "B") => {
    if (!cur) return;
    try {
      const bytes = await encodeWav(part(), 16).arrayBuffer();
      await (side === "A" ? engine.deckA : engine.deckB).load(bytes, partName());
      setNote(`Chargé sur la platine ${side}`);
    } catch {
      setErr(`Chargement sur platine ${side} impossible`);
    }
  };

  const loadToSampler = () => {
    if (!cur) return;
    engine.superSampler.setSource(part(), partName());
    setNote("Chargé dans le Super Sampler");
  };

  const pauseDecks = () => {
    engine.deckA.pause();
    engine.deckB.pause();
  };

  useEffect(() => {
    if (note) {
      noteTimer.current = setTimeout(() => setNote(""), 3000);
      return () => clearTimeout(noteTimer.current!);
    }
  }, [note]);

  return (
    <div className="flex flex-col gap-3 pb-[260px]">
      <div className="hw-panel p-3">
        <div className="text-sm font-black tracking-[0.25em]" style={{ color: COLOR }}>
          ATELIER
        </div>
        <div className="text-[11px] text-neutral-400">
          1 · choisis une source · 2 · travaille le son (sélection, découpe, retouches) · 3 · sépare-le en stems et règle
          chaque piste · le clavier en bas joue n&apos;importe quel son.
        </div>
        {engine.deckA.playing || engine.deckB.playing ? (
          <div className="mt-2 flex items-center gap-2 rounded bg-amber-900/20 p-1.5 text-[11px]">
            <div className="font-bold">Une platine joue : l&apos;atelier est fait pour préparer hors mix (la séparation de stems charge beaucoup le processeur).</div>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={pauseDecks}>
              PAUSE DES PLATINES
            </button>
          </div>
        ) : null}
      </div>

      <SourcePanel
        engine={engine}
        color={COLOR}
        busy={!!busy || !!sep}
        onOpenBytes={openBytes}
        onOpenBuffer={openBuffer}
        bank={
          <BankPanel
            engine={engine}
            version={bankVersion}
            onChanged={() => setBankVersion((v) => v + 1)}
            toKeys={toKeys}
            preview={preview}
            color={COLOR}
            onOpen={openBank}
          />
        }
      />

      {(busy || err || note) && (
        <div className="flex items-center gap-2">
          {busy && (
            <div className="flex-1 rounded bg-neutral-800 px-2 py-1 text-[11px]" style={{ color: COLOR }}>
              {busy}
            </div>
          )}
          {err && (
            <div className="flex-1 rounded bg-red-900/20 px-2 py-1 text-[11px] text-red-300">
              {err}
              <button className="ml-2" onClick={() => setErr("")}>
                ✕
              </button>
            </div>
          )}
          {note && <div className="flex-1 text-[11px] text-emerald-300">{note}</div>}
        </div>
      )}

      <SessionStrip
        sounds={sounds}
        curId={curId}
        savedIds={savedIds}
        color={COLOR}
        onSelect={select}
        onRemove={remove}
        onPlay={playChip}
        onClear={clearAll}
      />

      {cur ? (
        <div className="hw-panel flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[12px] font-bold" style={{ color: COLOR }}>
              2 · SON
            </div>
            <input
              type="text"
              value={cur.name}
              onChange={(e) => update(cur.id, { name: e.target.value })}
              className="bg-transparent text-[12px] font-bold"
              style={{ color: COLOR }}
            />
            <div className="hw-btn px-1.5 py-0.5 text-[9px] font-black">{KIND_FR[cur.kind]}</div>
            {cur.from && <div className="text-[10px] text-neutral-400">de {cur.from}</div>}
            <div className="text-[10px] text-neutral-400">
              {Math.floor(cur.buf.duration / 60)
                .toString()
                .padStart(2, "0")}
              :{Math.floor(cur.buf.duration % 60)
                .toString()
                .padStart(2, "0")}
              .{Math.floor((cur.buf.duration % 1) * 10)}
            </div>
            <div className="flex items-center gap-1">
              <div className="text-[10px] text-neutral-400">BPM</div>
              <input
                key={`${cur.id}-${cur.bpm}`}
                type="number"
                defaultValue={cur.bpm ? cur.bpm.toFixed(1) : ""}
                placeholder="?"
                min={40}
                max={240}
                step={0.1}
                className="w-16 rounded bg-neutral-800 px-1 py-0.5 text-[10px]"
                onBlur={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  if (Number.isFinite(v) && v >= 40 && v <= 240) update(cur.id, { bpm: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            {cur.key && <div className="text-[10px] text-neutral-400">{cur.key}</div>}
            {cur.info && (
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={() => setInfoOpen((x) => !x)}
              >
                INFOS {infoOpen ? "▴" : "▾"}
              </button>
            )}
            <div className="ml-auto text-[10px] text-neutral-400">
              {playhead() !== null
                ? `${Math.floor(playhead()! / 60)
                    .toString()
                    .padStart(2, "0")}:${Math.floor(playhead()! % 60)
                    .toString()
                    .padStart(2, "0")}.${Math.floor((playhead()! % 1) * 10)}`
                : `${Math.floor(cursor / 60)
                    .toString()
                    .padStart(2, "0")}:${Math.floor(cursor % 60)
                    .toString()
                    .padStart(2, "0")}.${Math.floor((cursor % 1) * 10)}`}
              {sel && (
                <span className="ml-1">
                  · {Math.floor((sel.b - sel.a) / 60)
                    .toString()
                    .padStart(2, "0")}:{Math.floor((sel.b - sel.a) % 60)
                    .toString()
                    .padStart(2, "0")}.{Math.floor(((sel.b - sel.a) % 1) * 10)}
                </span>
              )}
            </div>
          </div>

          {infoOpen && cur.info && (
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10px]">
              {cur.info.map((item) => (
                <Fragment key={item.label}>
                  <div className="text-neutral-400">{item.label}</div>
                  <div className="break-all">{item.value}</div>
                </Fragment>
              ))}
            </div>
          )}

          <WaveEditor
            buf={cur.buf}
            sel={sel}
            onSel={setSel}
            onSeek={seek}
            playhead={playhead}
            grid={cur.bpm > 0 ? { bpm: cur.bpm, offset: cur.offset } : null}
            marks={marks}
            color={COLOR}
            height={140}
          />
          <div className="text-[10px] text-neutral-500">
            Clic : placer la lecture · glisser : sélectionner (les actions portent alors sur la sélection).
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${playing !== "none" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: playing !== "none" ? COLOR : undefined }}
              onClick={() => (playing !== "none" ? stopAll() : play())}
            >
              {playing !== "none" ? "■ STOP" : "▶ LIRE"}
            </button>
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${loop ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: loop ? COLOR : undefined }}
              onClick={() => setLoop((x) => !x)}
            >
              BOUCLE
            </button>
            {hasStems && (
              <>
                <div className="text-[10px] text-neutral-400">ÉCOUTE</div>
                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${listen === "mix" ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: listen === "mix" ? COLOR : undefined }}
                  onClick={() => {
                    stopAll();
                    setListen("mix");
                  }}
                >
                  STEMS
                </button>
                <button
                  className={`hw-btn px-2 py-1 text-[11px] font-bold ${listen === "orig" ? "hw-btn-on" : ""}`}
                  style={{ ["--led" as string]: listen === "orig" ? COLOR : undefined }}
                  onClick={() => {
                    stopAll();
                    setListen("orig");
                  }}
                >
                  ORIGINAL
                </button>
              </>
            )}
            {mixer.busy && <div className="text-[10px] text-neutral-400">CALCUL…</div>}
          </div>

          <div className="hw-recess flex flex-wrap items-center gap-1.5 p-1.5">
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={addSample}
              disabled={!sel}
            >
              + SAMPLE
            </button>
            {cur.bpm > 0 && (
              <>
                <div className="text-[10px] text-neutral-400">DÉCOUPER</div>
                <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => sliceBars(1)}>
                  1
                </button>
                <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => sliceBars(2)}>
                  2
                </button>
                <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => sliceBars(4)}>
                  4
                </button>
                <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => sliceBars(8)}>
                  8
                </button>
                <div className="text-[10px] text-neutral-400">MESURES</div>
              </>
            )}
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={addOnsets}>
              ATTAQUES
            </button>
            <Knob
              label="SENSIBILITÉ"
              value={sens}
              min={0}
              max={1}
              defaultValue={0.5}
              onChange={setSens}
              color={COLOR}
              size={32}
            />
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${model === "htdemucs" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: model === "htdemucs" ? COLOR : undefined }}
              onClick={() => setModel("htdemucs")}
              disabled={!!sep}
            >
              4 PISTES
            </button>
            <button
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${model === "htdemucs_6s" ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: model === "htdemucs_6s" ? COLOR : undefined }}
              onClick={() => setModel("htdemucs_6s")}
              disabled={!!sep}
            >
              6 PISTES
            </button>
            {sep && sep.id === cur.id ? (
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                onClick={cancelSep}
                title="Sépare tout le son (ou fais d'abord un sample de la partie voulue). Un morceau entier prend une à trois minutes"
              >
                ANNULER · {sep.pct ?? 0} %
              </button>
            ) : sep ? (
              <div className="text-[10px] text-neutral-400">séparation en cours…</div>
            ) : (
              <button
                className="hw-btn px-2 py-1 text-[11px] font-bold"
                style={{ ["--led" as string]: COLOR }}
                onClick={separate}
                title="Sépare tout le son (ou fais d'abord un sample de la partie voulue). Un morceau entier prend une à trois minutes"
              >
                SÉPARER EN STEMS
              </button>
            )}
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => toKeys(part(), partName())}>
              CLAVIER
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={saveToBank} disabled={!!busy}>
              {savedIds.has(cur.id) ? "SAUVÉ" : "SAUVER"}
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => loadToDeck("A")}>
              → A
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => loadToDeck("B")}>
              → B
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={loadToSampler}>
              → SAMPLER
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => exportSound("wav")}>
              ⤓ WAV
            </button>
            <button className="hw-btn px-2 py-1 text-[11px] font-bold" onClick={() => exportSound("mp3")}>
              ⤓ MP3
            </button>
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => setToolsOpen((x) => !x)}
            >
              OUTILS {toolsOpen ? "▴" : "▾"}
            </button>
          </div>

          {toolsOpen && (
            <EditTools
              buf={cur.buf}
              sel={sel}
              bpm={cur.bpm}
              color={COLOR}
              busy={!!busy}
              canUndo={(cur.undo?.length ?? 0) > 0}
              onApply={apply}
              onUndo={undoLast}
              onExport={exportSound}
            />
          )}

          {hasStems && (
            <AtelierStems
              sound={cur}
              keys={keys}
              mixer={mixer}
              color={COLOR}
              playhead={playhead}
              cursor={cursor}
              playing={playing === "mix"}
              loop={loop}
              sel={sel}
              onCtls={(ctls) => update(cur.id, { ctls })}
              onPlay={playFrom}
              onStop={stopAll}
              onSeek={seek}
              toKeys={toKeys}
              onNewSound={(buf, name, kind) => {
                addSound(
                  { name, buf, kind, from: cur.name, bpm: cur.bpm, key: cur.key, offset: cur.offset },
                  false
                );
                setNote("Ajouté à la session");
              }}
              onSaved={() => setBankVersion((v) => v + 1)}
            />
          )}
        </div>
      ) : (
        <div className="hw-panel p-6 text-center text-[11px] text-neutral-400">
          Choisis un son dans les sources ci-dessus : une recherche YouTube, un morceau de la bibliothèque, un fichier,
          une platine ou la banque.
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
        <MiniKeys
          keys={keys}
          color={COLOR}
          active={active}
          current={cur ? { name: partName(), load: () => toKeys(part(), partName()) } : null}
        />
      </div>
    </div>
  );
}
