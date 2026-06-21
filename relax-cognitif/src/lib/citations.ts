export type Citation = {
  template: string; // contient "___" à l'emplacement du mot manquant
  answer: string;
  distractors: [string, string];
  author: string;
};

export const CITATIONS: Citation[] = [
  { template: "Je pense, donc je ___.", answer: "suis", distractors: ["vis", "rêve"], author: "René Descartes" },
  { template: "L'enfer, c'est les ___.", answer: "autres", distractors: ["gens", "ennuis"], author: "Jean-Paul Sartre" },
  { template: "Connais-toi toi-___.", answer: "même", distractors: ["seul", "ami"], author: "Socrate" },
  { template: "Le ___ est un roseau pensant.", answer: "homme", distractors: ["sage", "monde"], author: "Blaise Pascal" },
  { template: "La fin justifie les ___.", answer: "moyens", distractors: ["actes", "guerres"], author: "Nicolas Machiavel" },
  { template: "Rien ne sert de ___, il faut partir à point.", answer: "courir", distractors: ["crier", "gagner"], author: "Jean de La Fontaine" },
  { template: "Aide-toi, le ___ t'aidera.", answer: "ciel", distractors: ["sort", "roi"], author: "Jean de La Fontaine" },
  { template: "Veni, vidi, ___.", answer: "vici", distractors: ["vidi", "vita"], author: "Jules César" },
  { template: "Les hommes naissent ___ et égaux en droits.", answer: "libres", distractors: ["frères", "nobles"], author: "Déclaration de 1789" },
  { template: "Après moi, le ___.", answer: "déluge", distractors: ["silence", "chaos"], author: "Louis XV" },
  { template: "L'exactitude est la politesse des ___.", answer: "rois", distractors: ["sages", "grands"], author: "Louis XVIII" },
  { template: "L'habit ne fait pas le ___.", answer: "moine", distractors: ["roi", "héros"], author: "Proverbe" },
  { template: "Petit à petit, l'oiseau fait son ___.", answer: "nid", distractors: ["vol", "chant"], author: "Proverbe" },
  { template: "La ___ est un plat qui se mange froid.", answer: "vengeance", distractors: ["patience", "rancune"], author: "Proverbe" },
  { template: "L'argent ne fait pas le ___.", answer: "bonheur", distractors: ["bonté", "succès"], author: "Proverbe" },
  { template: "Qui vivra ___.", answer: "verra", distractors: ["rira", "saura"], author: "Proverbe" },
  { template: "Plus ça change, plus c'est la même ___.", answer: "chose", distractors: ["histoire", "vie"], author: "Alphonse Karr" },
  { template: "Carpe ___.", answer: "diem", distractors: ["vita", "noctem"], author: "Horace" },
  { template: "Errare humanum ___.", answer: "est", distractors: ["sum", "vita"], author: "Sénèque" },
  { template: "Le doute est le commencement de la ___.", answer: "sagesse", distractors: ["science", "raison"], author: "Aristote" },
  { template: "La ___ est la vertu des forts.", answer: "patience", distractors: ["prudence", "sagesse"], author: "Léon Tolstoï" },
  { template: "Un ___ averti en vaut deux.", answer: "homme", distractors: ["roi", "sage"], author: "Proverbe" },
  { template: "Le savoir est une ___ que l'on partage.", answer: "richesse", distractors: ["lumière", "force"], author: "Proverbe" },
  { template: "La liberté des uns s'arrête où commence celle des ___.", answer: "autres", distractors: ["rois", "forts"], author: "Proverbe" },
  { template: "Il n'y a pas de ___ sans peine.", answer: "plaisir", distractors: ["roses", "gloire"], author: "Proverbe" },
  { template: "Tel est pris qui croyait ___.", answer: "prendre", distractors: ["gagner", "fuir"], author: "Jean de La Fontaine" },
  { template: "On ne voit bien qu'avec le ___.", answer: "cœur", distractors: ["temps", "recul"], author: "Antoine de Saint-Exupéry" },
  { template: "L'imagination est plus importante que le ___.", answer: "savoir", distractors: ["talent", "génie"], author: "Albert Einstein" },
  { template: "La beauté est dans les yeux de celui qui ___.", answer: "regarde", distractors: ["aime", "rêve"], author: "Oscar Wilde" },
  { template: "Un grand pouvoir implique de grandes ___.", answer: "responsabilités", distractors: ["victoires", "épreuves"], author: "Proverbe" },
  { template: "Le temps, c'est de l'___.", answer: "argent", distractors: ["or", "espoir"], author: "Benjamin Franklin" },
  { template: "Mieux vaut tard que ___.", answer: "jamais", distractors: ["rien", "tôt"], author: "Proverbe" },
  { template: "Tous pour un, un pour ___.", answer: "tous", distractors: ["soi", "l'honneur"], author: "Alexandre Dumas" },
  { template: "Connaître les autres, c'est sagesse ; se connaître soi-même, c'est ___.", answer: "sagesse supérieure", distractors: ["force", "vanité"], author: "Lao-Tseu" },
  { template: "Le bonheur n'est réel que lorsqu'il est ___.", answer: "partagé", distractors: ["mérité", "cherché"], author: "Christopher McCandless" },
  { template: "La vie est un ___ qu'il faut savoir danser.", answer: "mystère", distractors: ["combat", "voyage"], author: "Proverbe" },
  { template: "Vouloir, c'est ___.", answer: "pouvoir", distractors: ["agir", "oser"], author: "Proverbe" },
  { template: "L'union fait la ___.", answer: "force", distractors: ["paix", "joie"], author: "Devise belge" },
  { template: "À cœur vaillant rien d'___.", answer: "impossible", distractors: ["interdit", "éternel"], author: "Jacques Cœur" },
  { template: "Chaque chose en son ___.", answer: "temps", distractors: ["lieu", "ordre"], author: "Proverbe" },
];
