export type MidiNote = { t: number; dur: number; midi: number; vel: number };

// Notes of one track of a Standard MIDI File, in seconds (tempo map applied), sorted by
// start. The track is picked by name (case-insensitive); null when there is no such track.
export function readMidiTrack(data: Uint8Array, trackName: string): MidiNote[] | null {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (at: number) => String.fromCharCode(...data.subarray(at, at + 4));
  if (data.length < 14 || tag(0) !== "MThd") throw new Error("not a MIDI file");
  const ntracks = dv.getUint16(10);
  const ppq = dv.getUint16(12);
  if (ppq & 0x8000) throw new Error("SMPTE time division not supported");
  const tempos: [number, number][] = []; // [tick, microseconds per quarter note]
  const tracks: { name: string; ev: [number, boolean, number, number][] }[] = []; // [tick, on, key, velocity]
  let p = 8 + dv.getUint32(4);
  for (let k = 0; k < ntracks && p + 8 <= data.length; k++) {
    const isTrack = tag(p) === "MTrk";
    let q = p + 8;
    const end = Math.min(data.length, q + dv.getUint32(p + 4));
    p = end;
    if (!isTrack) continue;
    const vlq = () => {
      let v = 0;
      let b = 0x80;
      while (b & 0x80 && q < end) {
        b = data[q++];
        v = (v << 7) | (b & 0x7f);
      }
      return v;
    };
    let tick = 0;
    let status = 0;
    let name = "";
    const ev: [number, boolean, number, number][] = [];
    while (q < end) {
      tick += vlq();
      if (data[q] & 0x80) status = data[q++];
      if (status === 0xff) {
        const type = data[q++];
        const l = vlq();
        if (type === 0x03) name = new TextDecoder().decode(data.subarray(q, q + l));
        else if (type === 0x51 && l >= 3) tempos.push([tick, (data[q] << 16) | (data[q + 1] << 8) | data[q + 2]]);
        q += l;
        status = 0; // meta events cancel running status
      } else if (status === 0xf0 || status === 0xf7) {
        q += vlq();
        status = 0;
      } else {
        const hi = status & 0xf0;
        const a = data[q++];
        const b = hi === 0xc0 || hi === 0xd0 ? 0 : data[q++];
        if (hi === 0x90 && b > 0) ev.push([tick, true, a, b]);
        else if (hi === 0x80 || hi === 0x90) ev.push([tick, false, a, 0]);
      }
    }
    tracks.push({ name, ev });
  }
  const want = trackName.trim().toLowerCase();
  const track = tracks.find((t) => t.name.trim().toLowerCase() === want);
  if (!track) return null;
  // ticks -> seconds through the tempo map (120 BPM until the first tempo event)
  tempos.sort((x, y) => x[0] - y[0]);
  const sec = (tick: number) => {
    let s = 0;
    let last = 0;
    let us = 500000;
    for (const [t, u] of tempos) {
      if (t >= tick) break;
      s += ((t - last) * us) / (ppq * 1e6);
      last = t;
      us = u;
    }
    return s + ((tick - last) * us) / (ppq * 1e6);
  };
  const open = new Map<number, [number, number]>(); // key -> [start tick, velocity]
  const notes: MidiNote[] = [];
  for (const [tick, on, key, vel] of track.ev) {
    const prev = open.get(key);
    if (prev) {
      const t = sec(prev[0]);
      notes.push({ t, dur: Math.max(0.02, sec(tick) - t), midi: key, vel: prev[1] / 127 });
      open.delete(key);
    }
    if (on) open.set(key, [tick, vel]);
  }
  return notes.sort((x, y) => x.t - y.t);
}
