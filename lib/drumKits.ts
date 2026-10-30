// Real drum machine kits: smpldsnds/drum-machines collection, public domain (MaRuche/Codestral)
export type DrumPart = "kick" | "snare" | "clap" | "hat" | "open";
export const DRUM_PARTS: DrumPart[] = ["kick", "snare", "clap", "hat", "open"];
export interface DrumKitDef { id: string; label: string; style: string; folder: string; parts: Record<DrumPart, string> }
export const DRUM_KITS: DrumKitDef[] = [
  { id: "lm2", label: "LinnDrum LM-2", style: "pop 80s", folder: "LM-2", parts: { kick: "kick", snare: "snare-m", clap: "clap", hat: "hhclosed", open: "hhopen" } },
  { id: "drumtraks", label: "Drumtraks", style: "acoustique 80s", folder: "Sequential-Circuits-Drumtraks", parts: { kick: "DT_Kick", snare: "DT_Snare", clap: "DT_Clap", hat: "DT_Closedhat", open: "DT_Openhat" } },
  { id: "tr808", label: "TR-808", style: "hip-hop, électro", folder: "TR-808", parts: { kick: "kick/bd5025", snare: "snare/sd5050", clap: "clap/cp", hat: "hihat-close/ch", open: "hihat-open/oh25" } },
  { id: "mfb512", label: "MFB-512", style: "techno", folder: "MFB-512", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open" } },
  { id: "cr8000", label: "CR-8000", style: "disco, italo", folder: "Roland-CR-8000", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open" } }
];
export function drumKit(id: string): DrumKitDef | undefined { return DRUM_KITS.find(kit => kit.id === id); }
export function drumUrl(kit: DrumKitDef, part: DrumPart): string { return `https://smpldsnds.github.io/drum-machines/${kit.folder}/${kit.parts[part]}.ogg`; }
export function isDrumPart(x: string): x is DrumPart { return DRUM_PARTS.includes(x as DrumPart); }
export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(DRUM_KITS.length === 5, "5 kits");
  assert(new Set(DRUM_KITS.map((kit) => kit.id)).size === DRUM_KITS.length, "unique ids");
  assert(DRUM_KITS.every(kit => DRUM_PARTS.every(part => kit.parts[part] !== "")), "5 parts non-empty");
  assert(drumUrl(drumKit("tr808")!, "kick") === "https://smpldsnds.github.io/drum-machines/TR-808/kick/bd5025.ogg", "drumUrl");
  assert(drumKit("nope") === undefined, "drumKit");
  assert(isDrumPart("open") && !isDrumPart("tom"), "isDrumPart");
}
