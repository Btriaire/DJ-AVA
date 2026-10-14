import { useEffect, useRef, useState } from "react"
import type { DJEngine } from "@/lib/audio/engine"
import { DEFAULT_SS_PARAMS, DELAY_LABELS, FILTER_NAMES, type SSParams } from "@/lib/audio/SuperSampler"

const PRESET_KEY = "djsynth.supersampler.presets.v1"

function readPresets(): Record<string, SSParams> {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}") as Record<string, SSParams>
  } catch {
    return {}
  }
}

function writePresets(presets: Record<string, SSParams>): void {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
  } catch {
    // storage full or blocked: presets stay in memory only
  }
}
import { Knob } from "./Knob"
import { SSScreen } from "./SSScreen"
import { SSKeys } from "./SSKeys"
import { SSPads } from "./SSPads"
import { SSSeq } from "./SSSeq"
import { detectBPM } from "@/lib/audio/bpm"
import { addLocalTrack } from "@/lib/library"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function SuperSampler({ engine, onLibraryChange }: { engine: DJEngine; onLibraryChange?: () => void }) {
  const [p, setP] = useState<SSParams>(() => engine.superSampler.getParams())
  const [side, setSide] = useState<"A" | "B">("A")
  const [status, setStatus] = useState("Charge une source")
  const [srcBpm, setSrcBpm] = useState(0)
  const [presets, setPresets] = useState<Record<string, SSParams>>(() => readPresets())
  const [presetName, setPresetName] = useState("")
  const [busy, setBusy] = useState(false)
  const [keyBase, setKeyBase] = useState(48)
  const [mode, setMode] = useState<"keys" | "pads" | "seq">("keys")
  const deckBpm = engine.masterDeck()?.fxClock()?.bpm ?? 0
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [screenMode, setScreenMode] = useState<"wave" | "spectrum" | "scope">("wave")
  const [youtube, setYoutube] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [, setBakeTick] = useState(0)

  useEffect(() => {
    engine.superSampler.setBakeListener(() => setBakeTick(n => n + 1))
    return () => engine.superSampler.setBakeListener(null)
  }, [engine])

  const set = <K extends keyof SSParams>(key: K, value: SSParams[K]) => {
    engine.superSampler.setParam(key, value)
    setP(prev => ({ ...prev, [key]: value }))
  }

  const loadBuffer = (buffer: AudioBuffer, name: string, label: string, bpmHint?: number) => {
    engine.superSampler.setSource(buffer, name)
    setSrcBpm(bpmHint && bpmHint > 0 ? bpmHint : detectBPM(buffer))
    setStatus(label)
  }

  const loadFile = async (file: File) => {
    setBusy(true)
    try {
      const buf = await engine.ctx.decodeAudioData(await file.arrayBuffer())
      loadBuffer(buf, file.name, "Fichier chargé : " + file.name)
    } catch {
      setStatus("Fichier illisible")
    } finally {
      setBusy(false)
    }
  }

  const pickDeck = (s: "A" | "B") => {
    setSide(s)
    const deck = s === "A" ? engine.deckA : engine.deckB
    if (!deck.audioBuffer) {
      setStatus("Aucun morceau sur la platine " + s)
      return
    }
    loadBuffer(deck.audioBuffer, deck.name || "Platine " + s, "Source : platine " + s, deck.bpm)
  }

  const pickStem = (i: number) => {
    const deck = side === "A" ? engine.deckA : engine.deckB
    const buf = deck.getStemBuffer(i)
    if (!buf) {
      setStatus("Stem indisponible (sépare d'abord le morceau)")
      return
    }
    loadBuffer(buf, (deck.name || "Platine " + side) + " · " + deck.stemNames[i], "Source : stem " + deck.stemNames[i], deck.bpm)
  }

  const loadYoutube = async () => {
    const match = youtube.match(/(?:v=|youtu\.be\/|^)([A-Za-z0-9_-]{11})/)
    if (!match) {
      setStatus("Lien YouTube invalide")
      return
    }
    const id = match[1]
    setBusy(true)
    try {
      const res = await fetch("/api/youtube/stream?id=" + id)
      if (!res.ok) {
        setStatus("Échec du téléchargement (" + res.status + ")")
        return
      }
      const buf = await engine.ctx.decodeAudioData(await res.arrayBuffer())
      loadBuffer(buf, "YouTube " + id, "Source : YouTube " + id)
    } catch (e) {
      setStatus("Erreur : " + (e instanceof Error ? e.message : "inconnue"))
    } finally {
      setBusy(false)
    }
  }

  const exportNow = async () => {
    if (!engine.superSampler.buffer) {
      setStatus("Rien à exporter")
      return
    }
    setBusy(true)
    try {
      const blob = await engine.superSampler.exportWav()
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = (engine.superSampler.name || "sample") + "-ss.wav"
      link.click()
      URL.revokeObjectURL(link.href)
      const m = engine.superSampler.loudness
      setStatus(
        m && Number.isFinite(m.lufs) && Number.isFinite(m.truePeakDb)
          ? `Export WAV 24 bits : ${m.lufs.toFixed(1)} LUFS · TP ${m.truePeakDb.toFixed(1)} dBTP`
          : "Export WAV 24 bits prêt"
      )
    } finally {
      setBusy(false)
    }
  }

  const savePreset = () => {
    const name = presetName.trim() || "Préréglage " + (Object.keys(presets).length + 1)
    const next = { ...presets, [name]: { ...p } }
    setPresets(next)
    writePresets(next)
    setStatus("Préréglage enregistré : " + name)
  }

  const loadPreset = (name: string) => {
    const preset = presets[name]
    if (!preset) return
    for (const key in preset) {
      engine.superSampler.setParam(key as keyof SSParams, preset[key as keyof SSParams])
    }
    setP({ ...preset })
    setStatus("Préréglage chargé : " + name)
  }

  const deletePreset = (name: string) => {
    const next = { ...presets }
    delete next[name]
    setPresets(next)
    writePresets(next)
  }

  const normalizeSource = () => {
    const buf = engine.superSampler.buffer
    if (!buf) { setStatus("Aucune source à normaliser"); return }
    let peak = 0
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
    }
    if (peak === 0) { setStatus("Silence : rien à normaliser"); return }
    const gain = 0.97 / peak
    const out = engine.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c)
      const dst = out.getChannelData(c)
      for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain
    }
    const name = engine.superSampler.name
    engine.superSampler.setSource(out, name)
    setP(prev => ({ ...prev, start: 0, end: 1 }))
    setStatus("Normalisée à -0,3 dBFS (gain " + (20 * Math.log10(gain)).toFixed(1) + " dB)")
  }

  const trimSilence = () => {
    const buf = engine.superSampler.buffer
    if (!buf) { setStatus("Aucune source à rogner"); return }
    const threshold = 0.004
    let first = buf.length
    let last = -1
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) {
        if (Math.abs(d[i]) > threshold) { if (i < first) first = i; break }
      }
      for (let i = d.length - 1; i >= 0; i--) {
        if (Math.abs(d[i]) > threshold) { if (i > last) last = i; break }
      }
    }
    if (last < 0) { setStatus("Silence : aucune région"); return }
    const start = first / buf.length
    const end = Math.max(start + 0.001, (last + 1) / buf.length)
    set("start", start)
    set("end", end)
    setStatus("Silences rognés : " + ((end - start) * buf.duration).toFixed(2) + " s conservées")
  }

  const resetRegion = () => {
    set("start", 0)
    set("end", 1)
    setStatus("Région remise à zéro")
  }

  const syncToDeck = () => {
    if (srcBpm <= 0 || deckBpm <= 0) return
    const factor = srcBpm / deckBpm
    const clamped = Math.min(2, Math.max(0.5, factor))
    set("stretch", Math.round(clamped * 100) / 100)
    const pair = `${Math.round(srcBpm)} → ${Math.round(deckBpm)} BPM`
    setStatus(clamped === factor ? `Synchro : ${pair}` : `Hors plage ×0,5 à ×2 : ${pair}`)
  }

  const exportToLibrary = async () => {
    if (!engine.superSampler.buffer) return
    if (engine.superSampler.baking) {
      setStatus("Attends la fin du rendu d'étirement")
      return
    }
    setBusy(true)
    try {
      const blob = await engine.superSampler.exportWav()
      const base = engine.superSampler.name || "Sample"
      const params = engine.superSampler.getParams()
      const buf = engine.superSampler.buffer
      await addLocalTrack(blob, base + " · Super Sampler", {
        durationSec: (params.end - params.start) * buf.duration * params.stretch,
        bpm: srcBpm > 0 ? Math.round((srcBpm / params.stretch) * 10) / 10 : undefined,
      })
      onLibraryChange?.()
      setStatus("Ajouté à la bibliothèque : " + base)
    } catch {
      setStatus("Ajout impossible (stockage navigateur plein ?)")
    } finally {
      setBusy(false)
    }
  }

  const resetAll = () => {
    for (const key in DEFAULT_SS_PARAMS) {
      engine.superSampler.setParam(key as keyof SSParams, DEFAULT_SS_PARAMS[key as keyof SSParams])
    }
    setP({ ...DEFAULT_SS_PARAMS })
  }

  const noteDown = (n: number) => {
    setHeld(prev => new Set(prev).add(n))
    engine.superSampler.noteOn(n, 1)
  }

  const noteUp = (n: number) => {
    setHeld(prev => {
      const s = new Set(prev)
      s.delete(n)
      return s
    })
    engine.superSampler.noteOff(n)
  }

  const octave = (d: number) => {
    setKeyBase(b => Math.max(24, Math.min(84, b + 12 * d)))
    engine.superSampler.stopAll()
  }

  const deck = side === "A" ? engine.deckA : engine.deckB
  const mask = Array.from(held).reduce((m, n) => m | (1 << (n - keyBase)), 0)

  return (
    <div className="hw-screwed bg-carbon-900 rounded-[14px] border border-carbon-800 shadow-2xl p-4 gap-3 flex flex-col">
      <header className="hw-brushed h-[44px] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h1 className="font-bold tracking-[0.3em]">SUPER SAMPLER</h1>
          <span className="hw-lcd text-[10px] px-1">SS-16 PRO</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hw-led text-[10px]">ACTIF</span>
          <span className="text-[9px] text-neutral-500">CARBONE</span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 flex flex-col">
          <SSScreen
            buffer={engine.superSampler.buffer}
            name={engine.superSampler.name}
            start={p.start}
            end={p.end}
            loop={p.loop}
            rootNote={p.rootNote}
            pitch={p.pitch}
            bpm={deck.bpm || 120}
            volume={p.volume}
            analyser={engine.superSampler.analyser}
            mode={screenMode}
            onModeChange={setScreenMode}
            onRegionChange={(s, e) => { set("start", s); set("end", e); }}
          />
        </div>

        <div className="hw-recess flex-1 lg:w-[30%] p-3 flex flex-col gap-2">
          <h2 className="text-[10px] tracking-[0.2em] text-neutral-400">SOURCE</h2>
          <div className="flex gap-1">
            <button
              className="hw-btn flex-1"
              onClick={() => fileInputRef.current?.click()}
            >
              FICHIER
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
              className="hidden"
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
            <button
              className={`hw-btn flex-1 ${side === "A" ? "hw-btn-on" : ""}`}
              onClick={() => pickDeck("A")}
            >
              PLATINE A
            </button>
            <button
              className={`hw-btn flex-1 ${side === "B" ? "hw-btn-on" : ""}`}
              onClick={() => pickDeck("B")}
            >
              PLATINE B
            </button>
          </div>

          <div className="flex gap-1">
            {deck.stemNames.slice(0, 6).map((name, i) => (
              <button
                key={i}
                className="hw-btn flex-1 text-[9px]"
                onClick={() => pickStem(i)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            <input
              type="text"
              value={youtube}
              onChange={e => setYoutube(e.target.value)}
              placeholder="ID ou URL YouTube"
              className="hw-input flex-1"
            />
            <button
              className="hw-btn"
              onClick={loadYoutube}
              disabled={busy}
            >
              GO
            </button>
          </div>

          <div className="hw-lcd text-[9px] p-1 bg-carbon-800 text-cyan-400">
            {status}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button className="hw-btn text-[10px]" onClick={normalizeSource}>NORMALISER</button>
            <button className="hw-btn text-[10px]" onClick={trimSilence}>ROGNER</button>
            <button className="hw-btn text-[10px]" onClick={resetRegion}>RÉGION 0-100</button>
          </div>
          <div className="flex gap-1">
            <input
              className="hw-lcd flex-1 min-w-0 text-[10px] px-2"
              placeholder="Nom du préréglage"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
            />
            <button className="hw-btn text-[10px]" onClick={savePreset}>SAUVER</button>
          </div>
          {Object.keys(presets).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.keys(presets).map(name => (
                <span key={name} className="flex items-center rounded ring-1 ring-neutral-700">
                  <button className="px-2 py-1 text-[10px] font-bold text-neutral-200" onClick={() => loadPreset(name)}>{name}</button>
                  <button className="px-1 py-1 text-[10px] text-neutral-500 hover:text-red-400" title="Supprimer ce préréglage" onClick={() => deletePreset(name)}>x</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">ACCORD</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="PITCH"
              min={-24}
              max={24}
              defaultValue={0}
              value={p.pitch}
              onChange={v => set("pitch", Math.round(v))}
              format={v => `${v >= 0 ? "+" : ""}${v} st`}
            />
            <Knob
              size={44}
              label="FIN"
              min={-100}
              max={100}
              defaultValue={0}
              value={p.fine}
              onChange={v => set("fine", v)}
              format={v => `${v.toFixed(0)} ct`}
            />
            <Knob
              size={44}
              label="ÉTIRE"
              min={0.5}
              max={2}
              defaultValue={1}
              value={p.stretch}
              onChange={v => set("stretch", Math.round(v * 100) / 100)}
              format={v => engine.superSampler.baking ? "RENDU…" : `×${v.toFixed(2)}`}
            />
            <button
              className="hw-btn self-center text-[10px] whitespace-nowrap"
              onClick={syncToDeck}
              disabled={srcBpm <= 0 || deckBpm <= 0}
              title={srcBpm > 0 && deckBpm > 0 ? `${Math.round(srcBpm)} → ${Math.round(deckBpm)} BPM` : "Il faut un BPM source et une platine cadencée"}
            >
              SYNC
            </button>
          </div>
          <div className="flex gap-1 mt-2">
            <button
              className="hw-btn flex-1 whitespace-nowrap text-[10px]"
              onClick={() => set("rootNote", Math.max(24, p.rootNote - 1))}
            >
              ROOT -
            </button>
            <span className="hw-lcd text-[9px] flex-1 text-center">
              {NOTE_NAMES[p.rootNote % 12]}{Math.floor(p.rootNote / 12) - 1}
            </span>
            <button
              className="hw-btn flex-1 whitespace-nowrap text-[10px]"
              onClick={() => set("rootNote", Math.min(96, p.rootNote + 1))}
            >
              ROOT +
            </button>
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">FILTRE</h3>
          <div className="flex gap-1 mb-2">
            <button
              className="hw-btn flex-1"
              onClick={() => set("filterType", (p.filterType + 1) % 3)}
            >
              {FILTER_NAMES[p.filterType]}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="CUT"
              min={0}
              max={1}
              defaultValue={0.5}
              value={p.filterCut}
              onChange={v => set("filterCut", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
              size={44}
              label="RES"
              min={0}
              max={1}
              defaultValue={0.1}
              value={p.filterRes}
              onChange={v => set("filterRes", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">SATURATION</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="DRIVE"
              min={0}
              max={1}
              defaultValue={0}
              value={p.drive}
              onChange={v => set("drive", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
              size={44}
              label="CRUSH"
              min={0}
              max={1}
              defaultValue={0}
              value={p.crush}
              onChange={v => set("crush", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">ENVELOPPE</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="ATTAQUE"
              min={0}
              max={500}
              defaultValue={10}
              value={p.attack}
              onChange={v => set("attack", v)}
              format={v => `${v.toFixed(0)} ms`}
            />
            <Knob
              size={44}
              label="RELÂCHE"
              min={2}
              max={3000}
              defaultValue={500}
              value={p.release}
              onChange={v => set("release", v)}
              format={v => `${v.toFixed(0)} ms`}
            />
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">DÉLAI</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="ENVOI"
              min={0}
              max={1}
              defaultValue={0}
              value={p.delaySend}
              onChange={v => set("delaySend", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
              size={44}
              label="FB"
              min={0}
              max={0.85}
              defaultValue={0.3}
              value={p.delayFb}
              onChange={v => set("delayFb", v)}
              format={v => `${v.toFixed(2)}`}
            />
          </div>
          <div className="flex gap-1 mt-2">
            {DELAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={`hw-btn flex-1 min-w-0 whitespace-nowrap text-[10px] ${p.delayDiv === i ? "hw-btn-on" : ""}`}
                onClick={() => set("delayDiv", i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">RÉVERB</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              size={44}
              label="ENVOI"
              min={0}
              max={1}
              defaultValue={0}
              value={p.reverbSend}
              onChange={v => set("reverbSend", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
              size={44}
              label="DÉCLIN"
              min={0}
              max={1}
              defaultValue={0.5}
              value={p.reverbDecay}
              onChange={v => set("reverbDecay", v)}
              format={v => `${(0.4 + v * 3.6).toFixed(1)} s`}
            />
          </div>
        </div>

        <div className="hw-recess p-2 col-span-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-400">SORTIE</h3>

          <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto justify-items-center">
            <Knob
              size={44}
              label="VOL"
              min={0}
              max={1.5}
              defaultValue={0.7}
              value={p.volume}
              onChange={v => set("volume", v)}
              format={v => v === 0 ? "-∞" : `${(20 * Math.log10(v)).toFixed(1)} dB`}
            />
            <Knob
              size={44}
              label="PAN"
              min={-1}
              max={1}
              defaultValue={0}
              value={p.pan}
              onChange={v => set("pan", v)}
              format={v => v < 0 ? `G ${Math.round(-v * 50)}` : v > 0 ? `D ${Math.round(v * 50)}` : "C"}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Mode de jeu</span>
        {(["keys", "pads", "seq"] as const).map(m => (
          <button
            key={m}
            className={`hw-btn px-3 py-1.5 text-[11px] font-bold ${mode === m ? "hw-btn-on" : ""}`}
            onClick={() => { engine.superSampler.stopAll(); setMode(m) }}
          >
            {m === "keys" ? "CLAVIER" : m === "pads" ? "PADS" : "SÉQUENCE"}
          </button>
        ))}
      </div>
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1">
          {mode === "keys" && (
            <SSKeys
              baseNote={keyBase}
              activeMask={mask}
              onDown={noteDown}
              onUp={noteUp}
              onOctave={octave}
            />
          )}
          {mode === "pads" && (
            <SSPads
              onPlay={i => engine.superSampler.playSlice(i, 16)}
              sliceLabel={i => `${Math.round((i / 16) * 100)}%`}
            />
          )}
          {mode === "seq" && (
            <SSSeq
              keyBase={keyBase}
              deckBpm={deckBpm}
              stepsCount={16}
              now={() => engine.ctx.currentTime}
              playStep={(note, len, when) => engine.superSampler.playStep(note, len, when)}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 w-full lg:w-[200px]">
          <button
            className={`hw-btn ${p.loop ? "hw-btn-on" : ""}`}
            onClick={() => set("loop", !p.loop)}
          >
            LOOP
          </button>
          <button
            className={`hw-btn ${p.oneShot ? "hw-btn-on" : ""}`}
            onClick={() => set("oneShot", !p.oneShot)}
          >
            ONE-SHOT
          </button>
          <button
            className={`hw-btn ${p.reverse ? "hw-btn-on" : ""}`}
            onClick={() => set("reverse", !p.reverse)}
          >
            REVERSE
          </button>
          <button
            className="hw-btn"
            onClick={exportNow}
            disabled={busy || !engine.superSampler.buffer}
          >
            {busy ? "EXPORT…" : "EXPORT WAV"}
          </button>
          <button
            className="hw-btn col-span-2"
            onClick={exportToLibrary}
            disabled={busy || !engine.superSampler.buffer}
          >
            VERS BIBLIOTHÈQUE
          </button>
          <button
            className="hw-btn col-span-2"
            onClick={resetAll}
          >
            RESET
          </button>
        </div>
      </div>

      <footer className="text-[9px] text-neutral-600">
        Clavier : A à K, Z à , · [ ] octave · Export WAV 24 bits normalisé à -1 dBFS · la hauteur suit la vitesse (sans étirement temporel)
      </footer>
    </div>
  )
}
