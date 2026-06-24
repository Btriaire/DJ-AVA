import { useState } from "react";
import Icon from "./Icon";

type RuleDef = { icon: string; lines: string[] };

const RULES: Partial<Record<string, RuleDef>> = {
  sudoku:     { icon: "sudoku",    lines: ["Remplissez la grille : chaque chiffre doit apparaître une seule fois par ligne, colonne et carré.", "Touchez une case vide, puis choisissez le chiffre.", "Utilisez les indices si vous bloquez."] },
  memory:     { icon: "memory",    lines: ["Mode Paires : retournez 2 cartes ; identiques, elles restent visibles.", "Mode Trios : retrouvez 3 cartes identiques d'un coup.", "Retrouvez tous les groupes pour gagner !"] },
  logique:    { icon: "logic",     lines: ["Une suite de nombres vous est présentée.", "Trouvez le motif et choisissez le nombre manquant, puis appuyez sur Suivant.", "Une manche de 20 suites : le résultat et le diplôme s'affichent à la fin (14/20 pour réussir)."] },
  motscroises:{ icon: "crossword", lines: ["Lisez la définition et trouvez le mot.", "Tapez les lettres dans les cases de la grille.", "Complétez toutes les cases pour gagner !"] },
  citations:  { icon: "quote",     lines: ["Une citation célèbre avec un mot manquant vous est proposée.", "Choisissez un mot, puis appuyez sur Suivant (sans savoir si c'est juste).", "Une manche de 20 citations : le résultat et le diplôme s'affichent à la fin (14/20 pour réussir)."] },
  tangram:    { icon: "tangram",   lines: ["Touchez une pièce en bas pour la choisir.", "Puis touchez l'emplacement de la silhouette où elle va.", "Aux niveaux supérieurs, tournez la pièce avec ⟳ avant de la poser."] },
  formes:     { icon: "shapes",    lines: ["Parmi les formes affichées, l'une est différente des autres.", "Observez la couleur, la forme ou la taille.", "Touchez l'intrus pour gagner !"] },
  mahjong:    { icon: "mahjong",   lines: ["Retirez les tuiles par paires identiques.", "Une tuile est jouable si elle est libre sur au moins un côté.", "Videz tout le plateau pour gagner !"] },
  puzzle:     { icon: "puzzle",    lines: ["Les pièces de l'image sont mélangées.", "Touchez une pièce puis sa destination pour l'échanger.", "Reconstituez l'image complète pour gagner !"] },
  couleurs:   { icon: "palette",   lines: ["Une question sur les couleurs ou les expressions vous est posée.", "Choisissez une réponse, puis appuyez sur Suivant.", "Une manche de 20 questions : le résultat et le diplôme s'affichent à la fin (14/20 pour réussir)."] },
  calcul:     { icon: "calc",      lines: ["Placez les opérateurs +, − ou × entre les nombres.", "Touchez un signe pour le changer dans l'ordre.", "Atteignez le résultat cible indiqué après le =."] },
  rapidite:   { icon: "target",    lines: ["Des cibles apparaissent aléatoirement à l'écran.", "Touchez-les le plus vite possible avant qu'elles disparaissent !", "10 cibles par manche — mesurez votre temps de réaction."] },
  feuvert:    { icon: "flash",     lines: ["Touchez l'écran uniquement quand le rond devient VERT.", "Au ROUGE, ne touchez pas : résistez à l'impulsion !", "Ne touchez pas non plus pendant l'attente. 12 tours par manche."] },
  ordre:      { icon: "order",     lines: ["Des nombres sont mélangés dans la grille.", "Touchez-les dans l'ordre croissant : 1, 2, 3…", "Allez le plus vite possible, sans vous tromper !"] },
  stroop:     { icon: "palette",   lines: ["Un mot de couleur s'affiche, écrit dans une autre couleur.", "Touchez la couleur de l'ENCRE, pas le mot que vous lisez.", "Exemple : « ROUGE » écrit en vert → répondez Vert."] },
  simon:      { icon: "flower",    lines: ["Les pétales de la fleur s'allument l'un après l'autre.", "Mémorisez l'ordre, puis touchez-les dans le même ordre.", "La suite s'allonge à chaque réussite. Tenez le plus longtemps !"] },
  dames:      { icon: "dames",     lines: ["Vous jouez les pions blancs (bas du plateau).", "Déplacez vos pions en diagonale pour capturer ceux de l'adversaire.", "Les prises sont obligatoires. Atteignez la rangée adverse pour devenir Dame !"] },
  culture:    { icon: "globe",     lines: ["Une question de culture générale vous est posée.", "Choisissez une réponse, puis appuyez sur Suivant.", "Une manche de 20 questions : le résultat et le diplôme s'affichent à la fin (14/20 pour réussir)."] },
  philo:      { icon: "scroll",    lines: ["Mode « Qui a dit ? » : une citation s'affiche, trouvez le philosophe.", "Mode « Laquelle ? » : un philosophe s'affiche, trouvez sa citation.", "Une manche de 20 questions : le résultat et le diplôme s'affichent à la fin (14/20 pour réussir)."] },
  motsmeles:  { icon: "grid",      lines: ["Des mots d'un même thème sont cachés dans la grille.", "Touchez les lettres une à une pour tracer un mot (toutes directions).", "Retrouvez tous les mots de la liste pour gagner !"] },
  anagrammes: { icon: "letters",   lines: ["Les lettres d'un mot sont mélangées.", "Touchez les lettres pour les placer dans le bon ordre.", "Aidez-vous de la définition et des indices si besoin !"] },
  motmystere: { icon: "bulb",      lines: ["Devinez le mot caché ; la 1re lettre est donnée.", "Tapez un mot puis « Entrée » : vert = bien placé, orangé = mal placé, gris = absent.", "6 essais. L'indice révèle la définition du mot !"] },
  pyramide:   { icon: "cards",     lines: ["Touchez deux cartes libres dont la somme fait 13 pour les retirer.", "As = 1, Valet = 11, Dame = 12, Roi = 13 (le Roi se retire seul).", "Piochez si besoin, puis dégagez toute la pyramide !"] },
  plusmoins:  { icon: "hilo",      lines: ["Une carte est face visible. Devinez la suivante.", "Annoncez si elle sera plus haute ou plus basse (As = 1, Roi = 13).", "Enchaînez les bonnes réponses sans vous tromper !"] },
  puissance4: { icon: "connect4",  lines: ["Vous jouez les jetons rouges contre l'ordinateur.", "Touchez une colonne pour y laisser tomber un jeton.", "Alignez 4 jetons (ligne, colonne ou diagonale) pour gagner !"] },
};

const SEEN_KEY = "ec.rules.seen";
function getSeen(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); }
}
function markSeen(game: string) {
  const s = getSeen(); s.add(game);
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {}
}

export default function GameRules({ game }: { game: string }) {
  const def = RULES[game];
  const [dismissed, setDismissed] = useState(() => getSeen().has(game));
  if (!def || dismissed) return null;

  function close() { markSeen(game); setDismissed(true); }

  return (
    <div className="rules-overlay" role="dialog" aria-modal="true">
      <div className="rules-card">
        <div className="rules-icon"><Icon name={def.icon} size={32} /></div>
        <h2 className="rules-title">Comment jouer ?</h2>
        <ul className="rules-list">
          {def.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        <button className="btn rules-btn" onClick={close} autoFocus>Jouer !</button>
      </div>
    </div>
  );
}
