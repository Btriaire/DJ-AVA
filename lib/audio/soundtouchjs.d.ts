declare module "soundtouchjs" {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    rate: number;
  }

  export interface SampleSource {
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  export class SimpleFilter {
    constructor(sourceSound: SampleSource, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames: number): number;
  }
}
