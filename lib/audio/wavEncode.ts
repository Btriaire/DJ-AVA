export function cropWav(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const start = Math.max(0, Math.min(startSec, buffer.duration));
  const end = Math.max(0, Math.min(endSec, buffer.duration));
  if (end <= start) return new Blob([], { type: "audio/wav" });

  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const samplesPerChannel = endSample - startSample;

  const headerSize = 44;
  const dataSize = samplesPerChannel * channels * 2;
  const totalSize = headerSize + dataSize;
  const bufferView = new ArrayBuffer(totalSize);
  const dataView = new DataView(bufferView);

  // RIFF header
  dataView.setUint32(0, 0x52494646, false); // "RIFF"
  dataView.setUint32(4, 36 + dataSize, true); // File size - 8
  dataView.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt subchunk
  dataView.setUint32(12, 0x666d7420, false); // "fmt "
  dataView.setUint32(16, 16, true); // Subchunk1Size
  dataView.setUint16(20, 1, true); // AudioFormat (PCM)
  dataView.setUint16(22, channels, true); // NumChannels
  dataView.setUint32(24, sampleRate, true); // SampleRate
  dataView.setUint32(28, sampleRate * channels * 2, true); // ByteRate
  dataView.setUint16(32, channels * 2, true); // BlockAlign
  dataView.setUint16(34, 16, true); // BitsPerSample

  // data subchunk
  dataView.setUint32(36, 0x64617461, false); // "data"
  dataView.setUint32(40, dataSize, true); // Subchunk2Size

  // Write samples
  for (let channel = 0; channel < channels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < samplesPerChannel; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[startSample + i]));
      const int16 = Math.round(sample * 32767);
      dataView.setInt16(headerSize + (i * channels + channel) * 2, int16, true);
    }
  }

  return new Blob([bufferView], { type: "audio/wav" });
}
