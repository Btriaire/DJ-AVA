import { divSeconds, makeRamp, setRampFreq, FxEnv, FxUnit } from "./fxTypes";

// Stem performance FX: build-up roll, note freeze, half/double time, pitch riser,
// echo-out throw, reverb wash.
export type UnitDName = "build" | "freeze" | "halftime" | "double" | "rise" | "echoout" | "wash";

// noise impulse response for the reverb wash (stereo, exponential decay)
function washIR(c: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.round(seconds * c.sampleRate);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  return buf;
}

export function buildUnitD(name: UnitDName, env: FxEnv): FxUnit {
  const c = env.ctx;
  const input = new GainNode(c, { gain: 1 });
  const output = new GainNode(c, { gain: 1 });

  switch (name) {
    // BUILD: the stem is captured and rolled, the roll gets shorter stage by stage
    // (1/2 → 1/4 → 1/8 → 1/16 → 1/32 of a beat) while a high-pass rises: a drum roll
    // / riser from any stem, ready to drop on release.
    case "build": {
      const STAGES = [1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32];
      const SHARE = [0.3, 0.25, 0.2, 0.15, 0.1]; // part of the build spent on each stage
      const LENGTHS = [2, 4, 8, 16]; // beats
      const delay = c.createDelay(4);
      const hp = new BiquadFilterNode(c, { type: "highpass", frequency: 20, Q: 0.9 });
      const fb = new GainNode(c, { gain: 0 });
      const gateIn = new GainNode(c, { gain: 1 });
      const sum = new GainNode(c, { gain: 1 });
      input.connect(gateIn).connect(sum).connect(delay).connect(hp).connect(output);
      delay.connect(fb).connect(sum);
      let beats = 8;
      let topHz = 2500;
      const half = () => Math.min(3.9, Math.max(0.02, env.beat().period * STAGES[0]));
      delay.delayTime.value = half();
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") beats = LENGTHS[Math.min(3, Math.floor(v * 4))];
          else topHz = 200 * Math.pow(25, v);
        },
        setBeat() {},
        engage() {
          const t = c.currentTime;
          const period = env.beat().period;
          gateIn.gain.setTargetAtTime(0, t, 0.004);
          fb.gain.setValueAtTime(0.998, t); // near 1: the 1/32 stage repeats ~64×/s and must not die out
          // Each stage halves the loop. Switching exactly `next` seconds into a cycle
          // of the current loop makes the shorter loop repeat the START of the
          // captured slice (switching anywhere else repeats a later part, often the
          // silence between two hits).
          let loop = Math.max(0.005, period * STAGES[0]);
          let origin = t;
          let planned = t;
          delay.delayTime.setValueAtTime(loop, t);
          for (let k = 1; k < STAGES.length; k++) {
            planned += beats * period * SHARE[k - 1];
            const next = Math.max(0.005, period * STAGES[k]);
            const at = origin + next + Math.max(0, Math.ceil((planned - origin - next) / loop)) * loop;
            delay.delayTime.setValueAtTime(next, at);
            origin = at;
            loop = next;
          }
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setValueAtTime(20, t);
          hp.frequency.exponentialRampToValueAtTime(topHz, t + beats * period);
        },
        release() {
          const t = c.currentTime;
          delay.delayTime.cancelScheduledValues(t);
          hp.frequency.cancelScheduledValues(t);
          gateIn.gain.setTargetAtTime(1, t, 0.004);
          fb.gain.setValueAtTime(0, t);
          delay.delayTime.setValueAtTime(half(), t);
          hp.frequency.setValueAtTime(20, t);
          return 0;
        },
        retune() {
          if (fb.gain.value === 0) delay.delayTime.setTargetAtTime(half(), c.currentTime, 0.05);
        },
      };
    }

    // FREEZE: holds the last grain of the stem forever, smeared by all-pass
    // diffusion into a pad (freeze a vocal note or a chord while the beat goes on).
    case "freeze": {
      const delay = c.createDelay(1);
      const ap1 = new BiquadFilterNode(c, { type: "allpass", frequency: 700, Q: 0.6 });
      const ap2 = new BiquadFilterNode(c, { type: "allpass", frequency: 2300, Q: 0.6 });
      const lp = new BiquadFilterNode(c, { type: "lowpass", frequency: 6000, Q: 0.5 });
      const fb = new GainNode(c, { gain: 0 });
      const gateIn = new GainNode(c, { gain: 1 });
      const sum = new GainNode(c, { gain: 1 });
      input.connect(gateIn).connect(sum).connect(delay).connect(ap1).connect(ap2).connect(lp).connect(output);
      lp.connect(fb).connect(sum);
      delay.delayTime.value = 0.18;
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") delay.delayTime.setTargetAtTime(0.06 + v * 0.54, c.currentTime, 0.02);
          else lp.frequency.setTargetAtTime(1000 * Math.pow(16, v), c.currentTime, 0.03);
        },
        setBeat() {},
        engage() {
          const t = c.currentTime;
          gateIn.gain.setTargetAtTime(0, t, 0.01);
          fb.gain.setTargetAtTime(0.995, t, 0.005);
        },
        release() {
          const t = c.currentTime;
          // the frozen pad fades out instead of stopping dead; the live stem comes back after it
          fb.gain.setTargetAtTime(0, t, 0.08);
          gateIn.gain.setTargetAtTime(1, t + 0.3, 0.01);
          return 0.25;
        },
        retune() {},
      };
    }

    // HALF / DOUBLE: in each window (beat division) the stem is replayed at half
    // speed from the window start (heavier, an octave down) or at double speed
    // (frantic, an octave up, the window plays itself twice). Short fades hide the
    // window jumps; windows stay on the beat grid.
    case "halftime":
    case "double": {
      const speed = name === "halftime" ? 0.5 : 2;
      const delay = c.createDelay(8);
      const lp = new BiquadFilterNode(c, { type: "lowpass", frequency: 20000, Q: 0.5 });
      const fade = new GainNode(c, { gain: 0 });
      const depth = new GainNode(c, { gain: 0 });
      const edges = new WaveShaperNode(c, {
        curve: Float32Array.from({ length: 1024 }, (_, i) => Math.min(1, (1 - Math.abs(-1 + (2 * i) / 1023)) * 20)),
      });
      input.connect(delay).connect(lp).connect(fade).connect(output);
      let beatIdx = 5;
      let ramp: AudioBufferSourceNode | null = null;
      const span = () => Math.min(7.9, divSeconds(env, beatIdx));
      const tune = () => {
        const w = span();
        // the delay sweeps by (1 - speed)·w per window: 0 → w/2 for half speed, w → 0 for double
        delay.delayTime.setTargetAtTime((Math.abs(1 - speed) * w) / 2, c.currentTime, 0.01);
        depth.gain.setTargetAtTime(((1 - speed) * w) / 2, c.currentTime, 0.01);
        if (ramp) setRampFreq(c, ramp, 1 / w);
      };
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") lp.frequency.setTargetAtTime(400 * Math.pow(50, v), c.currentTime, 0.03);
        },
        setBeat(idx) {
          beatIdx = idx;
          tune();
        },
        engage() {
          const w = span();
          ramp = makeRamp(c, 1 / w);
          ramp.connect(depth).connect(delay.delayTime);
          ramp.connect(edges).connect(fade.gain);
          tune();
          // start mid-window so the windows land on the beats, without waiting for the next one
          const into = (w - (env.beat().toNext % w)) / w;
          ramp.start(c.currentTime, into * (ramp.buffer!.duration));
        },
        release() {
          if (ramp) {
            try { ramp.stop(); } catch {}
            ramp.disconnect();
            ramp = null;
          }
          return 0;
        },
        retune() {
          tune();
        },
      };
    }

    // RISE: the stem's pitch climbs continuously (up to +5..+24 semitones over the
    // chosen number of beats), tempo kept: a riser out of any stem. Two crossfaded
    // delay taps swept by a sawtooth; the sawtooth speeds up to raise the pitch.
    case "rise": {
      const D = 0.06; // tap sweep depth (s): pitch ratio = 1 + D·f
      const LENGTHS = [2, 4, 8, 16];
      const sinWindow = Float32Array.from({ length: 1024 }, (_, i) => Math.sin((Math.PI * i) / 1023));
      let beats = 8;
      let semis = 12;
      let taps: { ramp: AudioBufferSourceNode; delay: DelayNode; nodes: AudioNode[] }[] = [];
      const stop = () => {
        for (const t of taps) {
          try { t.ramp.stop(); } catch {}
          try { input.disconnect(t.delay); } catch {}
          t.nodes.forEach((n) => n.disconnect());
        }
        taps = [];
      };
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") beats = LENGTHS[Math.min(3, Math.floor(v * 4))];
          else semis = Math.round(5 + v * 19);
        },
        setBeat() {},
        engage() {
          stop();
          const t = c.currentTime;
          const fEnd = (Math.pow(2, semis / 12) - 1) / D;
          const dur = beats * env.beat().period;
          for (let k = 0; k < 2; k++) {
            const ramp = makeRamp(c, 0.2);
            const delay = c.createDelay(1);
            const depth = new GainNode(c, { gain: -D / 2 }); // delay falls D → 0 each cycle: pitch up
            const shape = new WaveShaperNode(c, { curve: sinWindow });
            const vca = new GainNode(c, { gain: 0 });
            delay.delayTime.value = D / 2;
            ramp.connect(depth).connect(delay.delayTime);
            ramp.connect(shape).connect(vca.gain);
            input.connect(delay).connect(vca).connect(output);
            const rate = ramp.playbackRate;
            rate.cancelScheduledValues(t);
            rate.setValueAtTime(rate.value, t);
            rate.linearRampToValueAtTime((ramp.buffer!.length / c.sampleRate) * fEnd, t + dur);
            ramp.start(t, k * 0.5 * ramp.buffer!.duration); // second tap half a cycle later
            taps.push({ ramp, delay, nodes: [ramp, delay, depth, shape, vca] });
          }
        },
        release() {
          stop();
          return 0;
        },
        retune() {},
      };
    }

    // OUT: echo-out throw. The stem is cut and its last moment flies away in
    // tempo echoes that thin out — a clean way to take a stem (or a vocal) out.
    case "echoout": {
      const delay = c.createDelay(4);
      const hp = new BiquadFilterNode(c, { type: "highpass", frequency: 80, Q: 0.7 });
      const lp = new BiquadFilterNode(c, { type: "lowpass", frequency: 9000, Q: 0.5 });
      const fb = new GainNode(c, { gain: 0 });
      const gateIn = new GainNode(c, { gain: 1 });
      const sum = new GainNode(c, { gain: 1 });
      input.connect(gateIn).connect(sum).connect(delay).connect(hp).connect(lp).connect(output);
      lp.connect(fb).connect(sum);
      let beatIdx = 3;
      let feedback = 0.6;
      let thin = 1500;
      const span = () => Math.min(3.9, Math.max(0.03, divSeconds(env, beatIdx)));
      delay.delayTime.value = span();
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") feedback = 0.35 + v * 0.5;
          else thin = 300 * Math.pow(15, v);
        },
        setBeat(idx) {
          beatIdx = idx;
          if (fb.gain.value === 0) delay.delayTime.setTargetAtTime(span(), c.currentTime, 0.05);
        },
        engage() {
          const t = c.currentTime;
          gateIn.gain.setTargetAtTime(0, t, 0.004);
          fb.gain.setValueAtTime(feedback, t);
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setValueAtTime(80, t);
          hp.frequency.exponentialRampToValueAtTime(thin, t + 4 * env.beat().period);
        },
        release() {
          const t = c.currentTime;
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setValueAtTime(80, t);
          gateIn.gain.setTargetAtTime(1, t, 0.004);
          fb.gain.setValueAtTime(0, t);
          return 0;
        },
        retune() {
          if (fb.gain.value === 0) delay.delayTime.setTargetAtTime(span(), c.currentTime, 0.05);
        },
      };
    }

    // WASH: the stem drowns in a huge reverb while a high-pass opens on it.
    case "wash": {
      const hp = new BiquadFilterNode(c, { type: "highpass", frequency: 120, Q: 0.7 });
      const verb = new ConvolverNode(c, { buffer: washIR(c, 4) });
      const level = new GainNode(c, { gain: 0 });
      input.connect(hp).connect(verb).connect(level).connect(output);
      let size = 4;
      let top = 1200;
      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            const s = 1.5 + v * 5.5;
            if (Math.abs(s - size) > 0.25) {
              size = s;
              verb.buffer = washIR(c, size);
            }
          } else top = 200 * Math.pow(25, v);
        },
        setBeat() {},
        engage() {
          const t = c.currentTime;
          level.gain.cancelScheduledValues(t);
          level.gain.setTargetAtTime(5, t, 0.02); // makeup: a long normalized IR spreads the energy (~-18 dB)
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setValueAtTime(120, t);
          hp.frequency.exponentialRampToValueAtTime(top, t + 4 * env.beat().period);
        },
        release() {
          const t = c.currentTime;
          level.gain.setTargetAtTime(0, t, 0.12); // short fade so the stem comes back quickly
          hp.frequency.cancelScheduledValues(t);
          hp.frequency.setTargetAtTime(120, t + 0.4, 0.05);
          return 0.4;
        },
        retune() {},
      };
    }
  }
}
