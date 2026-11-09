import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { onJamTick, songToCtx } from "./stemJam";
import { SampledInstrument } from "./sampledInstrument";
import { chordHarmony } from "./chordHarmony";
import { choirVoice, voicing, warmPad, type ChoirVowel } from "./lyricChoirNotes";
import { alignOffset, alignQuality, buildPhrases, cleanTerm, parseLrc, phraseAt, nextPhrase, refineOnVoice, vowelTimes, type Phrase } from "../lyricsPlan";

export type ChoirMode = "suit" | "reponse";
type Song = { name: string; status: "recherche" | "synchro" | "texte" | "aucune" | "erreur"; raw: Phrase[]; phrases: Phrase[]; voice: number[] | null; auto: number; quality: number };

export class LyricChoir extends JamModule {
  on = false;
  pad = 0.7;
  strings = 0;
  choir = 0.9;
  mode: ChoirMode = "suit";
  nudge = 0;
  private song: Song | null = null;
  private sampled: SampledInstrument;
  private padGain: GainNode; private stringGain: GainNode; private choirGain: GainNode;
  private done = new Set<string>();
  private lastTo = -1;

  constructor(engine: DJEngine) {
    super(engine, "other");
    this.padGain = new GainNode(engine.ctx, { gain: 0 });
    this.stringGain = new GainNode(engine.ctx, { gain: 0 });
    this.choirGain = new GainNode(engine.ctx, { gain: 0 });
    this.padGain.connect(this.bus);
    this.stringGain.connect(this.bus);
    this.choirGain.connect(this.bus);
    this.sampled = new SampledInstrument(engine.ctx);
    this.sampled.out.connect(this.stringGain);
    this.gateModule("session");
    onJamTick(engine, (d, from, to) => { if (this.active) this.tick(d, from, to); });
    setInterval(() => this.applyGains(), 250);
  }

  setOn(v: boolean) {
    this.on = v;
    this.done.clear();
    if (v && this.strings > 0) void this.sampled.load("mk_string_ensemble_1").then(() => jamChanged());
    this.applyGains();
    jamChanged();
  }

  setLevel(layer: "pad" | "strings" | "choir", v: number) {
    v = Math.max(0, Math.min(1.5, v));
    this[layer] = v;
    if (layer === "strings" && v > 0 && this.on) void this.sampled.load("mk_string_ensemble_1").then(() => jamChanged());
    this.applyGains();
  }

  setMode(m: ChoirMode) {
    this.mode = m;
    this.done.clear();
    jamChanged();
  }

  setNudge(s: number) {
    this.nudge = Math.round(Math.max(-3, Math.min(3, s)) * 10) / 10;
    this.done.clear();
    jamChanged();
  }

  private applyGains() {
    const t = this.engine.ctx.currentTime;
    const live = this.on && this.deck()?.playing === true;
    this.padGain.gain.setTargetAtTime(live ? this.pad : 0, t, 0.1);
    this.stringGain.gain.setTargetAtTime(live ? this.strings * 0.9 : 0, t, 0.1);
    this.choirGain.gain.setTargetAtTime(live ? this.choir * 0.4 : 0, t, 0.1);
  }

  protected routeTarget(deck: Deck): AudioNode | null {
    return super.routeTarget(deck) ?? deck.crowdInput();
  }

  pads(): PadDef[] {
    return [];
  }

  offset(): number {
    return (this.song?.auto ?? 0) + this.nudge;
  }

  private ensure(d: Deck): Song | null {
    if (!d.name) return null;
    if (this.song === null || this.song.name !== d.name) {
      this.song = { name: d.name, status: "recherche", raw: [], phrases: [], voice: null, auto: 0, quality: 0 };
      this.done.clear();
      const s = this.song;
      fetch("/api/lyrics?q=" + encodeURIComponent(cleanTerm(d.name))).then((r) => r.json()).then((o: { lrc?: string | null; synced?: boolean }) => {
        if (this.song !== s) return;
        const lines = typeof o.lrc === "string" ? parseLrc(o.lrc) : [];
        if (lines.length > 0) {
          s.raw = buildPhrases(lines);
          s.phrases = s.raw;
          s.status = "synchro";
        } else {
          s.status = o.lrc ? "texte" : "aucune";
        }
        jamChanged();
      }).catch(() => {
        if (this.song === s) {
          s.status = "erreur";
          jamChanged();
        }
      });
    }
    const s = this.song;
    const v = d.stemMap?.voice;
    const step = d.stemMap?.voiceStep;
    if (s.raw.length > 0 && v && step && v !== s.voice) {
      s.voice = v;
      s.auto = alignOffset(s.raw, v, step);
      s.phrases = refineOnVoice(s.raw, v, step, s.auto);
      s.quality = alignQuality(s.raw, v, step, s.auto);
      this.done.clear();
      jamChanged();
    }
    return this.song;
  }

  private tick(d: Deck, from: number, to: number) {
    if (!this.on || d !== this.deck()) return;
    this.route(d);
    const s = this.ensure(d);
    if (!s || s.phrases.length === 0) return;
    if (Math.abs(from - this.lastTo) > 0.001) this.done.clear();
    this.lastTo = to;
    const off = this.offset();
    const rate = Math.max(0.25, d.playbackRate);
    const ctx = this.engine.ctx;
    const harmony = chordHarmony(this.engine);
    for (let i = 0; i < s.phrases.length; i++) {
      const p = s.phrases[i];
      if (p.start + off < from - 10 || p.start + off > to + 10) continue;
      const start = p.start + off;
      const end = p.end + off;
      const vel = p.refrain ? 1 : 0.72;
      if (start >= from && start < to && !this.done.has(`${i}:p`)) {
        this.done.add(`${i}:p`);
        for (const span of harmony.chordSpans(d, start, end)) {
          const at = songToCtx(d, span.start);
          const dur = (span.end - span.start) / rate;
          if (this.pad > 0) {
            for (const m of voicing(span.notes, 48)) {
              warmPad(ctx, this.padGain, m, at, dur, vel);
            }
          }
          if (this.strings > 0 && this.sampled.ready()) {
            for (const m of voicing(span.notes, 60)) {
              this.sampled.note(m, at, dur, vel * 0.8, "pad");
            }
          }
          if (this.choir > 0 && this.mode === "suit") {
            const vt = vowelTimes(p).map((x) => ({ at: songToCtx(d, x.at + off), v: x.v as ChoirVowel }));
            const voices = voicing(span.notes, 55).slice(0, 4);
            voices.forEach((m, k) => choirVoice(ctx, this.choirGain, m, at, dur, vt, vel, voices.length > 1 ? -0.5 + k / (voices.length - 1) : 0));
          }
          this.hit(at);
        }
      }
      if (this.choir > 0 && this.mode === "reponse") {
        const nx = s.phrases[i + 1];
        const gapEnd = nx ? nx.start + off - 0.05 : end + 3;
        const g0 = end;
        const g1 = Math.min(gapEnd, end + 3);
        if (g1 - g0 >= 0.6 && g0 >= from && g0 < to && !this.done.has(`${i}:r`)) {
          this.done.add(`${i}:r`);
          const lastV = (p.vowels[p.vowels.length - 1] ?? "o") as ChoirVowel;
          for (const span of harmony.chordSpans(d, g0, g1)) {
            const at = songToCtx(d, span.start);
            const dur = (span.end - span.start) / rate;
            const voices = voicing(span.notes, 55).slice(0, 4);
            voices.forEach((m, k) => choirVoice(ctx, this.choirGain, m, at, dur, [{ at, v: lastV }, { at: at + dur * 0.5, v: "o" }], vel * 0.9, voices.length > 1 ? 0.5 - k / (voices.length - 1) : 0));
            this.hit(at);
          }
        }
      }
    }
  }

  lyricsStatus(): string {
    if (this.on) {
      const d = this.deck();
      if (d) this.ensure(d);
    }
    const s = this.song;
    if (!this.on) return "";
    if (!s) return "Charge un morceau sur la platine.";
    switch (s.status) {
      case "recherche": return "Recherche des paroles…";
      case "aucune": return "Aucune parole trouvée : le module attend un titre chanté.";
      case "erreur": return "Paroles indisponibles (réseau ou spotDL).";
      case "texte": return "Paroles trouvées sans minutage : impossible de caler les phrases.";
      case "synchro":
        const d = this.deck();
        const fmt = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1).replace(".", ",");
        return `${s.phrases.length} phrases minutées, calage ${fmt(this.offset())} s` + (s.voice ? " (sur la voix)" : " (voix pas encore analysée)") + (s.voice && s.quality < 0.5 ? " · calage incertain : paroles d'une autre version (live, remix) ?" : "") + (d && !d.stemNotes ? " · accords : tonique seule, prépare les stems pour suivre la grille" : "");
    }
  }

  lines(): { now: string; next: string } {
    if (this.on) {
      const d0 = this.deck();
      if (d0) this.ensure(d0);
    }
    const s = this.song;
    const d = this.deck();
    if (!s || s.phrases.length === 0) return { now: "", next: "" };
    const t = d.position() - this.offset();
    const i = phraseAt(s.phrases, t);
    const j = nextPhrase(s.phrases, t);
    return { now: i >= 0 ? s.phrases[i].text : "", next: j >= 0 ? s.phrases[j].text : "" };
  }

  loading(): string | null {
    if (this.on && this.strings > 0 && !this.sampled.ready()) {
      return this.sampled.failed ? "Cordes indisponibles" : `Chargement des cordes ${this.sampled.done}/${this.sampled.total}`;
    }
    return null;
  }

  protected closed(): void {
    this.done.clear();
  }

  protected keep(): string[] {
    return ["pad", "strings", "choir", "mode", "nudge"];
  }

  protected resetFields(): void {
    this.setOn(false);
    this.pad = 0.7;
    this.strings = 0;
    this.choir = 0.9;
    this.mode = "suit";
    this.nudge = 0;
    this.applyGains();
  }
}

const cache = new WeakMap<DJEngine, LyricChoir>();
export function lyricChoir(engine: DJEngine): LyricChoir {
  if (!cache.has(engine)) {
    const m = new LyricChoir(engine);
    try {
      m.restore(JSON.parse(localStorage.getItem("djsynth.lyricchoir.v1") || "{}"));
    } catch {}
    cache.set(engine, m);
    setInterval(() => {
      try {
        const s = JSON.stringify(m.snapshot());
        if (s !== localStorage.getItem("djsynth.lyricchoir.v1")) localStorage.setItem("djsynth.lyricchoir.v1", s);
      } catch {}
    }, 2000);
  }
  return cache.get(engine)!;
}
