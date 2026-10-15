import { divSeconds, makeRamp, setRampFreq, startAligned, FxEnv, FxUnit } from "./fxTypes";

export function buildUnitC(name: "dub" | "ring" | "tape" | "mash" | "vowel" | "scatter", env: FxEnv): FxUnit {
  const c = env.ctx;
  const input = new GainNode(c, { gain: 1 });
  const output = new GainNode(c, { gain: 1 });

  switch (name) {
    case "dub": {
      let beatIdx = 4;
      let feedback = 0.2 + 0.55 * 0.68;
      let tone = 300 * Math.pow(12, 0.5);
      let gen = 0;

      let feed: GainNode | null = null;
      let delayL: DelayNode | null = null;
      let delayR: DelayNode | null = null;
      let bp: BiquadFilterNode | null = null;
      let sat: WaveShaperNode | null = null;
      let fb: GainNode | null = null;
      let merger: ChannelMergerNode | null = null;

      function teardown() {
        try { if (feed) input.disconnect(feed); } catch {}
        if (delayL) {
          delayL.disconnect();
        }
        if (delayR) {
          delayR.disconnect();
        }
        if (bp) bp.disconnect();
        if (sat) sat.disconnect();
        if (fb) fb.disconnect();
        if (merger) merger.disconnect();
        feed = delayL = delayR = bp = sat = fb = merger = null;
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") feedback = 0.2 + v * 0.68;
          else if (key === "p2") tone = 300 * Math.pow(12, v);
          if (fb) fb.gain.setTargetAtTime(feedback, c.currentTime, 0.02);
          if (bp) bp.frequency.setTargetAtTime(tone, c.currentTime, 0.02);
        },
        setBeat(idx) {
          beatIdx = idx;
          if (delayL && delayR) {
            const delayTime = divSeconds(env, beatIdx);
            delayL.delayTime.setTargetAtTime(delayTime, c.currentTime, 0.05);
            delayR.delayTime.setTargetAtTime(delayTime, c.currentTime, 0.05);
          }
        },
        engage() {
          teardown();
          gen++;
          const delayTime = divSeconds(env, beatIdx);
          feed = new GainNode(c, { gain: 0.8 });
          delayL = new DelayNode(c, { delayTime, maxDelayTime: 4 });
          delayR = new DelayNode(c, { delayTime, maxDelayTime: 4 });
          bp = new BiquadFilterNode(c, { type: "bandpass", Q: 0.9, frequency: tone });
          sat = new WaveShaperNode(c, { curve: softClipCurve(), oversample: "2x" });
          fb = new GainNode(c, { gain: feedback });
          merger = new ChannelMergerNode(c, { numberOfInputs: 2 });

          input.connect(feed).connect(delayL);
          delayL.connect(merger, 0, 0);
          delayL.connect(delayR);
          delayR.connect(merger, 0, 1);
          delayR.connect(bp).connect(sat).connect(fb).connect(delayL);
          merger.connect(output);
        },
        release() {
          try { if (feed) input.disconnect(feed); } catch {}
          const tail = Math.min(6, 8 * divSeconds(env, beatIdx));
          if (fb) fb.gain.setTargetAtTime(0, c.currentTime, tail / 4);
          const myGen = ++gen;
          setTimeout(() => { if (gen === myGen) teardown(); }, (tail + 0.2) * 1000);
          return tail;
        },
        retune() {
          if (delayL && delayR) {
            const delayTime = divSeconds(env, beatIdx);
            delayL.delayTime.setTargetAtTime(delayTime, c.currentTime, 0.05);
            delayR.delayTime.setTargetAtTime(delayTime, c.currentTime, 0.05);
          }
        }
      };
    }

    case "ring": {
      let carrier = 30 * Math.pow(100, 0.45);
      let mix = 0.7;

      let osc: OscillatorNode | null = null;
      let mod: GainNode | null = null;
      let wet: GainNode | null = null;
      let dry: GainNode | null = null;

      function teardown() {
        if (osc) {
          osc.disconnect();
        }
        if (mod) mod.disconnect();
        if (wet) wet.disconnect();
        if (dry) dry.disconnect();
        osc = mod = wet = dry = null;
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") carrier = 30 * Math.pow(100, v);
          else if (key === "p2") mix = v;
          if (osc) osc.frequency.setTargetAtTime(Math.min(carrier, c.sampleRate / 2 - 100), c.currentTime, 0.02);
          if (wet && dry) {
            wet.gain.setTargetAtTime(Math.sin(mix * Math.PI / 2), c.currentTime, 0.02);
            dry.gain.setTargetAtTime(Math.cos(mix * Math.PI / 2), c.currentTime, 0.02);
          }
        },
        setBeat() {},
        engage() {
          teardown();
          osc = new OscillatorNode(c, { type: "sine", frequency: Math.min(carrier, c.sampleRate / 2 - 100) });
          mod = new GainNode(c, { gain: 0 });
          wet = new GainNode(c, { gain: Math.sin(mix * Math.PI / 2) });
          dry = new GainNode(c, { gain: Math.cos(mix * Math.PI / 2) });

          osc.connect(mod.gain);
          input.connect(mod).connect(wet).connect(output);
          input.connect(dry).connect(output);
          osc.start();
        },
        release() {
          teardown();
          return 0;
        },
        retune() {}
      };
    }

    case "tape": {
      let wear = 0.5;
      let cutoff = 2000 * Math.pow(8, 0.55);

      let wf: DelayNode | null = null;
      let wow: OscillatorNode | null = null;
      let wowDepth: GainNode | null = null;
      let flutter: OscillatorNode | null = null;
      let flutDepth: GainNode | null = null;
      let sat: WaveShaperNode | null = null;
      let lp: BiquadFilterNode | null = null;
      let trim: GainNode | null = null;
      let noise: AudioBufferSourceNode | null = null;
      let hiss: BiquadFilterNode | null = null;
      let nGain: GainNode | null = null;

      function teardown() {
        if (wf) {
          wf.disconnect();
        }
        if (wow) {
          try { wow.stop(); } catch {}
          wow.disconnect();
        }
        if (wowDepth) wowDepth.disconnect();
        if (flutter) {
          try { flutter.stop(); } catch {}
          flutter.disconnect();
        }
        if (flutDepth) flutDepth.disconnect();
        if (sat) sat.disconnect();
        if (lp) lp.disconnect();
        if (trim) trim.disconnect();
        if (noise) {
          noise.disconnect();
        }
        if (hiss) hiss.disconnect();
        if (nGain) nGain.disconnect();
        wf = wow = wowDepth = flutter = flutDepth = sat = lp = trim = noise = hiss = nGain = null;
      }

      const tapeTrim = (w: number) => {
        const d = 1 + w * 5;
        return 0.85 * 0.3 * Math.tanh(d) / Math.tanh(0.3 * d);
      };

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            wear = v;
            if (trim) trim.gain.setTargetAtTime(tapeTrim(wear), c.currentTime, 0.02);
          }
          else if (key === "p2") cutoff = 2000 * Math.pow(8, v);
          if (wowDepth) wowDepth.gain.setTargetAtTime(0.0018 * wear, c.currentTime, 0.02);
          if (flutDepth) flutDepth.gain.setTargetAtTime(0.00025 * wear, c.currentTime, 0.02);
          if (nGain) nGain.gain.setTargetAtTime(0.004 * wear, c.currentTime, 0.02);
          if (sat) sat.curve = tanhCurve(1 + wear * 5);
          if (lp) lp.frequency.setTargetAtTime(cutoff, c.currentTime, 0.02);
        },
        setBeat() {},
        engage() {
          teardown();
          wf = new DelayNode(c, { delayTime: 0.006, maxDelayTime: 0.05 });
          wow = new OscillatorNode(c, { type: "sine", frequency: 0.6 });
          wowDepth = new GainNode(c, { gain: 0.0018 * wear });
          flutter = new OscillatorNode(c, { type: "sine", frequency: 7.5 });
          flutDepth = new GainNode(c, { gain: 0.00025 * wear });
          sat = new WaveShaperNode(c, { curve: tanhCurve(1 + wear * 5), oversample: "2x" });
          lp = new BiquadFilterNode(c, { type: "lowpass", Q: 0.5, frequency: cutoff });
          trim = new GainNode(c, { gain: tapeTrim(wear) });

          const noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
          const noiseData = noiseBuffer.getChannelData(0);
          for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
          noise = new AudioBufferSourceNode(c, { buffer: noiseBuffer, loop: true });
          hiss = new BiquadFilterNode(c, { type: "highpass", frequency: 3000, Q: 0.7 });
          nGain = new GainNode(c, { gain: 0.004 * wear });

          input.connect(wf).connect(sat).connect(lp).connect(trim).connect(output);
          wow.connect(wowDepth).connect(wf.delayTime);
          flutter.connect(flutDepth).connect(wf.delayTime);
          noise.connect(hiss).connect(nGain).connect(output);
          wow.start();
          flutter.start();
          noise.start();
        },
        release() {
          teardown();
          return 0;
        },
        retune() {}
      };
    }

    case "mash": {
      let beatIdx = 0;
      let density = 0.35 + 0.5 * 0.6;
      let edge = (2 + 0.3 * 28) / 1000;
      let pattern: boolean[] = [];
      let src: AudioBufferSourceNode | null = null;
      const gate = new GainNode(c, { gain: 1 });

      input.connect(gate).connect(output);

      function newPattern(): boolean[] {
        const p = new Array(16).fill(false);
        p[0] = true;
        for (let i = 1; i < 16; i++) p[i] = Math.random() < density;
        return p;
      }

      function buildBuffer(): AudioBuffer {
        const step = divSeconds(env, beatIdx);
        const len = Math.max(1, Math.round(16 * step * c.sampleRate));
        const buffer = c.createBuffer(1, len, c.sampleRate);
        const data = buffer.getChannelData(0);
        const e = Math.min(edge, step / 3);

        for (let k = 0; k < 16; k++) {
          if (pattern[k]) {
            const start = Math.round(k * step * c.sampleRate);
            const end = Math.round((k + 1) * step * c.sampleRate);
            const rampStart = Math.round((k * step + e) * c.sampleRate);
            const rampEnd = Math.round(((k + 1) * step - e) * c.sampleRate);

            for (let i = start; i < end; i++) {
              if (i < rampStart) data[i] = (i - start) / (rampStart - start);
              else if (i > rampEnd) data[i] = (end - i) / (end - rampEnd);
              else data[i] = 1;
            }
          }
        }
        return buffer;
      }

      function start() {
        if (src) {
          try { src.stop(); } catch {}
          src.disconnect();
        }
        src = new AudioBufferSourceNode(c, { buffer: buildBuffer(), loop: true });
        gate.gain.cancelScheduledValues(c.currentTime);
        gate.gain.value = 0;
        src.connect(gate.gain);
        startAligned(c, src, env);
      }

      function restart() {
        if (src) {
          try { src.stop(); } catch {}
          src.disconnect();
        }
        start();
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            density = 0.35 + v * 0.6;
            if (src) {
              pattern = newPattern();
              restart();
            }
          } else if (key === "p2") {
            edge = (2 + v * 28) / 1000;
            if (src) restart();
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          if (src) restart();
        },
        engage() {
          pattern = newPattern();
          start();
        },
        release() {
          if (src) {
            src.disconnect();
          }
          gate.gain.cancelScheduledValues(c.currentTime);
          gate.gain.value = 1;
          return 0;
        },
        retune() {
          if (src) restart();
        }
      };
    }

    case "vowel": {
      const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
      const SCALE = 4000;
      const LEVELS = [1, 0.7, 0.4];

      let beatIdx = 5;
      let q = 4 + 0.5 * 16;
      let glide = 0.4;

      let ramp: AudioBufferSourceNode | null = null;
      let sh: WaveShaperNode[] = [];
      let sc: GainNode[] = [];
      let bp: BiquadFilterNode[] = [];
      let lv: GainNode[] = [];
      let makeup: GainNode | null = null;

      function curveFor(k: number): Float32Array<ArrayBuffer> {
        const n = 4096;
        const curve = new Float32Array(new ArrayBuffer(n * 4));
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const pos = u * 5;
          const idx = Math.min(4, Math.floor(pos));
          const frac = pos - idx;
          const next = (idx + 1) % 5;
          let f: number;
          if (glide > 0 && frac > 1 - glide) {
            const t = (frac - (1 - glide)) / glide;
            const s = t * t * (3 - 2 * t);
            f = VOWELS[idx][k] * (1 - s) + VOWELS[next][k] * s;
          } else {
            f = VOWELS[idx][k];
          }
          curve[i] = f / SCALE;
        }
        return curve;
      }

      function teardown() {
        if (ramp) {
          ramp.disconnect();
        }
        for (let i = 0; i < 3; i++) {
          if (sh[i]) sh[i].disconnect();
          if (sc[i]) sc[i].disconnect();
          if (bp[i]) bp[i].disconnect();
          if (lv[i]) lv[i].disconnect();
        }
        if (makeup) makeup.disconnect();
        ramp = null;
        sh = [];
        sc = [];
        bp = [];
        lv = [];
        makeup = null;
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") {
            q = 4 + v * 16;
            if (makeup) makeup.gain.setTargetAtTime(1.6 * Math.sqrt(q), c.currentTime, 0.02);
          }
          else if (key === "p2") glide = v;
          for (let i = 0; i < 3; i++) {
            if (bp[i]) bp[i].Q.setTargetAtTime(q, c.currentTime, 0.02);
            if (sh[i] && key === "p2") sh[i].curve = curveFor(i);
          }
        },
        setBeat(idx) {
          beatIdx = idx;
          if (ramp) setRampFreq(c, ramp, 1 / (5 * divSeconds(env, beatIdx)));
        },
        engage() {
          teardown();
          ramp = makeRamp(c, 1 / (5 * divSeconds(env, beatIdx)));
          sh = [];
          sc = [];
          bp = [];
          lv = [];
          makeup = new GainNode(c, { gain: 1.6 * Math.sqrt(q) });

          for (let k = 0; k < 3; k++) {
            sh[k] = new WaveShaperNode(c, { curve: curveFor(k) });
            sc[k] = new GainNode(c, { gain: SCALE });
            bp[k] = new BiquadFilterNode(c, { type: "bandpass", Q: q, frequency: 0 });
            lv[k] = new GainNode(c, { gain: LEVELS[k] });

            ramp.connect(sh[k]).connect(sc[k]).connect(bp[k].frequency);
            input.connect(bp[k]).connect(lv[k]).connect(makeup);
          }
          makeup.connect(output);
          startAligned(c, ramp, env);
        },
        release() {
          teardown();
          return 0;
        },
        retune() {
          if (ramp) setRampFreq(c, ramp, 1 / (5 * divSeconds(env, beatIdx)));
        }
      };
    }

    case "scatter": {
      let rate = 6 + 0.4 * 34;
      let spread = 0.04 + 0.4 * 0.6;
      let timer: ReturnType<typeof setInterval> | null = null;
      let nextAt = 0;
      let active = 0;
      const MAX_GRAINS = 24;

      function grain(t: number) {
        if (active >= MAX_GRAINS) return;
        const d = 0.04 + Math.random() * 0.08;
        const dl = new DelayNode(c, { delayTime: 0.02 + Math.random() * spread });
        const env = new GainNode(c, { gain: 0 });
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.5, t + d / 2);
        env.gain.linearRampToValueAtTime(0, t + d);
        const pan = new StereoPannerNode(c, { pan: Math.random() * 1.6 - 0.8 });

        input.connect(dl).connect(env).connect(pan).connect(output);
        active++;

        setTimeout(() => {
          try { input.disconnect(dl); } catch {}
          dl.disconnect();
          env.disconnect();
          pan.disconnect();
          active--;
        }, (t + d - c.currentTime + 0.05) * 1000);
      }

      function tick() {
        const horizon = c.currentTime + 0.1;
        while (nextAt < horizon) {
          grain(Math.max(nextAt, c.currentTime + 0.005));
          nextAt += (1 / rate) * (0.5 + Math.random());
        }
      }

      return {
        input,
        output,
        setParam(key, v) {
          if (key === "p1") rate = 6 + v * 34;
          else if (key === "p2") spread = 0.04 + v * 0.6;
        },
        setBeat() {},
        engage() {
          if (timer) clearInterval(timer);
          nextAt = c.currentTime + 0.01;
          tick();
          timer = setInterval(tick, 25);
        },
        release() {
          if (timer) clearInterval(timer);
          timer = null;
          return 0.15;
        },
        retune() {}
      };
    }
  }

  throw new Error(`Unknown unit: ${name}`);
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x);
  }
  return curve;
}

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}
