export { BaseModule, type ParamDef, type FlagDef } from "./BaseModule";

// DSP Modules - imports for use in factory
import { LoudnessModule } from "./Loudness";
import { SurroundModule } from "./Surround";
import { ExciterModule } from "./Exciter";
import { TransientModule } from "./Transient";
import { MultibandModule } from "./Multiband";
import { CompModule } from "./Comp";
import { DriveModule } from "./Drive";
import { WavefoldModule } from "./Wavefold";
import { CrushModule } from "./Crush";
import { RobotModule } from "./Robot";
import { RingmodModule } from "./Ringmod";
import { VoyelleModule } from "./Voyelle";
import { IsolatorModule } from "./Isolator";
import { AutowahModule } from "./Autowah";
import { ResonatorModule } from "./Resonator";
import { GateModule } from "./Gate";
import { GlitchModule } from "./Glitch";
import { ShimmerModule } from "./Shimmer";
import { DelayModule } from "./Delay";
import { ReverbModule } from "./Reverb";
import { LimiterModule } from "./Limiter";
import { AutotuneModule } from "./Autotune";
import { Eq10BandModule } from "./Eq10Band";

// Re-export for external use
export { LoudnessModule, SurroundModule, ExciterModule, TransientModule, MultibandModule, CompModule, DriveModule, WavefoldModule, CrushModule, RobotModule, RingmodModule, VoyelleModule, IsolatorModule, AutowahModule, ResonatorModule, GateModule, GlitchModule, ShimmerModule, DelayModule, ReverbModule, LimiterModule, AutotuneModule, Eq10BandModule };

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
