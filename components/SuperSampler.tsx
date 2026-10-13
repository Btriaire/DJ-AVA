import { useRef, useState } from "react"
import type { DJEngine } from "@/lib/audio/engine"
import { DEFAULT_SS_PARAMS, DELAY_LABELS, FILTER_NAMES, type SSParams } from "@/lib/audio/SuperSampler"
import { Knob } from "./Knob"
import { SSScreen } from "./SSScreen"
import { SSKeys } from "./SSKeys"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function SuperSampler({ engine }: { engine: DJEngine }) {
  const [p, setP] = useState<SSParams>(() => engine.superSampler.getParams())
  const [side, setSide] = useState<"A" | "B">("A")
  const [status, setStatus] = useState("Charge une source")
  const [busy, setBusy] = useState(false)
  const [keyBase, setKeyBase] = useState(48)
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [screenMode, setScreenMode] = useState<"wave" | "spectrum" | "scope">("wave")
  const [youtube, setYoutube] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof SSParams>(key: K, value: SSParams[K]) => {
    engine.superSampler.setParam(key, value)
    setP(prev => ({ ...prev, [key]: value }))
  }

  const loadBuffer = (buffer: AudioBuffer, name: string, label: string) => {
    engine.superSampler.setSource(buffer, name)
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
    loadBuffer(deck.audioBuffer, deck.name || "Platine " + s, "Source : platine " + s)
  }

  const pickStem = (i: number) => {
    const deck = side === "A" ? engine.deckA : engine.deckB
    const buf = deck.getStemBuffer(i)
    if (!buf) {
      setStatus("Stem indisponible (sépare d'abord le morceau)")
      return
    }
    loadBuffer(buf, (deck.name || "Platine " + side) + " · " + deck.stemNames[i], "Source : stem " + deck.stemNames[i])
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
      setStatus("Export WAV 24 bits prêt")
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
        <div className="flex-1">
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
          <h2 className="text-[10px] tracking-[0.2em] text-neutral-500">SOURCE</h2>
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
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">ACCORD</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="PITCH"
              min={-24}
              max={24}
              defaultValue={0}
              value={p.pitch}
              onChange={v => set("pitch", Math.round(v))}
              format={v => `${v >= 0 ? "+" : ""}${v} st`}
            />
            <Knob
              label="FIN"
              min={-100}
              max={100}
              defaultValue={0}
              value={p.fine}
              onChange={v => set("fine", v)}
              format={v => `${v.toFixed(0)} ct`}
            />
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
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">FILTRE</h3>
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
              label="CUT"
              min={0}
              max={1}
              defaultValue={0.5}
              value={p.filterCut}
              onChange={v => set("filterCut", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
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
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">SATURATION</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="DRIVE"
              min={0}
              max={1}
              defaultValue={0}
              value={p.drive}
              onChange={v => set("drive", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
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
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">ENVELOPPE</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="ATTAQUE"
              min={0}
              max={500}
              defaultValue={10}
              value={p.attack}
              onChange={v => set("attack", v)}
              format={v => `${v.toFixed(0)} ms`}
            />
            <Knob
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
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">DÉLAI</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="ENVOI"
              min={0}
              max={1}
              defaultValue={0}
              value={p.delaySend}
              onChange={v => set("delaySend", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
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
                className={`hw-btn flex-1 text-[8px] ${p.delayDiv === i ? "hw-btn-on" : ""}`}
                onClick={() => set("delayDiv", i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">RÉVERB</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="ENVOI"
              min={0}
              max={1}
              defaultValue={0}
              value={p.reverbSend}
              onChange={v => set("reverbSend", v)}
              format={v => `${Math.round(v * 100)}%`}
            />
            <Knob
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

        <div className="hw-recess p-2">
          <h3 className="text-[10px] tracking-[0.2em] text-neutral-500">SORTIE</h3>
          <div className="grid grid-cols-2 gap-2">
            <Knob
              label="VOL"
              min={0}
              max={1.5}
              defaultValue={0.7}
              value={p.volume}
              onChange={v => set("volume", v)}
              format={v => v === 0 ? "-∞" : `${(20 * Math.log10(v)).toFixed(1)} dB`}
            />
            <Knob
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

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1">
          <SSKeys
            baseNote={keyBase}
            activeMask={mask}
            onDown={noteDown}
            onUp={noteUp}
            onOctave={octave}
          />
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
