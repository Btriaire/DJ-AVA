// Real drum machine kits: smpldsnds/drum-machines collection, public domain (MaRuche/Codestral); acoustic kits from VCSL (CC0), several velocity layers and takes per part
export type CorePart = "kick" | "snare" | "clap" | "hat" | "open";
export type ExtraPart = "tom" | "rim" | "perc" | "cymbal";
export type DrumPart = CorePart | ExtraPart;
export const CORE_PARTS: CorePart[] = ["kick", "snare", "clap", "hat", "open"];
export const DRUM_PARTS: DrumPart[] = [...CORE_PARTS, "tom", "rim", "perc", "cymbal"];
export interface DrumKitDef { id: string; label: string; style: string; folder: string; parts: Record<CorePart, string> & Partial<Record<ExtraPart, string>>; sfz?: Partial<Record<DrumPart, { sfz: string; key: number }>> }
export const DRUM_KITS: DrumKitDef[] = [
  { id: "lm2", label: "LinnDrum LM-2", style: "pop 80s", folder: "LM-2", parts: { kick: "kick", snare: "snare-m", clap: "clap", hat: "hhclosed", open: "hhopen", tom: "tom-m", rim: "stick-m", perc: "tambourine", cymbal: "crash" } },
  { id: "drumtraks", label: "Drumtraks", style: "acoustique 80s", folder: "Sequential-Circuits-Drumtraks", parts: { kick: "DT_Kick", snare: "DT_Snare", clap: "DT_Clap", hat: "DT_Closedhat", open: "DT_Openhat", tom: "DT_Tom01", rim: "DT_Rimshot", perc: "DT_Tamborine", cymbal: "DT_Crash" } },
  { id: "tr808", label: "TR-808", style: "hip-hop, électro", folder: "TR-808", parts: { kick: "kick/bd5025", snare: "snare/sd5050", clap: "clap/cp", hat: "hihat-close/ch", open: "hihat-open/oh25", tom: "mid-tom/mt50", rim: "rimshot/rs", perc: "cowbell/cb", cymbal: "cymbal/cy5050" } },
  { id: "mfb512", label: "MFB-512", style: "techno", folder: "MFB-512", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-mid", cymbal: "cymbal" } },
  { id: "cr8000", label: "CR-8000", style: "disco, italo", folder: "Roland-CR-8000", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-high", rim: "rimshot", perc: "cowbell", cymbal: "cymball" } },
  { id: "m808", label: "808 mini", style: "trap, hip-hop", folder: "808-mini", parts: { kick: "kick", snare: "snare-1", clap: "snare-2", hat: "hhclosed-1", open: "hhopen-1", tom: "tom-mid", cymbal: "crash" } },
  { id: "rz1", label: "Casio RZ-1", style: "lo-fi 80s", folder: "Casio-RZ1", parts: { kick: "kick", snare: "snare", clap: "clap", hat: "hihat-closed", open: "hihat-open", tom: "tom-2", rim: "clave", perc: "cowbell", cymbal: "crash" } },
  { id: "mr10", label: "Yamaha MR-10", style: "rétro, lo-fi", folder: "Yamaha-MR10", parts: { kick: "kick", snare: "snare", clap: "shortsn", hat: "chihat", open: "ohihat", tom: "midtom", perc: "shaker", cymbal: "crash" } },
  { id: "sk1", label: "Casio SK-1", style: "lo-fi, chiptune", folder: "Casio-SK1", parts: { kick: "kick", snare: "snare", clap: "snare", hat: "hithat", open: "hihat-open", tom: "tom-hi" } },
  // acoustic kits: each part is a multisampled VCSL bank (velocity layers, round robins), one key of it
  { id: "acoustic", label: "Studio acoustique", style: "batterie réelle", folder: "", parts: { kick: "Bass Drum 1", snare: "Snare Drum, Modern 1", clap: "Claps", hat: "Hi-Hat Cymbal", open: "Hi-Hat Cymbal", tom: "Tom 1", rim: "Snare Drum, Modern 1", perc: "Tambourine 1", cymbal: "Suspended Cymbal 1" }, sfz: { kick: { sfz: "vcsl/Struck Membranophones/bass-drum-1.websfz.json", key: 60 }, snare: { sfz: "vcsl/Struck Membranophones/snare-drum-modern-1.websfz.json", key: 61 }, clap: { sfz: "vcsl/Struck Idiophones/claps.websfz.json", key: 60 }, hat: { sfz: "vcsl/Struck Idiophones/hihat-cymbal.websfz.json", key: 42 }, open: { sfz: "vcsl/Struck Idiophones/hihat-cymbal.websfz.json", key: 46 }, tom: { sfz: "vcsl/Struck Membranophones/tom-1.websfz.json", key: 62 }, rim: { sfz: "vcsl/Struck Membranophones/snare-drum-modern-1.websfz.json", key: 64 }, perc: { sfz: "vcsl/Struck Idiophones/tambourine-1.websfz.json", key: 60 }, cymbal: { sfz: "vcsl/Struck Idiophones/suspended-cymbal-1.websfz.json", key: 68 } } },
  { id: "acoustic_dry", label: "Studio sec", style: "batterie réelle, mate", folder: "", parts: { kick: "Bass Drum 2", snare: "Snare Drum, Modern 2", clap: "Claps", hat: "Hi-Hat Cymbal", open: "Hi-Hat Cymbal", tom: "Tom 2", rim: "Snare Drum, Modern 3", perc: "Cowbells", cymbal: "Suspended Cymbal 1" }, sfz: { kick: { sfz: "vcsl/Struck Membranophones/bass-drum-2.websfz.json", key: 62 }, snare: { sfz: "vcsl/Struck Membranophones/snare-drum-modern-2.websfz.json", key: 61 }, clap: { sfz: "vcsl/Struck Idiophones/claps.websfz.json", key: 61 }, hat: { sfz: "vcsl/Struck Idiophones/hihat-cymbal.websfz.json", key: 42 }, open: { sfz: "vcsl/Struck Idiophones/hihat-cymbal.websfz.json", key: 43 }, tom: { sfz: "vcsl/Struck Membranophones/tom-2.websfz.json", key: 62 }, rim: { sfz: "vcsl/Struck Membranophones/snare-drum-modern-3.websfz.json", key: 62 }, perc: { sfz: "vcsl/Struck Idiophones/cowbells.websfz.json", key: 62 }, cymbal: { sfz: "vcsl/Struck Idiophones/suspended-cymbal-1.websfz.json", key: 69 } } },
  { id: "world", label: "Percussions du monde", style: "congas, bongos, shaker", folder: "", parts: { kick: "Conga", snare: "Bongos", clap: "Claps", hat: "Shaker, Small", open: "Tambourine 1", tom: "Conga", rim: "Woodblock", perc: "Cowbells", cymbal: "Suspended Cymbal 1" }, sfz: { kick: { sfz: "vcsl/Struck Membranophones/conga.websfz.json", key: 65 }, snare: { sfz: "vcsl/Struck Membranophones/bongos.websfz.json", key: 60 }, clap: { sfz: "vcsl/Struck Idiophones/claps.websfz.json", key: 60 }, hat: { sfz: "vcsl/Struck Idiophones/shaker-small.websfz.json", key: 61 }, open: { sfz: "vcsl/Struck Idiophones/tambourine-1.websfz.json", key: 62 }, tom: { sfz: "vcsl/Struck Membranophones/conga.websfz.json", key: 61 }, rim: { sfz: "vcsl/Struck Idiophones/woodblock.websfz.json", key: 60 }, perc: { sfz: "vcsl/Struck Idiophones/cowbells.websfz.json", key: 62 }, cymbal: { sfz: "vcsl/Struck Idiophones/suspended-cymbal-1.websfz.json", key: 69 } } },
];
export function drumKit(id: string): DrumKitDef | undefined { return DRUM_KITS.find(kit => kit.id === id); }
export function drumUrl(kit: DrumKitDef, part: DrumPart): string | null { return !kit.sfz && part in kit.parts ? `https://smpldsnds.github.io/drum-machines/${kit.folder}/${kit.parts[part as keyof typeof kit.parts]}.ogg` : null; }
export function isDrumPart(x: string): x is DrumPart { return DRUM_PARTS.includes(x as DrumPart); }
export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(DRUM_KITS.length === 12, "12 kits");
  assert(drumUrl(drumKit("acoustic")!, "kick") === null && CORE_PARTS.every((p) => drumKit("acoustic")!.sfz![p]), "acoustic kits: every core part from a bank");
  assert(new Set(DRUM_KITS.map((kit) => kit.id)).size === DRUM_KITS.length, "unique ids");
  assert(DRUM_KITS.every(kit => CORE_PARTS.every(part => kit.parts[part] !== "")), "5 parts non-empty");
  assert(drumUrl(drumKit("tr808")!, "kick") === "https://smpldsnds.github.io/drum-machines/TR-808/kick/bd5025.ogg", "drumUrl");
  assert(drumUrl(drumKit("mfb512")!, "perc") === null, "drumUrl");
  assert(drumUrl(drumKit("rz1")!, "perc")!.endsWith("Casio-RZ1/cowbell.ogg"), "drumUrl");
  assert(isDrumPart("tom") && !isDrumPart("bell"), "isDrumPart");
  assert(drumKit("nope") === undefined, "drumKit");
}
