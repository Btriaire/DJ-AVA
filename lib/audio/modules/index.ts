export { BaseModule, type ParamDef, type FlagDef } from "./BaseModule";

// DSP Modules
export { LoudnessModule } from "./Loudness";
export { SurroundModule } from "./Surround";
export { ExciterModule } from "./Exciter";
export { TransientModule } from "./Transient";
export { MultibandModule } from "./Multiband";
export { CompModule } from "./Comp";
export { DriveModule } from "./Drive";
export { WavefoldModule } from "./Wavefold";
export { CrushModule } from "./Crush";
export { RobotModule } from "./Robot";
export { RingmodModule } from "./Ringmod";
export { VoyelleModule } from "./Voyelle";
export { IsolatorModule } from "./Isolator";
export { AutowahModule } from "./Autowah";
export { ResonatorModule } from "./Resonator";
export { GateModule } from "./Gate";
export { GlitchModule } from "./Glitch";
export { ShimmerModule } from "./Shimmer";
export { DelayModule } from "./Delay";
export { ReverbModule } from "./Reverb";
export { LimiterModule } from "./Limiter";
export { AutotuneModule } from "./Autotune";
export { Eq10BandModule } from "./Eq10Band";

// Module factory: create an instance by ID
export type ModuleId =
  | "loudness"
  | "surround"
  | "exciter"
  | "transient"
  | "multiband"
  | "comp"
  | "drive"
  | "wavefold"
  | "crush"
  | "robot"
  | "ringmod"
  | "voyelle"
  | "isolator"
  | "autowah"
  | "resonator"
  | "gate"
  | "glitch"
  | "shimmer"
  | "delay"
  | "reverb"
  | "limiter"
  | "autotune"
  | "eq10band";

export function createModule(id: ModuleId, ctx: AudioContext): any {
  switch (id) {
    case "loudness":
      return new LoudnessModule(ctx);
    case "surround":
      return new SurroundModule(ctx);
    case "exciter":
      return new ExciterModule(ctx);
    case "transient":
      return new TransientModule(ctx);
    case "multiband":
      return new MultibandModule(ctx);
    case "comp":
      return new CompModule(ctx);
    case "drive":
      return new DriveModule(ctx);
    case "wavefold":
      return new WavefoldModule(ctx);
    case "crush":
      return new CrushModule(ctx);
    case "robot":
      return new RobotModule(ctx);
    case "ringmod":
      return new RingmodModule(ctx);
    case "voyelle":
      return new VoyelleModule(ctx);
    case "isolator":
      return new IsolatorModule(ctx);
    case "autowah":
      return new AutowahModule(ctx);
    case "resonator":
      return new ResonatorModule(ctx);
    case "gate":
      return new GateModule(ctx);
    case "glitch":
      return new GlitchModule(ctx);
    case "shimmer":
      return new ShimmerModule(ctx);
    case "delay":
      return new DelayModule(ctx);
    case "reverb":
      return new ReverbModule(ctx);
    case "limiter":
      return new LimiterModule(ctx);
    case "autotune":
      return new AutotuneModule(ctx);
    case "eq10band":
      return new Eq10BandModule(ctx);
    default:
      throw new Error(`Unknown module: ${id}`);
  }
}
