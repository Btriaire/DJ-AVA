// Scènes pixel-art : chaque ligne est une rangée, chaque caractère une couleur.
// Grille 16×14. Palette colorée et lisible (style doux « Petit Bambou »).
export const PIXEL_PALETTE: Record<string, string> = {
  ".": "transparent",
  d: "#2f4a2c", // terre / vert foncé
  g: "#5aa17f", // herbe / montagne
  m: "#9aa0a6", // pierre (lanterne)
  s: "#f7fbff", // neige
  b: "#d4ecf5", // ciel
  B: "#6fb1c4", // eau
  r: "#c0392b", // rouge torii / queue
  k: "#7a2f22", // rouge sombre
  t: "#7a4a2b", // tronc
  f: "#f4b8c8", // fleurs de cerisier
  y: "#f6d365", // lueur (lanterne)
  o: "#f0883e", // soleil / carpe
  w: "#ffffff", // reflets / œil
};

// Mont Fuji enneigé au soleil levant
export const FUJI = [
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbboobb",
  "bbbbbbbbbbboooob",
  "bbbbbbbbbbbboobb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbssbbbbbbb",
  "bbbbbbgssgbbbbbb",
  "bbbbbgssssgbbbbb",
  "bbbbggssssggbbbb",
  "bbbggggssggggbbb",
  "bbggggggggggggbb",
  "bggggggggggggggb",
  "gggggggggggggggg",
  "dddddddddddddddd",
];

// Torii rouge devant l'eau
export const TORII = [
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "brrrrrrrrrrrrrrb",
  "bbrrrrrrrrrrrrbb",
  "bbbbrrbbbbrrbbbb",
  "bbbbrrbbbbrrbbbb",
  "bbbbrrbbbbrrbbbb",
  "bbbbrrbbbbrrbbbb",
  "BBBBrrBBBBrrBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "gggggggggggggggg",
  "dddddddddddddddd",
];

// Cerisier en fleurs (sakura)
export const SAKURA = [
  "bbbbbbbbbbbbbbbb",
  "bbbbbffffffbbbbb",
  "bbbffffffffffbbb",
  "bbffffffffffffbb",
  "bffffffffffffffb",
  "bbffffffffffffbb",
  "bbbffffffffffbbb",
  "bbbbbffttffbbbbb",
  "bbbbbbbttbbbbbbb",
  "bbbbbbbttbbbbbbb",
  "bbbbbbbttbbbbbbb",
  "gggggggggggggggg",
  "gggggggggggggggg",
  "dddddddddddddddd",
];

// Lanterne de pierre (tōrō) allumée
export const LANTERNE = [
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbmmbbbbbbb",
  "bbbbbbmmmmbbbbbb",
  "bbbbmmmmmmmmbbbb",
  "bbbbbmmmmmmbbbbb",
  "bbbbbmyyyymbbbbb",
  "bbbbbmyyyymbbbbb",
  "bbbbbmmmmmmbbbbb",
  "bbbbbbbmmbbbbbbb",
  "bbbbbbbmmbbbbbbb",
  "bbbbbmmmmmmbbbbb",
  "bbbbmmmmmmmmbbbb",
  "gggggggggggggggg",
  "dddddddddddddddd",
];

// Carpe koï dans l'étang
export const KOI = [
  "BBBBBBBBBBBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBoooBBBBBBBB",
  "BBBBoooooooBBBBB",
  "BBBooowoooooBBBB",
  "BBBoooooooooorBB",
  "BBBBoooooooorrBB",
  "BBBBBoooooorrBBB",
  "BBBBBBBoooBBBBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBBwBBBBBBwBBB",
  "BBBBBBBBBBBBBBBB",
  "BBBBwBBBBBwBBBBB",
  "BBBBBBBBBBBBBBBB",
];

// Soleil levant sur les collines
export const SOLEIL = [
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbooobbbbbb",
  "bbbbbooooooobbbb",
  "bbbboooooooobbbb",
  "bbbboooooooobbbb",
  "bbbbbooooooobbbb",
  "bbbbbbbooobbbbbb",
  "bbbbbbbbbbbbbbbb",
  "gggggggggggggggg",
  "gggggggggggggggg",
  "dddddddddddddddd",
  "gggggggggggggggg",
  "dddddddddddddddd",
  "dddddddddddddddd",
];

export type Scene = { key: string; title: string; rows: string[] };

export const SCENES: Scene[] = [
  { key: "fuji", title: "Mont Fuji", rows: FUJI },
  { key: "torii", title: "Torii", rows: TORII },
  { key: "sakura", title: "Cerisier", rows: SAKURA },
  { key: "lanterne", title: "Lanterne", rows: LANTERNE },
  { key: "koi", title: "Carpe koï", rows: KOI },
  { key: "soleil", title: "Soleil levant", rows: SOLEIL },
];
