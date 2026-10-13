import { SimpleFilter, SoundTouch } from "soundtouchjs";

export async function stretchBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  factor: number,
  isCancelled: () => boolean
): Promise<AudioBuffer | null> {
  if (!Number.isFinite(factor) || factor < 0.25 || factor > 4) {
    throw new RangeError("facteur d'étirement hors limites");
  }

  const targetLength = Math.round(input.length * factor);
  const channels = input.numberOfChannels >= 2 ? 2 : 1;
  const output = ctx.createBuffer(channels, targetLength, input.sampleRate);

  const st = new SoundTouch();
  st.tempo = 1 / factor;
  st.pitch = 1;

  const PAD = Math.round(input.sampleRate * 0.5);
  const total = input.length + PAD;

  const leftData = input.getChannelData(0);
  const rightData = channels === 2 ? input.getChannelData(1) : leftData;

  const source = {
    extract(target: Float32Array, numFrames: number, position: number): number {
      const n = Math.min(numFrames, total - position);
      for (let i = 0; i < n; i++) {
        const idx = position + i;
        const left = idx < input.length ? leftData[idx] : 0;
        const right = channels === 2 && idx < input.length ? rightData[idx] : left;
        target[i * 2] = left;
        target[i * 2 + 1] = right;
      }
      return n;
    }
  };

  const filter = new SimpleFilter(source, st);
  const CHUNK = 4096;
  const chunk = new Float32Array(CHUNK * 2);
  const outChannels = Array.from({ length: channels }, (_, i) => output.getChannelData(i));
  let outPos = 0;
  let iterations = 0;

  while (outPos < targetLength) {
    const n = Math.min(CHUNK, targetLength - outPos);
    const got = filter.extract(chunk, n);
    if (got === 0) break;

    for (let i = 0; i < got; i++) {
      outChannels[0][outPos + i] = chunk[i * 2];
      if (channels === 2) outChannels[1][outPos + i] = chunk[i * 2 + 1];
    }
    outPos += got;
    iterations++;

    if (iterations % 16 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (isCancelled()) return null;
    }
  }

  return output;
}
