"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { Knob } from "./Knob";
import { Fader } from "./Fader";
import { Waveform } from "./Waveform";
import { FXPad } from "./FXPad";
import { Spectrum } from "./Spectrum";
import { loadLibrary, saveLibrary, idbPutBlob, idbGetBlob, uid, LibTrack } from "@/lib/library";

interface Props {
  deck: Deck;
  side: "A" | "B";
  color: string;
  tick: number; // forces re-render from the rAF loop
  onLoaded: () => void;
  onSync: () => void;
  onSendToConverter: (link: string) => void; // push the deck's YT source to the MP3 converter
  otherBpm: () => number; // live effective BPM of the opposite deck (for auto-sync)
  onStems?: () => void; // fired when stems become available (refreshes the library badge)
  onLibraryChange?: () => void; // fired after the deck writes to the library (save to playlist)
}

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// short label + French title per Demucs stem name (4- and 6-stem models)
const STEM_INFO: Record<string, { label: string; title: string }> = {
  drums: { label: "BAT", title: "Batterie" },
  bass: { label: "BAS", title: "Basse" },
  other: { label: "AUT", title: "Autres instruments" },
  vocals: { label: "VOIX", title: "Voix" },
  guitar: { label: "GUIT", title: "Guitare" },
  piano: { label: "PIANO", title: "Piano" },
};
// the three analysis qualities offered in the deck
const STEM_MODELS: { id: "htdemucs" | "htdemucs_ft" | "htdemucs_6s"; label: string; title: string }[] = [
  { id: "htdemucs", label: "STD", title: "Standard — 4 pistes, rapide" },
  { id: "htdemucs_ft", label: "FIN", title: "Fine-tuned — 4 pistes, ~4× plus lent, plus net" },
  { id: "htdemucs_6s", label: "6 PISTES", title: "6 pistes — ajoute guitare + piano" },
];
// names shown on the faders before the stems are actually separated, per model
const STEM_PREVIEW: Record<string, string[]> = {
  htdemucs: ["drums", "bass", "other", "vocals"],
  htdemucs_ft: ["drums", "bass", "other", "vocals"],
  htdemucs_6s: ["drums", "bass", "other", "vocals", "guitar", "piano"],
};

export function DeckPanel({ deck, side, color, tick, onLoaded, onSync, onSendToConverter, otherBpm, onStems, onLibraryChange }: Props) {
  void tick;
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // progressive auto-sync: ramp this deck's tempo toward the other deck's BPM
  const [autoSync, setAutoSync] = useState(false);
  const syncRaf = useRef<number | null>(null);
  const stopAutoSync = () => {
    if (syncRaf.current !== null) cancelAnimationFrame(syncRaf.current);
    syncRaf.current = null;
    setAutoSync(false);
  };
  const startAutoSync = () => {
    const other = otherBpm();
    if (!other || !deck.bpm) return;
    stopAutoSync();
    const fromPct = deck.pitchPct;
    const toPct = Math.max(-50, Math.min(50, (other / deck.bpm - 1) * 100));
    const ms = 6000;
    const t0 = performance.now();
    setAutoSync(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const v = fromPct + (toPct - fromPct) * e;
      setPitch(v);
      deck.setPitch(v);
      if (p < 1) {
        syncRaf.current = requestAnimationFrame(step);
      } else {
        syncRaf.current = null;
        setAutoSync(false);
      }
    };
    syncRaf.current = requestAnimationFrame(step);
  };
  useEffect(() => stopAutoSync, []);

  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
  const [trim, setTrim] = useState(1);
  const [filter, setFilter] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [scratch, setScratch] = useState(0);
  const [loop, setLoop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fxKey, setFxKey] = useState(0); // bump to remount the FX section on PANIC

  // per-deck PANIC: eject the loaded song and return every control of THIS deck
  // to zero (EQ, gain, filter, pitch, scratch, loop, FX) — the other deck is
  // untouched.
  function panic() {
    stopAutoSync();
    deck.unload();
    setEq({ low: 0, mid: 0, high: 0 });
    setTrim(1);
    setFilter(0);
    setPitch(0);
    setScratch(0);
    setLoop(0);
    setLoading(false);
    setFxKey((k) => k + 1); // remount FXPad so its sliders re-read the cleared deck
    onLoaded();
    rerender();
  }

  const pos = deck.position();
  const progress = deck.duration ? pos / deck.duration : 0;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      await deck.load(file, file.name.replace(/\.[^.]+$/, ""));
      onLoaded();
      rerender();
    } catch (err) {
      alert("Décodage impossible: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // --- previous / next single -------------------------------------------
  // Navigate the singles filed for THIS deck (t.deck === side) in the library,
  // looping the queue, and load+play the prev/next one. Position is taken from
  // the deck's current origin, so it works no matter how the track was loaded.
  const [stepping, setStepping] = useState(false);
  async function stepSingle(dir: 1 | -1) {
    const q = loadLibrary().tracks.filter((t) => t.deck === side);
    if (!q.length || stepping) return;
    const cur = q.findIndex((t) => t.id === deck.origin?.id);
    const base = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
    const t = q[(base + dir + q.length) % q.length];
    const wasPlay = deck.playing;
    setStepping(true);
    deck.loading = true;
    deck.loadStartedAt = performance.now();
    try {
      if (t.source === "local") {
        const blob = await idbGetBlob(t.id);
        if (!blob) throw new Error("Fichier introuvable");
        await deck.load(await blob.arrayBuffer(), t.name);
        deck.sourceLink = "";
      } else {
        const res = await fetch(`/api/${t.source}/stream?id=${encodeURIComponent(t.url ?? "")}`);
        if (!res.ok) throw new Error("Flux indisponible");
        await deck.load(await res.arrayBuffer(), t.name);
        deck.sourceLink =
          t.source === "youtube"
            ? `https://www.youtube.com/watch?v=${t.url}`
            : t.source === "soundcloud"
              ? t.url ?? ""
              : "";
      }
      deck.coverArt = t.art ?? "";
      deck.origin = { id: t.id, source: t.source, url: t.url, art: t.art };
      if (wasPlay) deck.play();
      onLoaded();
    } catch {
      /* leave the previous track in place on failure */
    } finally {
      deck.loading = false;
      setStepping(false);
      rerender();
    }
  }

  // stems: remembered per-stem level so a mute toggle can restore it
  const stemPrev = useRef<number[]>([1, 1, 1, 1, 1, 1]);
  // when the loaded track changes, probe the server cache so the button can
  // advertise an instant load if the stems were already computed before. If
  // they aren't cached yet and the deck is idle (track loaded but not playing),
  // kick off a low-priority background separation so the stems are ready by the
  // time the user wants them — then poll until they land.
  useEffect(() => {
    if (!deck.name || deck.stemReady) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    deck.probeStems().then(() => {
      if (cancelled) return;
      rerender();
      if (deck.stemCached) {
        onStems?.(); // already on disk -> badge the library
        return;
      }
      // idle preparation: separate ahead of time while nothing is playing
      if (!deck.playing) {
        deck.prefetchStems().then(() => {
          if (cancelled) return;
          rerender();
        });
        poll = setInterval(() => {
          if (cancelled || deck.stemReady) return;
          deck.probeStems().then(() => {
            if (cancelled) return;
            rerender();
            if (deck.stemCached) {
              onStems?.();
              if (poll) clearInterval(poll);
            }
          });
        }, 5000);
      }
    });
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.name, deck.stemModel]);
  // manual trigger for the "Préparer les Stems" button: force a background
  // separation now, even if the deck is playing, and poll until it's ready.
  async function prepareStems() {
    if (deck.stemReady || deck.stemStatus === "working") return;
    await deck.prefetchStems();
    rerender();
    const poll = setInterval(() => {
      if (deck.stemReady) {
        clearInterval(poll);
        return;
      }
      deck.probeStems().then(() => {
        rerender();
        if (deck.stemCached) {
          onStems?.();
          clearInterval(poll);
        }
      });
    }, 5000);
  }
  async function handleStems() {
    if (deck.stemStatus === "working") return;
    if (!deck.stemReady) {
      await deck.ensureStems();
      if (deck.stemReady) {
        deck.setStemsActive(true);
        onStems?.(); // freshly separated -> refresh the library badge
      }
    } else {
      deck.setStemsActive(!deck.stemsActive);
    }
    rerender();
  }
  function setStemModel(m: (typeof STEM_MODELS)[number]["id"]) {
    deck.setStemModel(m);
    stemPrev.current = [1, 1, 1, 1, 1, 1];
    rerender();
  }
  function toggleStemMute(i: number) {
    if (deck.stemVol[i] > 0.001) {
      stemPrev.current[i] = deck.stemVol[i];
      deck.setStemVol(i, 0);
    } else {
      deck.setStemVol(i, stemPrev.current[i] || 1);
    }
    rerender();
  }
  // bulk faders: drop everything to silence (remembering levels) or push it all up
  function allStems(up: boolean) {
    if (!deck.stemReady) return;
    for (let i = 0; i < deck.stemVol.length; i++) {
      if (up) {
        deck.setStemVol(i, stemPrev.current[i] || 1);
      } else {
        if (deck.stemVol[i] > 0.001) stemPrev.current[i] = deck.stemVol[i];
        deck.setStemVol(i, 0);
      }
    }
    rerender();
  }

  // --- save the track loaded on this deck into a playlist ------------------
  const [plMenu, setPlMenu] = useState(false);
  const [plFlash, setPlFlash] = useState("");
  function flashPl(m: string) {
    setPlFlash(m);
    setTimeout(() => setPlFlash((c) => (c === m ? "" : c)), 2000);
  }
  // ensure the deck's current track exists in the library, then add it to the
  // chosen playlist ("__new__" creates one). Writes straight to localStorage and
  // tells the parent so the Library panel reloads.
  async function addToPlaylist(target: string) {
    setPlMenu(false);
    if (!deck.name) return;
    const lib = loadLibrary();
    const o = deck.origin;
    let track = o ? lib.tracks.find((t) => t.id === o.id) : undefined;
    if (!track) {
      const id = o?.id ?? uid();
      const source = o?.source ?? "local";
      track = {
        id,
        name: deck.name,
        source,
        url: o?.url,
        art: o?.art ?? deck.coverArt ?? undefined,
        deck: null,
        addedAt: Date.now(),
      } as LibTrack;
      // a directly-loaded local file has no stored blob — persist its bytes so
      // it can be reloaded later from the playlist.
      if (source === "local") {
        const raw = deck.getRawData();
        if (raw) {
          try {
            await idbPutBlob(id, new Blob([raw]));
          } catch {
            /* metadata still saved even if the blob store is unavailable */
          }
        }
      }
      lib.tracks = [track, ...lib.tracks];
    }
    let plName = "";
    if (target === "__new__") {
      const name = prompt("Nom de la playlist ?")?.trim();
      if (!name) return;
      const pl = { id: uid(), name, trackIds: [track.id] };
      lib.playlists = [...lib.playlists, pl];
      plName = name;
    } else {
      let found = false;
      lib.playlists = lib.playlists.map((p) => {
        if (p.id !== target) return p;
        found = true;
        plName = p.name;
        return p.trackIds.includes(track!.id)
          ? p
          : { ...p, trackIds: [...p.trackIds, track!.id] };
      });
      if (!found) return;
    }
    saveLibrary(lib);
    onLibraryChange?.();
    flashPl(`Ajouté à « ${plName} »`);
  }

  const spinning = deck.playing;

  return (
    <div className="zoom-zone hw-screwed hw-panel flex flex-col gap-3 p-4">
      {/* header */}
      <div className="hw-brushed flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-black text-black"
            style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
          >
            DECK {side}
          </span>
          <span className="max-w-[180px] truncate text-sm text-neutral-200">
            {deck.name || "— vide —"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* loading bar — fills (asymptotic trickle) between the click and "ready" */}
          {deck.loading && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] uppercase leading-none text-neutral-500">Chargement</span>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-black/60 ring-1 ring-black/40">
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{
                    width: `${Math.round(
                      (1 - Math.exp(-(performance.now() - deck.loadStartedAt) / 900)) * 92
                    )}%`,
                    // dégradé : sombre au départ → couleur du deck plein à la pointe
                    background: `linear-gradient(90deg, ${color}22 0%, ${color}88 55%, ${color} 100%)`,
                    boxShadow: `0 0 8px ${color}, inset 0 0 4px ${color}55`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="hw-led font-mono text-lg font-bold" style={{ color }}>
              {deck.effectiveBPM || "--"} <span className="text-xs text-neutral-500">BPM</span>
            </div>
          </div>
          {/* whole-track loop, sitting next to the BPM */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase leading-none text-neutral-500">Boucle</span>
            <button
              className={`hw-btn px-2.5 py-1 text-xs ${deck.repeat ? "hw-btn-on" : ""}`}
              style={{ ["--led" as string]: color, color: deck.repeat ? undefined : color }}
              onClick={() => {
                deck.toggleRepeat();
                rerender();
              }}
              title="Relance la chanson automatiquement quand elle se termine"
            >
              ↻
            </button>
          </div>
          <button
            onClick={panic}
            className="hw-panic text-[11px]"
            title={`PANIC Deck ${side} : éjecte le morceau et remet toutes les commandes à zéro`}
          >
            PANIC
          </button>
        </div>
      </div>

      {/* jog + waveform */}
      <div className="flex items-center gap-4">
        <div
          className="hw-jog relative h-32 w-32 shrink-0 rounded-full"
          style={{ boxShadow: spinning ? `0 0 26px ${color}55, inset 0 0 0 2px rgba(255,255,255,.06), inset 0 2px 10px rgba(0,0,0,.85), 0 8px 20px rgba(0,0,0,.7)` : undefined }}
        >
          {/* white illuminated edge ring */}
          <div className="hw-jog-ring absolute inset-[10px]" />
          {/* glossy platter, spins while playing */}
          <div
            className="hw-jog-face absolute inset-[13px]"
            style={{ animation: spinning ? "spin 2.2s linear infinite" : "none" }}
          >
            {/* red tach lines */}
            <div className="hw-jog-tach absolute inset-0" />
            {/* progress wedge in deck color */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from -90deg, ${color} ${progress * 360}deg, transparent 0deg)`,
                WebkitMask: "radial-gradient(circle, transparent 34%, #000 35%, #000 72%, transparent 73%)",
                mask: "radial-gradient(circle, transparent 34%, #000 35%, #000 72%, transparent 73%)",
                opacity: 0.9,
              }}
            />
            {/* position needle */}
            <div
              className="absolute left-1/2 top-[14%] h-[20%] w-[2px] origin-bottom -translate-x-1/2 rounded"
              style={{ background: "#fff", boxShadow: "0 0 4px #fff" }}
            />
            {/* cover art of the playing single = spinning vinyl label */}
            {deck.coverArt && (
              <img
                src={deck.coverArt}
                alt=""
                className="absolute inset-0 m-auto rounded-full object-cover"
                style={{
                  width: "62%",
                  height: "62%",
                  boxShadow: `0 0 0 2px rgba(0,0,0,.6), 0 0 10px ${color}66`,
                }}
              />
            )}
          </div>
          {/* center hub: full DECK label when empty, slim chrome spindle over art */}
          {deck.coverArt ? (
            <div
              className="hw-jog-hub absolute inset-0 m-auto h-4 w-4 rounded-full"
              style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,.5)" }}
            />
          ) : (
            <div className="hw-jog-hub absolute inset-0 m-auto flex h-12 w-12 flex-col items-center justify-center">
              <span className="text-[7px] font-bold tracking-widest text-neutral-500">DECK</span>
              <span className="text-sm font-black" style={{ color }}>
                {side}
              </span>
            </div>
          )}
        </div>
        <div className="hw-screen flex-1 p-2">
          <Waveform
            peaks={deck.peaks}
            progress={progress}
            cue={deck.duration ? deck.cuePoint / deck.duration : 0}
            color={color}
            onSeek={(n) => {
              deck.seek(n * deck.duration);
              rerender();
            }}
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-neutral-500">
            <span>{fmtTime(pos)}</span>
            <span>{fmtTime(deck.duration)}</span>
          </div>
        </div>
      </div>

      {/* live spectrum */}
      <Spectrum deck={deck} color={color} />

      {/* transport */}
      <div className="flex gap-2">
        <button
          className="hw-btn px-2 py-2 text-sm disabled:opacity-40"
          style={{ ["--led" as string]: color, color }}
          disabled={stepping}
          onClick={() => stepSingle(-1)}
          title={`Single précédent (morceaux classés sur le Deck ${side})`}
        >
          ⏮
        </button>
        <button
          className="hw-btn px-2 py-2 text-sm disabled:opacity-40"
          style={{ ["--led" as string]: color, color }}
          disabled={stepping}
          onClick={() => stepSingle(1)}
          title={`Single suivant (morceaux classés sur le Deck ${side})`}
        >
          ⏭
        </button>
        <button
          className="hw-btn flex-1 py-2 text-sm"
          style={{ ["--led" as string]: color, color }}
          onClick={() => {
            deck.setCue();
            rerender();
          }}
        >
          SET CUE
        </button>
        <button
          className="hw-btn flex-1 py-2 text-sm"
          style={{ ["--led" as string]: color, color }}
          onClick={() => {
            deck.gotoCue();
            rerender();
          }}
        >
          CUE
        </button>
        <button
          className={`hw-btn flex-1 py-2 text-sm ${deck.playing ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color }}
          onClick={() => {
            deck.toggle();
            rerender();
          }}
        >
          {deck.playing ? "❚❚ PAUSE" : "▶ PLAY"}
        </button>
        {/* seek: retour rapide / retour / avance / avance rapide */}
        {(
          [
            ["«15", -15, "Retour rapide"],
            ["‹5", -5, "Retour"],
            ["5›", 5, "Avance"],
            ["15»", 15, "Avance rapide"],
          ] as [string, number, string][]
        ).map(([label, dt, title]) => (
          <button
            key={label}
            className="hw-btn px-1.5 py-2 text-[10px] font-bold leading-none"
            style={{ ["--led" as string]: color, color }}
            disabled={!deck.name}
            title={title}
            onClick={() => {
              const t = Math.min(deck.duration, Math.max(0, deck.position() + dt));
              deck.seek(t);
              rerender();
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="hw-btn px-3 py-2 text-sm text-neutral-200"
          onClick={onSync}
          title="Caler le tempo sur l'autre deck (immédiat)"
        >
          SYNC
        </button>
        <button
          className={`hw-btn px-3 py-2 text-sm ${autoSync ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: color, color: autoSync ? undefined : color }}
          onClick={() => (autoSync ? stopAutoSync() : startAutoSync())}
          title="Glisser progressivement vers le tempo de l'autre deck (6 s)"
        >
          {autoSync ? "■ Sync…" : "⇄ Auto-sync"}
        </button>
      </div>

      {/* pitch + scratch — two halves directly under the SYNC / Auto-sync buttons */}
      <div className="flex items-stretch gap-3">
        {/* left half: pitch / tempo */}
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase text-neutral-500">
            Pitch {pitch > 0 ? "+" : ""}
            {pitch.toFixed(1)}%
          </span>
          <Fader
            value={pitch}
            min={-8}
            max={8}
            step={0.1}
            className="flex-1"
            ticks
            led={color}
            neutral={0}
            onChange={(v) => {
              setPitch(v);
              deck.setPitch(v);
            }}
          />
        </div>
        {/* right half: momentary scratch / pitch-bend (springs back to 0 on release) */}
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase text-neutral-500">Scratch</span>
          <Fader
            value={scratch}
            min={-1}
            max={1}
            step={0.01}
            className="flex-1"
            ticks
            led={color}
            neutral={0}
            onChange={(v) => {
              setScratch(v);
              deck.scratch(v);
            }}
            onRelease={() => {
              setScratch(0);
              deck.scratch(0);
            }}
          />
        </div>
      </div>

      {/* EQ + filter */}
      <div className="hw-recess flex items-center justify-around py-3">
        <Knob
          label="Gain"
          value={trim}
          min={0}
          max={1.5}
          defaultValue={1}
          color={color}
          onChange={(v) => {
            setTrim(v);
            deck.setTrim(v);
          }}
        />
        {(["high", "mid", "low"] as const).map((b) => (
          <Knob
            key={b}
            label={b}
            value={eq[b]}
            min={-26}
            max={12}
            defaultValue={0}
            color={color}
            onChange={(v) => {
              setEq((e) => ({ ...e, [b]: v }));
              deck.setEQ(b, v);
            }}
          />
        ))}
        <Knob
          label="Filter"
          value={filter}
          min={-1}
          max={1}
          defaultValue={0}
          color={color}
          onChange={(v) => {
            setFilter(v);
            deck.setFilter(v);
          }}
        />
      </div>

      {/* FX pad */}
      <div className="hw-recess p-3">
        <FXPad key={fxKey} deck={deck} color={color} />
      </div>

      {/* stem separation (Demucs) — split the track into live faders */}
      <div className="hw-recess flex items-stretch gap-3 p-3">
        <div className="flex w-28 shrink-0 flex-col justify-center gap-1">
          <span className="text-[9px] uppercase leading-none text-neutral-500">Séparation</span>
          {/* quality / channel-count selector — changing it drops loaded stems */}
          <div className="flex overflow-hidden rounded ring-1 ring-neutral-700">
            {STEM_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setStemModel(m.id)}
                disabled={deck.stemStatus === "working"}
                className="flex-1 px-1 py-0.5 text-[8px] font-black disabled:opacity-40"
                style={{
                  color: deck.stemModel === m.id ? "#0a0a0a" : color,
                  background: deck.stemModel === m.id ? color : "transparent",
                }}
                title={m.title}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            className={`hw-btn px-2 py-1.5 text-[11px] ${deck.stemsActive ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color, color: deck.stemsActive ? undefined : color }}
            disabled={deck.stemStatus === "working" || !deck.name}
            onClick={handleStems}
            title={
              deck.stemCached && !deck.stemReady
                ? "Stems déjà calculés pour ce morceau — chargement instantané"
                : "Sépare le morceau en pistes avec Demucs, puis les contrôle en direct"
            }
          >
            {deck.stemStatus === "working"
              ? "⏳ …"
              : deck.stemReady
                ? deck.stemsActive
                  ? "● STEMS"
                  : "○ STEMS"
                : deck.stemCached
                  ? "⚡ STEMS"
                  : "✂ STEMS"}
          </button>
          {/* manual: pre-compute the stems in the background (yields CPU to the
              live app) so they're ready before you press STEMS */}
          {deck.name && !deck.stemReady && !deck.stemCached && deck.stemStatus !== "working" && (
            <button
              className="hw-btn px-2 py-1 text-[9px] font-bold disabled:opacity-40"
              style={{ ["--led" as string]: color, color }}
              disabled={deck.stemStatus === "prefetching"}
              onClick={prepareStems}
              title="Calcule les stems en arrière-plan (priorité basse) pour qu'ils soient prêts à l'avance"
            >
              {deck.stemStatus === "prefetching" ? "⏳ préparation…" : "⚙ Préparer les Stems"}
            </button>
          )}
          {deck.stemStatus === "working" && (
            <span className="text-[8px] leading-tight text-neutral-500">
              {deck.stemModel === "htdemucs" ? "peut prendre 1–2 min…" : "qualité élevée — plus long…"}
            </span>
          )}
          {deck.stemStatus === "prefetching" && (
            <span className="text-[8px] leading-tight text-neutral-500">
              préparation en fond… (priorité basse)
            </span>
          )}
          {deck.stemCached && !deck.stemReady && deck.stemStatus !== "working" && (
            <span className="text-[8px] leading-tight text-neutral-500">en cache — instantané</span>
          )}
          {deck.stemStatus === "error" && (
            <span className="text-[9px] text-red-400">échec — réessaie</span>
          )}
          {/* bulk: drop or raise every stem fader at once */}
          <div className={`flex gap-1 ${deck.stemReady && deck.stemsActive ? "" : "pointer-events-none opacity-40"}`}>
            <button
              className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
              style={{ ["--led" as string]: color, color }}
              onClick={() => allStems(false)}
              title="Coupe toutes les pistes d'un coup"
            >
              ▼ ALL
            </button>
            <button
              className="hw-btn flex-1 px-1 py-1 text-[9px] font-bold"
              style={{ ["--led" as string]: color, color }}
              onClick={() => allStems(true)}
              title="Remonte toutes les pistes d'un coup"
            >
              ▲ ALL
            </button>
          </div>
        </div>
        <div
          className={`flex flex-1 items-stretch justify-around gap-1 ${
            deck.stemReady && deck.stemsActive ? "" : "pointer-events-none opacity-40"
          }`}
        >
          {(deck.stemReady ? deck.stemNames : STEM_PREVIEW[deck.stemModel]).map((name, i) => {
            const info = STEM_INFO[name] ?? { label: name.toUpperCase(), title: name };
            const lvl = deck.stemReady ? deck.stemVol[i] : 1;
            const muted = deck.stemReady && lvl <= 0.001;
            // brightness of the LED tracks the fader level (off when muted)
            const glow = Math.min(1, Math.max(0, lvl));
            return (
              <div key={name} className="flex flex-col items-center gap-1" title={info.title}>
                {/* voyant lumineux: glows with the deck colour, brightness = level */}
                <span
                  aria-hidden
                  className="block h-2 w-2 rounded-full"
                  style={{
                    background: muted ? "#2a2a2a" : color,
                    opacity: muted ? 1 : 0.35 + 0.65 * glow,
                    boxShadow: muted ? "none" : `0 0 ${3 + 6 * glow}px ${color}`,
                    border: muted ? "1px solid #444" : "none",
                  }}
                />
                {/* discreet graduation strips either side of the cap, like the other faders */}
                <div className="flex items-stretch justify-center gap-0.5">
                  <span className="fader-ticks" aria-hidden />
                  <Fader
                    value={deck.stemReady ? deck.stemVol[i] : 1}
                    min={0}
                    max={1}
                    step={0.01}
                    vertical
                    onChange={(v) => {
                      deck.setStemVol(i, v);
                      rerender();
                    }}
                  />
                  <span className="fader-ticks" aria-hidden />
                </div>
                <button
                  className="text-[9px] font-bold uppercase leading-none"
                  style={{ color: muted ? "#777" : color }}
                  onClick={() => toggleStemMute(i)}
                >
                  {info.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* beat loop + actions */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-neutral-500">Beat loop</span>
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                [1 / 16, "1/16"],
                [1 / 8, "1/8"],
                [1 / 4, "1/4"],
                [1 / 2, "1/2"],
                [1, "1"],
                [2, "2"],
                [4, "4"],
                [8, "8"],
                [16, "16"],
              ] as [number, string][]
            ).map(([b, l]) => (
              <button
                key={l}
                className={`hw-btn px-1.5 py-1 text-[11px] ${loop === b ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: color }}
                onClick={() => {
                  if (loop === b) {
                    deck.clearLoop();
                    setLoop(0);
                  } else {
                    deck.setBeatLoop(b);
                    setLoop(b);
                  }
                  rerender();
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* save the loaded track into a playlist (menu of existing + new) */}
        <div className="relative">
          <button
            className="hw-btn px-3 py-2 text-xs disabled:opacity-30"
            style={{ ["--led" as string]: color, color }}
            disabled={!deck.name}
            onClick={() => setPlMenu((v) => !v)}
            title="Enregistrer le morceau chargé dans une playlist"
          >
            ≣+ Playlist
          </button>
          {plMenu && (
            <div
              className="absolute bottom-full left-0 z-20 mb-1 max-h-52 w-44 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
              onMouseLeave={() => setPlMenu(false)}
            >
              {loadLibrary().playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToPlaylist(p.id)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  title={`Ajouter à « ${p.name} »`}
                >
                  ≣ {p.name}{" "}
                  <span className="text-neutral-500">({p.trackIds.length})</span>
                </button>
              ))}
              <button
                onClick={() => addToPlaylist("__new__")}
                className="mt-0.5 block w-full rounded px-2 py-1 text-left text-xs font-bold hover:bg-neutral-800"
                style={{ color }}
              >
                + Nouvelle playlist…
              </button>
            </div>
          )}
          {plFlash && (
            <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
              {plFlash}
            </span>
          )}
        </div>

        <button
          className="hw-btn px-3 py-2 text-xs disabled:opacity-30"
          style={{ ["--led" as string]: color, color }}
          disabled={!deck.sourceLink}
          onClick={() => deck.sourceLink && onSendToConverter(deck.sourceLink)}
          title={
            deck.sourceLink
              ? "Envoyer ce morceau YouTube vers le convertisseur MP3"
              : "Disponible seulement pour les morceaux chargés depuis YouTube"
          }
        >
          → MP3
        </button>
        <button
          className="hw-btn px-3 py-2 text-xs text-neutral-300"
          onClick={() => fileRef.current?.click()}
        >
          {loading ? "…" : "⤓ Charger"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
