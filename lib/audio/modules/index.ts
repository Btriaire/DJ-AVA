export { BaseModule, type ParamDef, type FlagDef } from "./BaseModule";
export { LoudnessModule } from "./Loudness";
export { SurroundModule } from "./Surround";
export { ExciterModule } from "./Exciter";
export { TransientModule } from "./Transient";
export { MultibandModule } from "./Multiband";

// Module factory: create an instance by ID
export type ModuleId = "loudness" | "surround" | "exciter" | "transient" | "multiband";

export function createModule(id: ModuleId, ctx: AudioContext): BaseModule {
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
    default:
      throw new Error(`Unknown module: ${id}`);
  }
}
