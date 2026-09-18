# Ce qui casse si on se trompe

Utile pour doser la vérification que mérite un changement.

Ce n'est pas un document de risque, c'est un **budget d'effort**. Il répond à une seule
question, celle qu'on se pose avant de livrer : « est-ce que je relis, ou est-ce que je
construis l'image et je teste pour de vrai ? » Sans ce tableau, la réponse dépend de
l'humeur et de la fatigue du contexte.

| Changement | Pire conséquence réaliste |
| ---------- | ------------------------- |
| Un fichier d'environnement ajouté au commit | un secret lisible à jamais dans l'historique d'un dépôt public ; découvert par un scan externe, quand la rotation arrive déjà tard |
| Une migration Prisma qui supprime une colonne ou une table | des données que plus aucune sauvegarde applicative ne détient ; découvert quand quelqu'un les réclame |
| L'arithmétique de `Money`, ou l'exposant d'une devise | des montants faux en XOF et XAF pendant que tous les tests en EUR passent ; découvert par un vendeur sur sa facture |
| Le domaine du cookie de session | chaque front reconnaît l'utilisateur pour lui seul ; les tests d'une application passent, seule la bascule entre sous-domaines révèle la rupture |
| Le stage `runner` d'un Dockerfile | une image dont le point d'entrée ne démarre pas ; le développement conteneurisé utilise le stage `dev` et ne la construit jamais — découvert au déploiement |
| Une variable de build absente de `globalEnv` dans `turbo.json` | le cache sert un artefact construit avec l'ancienne valeur ; se manifeste comme un bug fantôme qui disparaît après un build forcé |
| Un `.dockerignore` absent ou incomplet à la racine | chaque build transfère tout le dépôt au démon Docker ; se manifeste comme une lenteur générale qu'on attribue à la machine, jamais au fichier manquant |
| Un port applicatif publié à côté de nginx dans le compose | une application joignable en clair sur le réseau local, et une topologie de développement qui cesse de refléter la production ; découvert au déploiement, ou par quelqu'un d'autre |
| Un `index.ts` ajouté à la racine d'un module NestJS | un cycle d'imports résolu en `undefined` : aucune erreur au démarrage, un provider vide au moment de s'en servir ; découvert loin de la cause |
| Une dépendance ajoutée à `@clemperl/core` | le cœur métier cesse d'être importable partout ; découvert quand un worker NestJS tire React dans son image |

**Règles d'écriture.**

- **Le pire cas RÉALISTE, pas le pire cas imaginable.** « Perte de données » est vrai de
  presque tout et n'aide à rien classer. Ce qu'on cherche, c'est ce qui arrive vraiment,
  compte tenu des filets déjà en place.
- **Dire le moment de la découverte**, pas seulement le dégât. « Une image dont le point
  d'entrée ne démarre pas, découverte au déploiement » n'appelle pas la même vigilance
  qu'une erreur trouvée à la compilation. Le coût d'un défaut, c'est sa gravité multipliée
  par le retard à le voir.
- **Une ligne par geste, pas par fichier.** « Méthode de merge sur une promotion » plutôt
  que « `.github/` ».
- **Pas de colonne de sévérité, pas de score.** Une phrase concrète classe mieux qu'un
  « critique/majeur » que chacun interprète à sa façon.
- Le tableau reste court. Au-delà d'une dizaine de lignes il n'est plus lu, et les lignes
  qu'on n'ose pas retirer sont justement celles qui ne servent pas.
