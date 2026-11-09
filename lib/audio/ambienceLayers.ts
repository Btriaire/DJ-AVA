import { RainLayer } from "./rainLayer";
import { WindLayer } from "./windLayer";
import { DroneLayer } from "./droneLayer";
import { BowlLayer } from "./bowlLayer";
import { SampleBedLayer, PitchedBedLayer } from "./sampleBed";
import { SampleBowlLayer } from "./sampleBowl";
import { loadAmbienceSample, AmbienceSampleName } from "./sampleBank";

export type LayerName = "rain" | "wind" | "drone" | "bowl";

interface Layer {
  setLevel(v: number): void;
  setRoot?(midi: number): void;
  dispose(): void;
}

export class AmbienceLayers {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private layers: Map<LayerName, Layer>;
  private levels: Map<LayerName, number>;
  private creating: Map<LayerName, Promise<void>>;
  private disposed: boolean;
  private rootMidi: number;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.masterGain = new GainNode(ctx, { gain: 0.6 });
    this.masterGain.connect(out);
    this.layers = new Map();
    this.levels = new Map();
    this.creating = new Map();
    this.disposed = false;
    this.rootMidi = 48;
  }

  set(name: LayerName, v: number): void {
    v = Math.max(0, Math.min(1, v));
    this.levels.set(name, v);
    const layer = this.layers.get(name);
    if (layer) {
      layer.setLevel(v);
    } else if (v > 0.001 && !this.creating.has(name)) {
      this.creating.set(name, this.create(name));
    }
  }

  setRoot(midi: number): void {
    this.rootMidi = midi;
    this.layers.forEach(layer => {
      if (layer.setRoot) {
        layer.setRoot(midi);
      }
    });
  }

  private async create(name: LayerName): Promise<void> {
    let sampleName: AmbienceSampleName;
    switch (name) {
      case "rain":
        sampleName = "rain";
        break;
      case "wind":
        sampleName = "wind";
        break;
      case "drone":
        sampleName = "bowlSing";
        break;
      case "bowl":
        sampleName = "bowlStrike";
        break;
    }

    try {
      const sample = await loadAmbienceSample(this.ctx, sampleName);
      if (this.disposed) {
        return;
      }

      let layer: Layer;
      switch (name) {
        case "rain":
          layer = sample ? new SampleBedLayer(this.ctx, this.masterGain, sample, { segmentSec: 14, fadeSec: 4, rateJitter: 0.02, level: 3 }) : new RainLayer(this.ctx, this.masterGain);
          break;
        case "wind":
          layer = sample ? new SampleBedLayer(this.ctx, this.masterGain, sample, { segmentSec: 10, fadeSec: 3, rateJitter: 0.03, level: 3 }) : new WindLayer(this.ctx, this.masterGain);
          break;
        case "drone":
          layer = sample ? new PitchedBedLayer(this.ctx, this.masterGain, sample, { segmentSec: 16, fadeSec: 5, rateJitter: 0.005, level: 2.4 }) : new DroneLayer(this.ctx, this.masterGain);
          break;
        case "bowl":
          layer = sample ? new SampleBowlLayer(this.ctx, this.masterGain, sample) : new BowlLayer(this.ctx, this.masterGain);
          break;
      }

      if (layer.setRoot) {
        layer.setRoot(this.rootMidi);
      }
      this.layers.set(name, layer);
      layer.setLevel(this.levels.get(name) || 0);
    } catch (error) {
      console.error(`Error creating ${name} layer:`, error);
      let fallbackLayer: Layer;
      switch (name) {
        case "rain":
          fallbackLayer = new RainLayer(this.ctx, this.masterGain);
          break;
        case "wind":
          fallbackLayer = new WindLayer(this.ctx, this.masterGain);
          break;
        case "drone":
          fallbackLayer = new DroneLayer(this.ctx, this.masterGain);
          break;
        case "bowl":
          fallbackLayer = new BowlLayer(this.ctx, this.masterGain);
          break;
      }
      if (fallbackLayer.setRoot) {
        fallbackLayer.setRoot(this.rootMidi);
      }
      this.layers.set(name, fallbackLayer);
      fallbackLayer.setLevel(this.levels.get(name) || 0);
    } finally {
      this.creating.delete(name);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.layers.forEach(layer => layer.dispose());
    this.layers.clear();
    this.levels.clear();
    this.creating.clear();
    this.masterGain.disconnect();
  }
}