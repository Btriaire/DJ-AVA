export type PhiloMode = "citation" | "auteur"
export type PhiloEntry = { quote: string; author: string }
export type PhiloQuestion = {
  mode: PhiloMode
  display: string
  answer: string
  options: string[]
}

export const PHILO: PhiloEntry[] = [
  // ── SOCRATE ──────────────────────────────────────────────────────────
  { quote: "Je sais que je ne sais rien.", author: "Socrate" },
  { quote: "Connais-toi toi-même.", author: "Socrate" },
  { quote: "Une vie sans examen ne mérite pas d'être vécue.", author: "Socrate" },
  { quote: "Il n'y a qu'un seul bien, la connaissance, et un seul mal, l'ignorance.", author: "Socrate" },
  { quote: "La sagesse commence dans l'émerveillement.", author: "Socrate" },
  { quote: "Parle pour que je te voie.", author: "Socrate" },
  { quote: "Le commencement de la philosophie, c'est la conscience de sa propre ignorance.", author: "Socrate" },
  { quote: "On n'apprend rien, on se souvient seulement.", author: "Socrate" },
  { quote: "L'éducation est l'allumage d'une flamme, non le remplissage d'un vase.", author: "Socrate" },
  { quote: "Celui qui est le plus sage est le plus conscient de son ignorance.", author: "Socrate" },
  { quote: "La mort n'est peut-être que l'un des deux biens possibles.", author: "Socrate" },
  { quote: "Il n'est de vent favorable qu'à celui qui sait où il va.", author: "Socrate" },
  { quote: "Par le dialogue, nous découvrons ensemble la vérité.", author: "Socrate" },
  { quote: "Le vrai savoir est de savoir ce que l'on ignore.", author: "Socrate" },
  { quote: "Ce que je cherche, ce n'est pas des réponses, mais de bonnes questions.", author: "Socrate" },
  { quote: "L'insolence de ceux qui savent déjà tout les prive d'apprendre.", author: "Socrate" },

  // ── PLATON ────────────────────────────────────────────────────────────
  { quote: "La nécessité est la mère de l'invention.", author: "Platon" },
  { quote: "Nul n'est méchant volontairement.", author: "Platon" },
  { quote: "La beauté est la splendeur du vrai.", author: "Platon" },
  { quote: "L'éducation est une mise en lumière de l'âme.", author: "Platon" },
  { quote: "Le monde visible est une copie imparfaite du monde des Idées.", author: "Platon" },
  { quote: "La philosophie est un apprentissage de la mort.", author: "Platon" },
  { quote: "L'amour est le désir de l'immortalité.", author: "Platon" },
  { quote: "Dans l'âme droite réside la vraie liberté.", author: "Platon" },
  { quote: "La justice est de rendre à chacun ce qui lui est dû.", author: "Platon" },
  { quote: "Les hommes sont les jouets des dieux, et c'est là leur meilleure part.", author: "Platon" },
  { quote: "L'opinion est à mi-chemin entre l'être et le non-être.", author: "Platon" },
  { quote: "L'ignorance est la racine de tout mal.", author: "Platon" },
  { quote: "Seuls les morts ont vu la fin de la guerre.", author: "Platon" },
  { quote: "Le sage ne se plaint pas de sa condition, il la transforme.", author: "Platon" },
  { quote: "L'art est une imitation de la réalité, la réalité est elle-même une imitation.", author: "Platon" },
  { quote: "Tout acte humain vise un bien apparent ou réel.", author: "Platon" },

  // ── ARISTOTE ─────────────────────────────────────────────────────────
  { quote: "L'homme est un animal politique.", author: "Aristote" },
  { quote: "Nous sommes ce que nous faisons de manière répétitive.", author: "Aristote" },
  { quote: "Le bonheur est le but de l'existence humaine.", author: "Aristote" },
  { quote: "L'amitié est une âme logée dans deux corps.", author: "Aristote" },
  { quote: "La nature n'agit jamais sans but.", author: "Aristote" },
  { quote: "L'éducation est le meilleur viatique de la vieillesse.", author: "Aristote" },
  { quote: "La vertu est un juste milieu entre deux extrêmes.", author: "Aristote" },
  { quote: "Il est dans la nature de l'homme de désirer savoir.", author: "Aristote" },
  { quote: "Le courage est la vertu qui rend les autres vertus possibles.", author: "Aristote" },
  { quote: "L'excellence n'est pas un acte, c'est une habitude.", author: "Aristote" },
  { quote: "Le plaisir dans le travail perfectionne l'œuvre.", author: "Aristote" },
  { quote: "Tout art cherche à produire ce que la nature ne saurait faire seule.", author: "Aristote" },
  { quote: "La sagesse est la vertu des vieillards.", author: "Aristote" },
  { quote: "Un ami est ce que l'on a de plus précieux dans la vie.", author: "Aristote" },
  { quote: "La rhétorique est la contrepartie de la dialectique.", author: "Aristote" },
  { quote: "La pensée est la fleur ; le langage, le bouton ; l'action est le fruit.", author: "Aristote" },

  // ── ÉPICURE ───────────────────────────────────────────────────────────
  { quote: "Il ne faut pas craindre la mort : quand elle est là, je n'y suis plus.", author: "Épicure" },
  { quote: "Rien n'est suffisant pour celui à qui le suffisant est trop peu.", author: "Épicure" },
  { quote: "Il faut philosopher même quand on est vieux.", author: "Épicure" },
  { quote: "La mort n'est rien pour nous.", author: "Épicure" },
  { quote: "Le plaisir est le commencement et la fin de la vie bienheureuse.", author: "Épicure" },
  { quote: "La plus grande richesse est la pauvreté des désirs.", author: "Épicure" },
  { quote: "Parmi les biens que la sagesse procure, le plus grand est l'amitié.", author: "Épicure" },
  { quote: "Vivez caché.", author: "Épicure" },
  { quote: "Le bonheur, c'est d'être libéré de la peur et de la douleur.", author: "Épicure" },
  { quote: "Il est beau de philosopher, même sans argent.", author: "Épicure" },
  { quote: "Sois reconnaissant pour ce que tu as, tu trouveras que tu as beaucoup.", author: "Épicure" },
  { quote: "Le sage ne redoute pas la mort, car il sait qu'elle n'est pas un mal.", author: "Épicure" },
  { quote: "L'ataraxie est la paix de l'âme, seul vrai bonheur.", author: "Épicure" },
  { quote: "Une douleur intense ne dure pas, et une longue douleur n'est pas intense.", author: "Épicure" },

  // ── MARC AURÈLE ──────────────────────────────────────────────────────
  { quote: "Tu as du pouvoir sur ton esprit, pas sur les événements extérieurs.", author: "Marc Aurèle" },
  { quote: "L'âme reçoit la couleur de ses pensées.", author: "Marc Aurèle" },
  { quote: "Tout ce que tu vois changera bientôt et ne sera plus.", author: "Marc Aurèle" },
  { quote: "Le présent est la seule chose dont personne ne peut te priver.", author: "Marc Aurèle" },
  { quote: "Ce n'est pas la mort qu'il faut craindre, mais de ne jamais commencer à vivre.", author: "Marc Aurèle" },
  { quote: "Si ce n'est pas juste, ne le fais pas ; si ce n'est pas vrai, ne le dis pas.", author: "Marc Aurèle" },
  { quote: "Le bonheur de ta vie dépend de la qualité de tes pensées.", author: "Marc Aurèle" },
  { quote: "Accueille sans orgueil, abandonne sans résistance.", author: "Marc Aurèle" },
  { quote: "On n'a pas mal à cause des choses, mais à cause de l'opinion qu'on en a.", author: "Marc Aurèle" },
  { quote: "La vertu est son propre récompense.", author: "Marc Aurèle" },
  { quote: "Commence chaque jour comme une chance de devenir meilleur.", author: "Marc Aurèle" },
  { quote: "Ne gaspille pas les restes de ta vie en pensées sur les autres.", author: "Marc Aurèle" },
  { quote: "Agis comme un romain, comme un homme.", author: "Marc Aurèle" },
  { quote: "Tout est fugace, tant celui qui se souvient que ce dont on se souvient.", author: "Marc Aurèle" },
  { quote: "La paix intérieure n'exige pas que les choses soient différentes.", author: "Marc Aurèle" },
  { quote: "Ce qui nuit à la ruche nuit à l'abeille.", author: "Marc Aurèle" },

  // ── ÉPICTÈTE ─────────────────────────────────────────────────────────
  { quote: "Ce n'est pas ce qui nous arrive qui nous trouble, mais l'opinion que nous en avons.", author: "Épictète" },
  { quote: "Supporte et abstiens-toi.", author: "Épictète" },
  { quote: "Les hommes ne sont pas troublés par les événements, mais par leurs opinions sur eux.", author: "Épictète" },
  { quote: "Rien de grand n'entre dans la petite âme.", author: "Épictète" },
  { quote: "Le sage ne se plaint de personne ; ni de lui-même, ni des autres.", author: "Épictète" },
  { quote: "Chaque chose a deux anses : l'une par laquelle elle peut être portée, l'autre non.", author: "Épictète" },
  { quote: "Un homme éduqué ne blâme pas les autres quand tout va mal pour lui.", author: "Épictète" },
  { quote: "Si tu veux avancer, renonce à beaucoup de choses.", author: "Épictète" },
  { quote: "La liberté n'est pas accordée par les hommes, mais par soi-même.", author: "Épictète" },
  { quote: "Fais ce qui dépend de toi avec soin ; avec le reste, prends ce qui vient.", author: "Épictète" },
  { quote: "Le sage distingue ce qui dépend de lui de ce qui n'en dépend pas.", author: "Épictète" },
  { quote: "Il n'y a qu'une seule voie vers le bonheur : cesser de se soucier des choses qui ne dépendent pas de nous.", author: "Épictète" },
  { quote: "N'aspire pas à ce que les événements se passent comme tu le veux, mais veuille qu'ils se passent comme ils se passent.", author: "Épictète" },
  { quote: "L'ignorance n'est pas un défaut de l'esprit mais un manque de volonté d'apprendre.", author: "Épictète" },

  // ── SÉNÈQUE ──────────────────────────────────────────────────────────
  { quote: "Ce n'est pas parce que c'est difficile que nous n'osons pas ; c'est parce que nous n'osons pas que c'est difficile.", author: "Sénèque" },
  { quote: "La vie s'écoule pendant qu'on la remet à plus tard.", author: "Sénèque" },
  { quote: "Qui est partout n'est nulle part.", author: "Sénèque" },
  { quote: "L'amitié partage toutes les joies et toutes les angoisses.", author: "Sénèque" },
  { quote: "Retire-toi en toi-même autant que tu peux.", author: "Sénèque" },
  { quote: "Vivons vite : la vie passe à toute vitesse.", author: "Sénèque" },
  { quote: "Nul ne devient bon tout d'un coup.", author: "Sénèque" },
  { quote: "Le temps est la seule chose que l'on ne puisse recouvrer.", author: "Sénèque" },
  { quote: "Celui qui n'a pas de port n'a pas de vent favorable.", author: "Sénèque" },
  { quote: "Chaque jour est une petite vie.", author: "Sénèque" },
  { quote: "La colère est une courte folie.", author: "Sénèque" },
  { quote: "La sagesse n'est pas une chose qu'on acquiert une fois pour toutes.", author: "Sénèque" },
  { quote: "Il est trop tard pour être frugal au fond de la bouteille.", author: "Sénèque" },
  { quote: "La pauvreté n'est pas d'avoir peu, mais de désirer davantage.", author: "Sénèque" },

  // ── HÉRACLITE ─────────────────────────────────────────────────────────
  { quote: "On ne se baigne jamais deux fois dans le même fleuve.", author: "Héraclite" },
  { quote: "Tout s'écoule.", author: "Héraclite" },
  { quote: "La guerre est la mère de toutes choses.", author: "Héraclite" },
  { quote: "Le caractère est le destin d'un homme.", author: "Héraclite" },
  { quote: "Beaucoup d'érudition n'enseigne pas l'intelligence.", author: "Héraclite" },
  { quote: "Ce qui s'oppose coopère.", author: "Héraclite" },
  { quote: "La nature aime à se cacher.", author: "Héraclite" },
  { quote: "Tout est un.", author: "Héraclite" },
  { quote: "Le soleil est nouveau chaque jour.", author: "Héraclite" },
  { quote: "Les contraires sont identiques dans leurs effets opposés.", author: "Héraclite" },

  // ── DESCARTES ─────────────────────────────────────────────────────────
  { quote: "Je pense, donc je suis.", author: "Descartes" },
  { quote: "Le bon sens est la chose du monde la mieux partagée.", author: "Descartes" },
  { quote: "Pour examiner la vérité, il faut, une fois en sa vie, douter de tout.", author: "Descartes" },
  { quote: "Diviser chaque difficulté en autant de parties que possible.", author: "Descartes" },
  { quote: "Les grandes âmes ont la volonté ; les petites n'ont que les souhaits.", author: "Descartes" },
  { quote: "La lecture est une conversation avec les meilleurs esprits des siècles passés.", author: "Descartes" },
  { quote: "Je doute, donc je pense, donc je suis.", author: "Descartes" },
  { quote: "Le doute est le commencement de la sagesse.", author: "Descartes" },
  { quote: "La raison est naturellement égale en tous les hommes.", author: "Descartes" },
  { quote: "Connaître, c'est mesurer.", author: "Descartes" },
  { quote: "L'esprit est si étroitement lié au corps qu'il forme avec lui un tout.", author: "Descartes" },
  { quote: "La mathématique est la clé de toutes les sciences.", author: "Descartes" },
  { quote: "La méthode est le chemin le plus sûr vers la vérité.", author: "Descartes" },
  { quote: "Surmonter soi-même est plus difficile que surmonter n'importe quel obstacle.", author: "Descartes" },

  // ── PASCAL ────────────────────────────────────────────────────────────
  { quote: "Le cœur a ses raisons que la raison ne connaît point.", author: "Pascal" },
  { quote: "L'homme n'est qu'un roseau, le plus faible de la nature, mais c'est un roseau pensant.", author: "Pascal" },
  { quote: "Tout le malheur des hommes vient de ne pas savoir demeurer en repos dans une chambre.", author: "Pascal" },
  { quote: "Le silence éternel de ces espaces infinis m'effraie.", author: "Pascal" },
  { quote: "L'homme est manifestement fait pour penser.", author: "Pascal" },
  { quote: "On mourra seul.", author: "Pascal" },
  { quote: "L'ennui est la maladie de l'âme.", author: "Pascal" },
  { quote: "Il y a deux sortes de gens : les justes qui se croient pécheurs, et les pécheurs qui se croient justes.", author: "Pascal" },
  { quote: "L'homme n'est ni ange ni bête.", author: "Pascal" },
  { quote: "Les rivières sont des chemins qui marchent.", author: "Pascal" },
  { quote: "La vraie éloquence se moque de l'éloquence.", author: "Pascal" },
  { quote: "Cleopâtre : si son nez eût été plus court, la face du monde aurait changé.", author: "Pascal" },
  { quote: "La dernière démarche de la raison est de reconnaître qu'il y a une infinité de choses qui la surpassent.", author: "Pascal" },
  { quote: "La raison peut bien y être, mais la foi y est plus.", author: "Pascal" },
  { quote: "Le moi est haïssable.", author: "Pascal" },
  { quote: "Toute la dignité de l'homme est en la pensée.", author: "Pascal" },

  // ── MONTAIGNE ─────────────────────────────────────────────────────────
  { quote: "Que sais-je ?", author: "Montaigne" },
  { quote: "Parce que c'était lui, parce que c'était moi.", author: "Montaigne" },
  { quote: "La plus grande chose du monde est de savoir être à soi.", author: "Montaigne" },
  { quote: "Philosopher, c'est apprendre à mourir.", author: "Montaigne" },
  { quote: "Chaque homme porte la forme entière de l'humaine condition.", author: "Montaigne" },
  { quote: "Je veux que la mort me trouve plantant mes choux.", author: "Montaigne" },
  { quote: "Il est peu de gens qui sachent être vieux.", author: "Montaigne" },
  { quote: "Il n'est pas moins beau de savoir se taire que de savoir parler.", author: "Montaigne" },
  { quote: "Ma vie a été pleine de malheurs terribles, dont la plupart ne sont jamais arrivés.", author: "Montaigne" },
  { quote: "Les jeux d'enfants ne sont pas des jeux, et il faut les regarder comme leurs plus sérieuses actions.", author: "Montaigne" },
  { quote: "Il n'y a pas de conversation plus douce que celle avec soi-même.", author: "Montaigne" },
  { quote: "C'est folie de rapporter le vrai et le faux à notre seule suffisance.", author: "Montaigne" },
  { quote: "Le voyager me semble un exercice profitable.", author: "Montaigne" },
  { quote: "Je peins le passage, non l'être.", author: "Montaigne" },
  { quote: "Toute la sagesse du monde dépend en fin de compte du bon sens.", author: "Montaigne" },
  { quote: "Le plus beau témoignage que l'on puisse rendre de sa bonté, c'est d'être tolérant.", author: "Montaigne" },

  // ── VOLTAIRE ──────────────────────────────────────────────────────────
  { quote: "Le mieux est l'ennemi du bien.", author: "Voltaire" },
  { quote: "Si Dieu n'existait pas, il faudrait l'inventer.", author: "Voltaire" },
  { quote: "Le travail éloigne de nous trois grands maux : l'ennui, le vice et le besoin.", author: "Voltaire" },
  { quote: "On doit des égards aux vivants ; on ne doit aux morts que la vérité.", author: "Voltaire" },
  { quote: "La superstition est à la religion ce que l'astrologie est à l'astronomie.", author: "Voltaire" },
  { quote: "Cultivons notre jardin.", author: "Voltaire" },
  { quote: "L'histoire n'est que la peinture des crimes et des malheurs.", author: "Voltaire" },
  { quote: "Il vaut mieux hasarder de sauver un coupable que de condamner un innocent.", author: "Voltaire" },
  { quote: "Les hommes sont égaux ; ce n'est pas la naissance, c'est la seule vertu qui les distingue.", author: "Voltaire" },
  { quote: "Je ne suis pas d'accord avec vous, mais je me battrai pour que vous ayez le droit de le dire.", author: "Voltaire" },
  { quote: "Chaque instant de la vie est un pas vers la mort.", author: "Voltaire" },
  { quote: "L'enthousiasme est une maladie qui se gagne facilement.", author: "Voltaire" },
  { quote: "Dans ce meilleur des mondes possibles, tout est au mieux.", author: "Voltaire" },
  { quote: "Dieu a fait l'homme à son image, et l'homme le lui a bien rendu.", author: "Voltaire" },
  { quote: "La raison est toujours la force des gens raisonnables.", author: "Voltaire" },
  { quote: "La vérité est un flambeau qui luit dans le brouillard sans le dissiper.", author: "Voltaire" },

  // ── ROUSSEAU ──────────────────────────────────────────────────────────
  { quote: "L'homme est né libre, et partout il est dans les fers.", author: "Rousseau" },
  { quote: "Tout est bien sortant des mains du Créateur ; tout dégénère entre les mains de l'homme.", author: "Rousseau" },
  { quote: "Exister, c'est sentir.", author: "Rousseau" },
  { quote: "La liberté consiste moins à faire sa volonté qu'à n'être pas soumis à celle d'autrui.", author: "Rousseau" },
  { quote: "Vivre n'est pas respirer, c'est agir.", author: "Rousseau" },
  { quote: "Le plus fort n'est jamais assez fort pour être toujours le maître.", author: "Rousseau" },
  { quote: "La patrie ne peut subsister sans la liberté.", author: "Rousseau" },
  { quote: "L'homme naturel est bon ; c'est la société qui le corrompt.", author: "Rousseau" },
  { quote: "L'amour-propre est un sentiment relatif et artificiel né dans la société.", author: "Rousseau" },
  { quote: "Qui veut conserver sa liberté doit toujours la défendre.", author: "Rousseau" },
  { quote: "On n'est jamais méchant pour le plaisir de l'être.", author: "Rousseau" },
  { quote: "L'enfant naît sensible, et ce qu'il ressent est la base de tout son développement.", author: "Rousseau" },

  // ── KANT ──────────────────────────────────────────────────────────────
  { quote: "Deux choses remplissent mon âme d'admiration : le ciel étoilé au-dessus de moi et la loi morale en moi.", author: "Kant" },
  { quote: "L'homme est une fin en soi, jamais un simple moyen.", author: "Kant" },
  { quote: "Ose savoir !", author: "Kant" },
  { quote: "Agis uniquement selon la maxime qui peut être érigée en loi universelle.", author: "Kant" },
  { quote: "La beauté est ce qui plaît universellement sans concept.", author: "Kant" },
  { quote: "Il n'y a qu'une seule chose bonne en elle-même : la volonté bonne.", author: "Kant" },
  { quote: "La raison doit approcher la nature, non en élève, mais en juge.", author: "Kant" },
  { quote: "L'expérience sans la théorie est aveugle, mais la théorie sans l'expérience n'est qu'un jeu.", author: "Kant" },
  { quote: "Avoir le courage de se servir de sa propre intelligence.", author: "Kant" },
  { quote: "La science est une connaissance organisée. La sagesse est une vie organisée.", author: "Kant" },
  { quote: "Vivre selon la raison est la seule manière vraiment humaine de vivre.", author: "Kant" },
  { quote: "L'espace et le temps sont les formes a priori de notre sensibilité.", author: "Kant" },
  { quote: "La liberté est indépendance de la volonté de toute loi autre que la raison.", author: "Kant" },
  { quote: "Ce que les hommes désirent avant tout, c'est le bonheur.", author: "Kant" },

  // ── HEGEL ─────────────────────────────────────────────────────────────
  { quote: "Le réel est rationnel, et le rationnel est réel.", author: "Hegel" },
  { quote: "La vérité est le tout.", author: "Hegel" },
  { quote: "L'histoire universelle est le tribunal du monde.", author: "Hegel" },
  { quote: "La liberté est la conscience de la nécessité.", author: "Hegel" },
  { quote: "Ce qui est connu n'est pas nécessairement reconnu.", author: "Hegel" },
  { quote: "La chouette de Minerve ne prend son envol qu'à la tombée du crépuscule.", author: "Hegel" },
  { quote: "L'État est la marche de Dieu dans le monde.", author: "Hegel" },
  { quote: "Le négatif est le moteur de toute dialectique.", author: "Hegel" },
  { quote: "L'histoire est la biographie de l'Esprit absolu.", author: "Hegel" },
  { quote: "Ce qui est familier n'est pas nécessairement connu.", author: "Hegel" },

  // ── NIETZSCHE ─────────────────────────────────────────────────────────
  { quote: "Dieu est mort.", author: "Nietzsche" },
  { quote: "Ce qui ne me tue pas me rend plus fort.", author: "Nietzsche" },
  { quote: "Il faut avoir du chaos en soi pour pouvoir donner naissance à une étoile qui danse.", author: "Nietzsche" },
  { quote: "Sans la musique, la vie serait une erreur.", author: "Nietzsche" },
  { quote: "L'homme est quelque chose qui doit être surmonté.", author: "Nietzsche" },
  { quote: "Il n'y a pas de faits, seulement des interprétations.", author: "Nietzsche" },
  { quote: "On pense mieux en marchant.", author: "Nietzsche" },
  { quote: "Devenir ce qu'on est.", author: "Nietzsche" },
  { quote: "Il faut rester fidèle à la terre.", author: "Nietzsche" },
  { quote: "La chose la plus courageuse est de penser librement à voix haute.", author: "Nietzsche" },
  { quote: "La volonté de puissance est la source de toute création.", author: "Nietzsche" },
  { quote: "L'art est la volonté de surmonter la laideur.", author: "Nietzsche" },
  { quote: "Vis de telle manière que tu désires que ta vie se répète éternellement.", author: "Nietzsche" },
  { quote: "La connaissance pour la connaissance est le dernier piège tendu par la morale.", author: "Nietzsche" },
  { quote: "Méfie-toi de ceux pour qui punir est une grande fête.", author: "Nietzsche" },
  { quote: "Là où est ton danger, là est aussi ta chance.", author: "Nietzsche" },
  { quote: "La vérité est laide : nous avons l'art pour ne pas mourir de la vérité.", author: "Nietzsche" },
  { quote: "Il faut aimer la vie assez pour la vouloir deux fois.", author: "Nietzsche" },

  // ── SCHOPENHAUER ─────────────────────────────────────────────────────
  { quote: "La vie est une affaire qui ne couvre pas ses frais.", author: "Schopenhauer" },
  { quote: "Tout plaisir n'est que l'absence momentanée d'une douleur.", author: "Schopenhauer" },
  { quote: "Le bonheur appartient à ceux qui se suffisent à eux-mêmes.", author: "Schopenhauer" },
  { quote: "La compassion est la base de la morale.", author: "Schopenhauer" },
  { quote: "La vie oscille comme un pendule entre la douleur et l'ennui.", author: "Schopenhauer" },
  { quote: "La musique est le miroir du monde.", author: "Schopenhauer" },
  { quote: "Nous vivons dans le pire des mondes possibles.", author: "Schopenhauer" },
  { quote: "Toute vérité passe par trois stades : ridiculisée, combattue, puis acceptée comme évidente.", author: "Schopenhauer" },
  { quote: "La solitude offre les plus grands avantages à qui s'y est habitué.", author: "Schopenhauer" },
  { quote: "L'amour n'est qu'un piège tendu par la nature pour perpétuer l'espèce.", author: "Schopenhauer" },
  { quote: "Vouloir, c'est souffrir.", author: "Schopenhauer" },
  { quote: "La santé n'est pas tout, mais sans elle, tout le reste est rien.", author: "Schopenhauer" },
  { quote: "L'intelligence est le simple outil de la volonté.", author: "Schopenhauer" },
  { quote: "Les neuf dixièmes du bonheur reposent sur la santé.", author: "Schopenhauer" },
  { quote: "Chaque enfant est en quelque sorte un génie, et chaque génie est en quelque sorte un enfant.", author: "Schopenhauer" },
  { quote: "La gloire de l'homme est aussi éphémère que la beauté d'une fleur.", author: "Schopenhauer" },

  // ── MARX ──────────────────────────────────────────────────────────────
  { quote: "La religion est l'opium du peuple.", author: "Marx" },
  { quote: "Les philosophes n'ont fait qu'interpréter le monde ; il s'agit maintenant de le transformer.", author: "Marx" },
  { quote: "L'histoire de toute société jusqu'à nos jours est l'histoire de la lutte des classes.", author: "Marx" },
  { quote: "De chacun selon ses capacités, à chacun selon ses besoins.", author: "Marx" },
  { quote: "Un spectre hante l'Europe : le spectre du communisme.", author: "Marx" },
  { quote: "Travailleurs de tous les pays, unissez-vous !", author: "Marx" },
  { quote: "Ce n'est pas la conscience des hommes qui détermine leur être social, mais leur être social qui détermine leur conscience.", author: "Marx" },
  { quote: "Le capital est du travail mort qui ne se ranime qu'en suçant le travail vivant.", author: "Marx" },
  { quote: "L'être social détermine la conscience.", author: "Marx" },
  { quote: "L'humanité ne se pose que les problèmes qu'elle peut résoudre.", author: "Marx" },

  // ── SPINOZA ───────────────────────────────────────────────────────────
  { quote: "Dieu ou la Nature.", author: "Spinoza" },
  { quote: "Tout être tend à persévérer dans son être.", author: "Spinoza" },
  { quote: "La haine ne peut jamais être bonne.", author: "Spinoza" },
  { quote: "L'homme libre ne pense à rien moins qu'à la mort.", author: "Spinoza" },
  { quote: "Ni rire ni pleurer, mais comprendre.", author: "Spinoza" },
  { quote: "La paix n'est pas l'absence de guerre, c'est une vertu.", author: "Spinoza" },
  { quote: "La félicité n'est pas la récompense de la vertu, elle est la vertu elle-même.", author: "Spinoza" },
  { quote: "Les hommes croient être libres parce qu'ils sont conscients de leurs désirs, mais ignorent les causes.", author: "Spinoza" },
  { quote: "Tout ce qui est excellent est aussi difficile que rare.", author: "Spinoza" },
  { quote: "La vraie connaissance libère l'homme de ses passions.", author: "Spinoza" },
  { quote: "L'envie est une tristesse accompagnée de l'idée d'un bien qu'un autre possède.", author: "Spinoza" },
  { quote: "Autant de réalité, autant de perfection.", author: "Spinoza" },

  // ── SARTRE ────────────────────────────────────────────────────────────
  { quote: "L'existence précède l'essence.", author: "Sartre" },
  { quote: "L'enfer, c'est les autres.", author: "Sartre" },
  { quote: "L'homme est condamné à être libre.", author: "Sartre" },
  { quote: "Nous sommes nos choix.", author: "Sartre" },
  { quote: "L'angoisse est la conscience de la liberté.", author: "Sartre" },
  { quote: "Exister, c'est choisir.", author: "Sartre" },
  { quote: "Ce qu'on appelle sérieux, c'est la mauvaise foi.", author: "Sartre" },
  { quote: "La liberté est ce que vous faites avec ce qu'on a fait de vous.", author: "Sartre" },
  { quote: "On n'est jamais entièrement ce qu'on est.", author: "Sartre" },
  { quote: "L'être et le néant sont les deux pôles de l'existence humaine.", author: "Sartre" },
  { quote: "L'homme est un être pour la mort qui vit comme s'il était immortel.", author: "Sartre" },
  { quote: "La nausée, c'est la révélation de l'absurdité de l'existence.", author: "Sartre" },
  { quote: "Nous sommes seuls, sans excuses. C'est ce que j'exprime en disant que l'homme est condamné à être libre.", author: "Sartre" },
  { quote: "L'existence humaine est pure contingence.", author: "Sartre" },

  // ── CAMUS ─────────────────────────────────────────────────────────────
  { quote: "Il faut imaginer Sisyphe heureux.", author: "Camus" },
  { quote: "La seule question philosophique vraiment sérieuse est celle du suicide.", author: "Camus" },
  { quote: "Au milieu de l'hiver, j'ai découvert en moi un invincible été.", author: "Camus" },
  { quote: "L'absurde naît de la confrontation de l'appel humain et du silence déraisonnable du monde.", author: "Camus" },
  { quote: "Je suis révolté, donc nous sommes.", author: "Camus" },
  { quote: "Mal nommer les choses, c'est ajouter au malheur du monde.", author: "Camus" },
  { quote: "La beauté est insupportable, elle nous désespère.", author: "Camus" },
  { quote: "Il faut se souvenir d'être heureux.", author: "Camus" },
  { quote: "Les hommes meurent et ne sont pas heureux.", author: "Camus" },
  { quote: "On aime sans raison et sans raison on hait.", author: "Camus" },
  { quote: "La révolte est une des dimensions essentielles de l'homme.", author: "Camus" },
  { quote: "Le monde est beau et hors de lui il n'y a pas de salut.", author: "Camus" },
  { quote: "L'artiste forge son œuvre dans l'incessant va-et-vient entre lui-même et les autres.", author: "Camus" },
  { quote: "Ne pas marcher devant moi, je ne saurais peut-être pas te suivre ; derrière moi, je ne voudrais peut-être pas t'y conduire.", author: "Camus" },

  // ── SIMONE DE BEAUVOIR ────────────────────────────────────────────────
  { quote: "On ne naît pas femme, on le devient.", author: "Simone de Beauvoir" },
  { quote: "La liberté d'autrui étend la mienne à l'infini.", author: "Simone de Beauvoir" },
  { quote: "Je veux tout faire, tout connaître, tout vivre.", author: "Simone de Beauvoir" },
  { quote: "C'est par le travail que la femme a franchi la distance qui la séparait du mâle.", author: "Simone de Beauvoir" },
  { quote: "Toute séparation est une petite mort.", author: "Simone de Beauvoir" },
  { quote: "Changer sa vie, ce n'est pas seulement changer une situation, c'est transformer ce qu'on est.", author: "Simone de Beauvoir" },
  { quote: "L'art est une tentative pour intégrer le mal.", author: "Simone de Beauvoir" },
  { quote: "La vieillesse est quelque chose qui va au-delà de ma propre vie.", author: "Simone de Beauvoir" },
  { quote: "Ce que la société impose à la femme, c'est de ne pas exiger.", author: "Simone de Beauvoir" },
  { quote: "Représenter, c'est déjà transformer.", author: "Simone de Beauvoir" },
  { quote: "On ne peut pas réduire une vie à quelques grandes actions.", author: "Simone de Beauvoir" },
  { quote: "Le monde appartient à ceux qui osent le nommer autrement.", author: "Simone de Beauvoir" },

  // ── CONFUCIUS ─────────────────────────────────────────────────────────
  { quote: "Ce que tu ne veux pas qu'on te fasse, ne le fais pas aux autres.", author: "Confucius" },
  { quote: "Choisissez un travail que vous aimez et vous n'aurez pas à travailler un seul jour de votre vie.", author: "Confucius" },
  { quote: "Notre plus grande gloire n'est pas de ne jamais tomber, mais de nous relever à chaque chute.", author: "Confucius" },
  { quote: "Quand la colère monte, pense aux conséquences.", author: "Confucius" },
  { quote: "Étudier sans réfléchir est vain ; réfléchir sans étudier est dangereux.", author: "Confucius" },
  { quote: "Peu importe la vitesse à laquelle tu vas, du moment que tu ne t'arrêtes pas.", author: "Confucius" },
  { quote: "L'homme noble se juge lui-même ; l'homme vulgaire juge les autres.", author: "Confucius" },
  { quote: "Avant de vous lancer dans une vengeance, commencez par creuser deux tombes.", author: "Confucius" },
  { quote: "Celui qui connaît les autres est sage ; celui qui se connaît lui-même est éclairé.", author: "Confucius" },
  { quote: "L'ignorance est la nuit de l'esprit, une nuit sans lune ni étoile.", author: "Confucius" },
  { quote: "Apprendre sans penser n'est que perte de temps.", author: "Confucius" },
  { quote: "Sans sincérité, il n'y a pas de vertu.", author: "Confucius" },
  { quote: "La bonté est la vertu principale.", author: "Confucius" },
  { quote: "Respectez les anciens, mais ne les imitez pas aveuglément.", author: "Confucius" },
  { quote: "L'homme de bien pense à sa vertu ; l'homme ordinaire pense à ses aises.", author: "Confucius" },
  { quote: "Si tu commets une erreur et ne la corriges pas, c'est une seconde erreur.", author: "Confucius" },

  // ── LAO-TSEU ──────────────────────────────────────────────────────────
  { quote: "Le voyage de mille li commence par un premier pas.", author: "Lao-Tseu" },
  { quote: "Celui qui sait ne parle pas ; celui qui parle ne sait pas.", author: "Lao-Tseu" },
  { quote: "L'eau est la chose la plus douce, mais elle ronge la pierre.", author: "Lao-Tseu" },
  { quote: "Le vide est utile.", author: "Lao-Tseu" },
  { quote: "Le Tao qui peut être nommé n'est pas le Tao éternel.", author: "Lao-Tseu" },
  { quote: "Agir sans agir.", author: "Lao-Tseu" },
  { quote: "Sans sortir de ma maison, je connais l'univers.", author: "Lao-Tseu" },
  { quote: "L'excès de lumière éblouit les yeux.", author: "Lao-Tseu" },
  { quote: "Le sage suit la nature ; le sot suit ses désirs.", author: "Lao-Tseu" },
  { quote: "Qui saute haut tombe de haut.", author: "Lao-Tseu" },
  { quote: "Là où il y a création, il y a aussi destruction.", author: "Lao-Tseu" },
  { quote: "Connaître les autres, c'est la sagesse. Se connaître soi-même, c'est l'éveil.", author: "Lao-Tseu" },
  { quote: "La souplesse est la force suprême.", author: "Lao-Tseu" },
  { quote: "Moins on agit, plus on accomplit.", author: "Lao-Tseu" },

  // ── BERGSON ───────────────────────────────────────────────────────────
  { quote: "L'univers dure.", author: "Bergson" },
  { quote: "L'intelligence est caractérisée par une incompréhension naturelle de la vie.", author: "Bergson" },
  { quote: "Le possible est plus riche que le réel.", author: "Bergson" },
  { quote: "Agir librement, c'est reprendre possession de soi.", author: "Bergson" },
  { quote: "Le rire est une réponse sociale à une rigidité mécanique.", author: "Bergson" },
  { quote: "La durée, c'est la vie elle-même.", author: "Bergson" },
  { quote: "La conscience est une lampe.", author: "Bergson" },
  { quote: "L'art vise à endormir les puissances actives de notre personnalité.", author: "Bergson" },
  { quote: "La science s'occupe des choses ; la philosophie, de l'être.", author: "Bergson" },
  { quote: "Penser, c'est ne pas se laisser penser.", author: "Bergson" },

  // ── HEIDEGGER ─────────────────────────────────────────────────────────
  { quote: "Le langage est la maison de l'être.", author: "Heidegger" },
  { quote: "L'angoisse révèle le néant.", author: "Heidegger" },
  { quote: "L'homme est un être-dans-le-monde.", author: "Heidegger" },
  { quote: "Seul un Dieu peut encore nous sauver.", author: "Heidegger" },
  { quote: "Le temps est l'horizon de l'être.", author: "Heidegger" },
  { quote: "La technique moderne est une mise en demeure de la nature.", author: "Heidegger" },
  { quote: "L'être n'est pas un étant parmi d'autres.", author: "Heidegger" },
  { quote: "Mourir est la possibilité la plus propre de l'existence humaine.", author: "Heidegger" },
  { quote: "La philosophie ne commence que dans la question de l'être.", author: "Heidegger" },
  { quote: "L'angoisse est le fondement de l'existence authentique.", author: "Heidegger" },

  // ── WITTGENSTEIN ──────────────────────────────────────────────────────
  { quote: "Ce dont on ne peut parler, il faut le taire.", author: "Wittgenstein" },
  { quote: "Les limites de mon langage signifient les limites de mon monde.", author: "Wittgenstein" },
  { quote: "Le monde est la totalité des faits, non des choses.", author: "Wittgenstein" },
  { quote: "La philosophie n'est pas une doctrine, c'est une activité.", author: "Wittgenstein" },
  { quote: "Un mot n'a de signification que dans le flux de la vie.", author: "Wittgenstein" },
  { quote: "Les problèmes philosophiques naissent quand le langage fait des vacances.", author: "Wittgenstein" },
  { quote: "La certitude n'est pas une caractéristique de la connaissance.", author: "Wittgenstein" },
  { quote: "Tout ce qui peut être montré ne peut pas être dit.", author: "Wittgenstein" },
  { quote: "Philosopher, c'est reconstruire son langage à partir de zéro.", author: "Wittgenstein" },
  { quote: "Sur ce dont on ne peut parler, on doit garder le silence.", author: "Wittgenstein" },

  // ── LEIBNIZ ───────────────────────────────────────────────────────────
  { quote: "Nous vivons dans le meilleur des mondes possibles.", author: "Leibniz" },
  { quote: "La nature ne fait pas de sauts.", author: "Leibniz" },
  { quote: "Rien n'est sans raison.", author: "Leibniz" },
  { quote: "Tout est possible sauf la contradiction.", author: "Leibniz" },
  { quote: "L'amour véritable est de vouloir le bonheur de l'autre.", author: "Leibniz" },
  { quote: "Chaque monade reflète l'univers entier à sa façon.", author: "Leibniz" },
  { quote: "La vérité est la correspondance de la pensée et de l'être.", author: "Leibniz" },
  { quote: "L'harmonie préétablie gouverne les relations entre âmes et corps.", author: "Leibniz" },
  { quote: "Si Dieu n'existait pas, il faudrait l'inventer pour comprendre l'ordre du monde.", author: "Leibniz" },
  { quote: "La raison est la lumière naturelle de l'esprit.", author: "Leibniz" },

  // ── SIMONE WEIL ───────────────────────────────────────────────────────
  { quote: "L'attention est la forme la plus rare et la plus pure de la générosité.", author: "Simone Weil" },
  { quote: "La beauté du monde est le sourire de Dieu à travers la matière.", author: "Simone Weil" },
  { quote: "La justice est une obligation envers tout être humain sans exception.", author: "Simone Weil" },
  { quote: "Toute vérité passe d'abord par l'expérience de la douleur.", author: "Simone Weil" },
  { quote: "Le malheur est une occasion de croissance pour l'âme.", author: "Simone Weil" },
  { quote: "La prière n'est rien d'autre que l'attention.", author: "Simone Weil" },
  { quote: "La grâce est l'amour de Dieu descendu jusqu'à nous.", author: "Simone Weil" },
  { quote: "Le vide de l'âme est l'espace où Dieu peut entrer.", author: "Simone Weil" },
  { quote: "On apprend à souffrir en souffrant, non en observant.", author: "Simone Weil" },
  { quote: "Obéir non par crainte, mais par amour.", author: "Simone Weil" },

  // ── BOUDDHA ───────────────────────────────────────────────────────────
  { quote: "Toute vie est souffrance.", author: "Bouddha" },
  { quote: "La souffrance a pour origine le désir.", author: "Bouddha" },
  { quote: "Soyez votre propre lumière.", author: "Bouddha" },
  { quote: "Tout est impermanent.", author: "Bouddha" },
  { quote: "La haine ne disparaît pas avec la haine ; elle disparaît avec l'amour.", author: "Bouddha" },
  { quote: "Il vaut mieux voyager bien que d'arriver vite.", author: "Bouddha" },
  { quote: "La plus grande victoire est de se vaincre soi-même.", author: "Bouddha" },
  { quote: "La paix vient de l'intérieur ; ne la cherchez pas à l'extérieur.", author: "Bouddha" },
  { quote: "Trois choses ne peuvent être longtemps cachées : le soleil, la lune et la vérité.", author: "Bouddha" },
  { quote: "Ce que vous êtes est ce que vous avez pensé.", author: "Bouddha" },
  { quote: "Il n'y a pas de chemin vers la paix ; la paix est le chemin.", author: "Bouddha" },
  { quote: "L'esprit est tout. Vous devenez ce que vous pensez.", author: "Bouddha" },
]

// ── Index par auteur ──────────────────────────────────────────────────────
const byAuthor: Record<string, string[]> = {}
for (const e of PHILO) {
  if (!byAuthor[e.author]) byAuthor[e.author] = []
  byAuthor[e.author].push(e.quote)
}
export const AUTHORS = Object.keys(byAuthor)

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeCitationQuestion(): PhiloQuestion {
  const entry = pickRandom(PHILO)
  const others = shuffle(AUTHORS.filter(a => a !== entry.author)).slice(0, 3)
  return {
    mode: "citation",
    display: entry.quote,
    answer: entry.author,
    options: shuffle([entry.author, ...others]),
  }
}

function makeAuteurQuestion(): PhiloQuestion {
  const author = pickRandom(AUTHORS)
  const correct = pickRandom(byAuthor[author])
  const wrong = shuffle(PHILO.filter(e => e.author !== author)).slice(0, 3).map(e => e.quote)
  return {
    mode: "auteur",
    display: author,
    answer: correct,
    options: shuffle([correct, ...wrong]),
  }
}

export function makePhiloQuestion(mode: PhiloMode): PhiloQuestion {
  return mode === "citation" ? makeCitationQuestion() : makeAuteurQuestion()
}

export function pickPhiloRound(mode: PhiloMode, n = 10): PhiloQuestion[] {
  const questions: PhiloQuestion[] = []
  const used = new Set<string>()
  for (let attempts = 0; attempts < n * 6 && questions.length < n; attempts++) {
    const q = makePhiloQuestion(mode)
    // key = author for citation mode, display for auteur mode
    const key = mode === "citation" ? q.answer : q.display
    if (!used.has(key)) {
      used.add(key)
      questions.push(q)
    }
  }
  while (questions.length < n) questions.push(makePhiloQuestion(mode))
  return questions
}
