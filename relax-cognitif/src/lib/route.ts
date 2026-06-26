// Banque de questions du « Jeu de la Route » : numéros de départements,
// préfectures, régions (présentés sur une fausse plaque d'immatriculation),
// plus une série de questions sur les routes et autoroutes célèbres de France.
// Les questions « plaque » sont générées à partir des départements ; combinées
// aux questions « route » écrites à la main, la banque dépasse 150 questions.

export type RouteTheme = "plaque" | "route";

export type SignType = "autoroute" | "nationale" | "emblem";

export type RouteQuestion = {
  id: string;
  theme: RouteTheme;
  question: string;
  options: string[];
  answer: string;
  explain?: string;
  plateDep?: string; // numéro affiché sur la plaque (thème « plaque »)
  sign?: { label: string; type: SignType }; // panneau (thème « route »)
};

export type Department = {
  num: string;
  name: string;
  prefecture: string;
  region: string;
};

// 96 départements métropolitains + 5 d'outre-mer.
export const DEPARTMENTS: Department[] = [
  { num: "01", name: "Ain", prefecture: "Bourg-en-Bresse", region: "Auvergne-Rhône-Alpes" },
  { num: "02", name: "Aisne", prefecture: "Laon", region: "Hauts-de-France" },
  { num: "03", name: "Allier", prefecture: "Moulins", region: "Auvergne-Rhône-Alpes" },
  { num: "04", name: "Alpes-de-Haute-Provence", prefecture: "Digne-les-Bains", region: "Provence-Alpes-Côte d'Azur" },
  { num: "05", name: "Hautes-Alpes", prefecture: "Gap", region: "Provence-Alpes-Côte d'Azur" },
  { num: "06", name: "Alpes-Maritimes", prefecture: "Nice", region: "Provence-Alpes-Côte d'Azur" },
  { num: "07", name: "Ardèche", prefecture: "Privas", region: "Auvergne-Rhône-Alpes" },
  { num: "08", name: "Ardennes", prefecture: "Charleville-Mézières", region: "Grand Est" },
  { num: "09", name: "Ariège", prefecture: "Foix", region: "Occitanie" },
  { num: "10", name: "Aube", prefecture: "Troyes", region: "Grand Est" },
  { num: "11", name: "Aude", prefecture: "Carcassonne", region: "Occitanie" },
  { num: "12", name: "Aveyron", prefecture: "Rodez", region: "Occitanie" },
  { num: "13", name: "Bouches-du-Rhône", prefecture: "Marseille", region: "Provence-Alpes-Côte d'Azur" },
  { num: "14", name: "Calvados", prefecture: "Caen", region: "Normandie" },
  { num: "15", name: "Cantal", prefecture: "Aurillac", region: "Auvergne-Rhône-Alpes" },
  { num: "16", name: "Charente", prefecture: "Angoulême", region: "Nouvelle-Aquitaine" },
  { num: "17", name: "Charente-Maritime", prefecture: "La Rochelle", region: "Nouvelle-Aquitaine" },
  { num: "18", name: "Cher", prefecture: "Bourges", region: "Centre-Val de Loire" },
  { num: "19", name: "Corrèze", prefecture: "Tulle", region: "Nouvelle-Aquitaine" },
  { num: "2A", name: "Corse-du-Sud", prefecture: "Ajaccio", region: "Corse" },
  { num: "2B", name: "Haute-Corse", prefecture: "Bastia", region: "Corse" },
  { num: "21", name: "Côte-d'Or", prefecture: "Dijon", region: "Bourgogne-Franche-Comté" },
  { num: "22", name: "Côtes-d'Armor", prefecture: "Saint-Brieuc", region: "Bretagne" },
  { num: "23", name: "Creuse", prefecture: "Guéret", region: "Nouvelle-Aquitaine" },
  { num: "24", name: "Dordogne", prefecture: "Périgueux", region: "Nouvelle-Aquitaine" },
  { num: "25", name: "Doubs", prefecture: "Besançon", region: "Bourgogne-Franche-Comté" },
  { num: "26", name: "Drôme", prefecture: "Valence", region: "Auvergne-Rhône-Alpes" },
  { num: "27", name: "Eure", prefecture: "Évreux", region: "Normandie" },
  { num: "28", name: "Eure-et-Loir", prefecture: "Chartres", region: "Centre-Val de Loire" },
  { num: "29", name: "Finistère", prefecture: "Quimper", region: "Bretagne" },
  { num: "30", name: "Gard", prefecture: "Nîmes", region: "Occitanie" },
  { num: "31", name: "Haute-Garonne", prefecture: "Toulouse", region: "Occitanie" },
  { num: "32", name: "Gers", prefecture: "Auch", region: "Occitanie" },
  { num: "33", name: "Gironde", prefecture: "Bordeaux", region: "Nouvelle-Aquitaine" },
  { num: "34", name: "Hérault", prefecture: "Montpellier", region: "Occitanie" },
  { num: "35", name: "Ille-et-Vilaine", prefecture: "Rennes", region: "Bretagne" },
  { num: "36", name: "Indre", prefecture: "Châteauroux", region: "Centre-Val de Loire" },
  { num: "37", name: "Indre-et-Loire", prefecture: "Tours", region: "Centre-Val de Loire" },
  { num: "38", name: "Isère", prefecture: "Grenoble", region: "Auvergne-Rhône-Alpes" },
  { num: "39", name: "Jura", prefecture: "Lons-le-Saunier", region: "Bourgogne-Franche-Comté" },
  { num: "40", name: "Landes", prefecture: "Mont-de-Marsan", region: "Nouvelle-Aquitaine" },
  { num: "41", name: "Loir-et-Cher", prefecture: "Blois", region: "Centre-Val de Loire" },
  { num: "42", name: "Loire", prefecture: "Saint-Étienne", region: "Auvergne-Rhône-Alpes" },
  { num: "43", name: "Haute-Loire", prefecture: "Le Puy-en-Velay", region: "Auvergne-Rhône-Alpes" },
  { num: "44", name: "Loire-Atlantique", prefecture: "Nantes", region: "Pays de la Loire" },
  { num: "45", name: "Loiret", prefecture: "Orléans", region: "Centre-Val de Loire" },
  { num: "46", name: "Lot", prefecture: "Cahors", region: "Occitanie" },
  { num: "47", name: "Lot-et-Garonne", prefecture: "Agen", region: "Nouvelle-Aquitaine" },
  { num: "48", name: "Lozère", prefecture: "Mende", region: "Occitanie" },
  { num: "49", name: "Maine-et-Loire", prefecture: "Angers", region: "Pays de la Loire" },
  { num: "50", name: "Manche", prefecture: "Saint-Lô", region: "Normandie" },
  { num: "51", name: "Marne", prefecture: "Châlons-en-Champagne", region: "Grand Est" },
  { num: "52", name: "Haute-Marne", prefecture: "Chaumont", region: "Grand Est" },
  { num: "53", name: "Mayenne", prefecture: "Laval", region: "Pays de la Loire" },
  { num: "54", name: "Meurthe-et-Moselle", prefecture: "Nancy", region: "Grand Est" },
  { num: "55", name: "Meuse", prefecture: "Bar-le-Duc", region: "Grand Est" },
  { num: "56", name: "Morbihan", prefecture: "Vannes", region: "Bretagne" },
  { num: "57", name: "Moselle", prefecture: "Metz", region: "Grand Est" },
  { num: "58", name: "Nièvre", prefecture: "Nevers", region: "Bourgogne-Franche-Comté" },
  { num: "59", name: "Nord", prefecture: "Lille", region: "Hauts-de-France" },
  { num: "60", name: "Oise", prefecture: "Beauvais", region: "Hauts-de-France" },
  { num: "61", name: "Orne", prefecture: "Alençon", region: "Normandie" },
  { num: "62", name: "Pas-de-Calais", prefecture: "Arras", region: "Hauts-de-France" },
  { num: "63", name: "Puy-de-Dôme", prefecture: "Clermont-Ferrand", region: "Auvergne-Rhône-Alpes" },
  { num: "64", name: "Pyrénées-Atlantiques", prefecture: "Pau", region: "Nouvelle-Aquitaine" },
  { num: "65", name: "Hautes-Pyrénées", prefecture: "Tarbes", region: "Occitanie" },
  { num: "66", name: "Pyrénées-Orientales", prefecture: "Perpignan", region: "Occitanie" },
  { num: "67", name: "Bas-Rhin", prefecture: "Strasbourg", region: "Grand Est" },
  { num: "68", name: "Haut-Rhin", prefecture: "Colmar", region: "Grand Est" },
  { num: "69", name: "Rhône", prefecture: "Lyon", region: "Auvergne-Rhône-Alpes" },
  { num: "70", name: "Haute-Saône", prefecture: "Vesoul", region: "Bourgogne-Franche-Comté" },
  { num: "71", name: "Saône-et-Loire", prefecture: "Mâcon", region: "Bourgogne-Franche-Comté" },
  { num: "72", name: "Sarthe", prefecture: "Le Mans", region: "Pays de la Loire" },
  { num: "73", name: "Savoie", prefecture: "Chambéry", region: "Auvergne-Rhône-Alpes" },
  { num: "74", name: "Haute-Savoie", prefecture: "Annecy", region: "Auvergne-Rhône-Alpes" },
  { num: "75", name: "Paris", prefecture: "Paris", region: "Île-de-France" },
  { num: "76", name: "Seine-Maritime", prefecture: "Rouen", region: "Normandie" },
  { num: "77", name: "Seine-et-Marne", prefecture: "Melun", region: "Île-de-France" },
  { num: "78", name: "Yvelines", prefecture: "Versailles", region: "Île-de-France" },
  { num: "79", name: "Deux-Sèvres", prefecture: "Niort", region: "Nouvelle-Aquitaine" },
  { num: "80", name: "Somme", prefecture: "Amiens", region: "Hauts-de-France" },
  { num: "81", name: "Tarn", prefecture: "Albi", region: "Occitanie" },
  { num: "82", name: "Tarn-et-Garonne", prefecture: "Montauban", region: "Occitanie" },
  { num: "83", name: "Var", prefecture: "Toulon", region: "Provence-Alpes-Côte d'Azur" },
  { num: "84", name: "Vaucluse", prefecture: "Avignon", region: "Provence-Alpes-Côte d'Azur" },
  { num: "85", name: "Vendée", prefecture: "La Roche-sur-Yon", region: "Pays de la Loire" },
  { num: "86", name: "Vienne", prefecture: "Poitiers", region: "Nouvelle-Aquitaine" },
  { num: "87", name: "Haute-Vienne", prefecture: "Limoges", region: "Nouvelle-Aquitaine" },
  { num: "88", name: "Vosges", prefecture: "Épinal", region: "Grand Est" },
  { num: "89", name: "Yonne", prefecture: "Auxerre", region: "Bourgogne-Franche-Comté" },
  { num: "90", name: "Territoire de Belfort", prefecture: "Belfort", region: "Bourgogne-Franche-Comté" },
  { num: "91", name: "Essonne", prefecture: "Évry-Courcouronnes", region: "Île-de-France" },
  { num: "92", name: "Hauts-de-Seine", prefecture: "Nanterre", region: "Île-de-France" },
  { num: "93", name: "Seine-Saint-Denis", prefecture: "Bobigny", region: "Île-de-France" },
  { num: "94", name: "Val-de-Marne", prefecture: "Créteil", region: "Île-de-France" },
  { num: "95", name: "Val-d'Oise", prefecture: "Pontoise", region: "Île-de-France" },
  { num: "971", name: "Guadeloupe", prefecture: "Basse-Terre", region: "Guadeloupe" },
  { num: "972", name: "Martinique", prefecture: "Fort-de-France", region: "Martinique" },
  { num: "973", name: "Guyane", prefecture: "Cayenne", region: "Guyane" },
  { num: "974", name: "La Réunion", prefecture: "Saint-Denis", region: "La Réunion" },
  { num: "976", name: "Mayotte", prefecture: "Mamoudzou", region: "Mayotte" },
];

// Départements « grand public » : servent au niveau Facile et de distracteurs
// plausibles partout.
const FAMOUS = new Set([
  "06", "13", "14", "21", "29", "30", "31", "33", "34", "35",
  "37", "38", "44", "45", "49", "51", "59", "62", "63", "64",
  "67", "69", "72", "74", "75", "76", "83", "84", "86", "87",
]);

export const REGIONS = [
  "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté",
  "Bretagne",
  "Centre-Val de Loire",
  "Corse",
  "Grand Est",
  "Hauts-de-France",
  "Île-de-France",
  "Normandie",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur",
];

// ── Questions « Routes & autoroutes célèbres » (écrites à la main) ──────
export const ROAD_QUESTIONS: RouteQuestion[] = [
  {
    id: "r-a7-soleil", theme: "route",
    question: "Quel surnom donne-t-on à l'axe autoroutier A6-A7 qui relie Paris à Marseille ?",
    options: ["L'autoroute du Soleil", "L'autoroute des Vacances", "La Méridienne", "L'autoroute du Sud"],
    answer: "L'autoroute du Soleil",
    explain: "L'A6 puis l'A7 forment « l'autoroute du Soleil », l'itinéraire mythique des départs en vacances vers la Méditerranée.",
    sign: { label: "A7", type: "autoroute" },
  },
  {
    id: "r-rn7", theme: "route",
    question: "Quelle ancienne route nationale, chantée par Charles Trenet, descendait de Paris vers la Côte d'Azur ?",
    options: ["La Nationale 7", "La Nationale 10", "La Nationale 20", "La Nationale 6"],
    answer: "La Nationale 7",
    explain: "La RN7, « la route bleue » ou « route des vacances », fut immortalisée par la chanson de Charles Trenet.",
    sign: { label: "N7", type: "nationale" },
  },
  {
    id: "r-periph", theme: "route",
    question: "Comment appelle-t-on le boulevard circulaire qui ceinture Paris ?",
    options: ["Le périphérique", "Le boulevard extérieur", "La rocade", "La ceinture"],
    answer: "Le périphérique",
    explain: "Le boulevard périphérique parisien, long d'environ 35 km, a été achevé en 1973.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-millau", theme: "route",
    question: "Quel célèbre viaduc autoroutier (A75) franchit la vallée du Tarn ?",
    options: ["Le viaduc de Millau", "Le pont de Normandie", "Le viaduc de Garabit", "Le pont du Gard"],
    answer: "Le viaduc de Millau",
    explain: "Inauguré en 2004, le viaduc de Millau est l'un des ponts les plus hauts du monde (pile culminant à 343 m).",
    sign: { label: "A75", type: "autoroute" },
  },
  {
    id: "r-napoleon", theme: "route",
    question: "La « Route Napoléon » relie Golfe-Juan, sur la Côte d'Azur, à quelle ville ?",
    options: ["Grenoble", "Lyon", "Marseille", "Turin"],
    answer: "Grenoble",
    explain: "Elle suit le trajet emprunté par Napoléon en 1815 à son retour de l'île d'Elbe, de Golfe-Juan jusqu'à Grenoble.",
    sign: { label: "N85", type: "nationale" },
  },
  {
    id: "r-a1", theme: "route",
    question: "Quelle autoroute relie Paris à Lille ?",
    options: ["L'A1", "L'A4", "L'A6", "L'A10"],
    answer: "L'A1",
    explain: "L'A1, « l'autoroute du Nord », relie Paris à Lille ; c'est l'une des plus fréquentées de France.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-a6", theme: "route",
    question: "Quelle autoroute relie Paris à Lyon ?",
    options: ["L'A6", "L'A1", "L'A4", "L'A7"],
    answer: "L'A6",
    explain: "L'A6 relie Paris à Lyon ; prolongée par l'A7, elle forme l'autoroute du Soleil vers Marseille.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-a4", theme: "route",
    question: "Quelle autoroute relie Paris à Strasbourg ?",
    options: ["L'A4", "L'A6", "L'A1", "L'A13"],
    answer: "L'A4",
    explain: "L'A4, « l'autoroute de l'Est », relie Paris à Strasbourg en passant par Reims et Metz.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-a10", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A10 qui relie Paris à Bordeaux ?",
    options: ["L'Aquitaine", "L'Océane", "La Méridienne", "L'Aquitaine du Sud"],
    answer: "L'Aquitaine",
    explain: "L'A10, « l'Aquitaine », est la plus longue autoroute de France ; elle relie Paris à Bordeaux.",
    sign: { label: "A10", type: "autoroute" },
  },
  {
    id: "r-a13", theme: "route",
    question: "Quelle autoroute relie Paris à la Normandie (Rouen, Caen) ?",
    options: ["L'A13", "L'A1", "L'A11", "L'A4"],
    answer: "L'A13",
    explain: "L'A13, « l'autoroute de Normandie », fut la première autoroute de France ouverte (tronçon de 1946).",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-a8", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A8, d'Aix-en-Provence à la frontière italienne ?",
    options: ["La Provençale", "La Méridienne", "La Languedocienne", "La Catalane"],
    answer: "La Provençale",
    explain: "L'A8, « la Provençale », longe la Côte d'Azur d'Aix-en-Provence jusqu'à Menton et l'Italie.",
    sign: { label: "A8", type: "autoroute" },
  },
  {
    id: "r-a9", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A9 qui longe la Méditerranée vers l'Espagne ?",
    options: ["La Languedocienne", "La Provençale", "L'Aquitaine", "La Méridienne"],
    answer: "La Languedocienne",
    explain: "L'A9, « la Languedocienne », descend d'Orange jusqu'à la frontière espagnole au Perthus.",
    sign: { label: "A9", type: "autoroute" },
  },
  {
    id: "r-a75", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A75 entre Clermont-Ferrand et Béziers ?",
    options: ["La Méridienne", "La Provençale", "L'Aquitaine", "L'Auvergnate"],
    answer: "La Méridienne",
    explain: "L'A75, « la Méridienne », traverse le Massif central et franchit le viaduc de Millau ; elle est en grande partie gratuite.",
    sign: { label: "A75", type: "autoroute" },
  },
  {
    id: "r-a11", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A11 entre Paris et Nantes ?",
    options: ["L'Océane", "L'Aquitaine", "L'Armoricaine", "La Méridienne"],
    answer: "L'Océane",
    explain: "L'A11, « l'Océane », relie la région parisienne à Nantes en passant par Le Mans et Angers.",
    sign: { label: "A11", type: "autoroute" },
  },
  {
    id: "r-a40", theme: "route",
    question: "Comment surnomme-t-on l'autoroute A40 qui mène vers la Haute-Savoie et le Mont-Blanc ?",
    options: ["L'autoroute Blanche", "La Provençale", "L'Alpine", "La Savoyarde"],
    answer: "L'autoroute Blanche",
    explain: "L'A40, « l'autoroute Blanche », conduit de Mâcon vers Genève et la vallée de Chamonix.",
    sign: { label: "A40", type: "autoroute" },
  },
  {
    id: "r-montblanc", theme: "route",
    question: "Quel tunnel routier relie Chamonix à Courmayeur, sous le plus haut sommet des Alpes ?",
    options: ["Le tunnel du Mont-Blanc", "Le tunnel du Fréjus", "Le tunnel du Somport", "Le tunnel de Sainte-Marie"],
    answer: "Le tunnel du Mont-Blanc",
    explain: "Ouvert en 1965, le tunnel du Mont-Blanc (11,6 km) relie la France à l'Italie sous le massif du Mont-Blanc.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-frejus", theme: "route",
    question: "Quel tunnel routier relie Modane (Savoie) à Bardonecchia, en Italie ?",
    options: ["Le tunnel du Fréjus", "Le tunnel du Mont-Blanc", "Le tunnel du Lioran", "Le tunnel de Sainte-Marie-aux-Mines"],
    answer: "Le tunnel du Fréjus",
    explain: "Le tunnel routier du Fréjus, ouvert en 1980, franchit les Alpes entre la Savoie et le Piémont italien.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-normandie", theme: "route",
    question: "Quel grand pont à haubans franchit l'estuaire de la Seine près du Havre ?",
    options: ["Le pont de Normandie", "Le pont de Tancarville", "Le pont de Saint-Nazaire", "Le pont d'Aquitaine"],
    answer: "Le pont de Normandie",
    explain: "Inauguré en 1995, le pont de Normandie relie Le Havre à Honfleur par-dessus la Seine.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-stnazaire", theme: "route",
    question: "Quel pont routier franchit l'estuaire de la Loire entre Saint-Nazaire et Saint-Brevin ?",
    options: ["Le pont de Saint-Nazaire", "Le pont de Normandie", "Le pont de l'île de Ré", "Le pont d'Aquitaine"],
    answer: "Le pont de Saint-Nazaire",
    explain: "Ouvert en 1975, le pont de Saint-Nazaire enjambe la Loire à son embouchure.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-iledere", theme: "route",
    question: "Quel pont à péage relie le continent à une île de Charente-Maritime depuis La Rochelle ?",
    options: ["Le pont de l'île de Ré", "Le pont de l'île d'Oléron", "Le pont de Noirmoutier", "Le pont de Saint-Nazaire"],
    answer: "Le pont de l'île de Ré",
    explain: "Le pont de l'île de Ré, long de près de 3 km, relie La Rochelle à l'île depuis 1988.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-iseran", theme: "route",
    question: "Quel col, à 2 770 m, est le plus haut col routier des Alpes françaises ?",
    options: ["Le col de l'Iseran", "Le col du Galibier", "Le col du Tourmalet", "Le col de la Bonette"],
    answer: "Le col de l'Iseran",
    explain: "Le col de l'Iseran, en Savoie, est le plus haut col routier des Alpes (2 770 m), souvent au programme du Tour de France.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-tourmalet", theme: "route",
    question: "Quel col mythique du Tour de France culmine à 2 115 m dans les Pyrénées ?",
    options: ["Le col du Tourmalet", "Le col de l'Iseran", "Le col du Galibier", "Le col d'Aubisque"],
    answer: "Le col du Tourmalet",
    explain: "Le col du Tourmalet, dans les Hautes-Pyrénées, est le col le plus emprunté de l'histoire du Tour de France.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-vmax-auto", theme: "route",
    question: "Sur autoroute, quelle est la vitesse maximale autorisée par temps sec pour une voiture ?",
    options: ["130 km/h", "110 km/h", "120 km/h", "150 km/h"],
    answer: "130 km/h",
    explain: "La vitesse maximale sur autoroute est de 130 km/h par temps sec, abaissée à 110 km/h par temps de pluie.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-vmax-pluie", theme: "route",
    question: "Sur autoroute, à combien est abaissée la vitesse maximale par temps de pluie ?",
    options: ["110 km/h", "130 km/h", "100 km/h", "90 km/h"],
    answer: "110 km/h",
    explain: "Par temps de pluie, la vitesse sur autoroute passe de 130 à 110 km/h.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-vmax-nat", theme: "route",
    question: "Sur une route à double sens sans séparateur central, quelle est la vitesse maximale (depuis 2018) ?",
    options: ["80 km/h", "90 km/h", "100 km/h", "70 km/h"],
    answer: "80 km/h",
    explain: "Depuis juillet 2018, la limite est de 80 km/h sur ces routes (certains départements sont revenus à 90 km/h).",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-vmax-ville", theme: "route",
    question: "En ville, quelle est la vitesse maximale autorisée par défaut en agglomération ?",
    options: ["50 km/h", "30 km/h", "70 km/h", "60 km/h"],
    answer: "50 km/h",
    explain: "La vitesse par défaut en agglomération est de 50 km/h, parfois abaissée à 30 km/h dans certaines zones.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-couleur-auto", theme: "route",
    question: "De quelle couleur sont les panneaux de direction qui indiquent les autoroutes ?",
    options: ["Bleu", "Vert", "Blanc", "Rouge"],
    answer: "Bleu",
    explain: "En France, les panneaux de direction des autoroutes sont bleus ; les grandes liaisons hors autoroute sont en vert.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-couleur-vert", theme: "route",
    question: "De quelle couleur sont les panneaux indiquant les grandes liaisons routières (hors autoroute) ?",
    options: ["Vert", "Bleu", "Blanc", "Jaune"],
    answer: "Vert",
    explain: "Les panneaux verts signalent les grandes liaisons entre villes ; les panneaux blancs concernent les destinations locales.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-bisonfute", theme: "route",
    question: "Quelle mascotte indienne symbolise les prévisions de circulation routière en France ?",
    options: ["Bison Futé", "Castor Malin", "Aigle Royal", "Renard Rusé"],
    answer: "Bison Futé",
    explain: "Créé en 1976, Bison Futé classe les journées en vert, orange, rouge et noir selon le trafic prévu.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-journeenoire", theme: "route",
    question: "Dans les prévisions de Bison Futé, quelle couleur annonce les pires conditions de circulation ?",
    options: ["Noir", "Rouge", "Orange", "Violet"],
    answer: "Noir",
    explain: "Le « samedi noir » est la journée la plus chargée ; l'échelle va du vert (fluide) au noir (très difficile).",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-pointzero", theme: "route",
    question: "Où se trouve le « point zéro » des routes de France, d'où partent les distances vers Paris ?",
    options: ["Devant Notre-Dame de Paris", "Place de la Concorde", "Sous la tour Eiffel", "À l'Arc de Triomphe"],
    answer: "Devant Notre-Dame de Paris",
    explain: "Une dalle sur le parvis de Notre-Dame marque le « kilomètre zéro » des routes nationales françaises.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-bau", theme: "route",
    question: "À quoi sert la « bande d'arrêt d'urgence » sur l'autoroute ?",
    options: ["S'arrêter en cas de panne ou de danger", "Doubler par la droite", "Rouler plus vite", "Faire demi-tour"],
    answer: "S'arrêter en cas de panne ou de danger",
    explain: "La bande d'arrêt d'urgence est réservée aux arrêts d'urgence et aux véhicules de secours ; y rouler est interdit.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-peage", theme: "route",
    question: "Comment appelle-t-on l'endroit où l'on paie pour emprunter une autoroute ?",
    options: ["Le péage", "L'aire de repos", "Le poste-frontière", "La gare"],
    answer: "Le péage",
    explain: "La plupart des autoroutes françaises sont payantes : on s'acquitte du tarif au péage.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-aire", theme: "route",
    question: "Comment appelle-t-on les espaces où l'on peut s'arrêter pour se reposer le long d'une autoroute ?",
    options: ["Les aires de repos", "Les péages", "Les bretelles", "Les ronds-points"],
    answer: "Les aires de repos",
    explain: "Les aires de repos et de service permettent de faire une pause ; on recommande un arrêt toutes les deux heures.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-manche", theme: "route",
    question: "Le tunnel sous la Manche relie la France à quel pays ?",
    options: ["Le Royaume-Uni", "La Belgique", "L'Irlande", "Les Pays-Bas"],
    answer: "Le Royaume-Uni",
    explain: "Ouvert en 1994, le tunnel sous la Manche relie Calais à Folkestone ; les voitures y passent sur des navettes ferroviaires.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-24h", theme: "route",
    question: "Quelle célèbre course automobile d'endurance se déroule sur un circuit près d'une ville de la Sarthe ?",
    options: ["Les 24 Heures du Mans", "Le Grand Prix de Monaco", "Le Rallye de Monte-Carlo", "Les 1000 km de Paris"],
    answer: "Les 24 Heures du Mans",
    explain: "Les 24 Heures du Mans, créées en 1923, empruntent en partie des routes ouvertes près du Mans.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-rocade", theme: "route",
    question: "Comment appelle-t-on souvent la voie rapide qui contourne une grande ville comme Bordeaux ou Toulouse ?",
    options: ["La rocade", "Le périphérique", "L'autoroute", "La nationale"],
    answer: "La rocade",
    explain: "Une rocade (ou ceinture) contourne une agglomération pour éviter le centre-ville ; à Paris on parle de périphérique.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-rondpoint", theme: "route",
    question: "Comment appelle-t-on un carrefour circulaire où l'on tourne dans le sens inverse des aiguilles d'une montre ?",
    options: ["Un rond-point", "Un échangeur", "Une bretelle", "Un péage"],
    answer: "Un rond-point",
    explain: "La France est l'un des pays comptant le plus de ronds-points (giratoires) au monde.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-echangeur", theme: "route",
    question: "Comment nomme-t-on l'ouvrage qui permet de passer d'une autoroute à une autre sans croiser le trafic ?",
    options: ["Un échangeur", "Un rond-point", "Un péage", "Un passage à niveau"],
    answer: "Un échangeur",
    explain: "Un échangeur relie deux voies rapides par des bretelles, sans intersection ni feu.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-a20", theme: "route",
    question: "Quelle autoroute, en grande partie gratuite, relie Vierzon à Montauban via Limoges ?",
    options: ["L'A20", "L'A10", "L'A75", "L'A71"],
    answer: "L'A20",
    explain: "L'A20, « l'Occitane », descend du Centre vers le Sud-Ouest et est gratuite sur une grande partie de son tracé.",
    sign: { label: "A20", type: "autoroute" },
  },
  {
    id: "r-a35", theme: "route",
    question: "Quelle autoroute longe le Rhin et traverse l'Alsace du nord au sud ?",
    options: ["L'A35", "L'A4", "L'A31", "L'A36"],
    answer: "L'A35",
    explain: "L'A35 traverse l'Alsace de Lauterbourg à Saint-Louis, en passant par Strasbourg, Colmar et Mulhouse.",
    sign: { label: "A35", type: "autoroute" },
  },
  {
    id: "r-a16", theme: "route",
    question: "Quelle autoroute longe la côte de la Manche entre Paris et Dunkerque via Boulogne ?",
    options: ["L'A16", "L'A1", "L'A26", "L'A28"],
    answer: "L'A16",
    explain: "L'A16, « l'autoroute des Anglais », longe la Côte d'Opale jusqu'à la frontière belge.",
    sign: { label: "A16", type: "autoroute" },
  },
  {
    id: "r-corniche", theme: "route",
    question: "Comment appelle-t-on une route taillée à flanc de falaise qui domine la mer, comme sur la Côte d'Azur ?",
    options: ["Une corniche", "Une rocade", "Une bretelle", "Une nationale"],
    answer: "Une corniche",
    explain: "Les corniches (Grande, Moyenne et Basse Corniche) relient Nice à Menton en surplombant la Méditerranée.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-radar", theme: "route",
    question: "Quel appareil au bord des routes contrôle automatiquement la vitesse des véhicules ?",
    options: ["Le radar", "Le péage", "La balise", "Le compteur"],
    answer: "Le radar",
    explain: "Les radars automatiques mesurent la vitesse et verbalisent les excès ; ils sont signalés par des panneaux.",
    sign: { label: "", type: "emblem" },
  },
  {
    id: "r-gilet", theme: "route",
    question: "Quel équipement de sécurité, obligatoire dans la voiture, doit-on porter en cas d'arrêt sur le bas-côté ?",
    options: ["Le gilet jaune", "Le casque", "Les gants", "La ceinture"],
    answer: "Le gilet jaune",
    explain: "Le gilet de haute visibilité et le triangle de présignalisation sont obligatoires à bord de tout véhicule.",
    sign: { label: "", type: "emblem" },
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number, exclude: Set<T>): T[] {
  const pool = shuffle(arr.filter((x) => !exclude.has(x)));
  return pool.slice(0, n);
}

type PlateKind = "name" | "prefecture" | "region";

// Plaque française fictive : 2 lettres - 3 chiffres - 2 lettres (format SIV).
const PLATE_LETTERS = "ABCDEFGHJKLMNPQRSTVWXYZ"; // sans I, O, U
export function fakePlate(): string {
  const L = () => PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)];
  const d = () => Math.floor(Math.random() * 10);
  return `${L()}${L()}-${d()}${d()}${d()}-${L()}${L()}`;
}

function plateQuestion(dep: Department, kind: PlateKind): RouteQuestion {
  if (kind === "name") {
    const distract = sample(
      DEPARTMENTS.map((d) => d.name),
      3,
      new Set([dep.name])
    );
    return {
      id: `p-name-${dep.num}`,
      theme: "plaque",
      plateDep: dep.num,
      question: `À quel département correspond le numéro ${dep.num} ?`,
      options: shuffle([dep.name, ...distract]),
      answer: dep.name,
      explain: `Le ${dep.num}, c'est ${dep.name} (préfecture : ${dep.prefecture}, en ${dep.region}).`,
    };
  }
  if (kind === "prefecture") {
    const distract = sample(
      DEPARTMENTS.map((d) => d.prefecture),
      3,
      new Set([dep.prefecture])
    );
    return {
      id: `p-pref-${dep.num}`,
      theme: "plaque",
      plateDep: dep.num,
      question: `Quelle est la préfecture du département ${dep.name} (${dep.num}) ?`,
      options: shuffle([dep.prefecture, ...distract]),
      answer: dep.prefecture,
      explain: `La préfecture du ${dep.num} (${dep.name}) est ${dep.prefecture}.`,
    };
  }
  const distract = sample(REGIONS, 3, new Set([dep.region]));
  return {
    id: `p-reg-${dep.num}`,
    theme: "plaque",
    plateDep: dep.num,
    question: `Dans quelle région se trouve le département ${dep.name} (${dep.num}) ?`,
    options: shuffle([dep.region, ...distract]),
    answer: dep.region,
    explain: `Le ${dep.num} (${dep.name}) se situe en ${dep.region}.`,
  };
}

function buildPlateBank(pool: Department[], kinds: PlateKind[]): RouteQuestion[] {
  const out: RouteQuestion[] = [];
  for (const dep of pool) {
    for (const k of kinds) out.push(plateQuestion(dep, k));
  }
  return out;
}

export type RouteLevel = "plaques" | "routes" | "varie";

export const ROUTE_LEVEL_LABEL: Record<RouteLevel, string> = {
  plaques: "Plaques",
  routes: "Routes",
  varie: "Varié",
};

// Questions « route » les plus grand public : servent d'amorce facile.
const EASY_ROAD = new Set([
  "r-a7-soleil", "r-periph", "r-vmax-ville", "r-vmax-auto", "r-couleur-auto",
  "r-bisonfute", "r-gilet", "r-peage", "r-aire", "r-rondpoint", "r-bau",
  "r-millau", "r-manche", "r-radar", "r-rocade",
]);

// Manche de routes ordonnée du plus simple (connu de tous) au plus pointu.
function rampRoads(n: number): RouteQuestion[] {
  const easy = shuffle(ROAD_QUESTIONS.filter((q) => EASY_ROAD.has(q.id)));
  const hard = shuffle(ROAD_QUESTIONS.filter((q) => !EASY_ROAD.has(q.id)));
  return [...easy, ...hard].slice(0, n);
}

// Manche de plaques ordonnée par difficulté croissante :
// 1) nom d'un département connu → 2) préfecture/région connus + nom d'un
// département moins courant → 3) préfecture/région d'un département pointu.
function rampPlates(pool: Department[], n: number): RouteQuestion[] {
  const famous = pool.filter((d) => FAMOUS.has(d.num));
  const others = pool.filter((d) => !FAMOUS.has(d.num));
  const easy = shuffle(buildPlateBank(famous, ["name"]));
  const med = shuffle([
    ...buildPlateBank(famous, ["prefecture", "region"]),
    ...buildPlateBank(others, ["name"]),
  ]);
  const hard = shuffle(buildPlateBank(others, ["prefecture", "region"]));
  return [...easy, ...med, ...hard].slice(0, n);
}

/**
 * Compose une manche de `n` questions, toujours du plus simple au plus difficile.
 * - « plaques » : départements connus d'abord, notions pointues ensuite.
 * - « routes » : grandes évidences d'abord, cols et autoroutes rares ensuite.
 * - « varie » : entrelace plaques et routes en conservant la montée en difficulté.
 */
export function pickRouteRound(level: RouteLevel, n: number): RouteQuestion[] {
  if (level === "routes") return rampRoads(n);
  if (level === "plaques") return rampPlates(DEPARTMENTS, n);
  // varié : on entrelace deux manches déjà ordonnées pour garder le crescendo.
  const famousPool = DEPARTMENTS.filter((d) => FAMOUS.has(d.num));
  const half = Math.ceil(n / 2);
  const plates = rampPlates(famousPool, n - half);
  const roads = rampRoads(half);
  const out: RouteQuestion[] = [];
  let i = 0;
  let j = 0;
  while (out.length < n && (i < plates.length || j < roads.length)) {
    if (i < plates.length) out.push(plates[i++]);
    if (j < roads.length && out.length < n) out.push(roads[j++]);
  }
  return out.slice(0, n);
}
