export type Region = { a: number; b: number }; // seconds, a < b
// a sample being worked on in the Atelier (kept in memory for the session)
export interface WorkSample {
  id: string;
  name: string;
  buf: AudioBuffer;
  from: string; // name of the single it was cut from
  bpm: number; // 0 when unknown
  key: string; // e.g. "8A · A minor", "" when unknown
  at?: number; // start in the single it was cut from (s), for the waveform marks
}
