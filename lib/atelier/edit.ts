import { stretchBuffer } from "../audio/stretch";
import { Region } from "./types";

const blank = (like: AudioBuffer, length: number): AudioBuffer =>
  new AudioBuffer({
    numberOfChannels: like.numberOfChannels,
    length: Math.max(1, length),
    sampleRate: like.sampleRate,
  });

const copy = (buf: AudioBuffer): AudioBuffer => {
  const out = blank(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c));
  }
  return out;
};

const idx = (buf: AudioBuffer, t: number): number =>
  Math.max(0, Math.min(buf.length, Math.round(t * buf.sampleRate)));

const slice = (buf: AudioBuffer, r: Region): AudioBuffer => {
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  const result = blank(buf, end - start);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    result.getChannelData(c).set(buf.getChannelData(c).subarray(start, end));
  }
  return result;
};

const cut = (buf: AudioBuffer, r: Region): AudioBuffer => {
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  const result = blank(buf, buf.length - (end - start));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    result.getChannelData(c).set(data.subarray(0, start));
    result.getChannelData(c).set(data.subarray(end), start);
  }
  return result;
};

const gain = (buf: AudioBuffer, r: Region, db: number): AudioBuffer => {
  const result = copy(buf);
  const factor = Math.pow(10, db / 20);
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = start; i < end; i++) {
      data[i] *= factor;
    }
  }
  return result;
};

const normalize = (buf: AudioBuffer, r: Region, peakDb = -1): AudioBuffer => {
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  let max = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = start; i < end; i++) {
      max = Math.max(max, Math.abs(data[i]));
    }
  }
  if (max === 0) return copy(buf);
  const factor = Math.pow(10, peakDb / 20) / max;
  const result = copy(buf);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = start; i < end; i++) {
      data[i] *= factor;
    }
  }
  return result;
};

const fade = (buf: AudioBuffer, r: Region, dir: "in" | "out"): AudioBuffer => {
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  const len = end - start;
  if (len < 2) return copy(buf);

  const result = copy(buf);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const pos = i / (len - 1);
      const gain = dir === "in" ? Math.sin((pos * Math.PI) / 2) : Math.cos((pos * Math.PI) / 2);
      data[start + i] *= gain;
    }
  }
  return result;
};

const reverse = (buf: AudioBuffer, r: Region): AudioBuffer => {
  const result = copy(buf);
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = result.getChannelData(c);
    const reversed = data.subarray(start, end).slice().reverse();
    data.set(reversed, start);
  }
  return result;
};

const silence = (buf: AudioBuffer, r: Region): AudioBuffer => {
  const result = copy(buf);
  const start = idx(buf, r.a);
  const end = idx(buf, r.b);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    result.getChannelData(c).fill(0, start, end);
  }
  return result;
};

const repitch = async (buf: AudioBuffer, semis: number): Promise<AudioBuffer> => {
  const rate = 2 ** (semis / 12);
  const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.ceil(buf.length / rate)), buf.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = rate;
  source.connect(ctx.destination);
  source.start();
  return await ctx.startRendering();
};

const pitchKeep = async (buf: AudioBuffer, semis: number): Promise<AudioBuffer> => {
  const pitched = await repitch(buf, semis);
  const factor = Math.max(0.25, Math.min(4, buf.length / pitched.length));
  const stretched = await stretchBuffer(new OfflineAudioContext(1, 1, buf.sampleRate), pitched, factor, () => false);
  return stretched || pitched;
};

const tempo = async (buf: AudioBuffer, factor: number): Promise<AudioBuffer> => {
  factor = Math.max(0.25, Math.min(4, factor));
  return await stretchBuffer(new OfflineAudioContext(1, 1, buf.sampleRate), buf, factor, () => false) || buf;
};

const eq = async (buf: AudioBuffer, p: { low: number; mid: number; high: number; hp: number; lp: number }): Promise<AudioBuffer> => {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = p.hp;

  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 100;
  low.gain.value = p.low;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.9;
  mid.gain.value = p.mid;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 10000;
  high.gain.value = p.high;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = p.lp;

  source.connect(hp);
  hp.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(lp);
  lp.connect(ctx.destination);

  source.start();
  return await ctx.startRendering();
};

const onsets = (buf: AudioBuffer, sensitivity = 0.5, minGap = 0.12): number[] => {
  const frameSize = Math.floor(buf.sampleRate * 0.01);
  const numFrames = Math.floor(buf.length / frameSize);
  const energies: number[] = [];
  const rises: number[] = [];

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let j = 0; j < frameSize; j++) {
        const idx = i * frameSize + j;
        if (idx < buf.length) sum += data[idx] * data[idx];
      }
    }
    const energy = Math.sqrt(sum / (frameSize * buf.numberOfChannels));
    energies.push(energy);
  }

  for (let i = 1; i < energies.length; i++) {
    rises.push(Math.max(0, Math.log10(energies[i] + 1e-6) - Math.log10(energies[i - 1] + 1e-6)));
  }

  const mean = rises.reduce((a, b) => a + b, 0) / rises.length;
  const std = Math.sqrt(rises.reduce((a, b) => a + (b - mean) ** 2, 0) / rises.length);
  const threshold = mean + (2.5 - 2 * sensitivity) * std;

  const result: number[] = [];
  for (let i = 1; i < rises.length; i++) {
    if (rises[i] > threshold && (result.length === 0 || (i * frameSize / buf.sampleRate) - result[result.length - 1] >= minGap)) {
      result.push(i * frameSize / buf.sampleRate);
    }
  }

  return result.length > 0 ? result : [0];
};

const barRegions = (dur: number, bpm: number, offset: number, bars: number): Region[] => {
  if (bpm <= 0) return [];
  const barDur = (60 / bpm) * 4;
  const result: Region[] = [];
  let t = offset;
  while (t < dur) {
    const end = Math.min(t + bars * barDur, dur);
    if (end - t >= 0.05) result.push({ a: t, b: end });
    t += bars * barDur;
  }
  return result;
};

const mixStems = (stems: { buf: AudioBuffer; gain: number }[]): AudioBuffer => {
  if (stems.length === 0) throw new Error("Cannot mix empty stems");

  const maxChannels = Math.max(...stems.map(s => s.buf.numberOfChannels));
  const maxLength = Math.max(...stems.map(s => s.buf.length));
  const sampleRate = stems[0].buf.sampleRate;

  const result = new AudioBuffer({
    numberOfChannels: maxChannels,
    length: maxLength,
    sampleRate
  });

  for (let c = 0; c < maxChannels; c++) {
    const channelData = result.getChannelData(c);
    for (const stem of stems) {
      if (stem.gain === 0 || c >= stem.buf.numberOfChannels) continue;
      const stemData = stem.buf.getChannelData(c);
      for (let i = 0; i < stem.buf.length; i++) {
        channelData[i] += stemData[i] * stem.gain;
      }
    }
  }
  return result;
};

export {
  slice, cut, gain, normalize, fade, reverse, silence,
  repitch, pitchKeep, tempo, eq, onsets, barRegions, mixStems
};
