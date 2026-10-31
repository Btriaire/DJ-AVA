// What each Rack effect does, in words a DJ uses, and 4 ready-made variations per effect.
// A variation sets the dosage and every param; `stem` aims it at that stem when the stems play.
import type { RackModuleId } from "./Rack";

export type GuideStem = "drums" | "bass" | "other" | "vocals";
export interface RackVariation { name: string; desc: string; mix: number; params: Record<string, number>; flags?: Record<string, boolean>; stem?: GuideStem }
export interface RackGuide { hear: string; tip: string; variations: RackVariation[] }

export const RACK_GUIDE: Partial<Record<RackModuleId, RackGuide>> = {
  isolator: {
    hear: "Tu entends le centre de la stéréo seul (souvent la voix), ou tout sauf le centre en KARAOKÉ.",
    tip: "Sans stems : sortir une voix ou la retirer pour un passage instrumental.",
    variations: [
      { name: "Voix devant", desc: "Le centre ressort, les côtés reculent un peu", mix: 0.6, params: { focus: 0.6 }, flags: { karaoke: false } },
      { name: "Centre seul", desc: "Presque plus que la voix et la grosse caisse", mix: 1, params: { focus: 1 }, flags: { karaoke: false } },
      { name: "Karaoké", desc: "La voix disparaît, la musique reste", mix: 1, params: { focus: 0.9 }, flags: { karaoke: true } },
      { name: "Voix lointaine", desc: "La voix recule derrière la musique", mix: 0.5, params: { focus: 0.6 }, flags: { karaoke: true } },
    ],
  },
  autotune: {
    hear: "Tu entends la voix collée aux notes de la tonalité, du naturel jusqu’à l’effet robot.",
    tip: "Sur le stem Voix uniquement : le refrain qui devient un tube électro.",
    variations: [
      { name: "Juste", desc: "La voix est corrigée sans que ça s’entende", mix: 1, params: { amount: 0.6, retune: 0.6, key: 0, scale: 0 }, stem: "vocals" },
      { name: "T-Pain", desc: "Les notes sautent net de l’une à l’autre", mix: 1, params: { amount: 1, retune: 0, key: 0, scale: 0 }, stem: "vocals" },
      { name: "Majeur", desc: "Effet net, seulement les notes de la gamme majeure", mix: 1, params: { amount: 1, retune: 0.1, key: 0, scale: 1 }, stem: "vocals" },
      { name: "Mineur", desc: "Effet net, couleur sombre de la gamme mineure", mix: 1, params: { amount: 1, retune: 0.1, key: 9, scale: 2 }, stem: "vocals" },
    ],
  },
  comp: {
    hear: "Tu entends les écarts de volume se resserrer : le son colle et tape plus fort.",
    tip: "Sur la batterie pour du punch, sur la voix pour qu’elle reste devant.",
    variations: [
      { name: "Colle douce", desc: "Le mix se tient mieux, rien ne dépasse", mix: 1, params: { thresh: -18, ratio: 2, gain: 4 } },
      { name: "Batterie qui tape", desc: "Kick et caisse claire plus serrés et plus forts", mix: 1, params: { thresh: -24, ratio: 6, gain: 8 }, stem: "drums" },
      { name: "Voix devant", desc: "La voix reste au même niveau, toujours lisible", mix: 1, params: { thresh: -30, ratio: 4, gain: 9 }, stem: "vocals" },
      { name: "Écrasé", desc: "Tout est écrasé, le souffle de la pièce remonte", mix: 0.7, params: { thresh: -45, ratio: 16, gain: 18 } },
    ],
  },
  drive: {
    hear: "Tu entends le son chauffer : du grain, des harmoniques, puis une vraie saturation.",
    tip: "Sur la basse pour qu’elle s’entende sur petits haut-parleurs, ou sur tout pour salir une montée.",
    variations: [
      { name: "Lampe", desc: "Un peu de chaleur, le son s’épaissit", mix: 0.5, params: { drive: 0.25, tone: 0.5 } },
      { name: "Basse grasse", desc: "La basse grogne et passe partout", mix: 0.7, params: { drive: 0.6, tone: 0.35 }, stem: "bass" },
      { name: "Ampli rock", desc: "Saturation franche, aigus brillants", mix: 0.7, params: { drive: 0.8, tone: 0.8 } },
      { name: "Fuzz", desc: "Le son casse complètement, très agressif", mix: 0.5, params: { drive: 1, tone: 0.6 } },
    ],
  },
  wavefold: {
    hear: "Tu entends l’onde se replier sur elle-même : un son métallique, riche, presque synthé.",
    tip: "Sur la basse ou le stem Autre pour un grain de synthé modulaire.",
    variations: [
      { name: "Grain synthé", desc: "Des harmoniques en plus, encore musical", mix: 0.4, params: { fold: 0.3, tone: 0.6 } },
      { name: "Basse modulaire", desc: "La basse devient un synthé qui grince", mix: 0.6, params: { fold: 0.6, tone: 0.4 }, stem: "bass" },
      { name: "Métal", desc: "Son de tôle brillant et dur", mix: 0.5, params: { fold: 0.8, tone: 0.9 } },
      { name: "Chaos", desc: "Repli maximal, le son se déchire", mix: 0.5, params: { fold: 1, tone: 0.5 } },
    ],
  },
  crush: {
    hear: "Tu entends le son devenir lo-fi (grain et aliasing de vieille console), ou une voix de robot quand ROBOT monte.",
    tip: "Sur la batterie pour un breakbeat lo-fi, sur la voix pour un robot.",
    variations: [
      { name: "Lo-fi", desc: "Grain de vieille console de jeu, encore propre", mix: 0.5, params: { bits: 6, down: 3, robot: 0, shift: 0, tone: 1200 } },
      { name: "Breakbeat sale", desc: "La batterie grésille fort, très années 90", mix: 0.7, params: { bits: 3, down: 8, robot: 0, shift: 0, tone: 1200 }, stem: "drums" },
      { name: "Robot", desc: "La voix devient métallique et nasillarde", mix: 1, params: { bits: 4, down: 1, robot: 1, shift: 60, tone: 1400 }, stem: "vocals" },
      { name: "Talkie-walkie", desc: "Son de radio étroit et cassé", mix: 1, params: { bits: 5, down: 4, robot: 0.7, shift: 0, tone: 2200 } },
    ],
  },
  ringmod: {
    hear: "Tu entends les fréquences décalées : le son devient cloche, métal ou extraterrestre.",
    tip: "Petites doses sur le stem Autre, ou à fond pendant une coupure.",
    variations: [
      { name: "Cloche", desc: "Reflets de cloche sur les notes", mix: 0.4, params: { freq: 120, depth: 1 } },
      { name: "Désaccord", desc: "Tout sonne légèrement faux, inquiétant", mix: 0.3, params: { freq: 15, depth: 1 } },
      { name: "Alien", desc: "Voix et instruments méconnaissables", mix: 0.7, params: { freq: 450, depth: 1 }, stem: "vocals" },
      { name: "Descente", desc: "Décalage vers le bas, son sombre et creux", mix: 0.5, params: { freq: -300, depth: 1 } },
    ],
  },
  voyelle: {
    hear: "Tu entends le son prononcer des voyelles (a, é, ou…), comme s’il parlait.",
    tip: "Sur le stem Autre ou la basse, avec un balayage calé sur le tempo : wah qui parle.",
    variations: [
      { name: "Ouah ouah", desc: "Le son dit « oua » à chaque temps", mix: 0.8, params: { set: 3, morph: 0.4, size: 1, auto: 2, reso: 8, div: 4 } },
      { name: "Chœur", desc: "Voyelles de chœur, son aérien", mix: 0.6, params: { set: 2, morph: 0.5, size: 1.1, auto: 0.5, reso: 6, div: 6 } },
      { name: "Basse qui parle", desc: "La basse articule des voyelles graves", mix: 0.8, params: { set: 0, morph: 0.3, size: 0.8, auto: 4, reso: 10, div: 2 }, stem: "bass" },
      { name: "Nasal", desc: "Son pincé « m-n-ng », fixe", mix: 0.7, params: { set: 4, morph: 0.6, size: 1, auto: 0, reso: 12, div: 0 } },
    ],
  },
  autowah: {
    hear: "Tu entends un filtre qui s’ouvre à chaque attaque : chaque coup fait « ouah ».",
    tip: "Sur la basse ou une guitare (stem Autre) pour du funk.",
    variations: [
      { name: "Funk", desc: "Chaque note s’ouvre en « ouah » franc", mix: 0.8, params: { base: 150, sens: -25, q: 5 }, stem: "other" },
      { name: "Basse élastique", desc: "La basse rebondit sur chaque note", mix: 0.8, params: { base: 80, sens: -20, q: 6 }, stem: "bass" },
      { name: "Doux", desc: "Le filtre respire, discret", mix: 0.6, params: { base: 250, sens: -12, q: 2 } },
      { name: "Couinement", desc: "Ouverture très résonnante, presque une voix", mix: 0.7, params: { base: 400, sens: -35, q: 9 } },
    ],
  },
  resonator: {
    hear: "Tu entends le son chanter sur une note, ou balayer comme un avion à réaction quand MOUVEMENT monte.",
    tip: "Sur la batterie pour qu’elle sonne accordée, ou un jet sur tout le mix avant un drop.",
    variations: [
      { name: "Batterie accordée", desc: "Chaque coup résonne sur la note La", mix: 0.5, params: { tune: 110, reso: 0.85, move: 0, rate: 0.5, div: 0 }, stem: "drums" },
      { name: "Jet", desc: "Balayage de réacteur sur 2 mesures", mix: 0.6, params: { tune: 400, reso: 0.7, move: 0.8, rate: 0.5, div: 7 } },
      { name: "Flanger", desc: "Vague métallique calée sur la mesure", mix: 0.5, params: { tune: 800, reso: 0.5, move: 0.6, rate: 0.5, div: 6 } },
      { name: "Tuyau", desc: "Son creux de tube, fixe", mix: 0.6, params: { tune: 300, reso: 0.9, move: 0, rate: 0.5, div: 0 } },
    ],
  },
  gate: {
    hear: "Tu entends le son coupé en rythme : hachage on/off calé sur le tempo.",
    tip: "Sur une nappe ou le stem Autre pour la trance, ou sur tout pour annoncer un drop.",
    variations: [
      { name: "Trance 1/16", desc: "Hachage rapide en doubles croches", mix: 1, params: { rate: 8, depth: 1, div: 1 }, stem: "other" },
      { name: "Croches", desc: "Le son tombe une croche sur deux", mix: 1, params: { rate: 4, depth: 1, div: 2 } },
      { name: "Pompe douce", desc: "Le son respire en rythme sans se couper", mix: 1, params: { rate: 4, depth: 0.5, div: 2 } },
      { name: "Hachoir", desc: "Coupures très serrées, effet mitraillette", mix: 1, params: { rate: 16, depth: 1, div: 0 } },
    ],
  },
  glitch: {
    hear: "Tu entends un petit bout du son répété en boucle, comme un disque rayé ; REPEAT le fige.",
    tip: "Sur la voix pour un bégaiement, sur la batterie pour un roulement avant le drop.",
    variations: [
      { name: "Bégaiement", desc: "La voix répète sa syllabe en doubles croches", mix: 0.7, params: { time: 0.12, fb: 0.6, div: 1 }, flags: { repeat: false }, stem: "vocals" },
      { name: "Roulement", desc: "La batterie roule en croches", mix: 0.7, params: { time: 0.25, fb: 0.7, div: 2 }, flags: { repeat: false }, stem: "drums" },
      { name: "Disque rayé", desc: "Le son se fige sur une double croche", mix: 1, params: { time: 0.12, fb: 0.9, div: 1 }, flags: { repeat: true } },
      { name: "Grain", desc: "Répétitions minuscules, son granuleux", mix: 0.5, params: { time: 0.03, fb: 0.5, div: 0 }, flags: { repeat: false } },
    ],
  },
  shimmer: {
    hear: "Tu entends une réverbération qui monte d’une octave : une nappe brillante, céleste.",
    tip: "Sur la voix ou le stem Autre dans un break, jamais sur la basse.",
    variations: [
      { name: "Halo", desc: "Une lueur discrète derrière la voix", mix: 0.25, params: { decay: 3, shimmer: 0.35 }, stem: "vocals" },
      { name: "Cathédrale", desc: "Nappe immense qui reste après chaque phrase", mix: 0.45, params: { decay: 7, shimmer: 0.6 }, stem: "vocals" },
      { name: "Étoiles", desc: "Scintillement aigu au-dessus des accords", mix: 0.4, params: { decay: 5, shimmer: 0.85 }, stem: "other" },
      { name: "Break ambient", desc: "Tout le morceau se transforme en nappe", mix: 0.6, params: { decay: 8, shimmer: 0.7 } },
    ],
  },
  delay: {
    hear: "Tu entends le son répété en échos calés sur le tempo, qui s’éloignent.",
    tip: "Sur la voix en fin de phrase, ou sur la caisse claire pour du dub.",
    variations: [
      { name: "Fin de phrase", desc: "La voix se répète en 1/8 pointé et s’éteint", mix: 0.3, params: { time: 0.38, fb: 0.45, div: 3 }, flags: { pingpong: false }, stem: "vocals" },
      { name: "Ping-pong", desc: "Les échos sautent de gauche à droite en croches", mix: 0.3, params: { time: 0.25, fb: 0.5, div: 2 }, flags: { pingpong: true } },
      { name: "Dub", desc: "Caisse claire en échos longs à la noire", mix: 0.4, params: { time: 0.5, fb: 0.7, div: 4 }, flags: { pingpong: true }, stem: "drums" },
      { name: "Sortie en écho", desc: "Échos d’une demi-mesure qui durent : pour finir un morceau", mix: 0.5, params: { time: 1, fb: 0.8, div: 5 }, flags: { pingpong: false } },
    ],
  },
  reverb: {
    hear: "Tu entends le son placé dans une pièce : petite salle, club ou cathédrale.",
    tip: "Sur la voix pour l’aérer, ou en grand sur tout le morceau pour une coupure.",
    variations: [
      { name: "Pièce", desc: "Un peu d’air autour, à peine audible", mix: 0.2, params: { decay: 0.8 } },
      { name: "Club", desc: "La voix sonne comme dans une grande salle", mix: 0.3, params: { decay: 2 }, stem: "vocals" },
      { name: "Caisse 80s", desc: "Grosse caisse claire réverbérée des années 80", mix: 0.35, params: { decay: 1.6 }, stem: "drums" },
      { name: "Cathédrale", desc: "Queue immense, le morceau flotte", mix: 0.5, params: { decay: 6 } },
    ],
  },
  loudness: {
    hear: "Tu entends le morceau plus fort et plus dense, sans jamais saturer.",
    tip: "Pour un vieux morceau trop faible ; CIBLE à 0 = simple sécurité contre la saturation.",
    variations: [
      { name: "Sécurité", desc: "Rien ne change, seuls les pics sont rattrapés", mix: 1, params: { target: 0, punch: 0.5, ceil: -1 } },
      { name: "Remaster", desc: "Un vieux morceau gagne en volume et en présence", mix: 1, params: { target: 0.5, punch: 0.6, ceil: -1 } },
      { name: "Club fort", desc: "Très dense et très fort, le kick reste net", mix: 1, params: { target: 0.8, punch: 0.8, ceil: -0.5 } },
      { name: "Écrasé", desc: "Volume maximal, le son devient plat", mix: 1, params: { target: 1, punch: 0.1, ceil: -0.5 } },
    ],
  },
  surround: {
    hear: "Tu entends la stéréo s’élargir, du mono serré à un son qui déborde des enceintes.",
    tip: "Sur le stem Autre pour l’ouvrir autour de la voix, ou mono pour une intro serrée.",
    variations: [
      { name: "Mono", desc: "Tout au centre, comme une vieille radio", mix: 1, params: { width: 0, depth: 0 } },
      { name: "Large", desc: "Le son s’ouvre, la voix reste au centre", mix: 1, params: { width: 1.4, depth: 0 } },
      { name: "Autour de la voix", desc: "Les instruments s’écartent, la voix respire", mix: 1, params: { width: 1.8, depth: 0 }, stem: "other" },
      { name: "Immersion", desc: "Très large, le centre recule", mix: 1, params: { width: 2, depth: 0.6 } },
    ],
  },
  exciter: {
    hear: "Tu entends des aigus plus brillants et plus présents, sans monter le volume.",
    tip: "Sur une voix terne ou une charleston étouffée.",
    variations: [
      { name: "Air", desc: "Un peu d’éclat tout en haut", mix: 0.4, params: { harm: 0.4, freq: 8000 } },
      { name: "Voix claire", desc: "La voix gagne en présence et en netteté", mix: 0.5, params: { harm: 0.6, freq: 4000 }, stem: "vocals" },
      { name: "Charleston", desc: "Les cymbales brillent et claquent", mix: 0.5, params: { harm: 0.7, freq: 6000 }, stem: "drums" },
      { name: "Grésillant", desc: "Aigus durs et poussés, effet radio", mix: 0.6, params: { harm: 1, freq: 2500 } },
    ],
  },
  transient: {
    hear: "Tu entends l’attaque des coups renforcée ou adoucie, et leur queue raccourcie ou allongée.",
    tip: "Sur la batterie : plus de claque ou au contraire des coups plus ronds.",
    variations: [
      { name: "Claque", desc: "Kick et caisse claire attaquent plus sec", mix: 1, params: { attack: 0.9, sustain: 0.6 }, stem: "drums" },
      { name: "Sec", desc: "Les coups sont courts, la pièce disparaît", mix: 1, params: { attack: 0.7, sustain: 0.1 }, stem: "drums" },
      { name: "Rond", desc: "Attaques adoucies, son plus moelleux", mix: 1, params: { attack: 0.1, sustain: 0.8 } },
      { name: "Gros sustain", desc: "Les notes et la pièce durent plus longtemps", mix: 1, params: { attack: 0.4, sustain: 1 } },
    ],
  },
  multiband: {
    hear: "Tu entends graves, médiums et aigus tenus chacun à leur niveau : un son plus égal et plus serré.",
    tip: "Pour tenir une basse qui déborde, ou calmer des aigus agressifs.",
    variations: [
      { name: "Basse tenue", desc: "Les graves ne débordent plus", mix: 1, params: { lo: 0.8, mid: 0.2, hi: 0.2 }, stem: "bass" },
      { name: "Médium chaud", desc: "Le milieu du spectre s’épaissit", mix: 1, params: { lo: 0.3, mid: 0.7, hi: 0.3 } },
      { name: "Aigus doux", desc: "Les sifflantes et cymbales se calment", mix: 1, params: { lo: 0.2, mid: 0.2, hi: 0.8 } },
      { name: "Master serré", desc: "Les trois bandes tenues, son de radio FM", mix: 1, params: { lo: 0.7, mid: 0.6, hi: 0.7 } },
    ],
  },
  phaser: {
    hear: "Tu entends le son tourner en vagues creuses, calées sur le tempo.",
    tip: "Sur le stem Autre ou la charleston, ou sur tout pendant une montée.",
    variations: [
      { name: "Vague lente", desc: "Une vague par mesure, discrète", mix: 0.5, params: { rate: 0.5, depth: 0.5, fb: 0.4, div: 6 } },
      { name: "Charleston qui tourne", desc: "Les cymbales tournent à la noire", mix: 0.7, params: { rate: 2, depth: 0.7, fb: 0.6, div: 4 }, stem: "drums" },
      { name: "Montée", desc: "Grande vague de 2 mesures, très creusée", mix: 0.8, params: { rate: 0.25, depth: 1, fb: 0.8, div: 7 } },
      { name: "Hélice", desc: "Rotation rapide en croches, son de soucoupe", mix: 0.7, params: { rate: 4, depth: 0.6, fb: 0.7, div: 2 } },
    ],
  },
};

// every variation names real params inside their range, 4 distinct names, every module but EQ and XY covered
export function rackGuideTest(defs: { id: RackModuleId; params: { key: string; min: number; max: number }[]; flags?: { key: string }[] }[], startMix: Record<string, number>): void {
  for (const d of defs) {
    if (d.id === "eq" || d.id === "xymatrix") continue;
    const g = RACK_GUIDE[d.id];
    if (!g || g.variations.length !== 4) throw new Error(`guide ${d.id}`);
    if (!(startMix[d.id] > 0)) throw new Error(`start mix ${d.id}`);
    if (new Set(g.variations.map((v) => v.name)).size !== 4) throw new Error(`guide names ${d.id}`);
    for (const v of g.variations) {
      if (!(v.mix > 0 && v.mix <= 1)) throw new Error(`guide mix ${d.id} ${v.name}`);
      for (const p of d.params) {
        const x = v.params[p.key];
        if (typeof x !== "number" || x < p.min || x > p.max) throw new Error(`guide ${d.id} ${v.name} ${p.key}`);
      }
      for (const k of Object.keys(v.params)) if (!d.params.some((p) => p.key === k)) throw new Error(`guide ${d.id} ${v.name} unknown ${k}`);
      for (const k of Object.keys(v.flags ?? {})) if (!d.flags?.some((f) => f.key === k)) throw new Error(`guide ${d.id} flag ${k}`);
    }
  }
}
