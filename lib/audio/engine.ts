import { Deck } from "./Deck";
import { Synth } from "./Synth";
import { StepSequencer } from "./StepSequencer";
import { Sampler } from "./Sampler";
import { Recorder } from "./Recorder";
import { FXRack, FxName } from "./FXRack";
import { SoundFX } from "./SoundFX";
import { MidiManager } from "./midi";
import { idbPutBlob, idbGetBlob, idbDelBlob } from "../library";
import * as Tone from "tone";

// Build the AudioContext tuned for the lowest practical action latency. The
// "interactive" hint tells the browser to pick the smallest hardware buffer it
// can sustain — unlike "balanced"/"playback", which trade responsiveness for
// power efficiency — so a cue, play, or pad-hit reaches the speakers in the
// fewest milliseconds. Older engines that reject the options bag fall back to a
// plain context.
function lowLatencyContext(): AudioContext {
  try {
    return new AudioContext({ latencyHint: "interactive" });
  } catch {
    return new AudioContext();
  }
}

// Holds the shared AudioContext, two decks, the crossfader and master out.
export class DJEngine {
  readonly ctx: AudioContext;
  readonly deckA: Deck;
  readonly deckB: Deck;
  readonly synth: Synth;
  readonly synthSeq: StepSequencer;
  readonly sampler: Sampler;
  readonly midi: MidiManager; // Web MIDI input → synth + sampler (Arturia MiniLab)
  readonly soundFx: SoundFX; // synthesised one-shot DJ effects (airhorn, riser…)
  readonly recorder: Recorder;
  readonly dlRecorder: Recorder; // dedicated capture for WAV download
  readonly masterFx: FXRack; // FX bus on the full mix
  private chA: GainNode;
  private chB: GainNode;
  private master: GainNode;
  private meterAnalyser: AnalyserNode;
  private meterBuf: Uint8Array<ArrayBuffer>;
  private crossfade = 0.5;
  // iOS Safari suspends a page's AudioContext as soon as the tab backgrounds
  // (screen lock, app switch) — that's what kills playback, not the Wake
  // Lock elsewhere. But it does NOT suspend an actively playing HTMLMediaElement
  // (<audio>/<video>): that's how web radio players survive a locked screen.
  // This tap mirrors the exact same post-FX mix into a MediaStream that a
  // hidden <audio> element (wired up in app/page.tsx) plays from — WebKit
  // then treats the whole page as "legitimate background audio" and keeps
  // the AudioContext (and this stream) alive too. Not a 100% guarantee on
  // every iOS version, but it's the standard trick, and there's no other
  // web-only lever for it — reliable background audio otherwise needs a
  // native app wrapper (AVAudioSession background mode).
  private bgStreamDest: MediaStreamAudioDestinationNode;

  constructor() {
    this.ctx = lowLatencyContext();
    // Hand the shared context to Tone.js so the rack's creative effects (built on
    // Tone nodes) live in the same graph as the native engine — one clock, one
    // sample rate, no second context. Must run before any Tone node is created.
    Tone.setContext(this.ctx);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // master FX bus + metering: master -> masterFx -> analyser -> destination
    this.masterFx = new FXRack(this.ctx);
    this.meterAnalyser = this.ctx.createAnalyser();
    this.meterAnalyser.fftSize = 1024;
    this.meterAnalyser.smoothingTimeConstant = 0.75;
    this.meterBuf = new Uint8Array(this.meterAnalyser.frequencyBinCount);
    this.master.connect(this.masterFx.input);
    this.masterFx.output.connect(this.meterAnalyser);
    this.meterAnalyser.connect(this.ctx.destination);
    this.bgStreamDest = this.ctx.createMediaStreamDestination();
    this.meterAnalyser.connect(this.bgStreamDest); // parallel tap, see field comment

    this.chA = this.ctx.createGain();
    this.chB = this.ctx.createGain();
    this.chA.connect(this.master);
    this.chB.connect(this.master);

    this.deckA = new Deck(this.ctx);
    this.deckB = new Deck(this.ctx);
    this.deckA.output.connect(this.chA);
    this.deckB.output.connect(this.chB);

    // synth + sampler layer straight onto the master
    this.synth = new Synth(this.ctx);
    this.synthSeq = new StepSequencer(
      (n) => this.synth.noteOn(n),
      (n) => this.synth.noteOff(n)
    );
    this.sampler = new Sampler(this.ctx);
    this.midi = new MidiManager(this.synth, this.sampler);
    this.soundFx = new SoundFX(this.ctx);
    this.synth.out.connect(this.master);
    this.sampler.output.connect(this.master); // post-limiter sampler output
    this.soundFx.output.connect(this.master); // one-shot FX sit on the master too

    // recorders tap the full post-FX mix (decks + FX + synth + sampler)
    this.recorder = new Recorder(this.ctx, 30);
    this.dlRecorder = new Recorder(this.ctx, 600);
    this.masterFx.output.connect(this.recorder.input);
    this.masterFx.output.connect(this.dlRecorder.input);

    this.applyCrossfade();
    this.installAutoRecovery();
  }

  // ---------------------------------------------------------------------------
  // Audio keeps coming back on its own.
  //
  // Two failure modes cause the "sudden silence I can't fix without restarting":
  //   1. The context gets suspended/interrupted (backgrounded tab, OS sleep,
  //      power policy). A plain resume() fixes it — but browsers only honour
  //      resume() from a user gesture, so we bind it to clicks/keys too.
  //   2. On macOS the default OUTPUT device changes (AirPods connect/disconnect,
  //      switching to speakers). The context stays "running" but plays to a dead
  //      device, so resume() does nothing. The cure is a suspend→resume "kick"
  //      that forces the render thread to re-bind to the new default device.
  // ---------------------------------------------------------------------------
  private kicking = false;
  // The host (React page) wires this to a full engine rebuild. We call it as a
  // LAST resort, when the context is wedged in a way resume()/setSinkId() can't
  // fix (typically a sample-rate change after the output device switched) — so
  // the sound comes back on its own, with no "↻ SON" click required.
  onFatalSilence: (() => void) | null = null;
  private lastRebuildAt = 0;

  // Escalate to a full rebuild, but never thrash: at most once per 8 s, and only
  // when there's actually a track loaded whose silence is worth a heavy reset.
  private maybeRebuild() {
    const now = Date.now();
    if (now - this.lastRebuildAt < 8000) return;
    if (!this.onFatalSilence) return;
    if (!(this.deckA.name || this.deckB.name)) return;
    this.lastRebuildAt = now;
    this.onFatalSilence();
  }

  // True when the live context is bound to a sample rate that no longer matches
  // the current default output — the tell-tale of a "running but silent" context
  // that only a fresh AudioContext can cure. A throwaway probe context always
  // reports the CURRENT hardware rate, so a mismatch means our context is dead.
  // NOTE: this is only a SECONDARY confirmation now. On its own it false-positives
  // (a fresh probe can negotiate a different default rate for benign reasons), and
  // acting on it alone was firing needless suspend→resume kicks — heard as the
  // periodic "sound blocks" the user reported. We now require measured silence
  // (outputSilent) AND expected audio before ever escalating.
  private async deadOutput(): Promise<boolean> {
    try {
      const probe = new AudioContext();
      const rate = probe.sampleRate;
      await probe.close();
      return rate !== this.ctx.sampleRate;
    } catch {
      return false;
    }
  }

  // Audio is *expected* right now: a deck is actually playing and the master is
  // up. A loaded-but-paused deck, or master at 0, must never count as "should be
  // making sound" — otherwise the watchdog would kick during normal silence.
  private audioExpected(): boolean {
    return (this.deckA.playing || this.deckB.playing) && this.getMaster() > 0;
  }

  // Real, MEASURED silence at the master output, read from the post-FX analyser.
  // Returns true only when there is literally no energy in any band. This is the
  // ground truth that gates every disruptive recovery action: a benign probe
  // mismatch can no longer trigger a kick unless the output is genuinely dead.
  private outputSilent(): boolean {
    this.meterAnalyser.getByteFrequencyData(this.meterBuf);
    for (let i = 0; i < this.meterBuf.length; i++) {
      if (this.meterBuf[i] !== 0) return false;
    }
    return true;
  }

  private installAutoRecovery() {
    // 1. context falling out of "running" → bring it straight back
    this.ctx.onstatechange = () => {
      const s = this.ctx.state as string;
      if (s === "suspended" || s === "interrupted") this.ctx.resume().catch(() => {});
    };

    if (typeof window === "undefined") return;

    // 2. any user gesture is a free, browser-sanctioned chance to resume — so a
    //    single click ANYWHERE recovers a stuck context, no special button.
    const wake = () => {
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    };
    ["pointerdown", "keydown", "touchstart"].forEach((e) =>
      window.addEventListener(e, wake, { capture: true, passive: true })
    );

    // 3. coming back to the tab — resume if the OS suspended us while hidden
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });

    // 4. output device changed → re-bind to it with the suspend→resume kick. A
    //    real device switch genuinely needs the re-bind, so recover() runs here.
    //    But only escalate to a heavy rebuild when sound is EXPECTED yet MEASURED
    //    silent afterwards — never on the probe mismatch alone.
    const md = navigator.mediaDevices as MediaDevices | undefined;
    if (md && "addEventListener" in md) {
      let t: ReturnType<typeof setTimeout> | null = null;
      md.addEventListener("devicechange", () => {
        if (t) clearTimeout(t);
        t = setTimeout(async () => {
          await this.recover();
          if (this.audioExpected() && this.outputSilent() && (await this.deadOutput())) {
            this.maybeRebuild();
          }
        }, 300); // debounce the burst of events
      });
    }

    // 5. last-resort watchdog (every 2 s). Outside "running" → cheap nudge. The
    //    self-heal path now triggers ONLY on confirmed, sustained, measured
    //    silence while a deck is actually playing — so a fine-sounding mix is
    //    never interrupted by a speculative kick. We require silence across two
    //    consecutive ticks (~4 s) to rule out a momentary buffer gap or an
    //    intentional drop, then recover(), and rebuild only if it's still dead.
    let silentTicks = 0;
    setInterval(async () => {
      if (this.ctx.state !== "running") {
        this.ctx.resume().catch(() => {});
        return;
      }
      if (this.audioExpected() && this.outputSilent()) {
        if (++silentTicks >= 2) {
          silentTicks = 0;
          await this.recover();
          if (this.audioExpected() && this.outputSilent() && (await this.deadOutput())) {
            this.maybeRebuild();
          }
        }
      } else {
        silentTicks = 0;
      }
    }, 2000);
  }

  // Force the audio output to re-bind to the CURRENT default device. An
  // AudioContext stays glued to the device it was created on and does NOT follow
  // the system default — so when you switch headphones/speakers the sound dies
  // and resume() can't fix it. setSinkId() is the real cure; we toggle the sink
  // (concrete device → default) to force a fresh re-bind even when Chrome would
  // otherwise treat "set to the same id" as a no-op.
  async recover() {
    if (this.kicking) return;
    this.kicking = true;
    try {
      if (this.ctx.state !== "running") {
        await this.ctx.resume().catch(() => {});
      }
      const ctx = this.ctx as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
        sinkId?: string;
      };
      if (typeof ctx.setSinkId === "function") {
        // pick the current default output to re-point at, then fall back to ''
        let target = "";
        try {
          const outs = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "audiooutput"
          );
          target = (outs.find((d) => d.deviceId === "default") ?? outs[0])?.deviceId ?? "";
        } catch {
          /* no permission to list — '' (system default) still works */
        }
        try {
          await ctx.setSinkId(target);
          if (target !== "") await ctx.setSinkId(""); // settle back on the default
        } catch {
          /* setSinkId unsupported/blocked — fall through to the kick */
          await this.kick();
        }
      } else {
        await this.kick();
      }
      // whatever happened, make sure we end up running
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    } finally {
      this.kicking = false;
    }
  }

  // suspend→resume nudge — last resort when setSinkId isn't available
  private async kick() {
    try {
      if (this.ctx.state === "running") await this.ctx.suspend();
      await this.ctx.resume();
    } catch {
      /* best-effort */
    }
  }

  // grab a slice of a deck into the next free sampler pad; returns pad index
  grabToSampler(deck: "A" | "B", beats = 4): number | null {
    const buf = (deck === "A" ? this.deckA : this.deckB).captureSlice(beats);
    if (!buf) return null;
    const slot = this.sampler.nextGrabSlot();
    this.sampler.setBuffer(slot, buf, `${deck} grab`);
    return slot;
  }

  // start recording the live master mix
  startSampling() {
    this.recorder.start();
  }

  // stop recording and load the captured audio onto the synth keyboard,
  // playable pitched across the keys. Returns the sample length in seconds.
  stopSamplingToSynth(): number | null {
    const buf = this.recorder.stop();
    if (!buf) return null;
    this.synth.setSample(buf, "Live sample");
    return buf.length / buf.sampleRate;
  }

  resume() {
    // "suspended" (Chrome) or "interrupted" (Safari) both mean: no audio out.
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
  }

  // Soonest glitch-free instant to schedule ANY time-critical action — cue, play,
  // pad hit, FX punch, sampler trigger. Route every start time through this so
  // latency stays pinned to the hardware floor instead of creeping up from ad-hoc
  // padding scattered across call sites.
  //
  // The single biggest *variable* source of trigger lag is a context that has
  // slipped out of "running" (backgrounded tab, OS power policy, device switch):
  // nothing is heard until it resumes, which otherwise waits for the next user
  // gesture. So we kick resume() synchronously here, then hand back currentTime —
  // the audio clock's "right now", i.e. the very next render quantum — with no
  // artificial lookahead added on top. Pass an optional `lead` (seconds) only when
  // a caller genuinely needs a sample-accurate future point (e.g. quantised launch)
  // and accepts that much extra latency in exchange.
  actionTime(lead = 0): number {
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    return this.ctx.currentTime + Math.max(0, lead);
  }

  // Round-trip latency the hardware/output stack adds before a scheduled sound is
  // actually heard — purely informational (e.g. to show a "X ms" readout or to
  // compensate visual cues). `outputLatency` is the truer figure where supported,
  // with `baseLatency` (the context's internal buffer) as the fallback.
  latencyMs(): number {
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    const sec = ctx.outputLatency || ctx.baseLatency || 0;
    return Math.round(sec * 1000);
  }

  // PANIC: reset every control to default but keep loaded tracks + sampler pads.
  panic() {
    this.resume(); // first priority: wake a suspended/interrupted context
    this.deckA.reset();
    this.deckB.reset();
    this.synth.reset();
    (["echo", "reverb", "flanger", "phaser", "gate", "crush"] as FxName[]).forEach((fx) =>
      this.masterFx.setWet(fx, 0)
    );
    this.sampler.resetFx();
    this.setMaster(0.9);
    this.setCrossfade(0.5);
  }

  // stream to hand to a hidden <audio> element for background-audio survival
  // on iOS — see the bgStreamDest field comment for why this exists.
  get backgroundAudioStream(): MediaStream {
    return this.bgStreamDest.stream;
  }

  setMaster(v: number) {
    this.master.gain.value = v;
  }
  getMaster(): number {
    return this.master.gain.value;
  }

  // --- external module hooks (DX7 synth & future connectable modules) ---
  // Node where a plug-in module injects its audio INTO the live mix, so it is
  // heard, recorded, and processed by the master FX just like the decks.
  get mixInput(): AudioNode {
    return this.master;
  }
  // A fresh recorder tapping the POST-FX master mix, so a module can sample a few
  // live seconds of whatever is playing (both decks + FX + synth). The caller
  // owns start()/stop(); the tap persists for the recorder's lifetime.
  makeLiveRecorder(maxSeconds = 12): Recorder {
    const r = new Recorder(this.ctx, maxSeconds);
    this.masterFx.output.connect(r.input);
    return r;
  }

  // --- master FX bus (affects the whole mix) ---
  setMasterFx(name: FxName, v: number) {
    this.masterFx.setWet(name, v);
  }
  getMasterFx(name: FxName): number {
    return this.masterFx.getWet(name);
  }

  // N-band level meter (0..1 each) read from the post-FX master analyser
  getMeters(bands = 8): number[] {
    this.meterAnalyser.getByteFrequencyData(this.meterBuf);
    const bins = this.meterBuf.length;
    const out: number[] = new Array(bands).fill(0);
    // logarithmic band edges so low/high get fair share
    for (let b = 0; b < bands; b++) {
      const lo = Math.floor(bins * Math.pow(b / bands, 1.6));
      const hi = Math.max(lo + 1, Math.floor(bins * Math.pow((b + 1) / bands, 1.6)));
      let sum = 0;
      let n = 0;
      for (let i = lo; i < hi && i < bins; i++) {
        sum += this.meterBuf[i];
        n++;
      }
      out[b] = n ? sum / (n * 255) : 0;
    }
    return out;
  }

  // play/pause both decks together
  togglePlayAll(): boolean {
    const anyPlaying = this.deckA.playing || this.deckB.playing;
    if (anyPlaying) {
      this.deckA.pause();
      this.deckB.pause();
    } else {
      this.deckA.play();
      this.deckB.play();
    }
    return !anyPlaying;
  }
  get anyPlaying(): boolean {
    return this.deckA.playing || this.deckB.playing;
  }

  // record the live mix; stop returns a WAV Blob ready to download
  startRecording() {
    this.dlRecorder.start();
  }
  get isRecording(): boolean {
    return this.dlRecorder.recording;
  }
  stopRecording(): Blob | null {
    const buf = this.dlRecorder.stop();
    if (!buf) return null;
    return encodeWav(buf);
  }

  // equal-power crossfade, 0 = full A, 1 = full B
  setCrossfade(x: number) {
    this.crossfade = x;
    this.applyCrossfade();
  }
  getCrossfade(): number {
    return this.crossfade;
  }

  private applyCrossfade() {
    const x = this.crossfade;
    this.chA.gain.value = Math.cos((x * Math.PI) / 2);
    this.chB.gain.value = Math.cos(((1 - x) * Math.PI) / 2);
  }

  // match deck B tempo to deck A (or vice-versa)
  sync(target: "A" | "B") {
    const src = target === "A" ? this.deckB : this.deckA;
    const dst = target === "A" ? this.deckA : this.deckB;
    if (!src.effectiveBPM || !dst.bpm) return;
    const pct = (src.effectiveBPM / dst.bpm - 1) * 100;
    dst.setPitch(Math.max(-50, Math.min(50, pct)));
    return pct;
  }

  // --- hard recovery: snapshot the musically-important state so a brand-new
  // engine (fresh AudioContext) can take over when the current one is wedged.
  exportState(): EngineState {
    const snap = (d: Deck): DeckSnapshot => ({
      raw: d.getRawData(),
      name: d.name,
      coverArt: d.coverArt,
      sourceLink: d.sourceLink,
      origin: d.origin,
      settings: d.getSettings(),
      playing: d.playing,
      position: d.position(),
      repeat: d.repeat,
    });
    return {
      crossfade: this.crossfade,
      master: this.getMaster(),
      a: snap(this.deckA),
      b: snap(this.deckB),
    };
  }

  async importState(s: EngineState) {
    this.setCrossfade(s.crossfade);
    this.setMaster(s.master);
    await this.restoreDeck(this.deckA, s.a);
    await this.restoreDeck(this.deckB, s.b);
  }

  private async restoreDeck(d: Deck, snap: DeckSnapshot) {
    if (!snap.raw) return;
    await d.load(snap.raw, snap.name); // re-decode on the new context
    d.coverArt = snap.coverArt;
    d.sourceLink = snap.sourceLink;
    d.origin = snap.origin;
    d.applySettings(snap.settings);
    d.repeat = snap.repeat;
    d.seek(snap.position); // paused → just sets the resume point
    if (snap.playing) d.play();
  }
}

interface DeckSnapshot {
  raw: ArrayBuffer | null;
  name: string;
  coverArt: string;
  sourceLink: string;
  origin: Deck["origin"];
  settings: ReturnType<Deck["getSettings"]>;
  playing: boolean;
  position: number;
  repeat: boolean;
}
interface EngineState {
  crossfade: number;
  master: number;
  a: DeckSnapshot;
  b: DeckSnapshot;
}

// encode an AudioBuffer to a 16-bit PCM WAV Blob
export function encodeWav(buf: AudioBuffer): Blob {
  const numCh = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const sr = buf.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(off, s, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

let engine: DJEngine | null = null;
export function getEngine(): DJEngine {
  if (!engine) engine = new DJEngine();
  return engine;
}

// Nuclear recovery: when the audio is wedged for good (a dead/locked
// AudioContext that resume() and setSinkId() can't revive — typically a sample-
// rate change after switching output device), build a completely fresh engine on
// a new AudioContext, carry the loaded tracks + mixer/FX state across, and bin
// the old one. This is the in-app equivalent of "close everything and restart",
// minus the page reload. Returns the new engine; the caller must swap its
// reference and remount the UI so every panel points at the new decks.
export async function rebuildEngine(): Promise<DJEngine> {
  const old = engine;
  const state = old?.exportState();
  const next = new DJEngine(); // its ctor uses lowLatencyContext() too
  next.resume();
  if (state) {
    try {
      await next.importState(state);
    } catch {
      /* best-effort — at worst the decks come up empty */
    }
  }
  engine = next;
  if (old) {
    try {
      await old.ctx.close();
    } catch {
      /* already gone */
    }
  }
  return next;
}

// --- persistent Save State -------------------------------------------------
// Snapshot the full mix to disk so a closed session can be restored exactly:
// both decks' tracks + every parameter, the crossfader and master. The audio
// PCM is too big for localStorage, so the raw buffers live in IndexedDB (one
// blob per deck) while the lightweight metadata goes to localStorage.
const SAVE_KEY = "djsynth.savestate.v1";
const SAVE_BLOB_A = "__savestate_a";
const SAVE_BLOB_B = "__savestate_b";

interface SavedDeck {
  hasAudio: boolean;
  name: string;
  coverArt: string;
  sourceLink: string;
  origin: Deck["origin"];
  settings: ReturnType<Deck["getSettings"]>;
  playing: boolean;
  position: number;
  repeat: boolean;
}
interface SavedState {
  crossfade: number;
  master: number;
  a: SavedDeck;
  b: SavedDeck;
  savedAt: number;
}

export function hasSavedState(): boolean {
  try {
    return typeof localStorage !== "undefined" && !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

// timestamp (ms) of the last saved state, or 0 if none
export function savedStateTime(): number {
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    return txt ? (JSON.parse(txt) as SavedState).savedAt || 0 : 0;
  } catch {
    return 0;
  }
}

export async function saveEngineState(eng: DJEngine): Promise<void> {
  const s = eng.exportState();
  const persist = async (key: string, snap: DeckSnapshot): Promise<SavedDeck> => {
    if (snap.raw) {
      await idbPutBlob(key, new Blob([snap.raw]));
    } else {
      await idbDelBlob(key); // drop any stale audio for an empty deck
    }
    return {
      hasAudio: !!snap.raw,
      name: snap.name,
      coverArt: snap.coverArt,
      sourceLink: snap.sourceLink,
      origin: snap.origin,
      settings: snap.settings,
      playing: snap.playing,
      position: snap.position,
      repeat: snap.repeat,
    };
  };
  const a = await persist(SAVE_BLOB_A, s.a);
  const b = await persist(SAVE_BLOB_B, s.b);
  const payload: SavedState = { crossfade: s.crossfade, master: s.master, a, b, savedAt: Date.now() };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export async function loadEngineState(eng: DJEngine): Promise<boolean> {
  let saved: SavedState;
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    if (!txt) return false;
    saved = JSON.parse(txt);
  } catch {
    return false;
  }
  eng.resume();
  eng.setCrossfade(saved.crossfade);
  eng.setMaster(saved.master);
  await restoreSavedDeck(eng.deckA, SAVE_BLOB_A, saved.a);
  await restoreSavedDeck(eng.deckB, SAVE_BLOB_B, saved.b);
  return true;
}

async function restoreSavedDeck(d: Deck, key: string, snap: SavedDeck | undefined): Promise<void> {
  if (!snap || !snap.hasAudio) return;
  const blob = await idbGetBlob(key);
  if (!blob) return;
  const raw = await blob.arrayBuffer();
  await d.load(raw, snap.name); // re-decode on the live context
  d.coverArt = snap.coverArt;
  d.sourceLink = snap.sourceLink;
  d.origin = snap.origin;
  d.applySettings(snap.settings);
  d.repeat = snap.repeat;
  d.seek(snap.position);
  if (snap.playing) d.play();
}
