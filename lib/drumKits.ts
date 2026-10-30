// Real drum machine kits: smpldsnds/drum-machines collection, public domain (MaRuche/Codestral)
export type CorePart = "kick" | "snare" | "clap" | "hat" | "open";
export type ExtraPart = "tom" | "rim" | "perc" | "cymbal";
export type DrumPart = CorePart | ExtraPart;
export const CORE_PARTS: CorePart[] = ["kick", "snare", "clap", "hat", "open"];
export const DRUM_PARTS: DrumPart[] = [...CORE_PARTS, "tom", "rim", "perc", "cymbal"];
export interface DrumKitDef { id: string; label: string; style: string; folder: string; parts: Record<CorePart, string> & Partial<Record<ExtraPart, string>> }
export const DRUM_KITS: DrumKitDef[] = [
  { id: "lm2", label: "LinnDrum LM-2", style: "pop 80s", folder: "LM-2", parts: { kick: "kick", snare: "snare-m", clap: "clap", hat: "hhclosed", open: "hhopen", tom: "tom-m", rim: "stick-m", perc: "tambourine", cymbal: "crash" } },
  { id: "drumtraks", label: "Drumtraks", style: "acoustique 80s", folder: "Sequential-Circuits-Drumtraks", parts: { kick: "DT_Kick", snare: "DT_Snare", clap: "DT_Clap", hat: "DT_Closedhat", open: "DT_Openhat", tom: "DT_Tom01", rim: "DT_Rimshot", perc: "DT_Tamborine", cymbal: "DT_Crash" } },
  { id: "tr808", label: "TR-808", style: "hip-hop, électro", folder: "TR-808", parts: { kick: "kick/bd5025", snare: "snare/sd5050", clap: "clap/cp", hat: "hihat-close/ch", open: "hihat-open/oh25", tom: "mid-tom/mt50", rim: "rimshot/rs", perc: "cowbell/cb", cymbal: "cymbal/cy5050" } },
  { id: "mfb512", label: "MFB-512", style: "techno", folder: "MFB-512", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-mid", cymbal: "cymbal" } },
  { id: "cr8000", label: "CR-8000", style: "disco, italo", folder: "Roland-CR-8000", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-high", rim: "rimshot", perc: "cowbell", cymbal: "cymball" } },
  { id: "m808", label: "808 mini", style: "trap, hip-hop", folder: "808-mini", parts: { kick: "kick", snare: "snare-1", clap: "snare-2", hat: "hhclosed-1", open: "hhopen-1", tom: "tom-mid", cymbal: "crash" } },
  { id: "rz1", label: "Casio RZ-1", style: "lo-fi 80s", folder: "Casio-RZ1", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-2", rim: "clave", perc: "cowbell", cymbal: "crash" } },
  { id: "mr10", label: "Yamaha MR-10", style: "rétro, lo-fi", folder: "Yamaha-MR10", parts: { kick: "kick", snare: "snare", clap: "shortsn", hat: "chihat", open: "ohihat", tom: "midtom", perc: "shaker", cymbal: "crash" } },
  { id: "sk1", label: "Casio SK-1", style: "lo-fi, chiptune", folder: "Casio-SK1", parts: { kick: "kick", snare: "snare", clap: "snare", hat: "hithat", open: "hihat-open", tom: "tom-hi" } }
];
export function drumKit(id: string): DrumKitDef | undefined { return DRUM_KITS.find(kit => kit.id === id); }
export function drumUrl(kit: DrumKitDef, part: DrumPart): string | null { return part in kit.parts ? `https://smpldsnds.github.io/drum-machines/${kit.folder}/${kit.parts[part as keyof typeof kit.parts]}.ogg` : null; }
export function isDrumPart(x: string): x is DrumPart { return DRUM_PARTS.includes(x as DrumPart); }
export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(DRUM_KITS.length === 9, "9 kits");
  assert(new Set(DRUM_KITS.map((kit) => kit.id)).size === DRUM_KITS.length, "unique ids");
  assert(DRUM_KITS.every(kit => CORE_PARTS.every(part => kit.parts[part] !== "")), "5 parts non-empty");
  assert(drumUrl(drumKit("tr808")!, "kick") === "https://smpldsnds.github.io/drum-machines/TR-808/kick/bd5025.ogg", "drumUrl");
  assert(drumUrl(drumKit("mfb512")!, "perc") === null, "drumUrl");
  assert(drumUrl(drumKit("rz1")!, "perc")!.endsWith("Casio-RZ1/cowbell.ogg"), "drumUrl");
  assert(isDrumPart("tom") && !isDrumPart("bell"), "isDrumPart");
  assert(drumKit("nope") === undefined, "drumKit");
}
