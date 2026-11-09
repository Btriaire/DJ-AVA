// loop levels shared by the pad modules: drums loop at a note value, phrases loop on a fraction of their length
export const HIT_DIVS = [0, 1, 0.5, 0.25, 0.125] as const; // beats between two hits, 0 = auto (kick and snare 1/8, hat 1/16)
export const HIT_NAMES = ["Auto", "1/4", "1/8", "1/16", "1/32"];
export const PHRASE_FRACS = [1, 0.5, 0.25, 0.125] as const; // share of the phrase that loops
export const PHRASE_NAMES = ["Entière", "1/2", "1/4", "1/8"];
