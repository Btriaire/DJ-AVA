export type ThumbKind = "pads"|"keys"|"wave"|"chop"|"bars"|"knobs"|"disc"|"ramp"|"violin"|"curve"|"gate"|"clip"|"fold"|"steps"|"ring"|"reverb"|"delay"|"mod"|"surround";

export const MODULE_THUMB: Record<string, ThumbKind> = {
  stemprep: "chop",
  synth: "keys",
  dx7: "keys",
  solar42: "keys",
  sampler: "wave",
  soundfx: "knobs",
  rhythm: "knobs",
  djsynth: "keys",
  drums: "pads",
  dance: "ramp",
  jambass: "wave",
  samplepad: "pads",
  voicechop: "chop",
  bassslice: "chop",
  session: "violin",
  otherslice: "chop",
  guitarslice: "chop",
  pianoslice: "chop",
  drumlab: "pads",
  voicelab: "mod",
  jamvox: "mod",
  vocoder: "mod",
  jamsynth: "keys",
  jambeat: "pads",
  djkbd: "keys",
  supersampler: "wave",
  boss: "knobs",
  eq: "bars",
  fxpad: "knobs",
  isolator: "bars",
  comp: "curve",
  gate: "gate",
  loudness: "curve",
  multiband: "bars",
  transient: "gate",
  drive: "clip",
  wavefold: "fold",
  crush: "steps",
  ringmod: "ring",
  exciter: "bars",
  delay: "delay",
  reverb: "reverb",
  shimmer: "reverb",
  surround: "surround",
  glitch: "delay",
  autowah: "mod",
  resonator: "delay",
  voyelle: "mod",
  autotune: "mod",
  slicer: "chop",
  harmony: "keys"
};

export function thumbFor(key: string): ThumbKind {
  return MODULE_THUMB[key] ?? "knobs";
}

export function shortName(label: string): string {
  const parts = label.split(" · ");
  return parts[0].trim();
}

export function blurb(label: string): string {
  const parts = label.split(" · ");
  return parts.length > 1 ? parts[1].trim() : "";
}

export function thumbSelfCheck(): string[] {
  const errors: string[] = [];
  const validThumbKinds: ThumbKind[] = ["pads", "keys", "wave", "chop", "bars", "knobs", "disc", "ramp", "violin", "curve", "gate", "clip", "fold", "steps", "ring", "reverb", "delay", "mod", "surround"];

  if (thumbFor("inconnu") !== "knobs") {
    errors.push("thumbFor('inconnu') should return 'knobs'");
  }

  if (shortName("DX7 · Synthé FM : stabs") !== "DX7") {
    errors.push("shortName('DX7 · Synthé FM : stabs') should return 'DX7'");
  }

  if (blurb("DX7 · Synthé FM : stabs") !== "Synthé FM : stabs") {
    errors.push("blurb('DX7 · Synthé FM : stabs') should return 'Synthé FM : stabs'");
  }

  if (shortName("Compresseur") !== "Compresseur") {
    errors.push("shortName('Compresseur') should return 'Compresseur'");
  }

  if (blurb("Compresseur") !== "") {
    errors.push("blurb('Compresseur') should return an empty string");
  }

  const moduleThumbKeys = Object.keys(MODULE_THUMB);
  if (moduleThumbKeys.length !== 48) {
    errors.push(`MODULE_THUMB should contain exactly 48 keys, found ${moduleThumbKeys.length}`);
  }

  const invalidThumbKinds = Object.values(MODULE_THUMB).filter(kind => !validThumbKinds.includes(kind));
  if (invalidThumbKinds.length > 0) {
    errors.push(`MODULE_THUMB contains invalid thumb kinds: ${invalidThumbKinds.join(", ")}`);
  }

  return errors;
}