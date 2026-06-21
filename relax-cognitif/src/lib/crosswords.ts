export type Clue = { row: number; col: number; len: number; text: string };
export type Crossword = {
  title: string;
  size: number;
  solution: string[]; // rows, '#' = case noire
  across: Clue[];
  down: Clue[];
};

export const CROSSWORDS: Crossword[] = [
  {
    title: "Petite 1",
    size: 4,
    solution: ["PARC", "E#A#", "AMIS", "U#D#"],
    across: [
      { row: 0, col: 0, len: 4, text: "Espace vert public" },
      { row: 2, col: 0, len: 4, text: "Camarades proches" },
    ],
    down: [
      { row: 0, col: 0, len: 4, text: "Elle recouvre le corps" },
      { row: 0, col: 2, len: 4, text: "Attaque militaire rapide" },
    ],
  },
  {
    title: "Petite 2",
    size: 4,
    solution: ["ROSE", "I#O#", "NUIT", "G#R#"],
    across: [
      { row: 0, col: 0, len: 4, text: "Fleur parfumée" },
      { row: 2, col: 0, len: 4, text: "Quand il fait sombre" },
    ],
    down: [
      { row: 0, col: 0, len: 4, text: "Estrade carrée du boxeur" },
      { row: 0, col: 2, len: 4, text: "Fin de la journée" },
    ],
  },
  {
    title: "Grande 1",
    size: 5,
    solution: ["ABUSE", "R#L#L", "MOTTE", "E#R#V", "ETAGE"],
    across: [
      { row: 0, col: 0, len: 5, text: "Excès, usage exagéré" },
      { row: 2, col: 0, len: 5, text: "Bloc de terre détaché" },
      { row: 4, col: 0, len: 5, text: "Niveau d'un immeuble" },
    ],
    down: [
      { row: 0, col: 0, len: 5, text: "Ensemble des soldats d'un pays" },
      { row: 0, col: 2, len: 5, text: "Préfixe signifiant « au-delà »" },
      { row: 0, col: 4, len: 5, text: "Écolier, écolière" },
    ],
  },
  {
    title: "Grande 2",
    size: 5,
    solution: ["PROFS", "L#R#C", "AVARE", "G#G#N", "ELEVE"],
    across: [
      { row: 0, col: 0, len: 5, text: "Enseignants (familier)" },
      { row: 2, col: 0, len: 5, text: "Qui déteste dépenser" },
      { row: 4, col: 0, len: 5, text: "Écolier, écolière" },
    ],
    down: [
      { row: 0, col: 0, len: 5, text: "Bord de mer sablonneux" },
      { row: 0, col: 2, len: 5, text: "Pluie avec éclairs et tonnerre" },
      { row: 0, col: 4, len: 5, text: "Plateau de théâtre" },
    ],
  },
];
