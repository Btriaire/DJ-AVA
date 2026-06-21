// Jeu « De toutes les couleurs » — adapté d'une fiche d'atelier mémoire.
// Trois familles : mélanges de peinture, expressions noir/blanc, titres d'œuvres.
export type ColorQ = {
  prompt: string;
  answer: string;
  distractors: string[];
  note?: string; // précision affichée après la réponse
};

const MELANGES: ColorQ[] = [
  { prompt: "En peinture : ROUGE + BLEU = ?", answer: "Violet", distractors: ["Vert", "Orange", "Marron"] },
  { prompt: "En peinture : BLEU + JAUNE = ?", answer: "Vert", distractors: ["Violet", "Orange", "Gris"] },
  { prompt: "En peinture : JAUNE + ROUGE = ?", answer: "Orange", distractors: ["Vert", "Violet", "Rose"] },
  { prompt: "En peinture : ROUGE + BLEU + JAUNE = ?", answer: "Marron", distractors: ["Noir", "Gris", "Vert"] },
  { prompt: "En peinture : ROUGE + BLANC = ?", answer: "Rose", distractors: ["Orange", "Violet", "Beige"] },
  { prompt: "En peinture : NOIR + BLANC = ?", answer: "Gris", distractors: ["Beige", "Bleu", "Marron"] },
  { prompt: "En peinture : VERT + ROUGE = ?", answer: "Marron", distractors: ["Orange", "Gris", "Noir"] },
  { prompt: "En peinture : BLEU + BLANC = ?", answer: "Bleu ciel", distractors: ["Turquoise", "Gris", "Violet"] },
];

const NOIR_BLANC: ColorQ[] = [
  { prompt: "À la télé, le carré ___", answer: "blanc", distractors: ["noir"] },
  { prompt: "Dans la rue, un blouson ___", answer: "noir", distractors: ["blanc"] },
  { prompt: "En dessert, la crème Mont ___", answer: "blanc", distractors: ["noir"] },
  { prompt: "Le pétrole, l'or ___", answer: "noir", distractors: ["blanc"] },
  { prompt: "À l'élection, le vote ___", answer: "blanc", distractors: ["noir"] },
  { prompt: "Aux échecs, le joueur ___ démarre", answer: "blanc", distractors: ["noir"] },
  { prompt: "En boxe, un œil au beurre ___", answer: "noir", distractors: ["blanc"] },
  { prompt: "Pendant la guerre, le marché ___", answer: "noir", distractors: ["blanc"] },
  { prompt: "Au cirque, le clown ___", answer: "blanc", distractors: ["noir"] },
  { prompt: "À la banque, un chèque en ___", answer: "blanc", distractors: ["noir"] },
  { prompt: "Travailler au ___ (sans déclarer)", answer: "noir", distractors: ["blanc"] },
  { prompt: "Passer une nuit ___ (sans dormir)", answer: "blanche", distractors: ["noire"] },
  { prompt: "Montrer patte ___ pour entrer", answer: "blanche", distractors: ["noire"] },
  { prompt: "Être la bête ___ de quelqu'un", answer: "noire", distractors: ["blanche"] },
  { prompt: "Se mettre dans une colère ___", answer: "noire", distractors: ["blanche"] },
  { prompt: "Brandir le drapeau ___ (se rendre)", answer: "blanc", distractors: ["noir"] },
];

const TITRES: ColorQ[] = [
  { prompt: "Film de Luc Besson : « Le Grand ___ »", answer: "Bleu", distractors: ["Rouge", "Vert", "Noir"], note: "Luc Besson, 1988" },
  { prompt: "Film de Melville : « Le Cercle ___ »", answer: "Rouge", distractors: ["Noir", "Bleu", "Blanc"], note: "Jean-Pierre Melville, 1970" },
  { prompt: "Film de Kubrick : « ___ mécanique »", answer: "Orange", distractors: ["Rouge", "Jaune", "Bleu"], note: "Stanley Kubrick, 1971" },
  { prompt: "Film musical : « Moulin ___ »", answer: "Rouge", distractors: ["Bleu", "Vert", "Doré"], note: "John Huston, 1952" },
  { prompt: "Comédie de Blake Edwards : « La Panthère ___ »", answer: "Rose", distractors: ["Noire", "Grise", "Rouge"], note: "Blake Edwards, 1963" },
  { prompt: "Film de Truffaut : « La Mariée était en ___ »", answer: "Noir", distractors: ["Blanc", "Rouge", "Bleu"], note: "François Truffaut, 1968" },
  { prompt: "Roman de Stendhal : « Le ___ et le Noir »", answer: "Rouge", distractors: ["Bleu", "Blanc", "Vert"], note: "Stendhal, 1830" },
  { prompt: "Roman de Jules Verne : « Le Rayon ___ »", answer: "Vert", distractors: ["Bleu", "Doré", "Rouge"], note: "Jules Verne, 1882" },
  { prompt: "Roman de G. Leroux : « Le Mystère de la chambre ___ »", answer: "Jaune", distractors: ["Rouge", "Noire", "Bleue"], note: "Gaston Leroux, 1907" },
  { prompt: "Roman de Simenon : « Le Chien ___ »", answer: "Jaune", distractors: ["Noir", "Blanc", "Roux"], note: "Georges Simenon, 1931" },
  { prompt: "Roman de Marcel Aymé : « La Jument ___ »", answer: "Verte", distractors: ["Blanche", "Noire", "Grise"], note: "Marcel Aymé, 1933" },
  { prompt: "Roman de R. Deforges : « La Bicyclette ___ »", answer: "Bleue", distractors: ["Rouge", "Verte", "Blanche"], note: "Régine Deforges, 1981" },
];

export const COULEURS: ColorQ[] = [...MELANGES, ...NOIR_BLANC, ...TITRES];

export function randomColorQ(): ColorQ {
  return COULEURS[Math.floor(Math.random() * COULEURS.length)];
}
