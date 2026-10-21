@AGENTS.md

# Économie de tokens (règles du projet)

- Une session = une fonctionnalité. Au-delà de deux heures ou quand la conversation devient longue, ouvrir une nouvelle session plutôt que continuer.
- Lire les fichiers par plages : `grep -n` pour trouver la ligne, puis `Read` avec `offset` et `limit` (200 lignes au plus). Ne jamais lire un fichier de plus de 800 lignes en entier (un hook le bloque de toute façon).
- Limiter les sorties : `| head -n`, `| tail -n`, redirection des logs longs vers un fichier, pas de `cat` de gros fichiers, pas de listes d'outils ni de captures inutiles.
- Ne pas coller de gros fichiers dans les prompts de génération de code : donner le chemin, les numéros de lignes et l'extrait utile.
- Lancer `/compact` avant de changer de sujet dans une même session.
- Mesurer : `~/.claude/hooks/measure_tokens.sh /Users/bruno/dj-app` donne le volume de résultats d'outils par session.
