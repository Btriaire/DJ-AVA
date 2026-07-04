import type { AudioContext } from "web-audio-api";

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  fmt?: (v: number) => string;
}

export interface FlagDef {
  key: string;
  label: string;
}

export abstract class BaseModule {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly paramDefs: ParamDef[];
  readonly flagDefs: FlagDef[];

  protected params: Record<string, number> = {};
  protected flags: Record<string, boolean> = {};

  abstract input: GainNode | any;
  abstract output: GainNode | any;

  constructor(
    id: string,
    label: string,
    title: string,
    paramDefs: ParamDef[] = [],
    flagDefs: FlagDef[] = []
  ) {
    this.id = id;
    this.label = label;
    this.title = title;
    this.paramDefs = paramDefs;
    this.flagDefs = flagDefs;

    // Initialize params to defaults
    paramDefs.forEach((p) => {
      this.params[p.key] = p.def;
    });
    flagDefs.forEach((f) => {
      this.flags[f.key] = false;
    });
  }

  abstract build(ctx: AudioContext): void;

  getParam(key: string): number {
    return this.params[key] ?? 0;
  }

  setParam(key: string, value: number): void {
    const def = this.paramDefs.find((p) => p.key === key);
    if (def) {
      this.params[key] = Math.max(def.min, Math.min(def.max, value));
      this.onParamChange(key, this.params[key]);
    }
  }

  getFlag(key: string): boolean {
    return this.flags[key] ?? false;
  }

  setFlag(key: string, value: boolean): void {
    if (this.flagDefs.some((f) => f.key === key)) {
      this.flags[key] = value;
      this.onFlagChange(key, value);
    }
  }

  protected onParamChange(key: string, value: number): void {
    // Override in subclasses to respond to param changes
  }

  protected onFlagChange(key: string, value: boolean): void {
    // Override in subclasses to respond to flag changes
  }

  abstract dispose(): void;

  export(): { params: Record<string, number>; flags: Record<string, boolean> } {
    return { params: { ...this.params }, flags: { ...this.flags } };
  }

  import(data: { params?: Record<string, number>; flags?: Record<string, boolean> }): void {
    if (data.params) {
      Object.entries(data.params).forEach(([k, v]) => this.setParam(k, v));
    }
    if (data.flags) {
      Object.entries(data.flags).forEach(([k, v]) => this.setFlag(k, v));
    }
  }
}
