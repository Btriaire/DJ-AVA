// Core processing functions (pure, no side effects)
export type Channels = Float32Array[];
export const EDGE_MS = 5;

type Region = { a: number; b: number };

function regionToSamples(r: Region, sr: number, length: number): { a: number; b: number } {
  const a = Math.max(0, Math.round(r.a * sr));
  const b = Math.min(length, Math.round(r.b * sr));
  return { a, b };
}

function crossfadeEdges(orig: Channels, processed: Channels, sr: number, a: number, b: number): Channels {
  const edgeSamples = Math.min(Math.floor(EDGE_MS * sr / 1000), Math.floor((b - a) / 2));
  if (edgeSamples <= 0) return processed;

  return orig.map((channel, channelIndex) => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      if (i < a) {
        result[i] = channel[i];
      } else if (i >= b) {
        result[i] = channel[i];
      } else if (i < a + edgeSamples) {
        const pos = i - a;
        const w = 0.5 - 0.5 * Math.cos(Math.PI * pos / edgeSamples);
        result[i] = channel[i] * (1 - w) + processed[channelIndex][i] * w;
      } else if (i >= b - edgeSamples) {
        // w → 0 at the last sample of the region, so the signal lands back on the original
        const w = 0.5 - 0.5 * Math.cos(Math.PI * (b - 1 - i) / edgeSamples);
        result[i] = channel[i] * (1 - w) + processed[channelIndex][i] * w;
      } else {
        result[i] = processed[channelIndex][i];
      }
    }
    return result;
  });
}

export function coreKeepOnly(ch: Channels, sr: number, r: Region): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const edgeSamples = Math.min(Math.floor(EDGE_MS * sr / 1000), Math.floor((b - a) / 2));

  return ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      if (i < a || i >= b) {
        result[i] = 0;
      } else if (i < a + edgeSamples) {
        const pos = i - a;
        const w = 0.5 - 0.5 * Math.cos(Math.PI * pos / edgeSamples);
        result[i] = channel[i] * w;
      } else if (i >= b - edgeSamples) {
        const w = 0.5 - 0.5 * Math.cos(Math.PI * (b - 1 - i) / edgeSamples);
        result[i] = channel[i] * w;
      } else {
        result[i] = channel[i];
      }
    }
    return result;
  });
}

export function coreSilence(ch: Channels, sr: number, r: Region): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      result[i] = (i >= a && i < b) ? 0 : channel[i];
    }
    return result;
  });
  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreFade(ch: Channels, sr: number, r: Region, dir: "in" | "out", curve: "lin" | "exp" | "log" | "s"): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const length = b - a;

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      if (i < a || i >= b) {
        result[i] = channel[i];
        continue;
      }

      const pos = (i - a) / length;
      let x = dir === "in" ? pos : 1 - pos;

      switch (curve) {
        case "lin": break;
        case "exp": x = x * x; break;
        case "log": x = Math.sqrt(x); break;
        case "s": x = 0.5 - 0.5 * Math.cos(Math.PI * x); break;
      }

      result[i] = channel[i] * x;
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreGain(ch: Channels, sr: number, r: Region, db: number): Channels {
  const gain = Math.pow(10, db / 20);
  const { a, b } = regionToSamples(r, sr, ch[0].length);

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      result[i] = (i >= a && i < b) ? channel[i] * gain : channel[i];
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreNormalize(ch: Channels, sr: number, r: Region, peakDb = -1): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  let max = 0;

  for (const channel of ch) {
    for (let i = a; i < b; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > max) max = abs;
    }
  }

  if (max === 0) return ch;
  const target = Math.pow(10, peakDb / 20);
  const gain = target / max;

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      result[i] = (i >= a && i < b) ? channel[i] * gain : channel[i];
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreReverse(ch: Channels, sr: number, r: Region): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      if (i < a || i >= b) {
        result[i] = channel[i];
      } else {
        const pos = i - a;
        result[i] = channel[b - 1 - pos];
      }
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreInvertPolarity(ch: Channels, sr: number, r: Region): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      result[i] = (i >= a && i < b) ? -channel[i] : channel[i];
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreMono(ch: Channels, sr: number, r: Region): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const mono = new Float32Array(ch[0].length);

  for (let i = a; i < b; i++) {
    let sum = 0;
    for (const channel of ch) {
      sum += channel[i];
    }
    mono[i] = sum / ch.length;
  }

  const processed = ch.map(() => {
    const result = new Float32Array(mono.length);
    for (let i = 0; i < mono.length; i++) {
      result[i] = (i >= a && i < b) ? mono[i] : ch[0][i];
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreRemoveDC(ch: Channels): Channels {
  return ch.map(channel => {
    let sum = 0;
    for (const sample of channel) {
      sum += sample;
    }
    const dc = sum / channel.length;
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      result[i] = channel[i] - dc;
    }
    return result;
  });
}

export function coreGate(ch: Channels, sr: number, r: Region, thresholdDb: number, attackMs = 2, holdMs = 50, releaseMs = 80): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const threshold = Math.pow(10, thresholdDb / 20);
  const attackSamples = Math.floor(attackMs * sr / 1000);
  const holdSamples = Math.floor(holdMs * sr / 1000);
  const releaseSamples = Math.floor(releaseMs * sr / 1000);

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    let state: "closed" | "attack" | "open" | "release" = "closed";
    let counter = 0;
    let gain = 0;

    for (let i = 0; i < channel.length; i++) {
      if (i < a || i >= b) {
        result[i] = channel[i];
        continue;
      }

      const abs = Math.abs(channel[i]);
      if (abs > threshold) {
        if (state === "closed") {
          state = "attack";
          counter = 0;
        } else if (state === "release") {
          state = "open";
          counter = 0;
        }
      }

      switch (state) {
        case "closed":
          gain = 0;
          break;
        case "attack":
          gain = Math.min(1, counter / attackSamples);
          counter++;
          if (counter >= attackSamples) {
            state = "open";
            counter = 0;
          }
          break;
        case "open":
          gain = 1;
          counter++;
          if (counter >= holdSamples) {
            state = "release";
            counter = 0;
          }
          break;
        case "release":
          gain = Math.max(0, 1 - counter / releaseSamples);
          counter++;
          if (counter >= releaseSamples) {
            state = "closed";
            counter = 0;
          }
          break;
      }

      result[i] = channel[i] * gain;
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreStripSilence(ch: Channels, sr: number, thresholdDb = -50, minSilenceMs = 250): Channels {
  const threshold = Math.pow(10, thresholdDb / 20);
  const minSilenceSamples = Math.floor(minSilenceMs * sr / 1000);
  const windowSize = Math.floor(10 * sr / 1000); // 10ms window

  const isSilent = (channel: Float32Array, start: number, end: number): boolean => {
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += channel[i] * channel[i];
    }
    const rms = Math.sqrt(sum / (end - start));
    return rms < threshold;
  };

  const silentRegions: { a: number; b: number }[] = [];
  let currentStart = -1;

  for (let i = 0; i < ch[0].length; i += windowSize) {
    const windowEnd = Math.min(i + windowSize, ch[0].length);
    let silent = true;

    for (const channel of ch) {
      if (!isSilent(channel, i, windowEnd)) {
        silent = false;
        break;
      }
    }

    if (silent) {
      if (currentStart === -1) currentStart = i;
    } else {
      if (currentStart !== -1) {
        const duration = windowEnd - currentStart;
        if (duration >= minSilenceSamples) {
          silentRegions.push({ a: currentStart, b: windowEnd });
        }
        currentStart = -1;
      }
    }
  }

  if (currentStart !== -1) {
    const duration = ch[0].length - currentStart;
    if (duration >= minSilenceSamples) {
      silentRegions.push({ a: currentStart, b: ch[0].length });
    }
  }

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      let silent = false;
      for (const region of silentRegions) {
        if (i >= region.a && i < region.b) {
          silent = true;
          break;
        }
      }
      result[i] = silent ? 0 : channel[i];
    }
    return result;
  });

  return processed;
}

export function coreLimit(ch: Channels, sr: number, r: Region, ceilingDb = -1, lookaheadMs = 5, releaseMs = 50): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const ceiling = Math.pow(10, ceilingDb / 20);
  const lookaheadSamples = Math.floor(lookaheadMs * sr / 1000);
  const releaseSamples = Math.floor(releaseMs * sr / 1000);
  const edgeSamples = Math.min(Math.floor(EDGE_MS * sr / 1000), Math.floor((b - a) / 2));

  const processed = ch.map(channel => {
    const result = new Float32Array(channel.length);
    const gain = new Float32Array(channel.length);
    gain.fill(1);

    // Calculate gains
    for (let i = a; i < b; i++) {
      const lookaheadEnd = Math.min(i + lookaheadSamples, b);
      let max = 0;
      for (let j = i; j < lookaheadEnd; j++) {
        const abs = Math.abs(channel[j]);
        if (abs > max) max = abs;
      }

      if (max > ceiling) {
        gain[i] = ceiling / max;
      } else {
        gain[i] = 1;
      }

      // Apply release smoothing only when gain increases
      if (i > a && gain[i] > gain[i - 1]) {
        gain[i] = Math.min(gain[i], gain[i - 1] + (1 - gain[i - 1]) / releaseSamples);
      }
    }

    // Apply edge fades to gain
    for (let i = a; i < b; i++) {
      const pos = i - a;
      let edgeGain = 1;

      if (pos < edgeSamples) {
        edgeGain = pos / edgeSamples;
      } else if (pos >= (b - a) - edgeSamples) {
        edgeGain = (b - a - pos) / edgeSamples;
      }

      const finalGain = gain[i] * edgeGain + (1 - edgeGain);
      result[i] = Math.min(ceiling, Math.max(-ceiling, channel[i] * finalGain));
    }

    // Copy unchanged parts
    for (let i = 0; i < a; i++) {
      result[i] = channel[i];
    }
    for (let i = b; i < channel.length; i++) {
      result[i] = channel[i];
    }

    return result;
  });

  // no crossfadeEdges here: the limiter already eases its GAIN at the edges, and
  // mixing the raw original back in would break the ceiling
  return processed;
}

export function coreBeatRepeat(ch: Channels, sr: number, r: Region, division: 2 | 4 | 8 | 16): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const segmentLength = Math.floor((b - a) / division);
  const fadeSamples = Math.min(Math.floor(3 * sr / 1000), Math.floor(segmentLength / 2));

  // Create a copy of the original region to read from
  const sourceCopy = ch.map(channel => channel.slice(a, a + segmentLength));

  const processed = ch.map((channel, channelIndex) => {
    const result = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      if (i < a || i >= b) {
        result[i] = channel[i];
        continue;
      }

      const pos = i - a;
      const segmentIndex = Math.floor(pos / segmentLength);
      const segmentPos = pos % segmentLength;

      if (segmentIndex === 0) {
        // First segment - no crossfade
        result[i] = sourceCopy[channelIndex][segmentPos];
      } else {
        // For other segments, use the source copy
        result[i] = sourceCopy[channelIndex][segmentPos];

        // Apply crossfade at the start of each segment
        if (segmentPos < fadeSamples) {
          // every slice ends on the source's last sample, so the natural next sample is the
          // original audio right after the source slice
          const contIdx = a + segmentLength + segmentPos;
          const prevValue = contIdx < channel.length ? channel[contIdx] : 0;

          const fade = segmentPos / fadeSamples;
          result[i] = prevValue * (1 - fade) + result[i] * fade;
        }
      }
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreTransient(ch: Channels, sr: number, r: Region, attackDb: number, sustainDb: number): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  // one-pole smoothing coefficient for a time constant in ms
  const coef = (ms: number) => Math.exp(-1 / Math.max(1, (ms * sr) / 1000));
  const fastAtt = coef(1), fastRel = coef(20), slowAtt = coef(20), slowRel = coef(200), smooth = coef(1);
  const follow = (env: number, x: number, att: number, rel: number) => {
    const c = x > env ? att : rel;
    return c * env + (1 - c) * x;
  };

  // one gain curve shared by all channels, so the stereo image does not move
  const gains = new Float32Array(b - a);
  let fast = 0, slow = 0, g = 1;
  for (let i = a; i < b; i++) {
    let x = 0;
    for (const c of ch) x = Math.max(x, Math.abs(c[i]));
    fast = follow(fast, x, fastAtt, fastRel);
    slow = follow(slow, x, slowAtt, slowRel);
    // fast above slow = an attack; slow above fast = the decay/sustain after it
    const t = fast > slow ? (fast - slow) / Math.max(fast, 1e-9) : 0;
    const sus = slow > fast ? (slow - fast) / Math.max(slow, 1e-9) : 0;
    const target = Math.pow(10, (attackDb * t + sustainDb * sus) / 20); // 1 when both settings are 0
    g = smooth * g + (1 - smooth) * target;
    gains[i - a] = g;
  }

  const processed = ch.map((channel) => {
    const out = channel.slice();
    for (let i = a; i < b; i++) out[i] = channel[i] * gains[i - a];
    return out;
  });
  return crossfadeEdges(ch, processed, sr, a, b);
}

export function coreShift(ch: Channels, sr: number, seconds: number): Channels {
  const shiftSamples = Math.round(seconds * sr);
  const length = ch[0].length;

  return ch.map(channel => {
    const result = new Float32Array(length);
    if (shiftSamples >= 0) {
      for (let i = 0; i < length; i++) {
        result[i] = i < shiftSamples ? 0 : channel[i - shiftSamples];
      }
    } else {
      const absShift = -shiftSamples;
      for (let i = 0; i < length; i++) {
        result[i] = i >= length - absShift ? 0 : channel[i + absShift];
      }
    }
    return result;
  });
}

export function coreFitLength(part: Channels, length: number): Channels {
  return part.map(channel => {
    const result = new Float32Array(length);
    const copyLength = Math.min(channel.length, length);
    for (let i = 0; i < copyLength; i++) {
      result[i] = channel[i];
    }
    return result;
  });
}

export function corePaste(ch: Channels, sr: number, r: Region, part: Channels): Channels {
  const { a, b } = regionToSamples(r, sr, ch[0].length);
  const fittedPart = coreFitLength(part, b - a);

  const processed = ch.map((channel, i) => {
    const result = new Float32Array(channel.length);
    for (let j = 0; j < channel.length; j++) {
      if (j < a || j >= b) {
        result[j] = channel[j];
      } else {
        const pos = j - a;
        result[j] = fittedPart[i][pos];
      }
    }
    return result;
  });

  return crossfadeEdges(ch, processed, sr, a, b);
}

// AudioBuffer wrappers
function toChannels(buf: AudioBuffer): Channels {
  const channels: Channels = [];
  for (let i = 0; i < buf.numberOfChannels; i++) {
    channels.push(buf.getChannelData(i).slice());
  }
  return channels;
}

function fromChannels(chs: Channels, sr: number): AudioBuffer {
  const buf = new AudioBuffer({
    numberOfChannels: chs.length,
    length: chs[0].length,
    sampleRate: sr,
  });
  for (let i = 0; i < chs.length; i++) {
    buf.getChannelData(i).set(chs[i]);
  }
  return buf;
}

export function keepOnly(buf: AudioBuffer, r: Region): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreKeepOnly(ch, buf.sampleRate, r);
  return fromChannels(result, buf.sampleRate);
}

export function silence(buf: AudioBuffer, r: Region): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreSilence(ch, buf.sampleRate, r);
  return fromChannels(result, buf.sampleRate);
}

export function fade(buf: AudioBuffer, r: Region, dir: "in" | "out", curve: "lin" | "exp" | "log" | "s"): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreFade(ch, buf.sampleRate, r, dir, curve);
  return fromChannels(result, buf.sampleRate);
}

export function gain(buf: AudioBuffer, r: Region, db: number): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreGain(ch, buf.sampleRate, r, db);
  return fromChannels(result, buf.sampleRate);
}

export function normalize(buf: AudioBuffer, r: Region, peakDb = -1): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreNormalize(ch, buf.sampleRate, r, peakDb);
  return fromChannels(result, buf.sampleRate);
}

export function reverse(buf: AudioBuffer, r: Region): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreReverse(ch, buf.sampleRate, r);
  return fromChannels(result, buf.sampleRate);
}

export function invertPolarity(buf: AudioBuffer, r: Region): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreInvertPolarity(ch, buf.sampleRate, r);
  return fromChannels(result, buf.sampleRate);
}

export function mono(buf: AudioBuffer, r: Region): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreMono(ch, buf.sampleRate, r);
  return fromChannels(result, buf.sampleRate);
}

export function removeDC(buf: AudioBuffer): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreRemoveDC(ch);
  return fromChannels(result, buf.sampleRate);
}

export function gate(buf: AudioBuffer, r: Region, thresholdDb: number, attackMs = 2, holdMs = 50, releaseMs = 80): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreGate(ch, buf.sampleRate, r, thresholdDb, attackMs, holdMs, releaseMs);
  return fromChannels(result, buf.sampleRate);
}

export function stripSilence(buf: AudioBuffer, thresholdDb = -50, minSilenceMs = 250): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreStripSilence(ch, buf.sampleRate, thresholdDb, minSilenceMs);
  return fromChannels(result, buf.sampleRate);
}

export function limit(buf: AudioBuffer, r: Region, ceilingDb = -1, lookaheadMs = 5, releaseMs = 50): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreLimit(ch, buf.sampleRate, r, ceilingDb, lookaheadMs, releaseMs);
  return fromChannels(result, buf.sampleRate);
}

export function beatRepeat(buf: AudioBuffer, r: Region, division: 2 | 4 | 8 | 16): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreBeatRepeat(ch, buf.sampleRate, r, division);
  return fromChannels(result, buf.sampleRate);
}

export function transient(buf: AudioBuffer, r: Region, attackDb: number, sustainDb: number): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreTransient(ch, buf.sampleRate, r, attackDb, sustainDb);
  return fromChannels(result, buf.sampleRate);
}

export function shift(buf: AudioBuffer, seconds: number): AudioBuffer {
  const ch = toChannels(buf);
  const result = coreShift(ch, buf.sampleRate, seconds);
  return fromChannels(result, buf.sampleRate);
}

export async function withRegion(buf: AudioBuffer, r: Region, fn: (part: AudioBuffer) => Promise<AudioBuffer> | AudioBuffer): Promise<AudioBuffer> {
  const ch = toChannels(buf);
  const { a, b } = regionToSamples(r, buf.sampleRate, ch[0].length);
  const partCh = ch.map(channel => channel.slice(a, b));
  const partBuf = fromChannels(partCh, buf.sampleRate);
  const processedPart = await fn(partBuf);
  const processedCh = toChannels(processedPart);
  const result = corePaste(ch, buf.sampleRate, r, processedCh);
  return fromChannels(result, buf.sampleRate);
}

export async function compress(buf: AudioBuffer, r: Region, p: {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}): Promise<AudioBuffer> {
  return withRegion(buf, r, async (part) => {
    const ctx = new OfflineAudioContext(
      part.numberOfChannels,
      part.length,
      part.sampleRate
    );

    const source = ctx.createBufferSource();
    source.buffer = part;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(p.thresholdDb, 0);
    compressor.knee.setValueAtTime(6, 0);
    compressor.ratio.setValueAtTime(p.ratio, 0);
    compressor.attack.setValueAtTime(p.attackMs / 1000, 0);
    compressor.release.setValueAtTime(p.releaseMs / 1000, 0);

    const makeup = ctx.createGain();
    makeup.gain.setValueAtTime(Math.pow(10, p.makeupDb / 20), 0);

    source.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(ctx.destination);

    source.start();
    return ctx.startRendering();
  });
}
