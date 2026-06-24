// Web MIDI input → synth notes + sampler pads. Tuned for the Arturia MiniLab
// (MkII / MiniLab 3) factory template, but works with any class-compliant USB
// MIDI keyboard:
//   • velocity keys  → synth.noteOn / noteOff (full range, velocity-sensitive)
//   • the 8 pads     → sampler pads (Arturia sends them on MIDI channel 10)
//   • pitch-bend     → synth pitch-bend (±2 semitones)
//   • mod wheel/strip + the 8 encoders → synth parameters (factory CC numbers)
//
// Web MIDI needs a secure context: it works on https:// and on http://localhost
// (so the local dev server is fine) but NOT over a plain LAN IP. Chrome/Edge
// support it; Safari only since 18.4.
import type { Synth } from "./Synth";
import type { Sampler } from "./Sampler";

// Minimal local typings so we don't depend on the (still non-standard) global
// Web MIDI lib types being present.
interface MidiMessage {
  data: Uint8Array | null;
}
interface MidiInputLike {
  id: string;
  name: string | null;
  onmidimessage: ((e: MidiMessage) => void) | null;
}
interface MidiAccessLike {
  inputs: { forEach: (cb: (input: MidiInputLike) => void) => void };
  onstatechange: ((e: unknown) => void) | null;
}
type RequestMIDIAccess = (opts?: { sysex?: boolean }) => Promise<MidiAccessLike>;

// The mod wheel / touch-strip is CC 1 on every MiniLab template, and the pads
// sit on MIDI channel 10. The 8 encoders, however, send different CC numbers
// depending on the MIDI Control Center template (MkII vs MiniLab 3 vs custom),
// so instead of hardcoding a table we AUTO-LEARN them: the first encoder you
// touch binds to the first synth param, the next new encoder to the second,
// and so on. This way the knobs work whatever template the keyboard ships with.
const MODWHEEL_CC = 1;

// The ordered list of synth params the encoders map onto, in bind order. Turn
// 8 different knobs and they light up cutoff → reso → attack → … → detune.
const CC_TARGETS = [
  "cutoff",
  "reso",
  "attack",
  "decay",
  "sustain",
  "release",
  "lfo",
  "detune",
] as const;
type CCTarget = (typeof CC_TARGETS)[number];

export interface MidiState {
  supported: boolean;
  enabled: boolean;
  devices: string[];
}

export class MidiManager {
  private synth: Synth;
  private sampler: Sampler;
  private access: MidiAccessLike | null = null;
  private inputs: MidiInputLike[] = [];

  readonly state: MidiState = { supported: false, enabled: false, devices: [] };
  // last note activity, for a blinking "MIDI" LED in the UI
  lastNoteAt = 0;
  lastNote = -1;
  lastWasPad = false;
  // last encoder that moved, for an "appris : Cutoff" hint in the UI
  lastCCTarget: CCTarget | null = null;
  lastCCAt = 0;

  // auto-learn: CC number → assigned synth-param slot (index into CC_TARGETS).
  // Filled lazily as new encoders are turned for the first time.
  private ccMap = new Map<number, number>();

  private listeners = new Set<() => void>();

  constructor(synth: Synth, sampler: Sampler) {
    this.synth = synth;
    this.sampler = sampler;
    this.state.supported =
      typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  // subscribe a UI listener; returns an unsubscribe fn
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  async enable(): Promise<void> {
    if (!this.state.supported || this.access) return;
    const req = (navigator as unknown as { requestMIDIAccess?: RequestMIDIAccess })
      .requestMIDIAccess;
    if (!req) return;
    try {
      const access = await req.call(navigator, { sysex: false });
      this.access = access;
      access.onstatechange = () => this.rebind();
      this.rebind();
      this.state.enabled = true;
      this.emit();
    } catch {
      this.state.enabled = false;
      this.emit();
    }
  }

  disable(): void {
    for (const inp of this.inputs) inp.onmidimessage = null;
    this.inputs = [];
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.state.enabled = false;
    this.state.devices = [];
    this.emit();
  }

  toggle(): void {
    if (this.state.enabled) this.disable();
    else void this.enable();
  }

  // (re)attach to every connected input and refresh the device-name list
  private rebind(): void {
    if (!this.access) return;
    for (const inp of this.inputs) inp.onmidimessage = null;
    this.inputs = [];
    const names: string[] = [];
    this.access.inputs.forEach((inp) => {
      inp.onmidimessage = (e) => this.onMessage(e);
      this.inputs.push(inp);
      names.push(inp.name || "MIDI");
    });
    this.state.devices = names;
    this.emit();
  }

  private padIndex(note: number): number {
    // MiniLab pads send notes 36..43 → sampler pads 0..7
    return Math.max(0, Math.min(this.sampler.pads.length - 1, note - 36));
  }

  private flash(note: number, pad: boolean) {
    this.lastNote = note;
    this.lastWasPad = pad;
    this.lastNoteAt = performance.now();
    this.emit();
  }

  private onMessage(e: MidiMessage): void {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;
    const isPad = channel === 9; // MIDI channel 10 (0-indexed) = Arturia pads

    if (status === 0x90 && d2 > 0) {
      // note on
      const vel = d2 / 127;
      if (isPad) this.sampler.play(this.padIndex(d1), vel);
      else this.synth.noteOn(d1, vel);
      this.flash(d1, isPad);
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      // note off
      if (isPad) this.sampler.release(this.padIndex(d1));
      else this.synth.noteOff(d1);
    } else if (status === 0xe0) {
      // pitch bend: 14-bit, center 8192 → ±2 semitones
      const value = ((d2 << 7) | d1) - 8192;
      this.synth.setBend((value / 8192) * 2);
    } else if (status === 0xb0) {
      this.onCC(d1, d2);
    }
  }

  private onCC(cc: number, raw: number): void {
    const v = raw / 127; // 0..1

    // The mod wheel / touch-strip is always vibrato, never auto-learned.
    if (cc === MODWHEEL_CC) {
      this.synth.setVibrato(v * 50); // depth in cents
      this.emit();
      return;
    }

    // Auto-learn: bind this CC to the next free param slot the first time it
    // moves. Once all 8 slots are taken, extra encoders are ignored.
    let slot = this.ccMap.get(cc);
    if (slot === undefined) {
      if (this.ccMap.size >= CC_TARGETS.length) return; // no slots left
      slot = this.ccMap.size;
      this.ccMap.set(cc, slot);
    }

    const target = CC_TARGETS[slot];
    this.applyCCTarget(target, v);
    this.lastCCTarget = target;
    this.lastCCAt = performance.now();
    this.emit();
  }

  // Map a normalized 0..1 encoder value onto a named synth parameter.
  private applyCCTarget(target: CCTarget, v: number): void {
    switch (target) {
      case "cutoff":
        this.synth.setCutoff(80 * Math.pow(150, v)); // 80 Hz .. 12 kHz, log
        break;
      case "reso":
        this.synth.setReso(v * 25);
        break;
      case "attack":
        this.synth.attack = v * 1.5;
        break;
      case "decay":
        this.synth.decay = v * 2;
        break;
      case "sustain":
        this.synth.sustain = v;
        break;
      case "release":
        this.synth.release = 0.01 + v * 2;
        break;
      case "lfo":
        this.synth.setLfo(v * 3000);
        break;
      case "detune":
        this.synth.setDetune(v * 40);
        break;
    }
  }
}
